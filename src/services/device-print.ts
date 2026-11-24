import { reactive } from "vue";
import { useSession } from "../stores/session";
import { apiIdentity } from "./deployment";
import { requestKey } from "./journal";
import { api } from "./api";
import { sessionToken } from "./session-token";
import { devicePrinting } from "../services/native";
import { deviceDefaults,automaticInboundPrint,type DevicePrintScope,type DevicePrinterDefault,type DevicePrintResult } from "../domain/device-print";
import type { RecordItem,Warehouse,PrintJob } from "../domain/types";

const storage={get:(key:string)=>uni.getStorageSync(key),set:(key:string,value:unknown)=>uni.setStorageSync(key,value),remove:(key:string)=>uni.removeStorageSync(key)};
export const localPrinterDefaults=deviceDefaults(storage);
export const devicePrintStates=reactive<Record<string,DevicePrintResult>>({});
export function printScope():DevicePrintScope {
  const session=useSession();if(!session.ready||!session.context||!session.factoryId)throw new Error("请先选择工厂");
  return {api:apiIdentity(),tenantId:session.context.tenantId,factoryId:session.factoryId,deviceId:localDeviceId()};
}
export function localDeviceId():string {
  const nativeId=devicePrinting.identity();if(nativeId)return nativeId;
  let id=uni.getStorageSync("dq.printDeviceId");
  if(typeof id!=="string"||!/^[A-Za-z0-9_-]{16,64}$/.test(id)){id="app_"+requestKey();uni.setStorageSync("dq.printDeviceId",id);}
  return id;
}
const stateKey=(scope:DevicePrintScope,recordId:string)=>"dq.devicePrint:"+JSON.stringify([scope.api,scope.tenantId,scope.factoryId,scope.deviceId||"",recordId]);
export function printState(recordId:string):DevicePrintResult|undefined {
  const key=stateKey(printScope(),recordId);
  return devicePrintStates[key]||(uni.getStorageSync(key)||undefined);
}
function remember(scope:DevicePrintScope,recordId:string,result:DevicePrintResult) {
  const key=stateKey(scope,recordId);devicePrintStates[key]=result;
  // This is only a display cache; native durable evidence and the backend settle the print.
  try{uni.setStorageSync(key,result);}catch{/* Keep the visible result even if the display cache is full. */}
}
function isNetworkDefault(value:DevicePrinterDefault|undefined):value is DevicePrinterDefault {return !!value&&["IPP","IPPS"].includes(value.protocol);}
export function currentDefault(warehouse:Warehouse){
  const saved=localPrinterDefaults.get(printScope(),warehouse);
  // Retain previous settings; only network targets may execute in this release.
  return isNetworkDefault(saved)?saved:undefined;
}
export function capturePrintOrigin(){return {scope:printScope(),token:sessionToken.get(),userId:useSession().context!.userId};}
type PrintOrigin=ReturnType<typeof capturePrintOrigin>;
function sameOrigin(origin:PrintOrigin){
  const session=useSession();
  return sessionToken.get()===origin.token&&session.factoryId===origin.scope.factoryId&&apiIdentity()===origin.scope.api&&
    (!session.context||(session.context.tenantId===origin.scope.tenantId&&session.context.userId===origin.userId));
}
export async function printRecordOnDevice(record:RecordItem,target=currentDefault(record.warehouseType),origin=capturePrintOrigin()):Promise<DevicePrintResult> {
  const scope=origin.scope;
  if(target&&!isNetworkDefault(target)){
    const result={status:"NO_DEFAULT",error:"入库已成功，请重新选择本仓网络打印机"};remember(scope,record.id,result);return result;
  }
  remember(scope,record.id,{status:"WAITING_LABEL"});
  const result=await automaticInboundPrint(target,{
    sameScope:()=>sameOrigin(origin),
    label:async()=>{
      for(let attempt=0;attempt<30;attempt++) {
        if(!sameOrigin(origin))throw new Error("登录身份已变化，未继续打印");
        try {
          const label=await api.latestLabel(record.id);
          if(label.status==="READY")return label.id;
          if(label.status==="FAILED")throw new Error(label.errorMessage||"标签生成失败，请在记录详情重试当前标签");
        }catch(error:any){if(error?.code!==404&&error?.code!=="404")throw error;}
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      throw new Error("入库已成功，标签仍在准备中，请稍后核对打印");
    },
    print:async(defaultPrinter,labelId)=>{
      remember(scope,record.id,{status:"PREPARING"});
      try{return await devicePrinting.print({factoryId:scope.factoryId,expectedTenantId:scope.tenantId,deviceId:localDeviceId(),recordId:record.id,labelId,requestKey:"device-initial:"+record.id,...defaultPrinter});}
      catch{return {status:"UNKNOWN",error:"入库已成功，打印执行结果待核对，请查看打印记录，勿重复入库"};}
    },
  });
  remember(scope,record.id,result);return result;
}
export function startInboundPrint(record:RecordItem,target:DevicePrinterDefault|undefined,origin:PrintOrigin) {
  // Starts only after create returned a confirmed record, never after an ambiguous create response.
  if(!sameOrigin(origin))return;
  void printRecordOnDevice(record,target,origin).catch(error=>{
    if(sameOrigin(origin))remember(origin.scope,record.id,{status:"FAILED",error:error instanceof Error?error.message:"打印失败，请核对"});
  });
}
export async function retryDevicePrint(record:RecordItem) {
  const old=printState(record.id);
  if(!old?.jobId)return printRecordOnDevice(record);
  const job=await api.job(old.jobId);
  return retryDeviceJob(job);
}
export async function retryDeviceJob(job:PrintJob) {
  const scope=printScope();
  if(job.deviceId!==localDeviceId())throw new Error("请在原打印设备上重试此任务");
  if(job.status!=="FAILED")throw new Error("请先核对原打印任务，可能已出纸的任务不会自动重发");
  if(job.attempts?.some(attempt=>attempt.remoteStatus?.deliveryKind==="USB_BYTES"))throw new Error("此任务的USB打印目标已停用，请先核对原任务");
  const result=await devicePrinting.print({factoryId:scope.factoryId,expectedTenantId:scope.tenantId,deviceId:localDeviceId(),jobId:job.id,retry:true,expectedVersion:job.version});
  remember(scope,job.recordId,result);return result;
}
export async function reprintOnDevice(job:PrintJob,labelId:string,reason:string) {
  const scope=printScope(),target=currentDefault(job.warehouseType);
  if(!target)throw new Error("请先选择本设备的本仓默认打印机");
  const key="dq.deviceReprint:"+stateKey(scope,job.recordId)+":"+job.id;
  let intent=uni.getStorageSync(key);
  if(intent&&!isNetworkDefault(intent))throw new Error("旧补打目标已停用，请先核对原补打任务，再选择网络打印机");
  if(intent&&(intent.labelId!==labelId||intent.reason!==reason))throw new Error("上次补打结果待核对，请先查看原任务");
  if(!intent){intent={...target,factoryId:scope.factoryId,expectedTenantId:scope.tenantId,deviceId:localDeviceId(),recordId:job.recordId,parentJobId:job.id,labelId,reason,requestKey:requestKey()};uni.setStorageSync(key,intent);}
  const result=await devicePrinting.print(intent);
  remember(scope,job.recordId,result);
  if(["SUBMITTED","COMPLETED"].includes(result.status))uni.removeStorageSync(key);
  return result;
}
export async function syncMachinePrinting() {
  const session=useSession();if(!session.ready||!session.context||!session.factoryId)return;
  const identity=session.currentScope(),scope=printScope();
  const pending=await api.devicePrintPending(localDeviceId());
  if(identity!==session.currentScope())return;
  if(pending.machinePrintingEnabled)await devicePrinting.start({factoryId:scope.factoryId,expectedTenantId:scope.tenantId,deviceId:localDeviceId()});
  else devicePrinting.stop();
}
