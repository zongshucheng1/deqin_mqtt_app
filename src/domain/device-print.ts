import type { Warehouse, PrinterProtocol } from "./types";
import { usbPrinterOwner } from "./printer-setup";
export interface DevicePrinterDefault {
  printerId: string;
  printerName: string;
  endpointUri: string;
  protocol: PrinterProtocol;
  paperWidthMm: string;
  paperHeightMm: string;
  copies: number;
}
export interface DevicePrintScope { api: string; tenantId: string; factoryId: string; deviceId?:string }
export interface DevicePrintResult { status: string; jobId?: string; version?: number; error?: string; deliveryKind?: "USB_BYTES" | "PRINTER_JOB"; message?: string }
export interface DevicePrintStorage { get(key:string):unknown;set(key:string,value:unknown):void;remove(key:string):void }
export function deviceDefaultKey(scope:DevicePrintScope,warehouse:Warehouse) {
  if(!scope.api||!scope.tenantId||!scope.factoryId)throw new Error("请先选择已授权工厂");
  return "dq.devicePrinter:"+JSON.stringify([scope.api,scope.tenantId,scope.factoryId,scope.deviceId||"",warehouse]);
}
export function validateDeviceDefault(value:DevicePrinterDefault,ownerDeviceId?:string):string {
  if(typeof value.printerId!=="string"||!/^\d+$/.test(value.printerId)||typeof value.printerName!=="string"||!value.printerName.trim())return "请先选择本仓默认打印机";
  if(value.protocol==="USB_TSPL") {
    if(!ownerDeviceId||usbPrinterOwner(value.endpointUri)!==ownerDeviceId)return "USB打印机不属于当前设备，请重新连接并选择";
  } else if(!["IPP","IPPS"].includes(value.protocol)||typeof value.endpointUri!=="string"||!value.endpointUri.toLowerCase().startsWith(value.protocol.toLowerCase()+"://"))return "打印机连接信息不完整，请重新搜索";
  const w=Number(value.paperWidthMm),h=Number(value.paperHeightMm);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<10||w>600||h<10||h>1200)return "请填写有效纸张尺寸";
  if(value.protocol==="USB_TSPL"&&(w!==80||h!==80))return "GE540当前使用80×80mm标签纸";
  if(!Number.isInteger(value.copies)||value.copies<1||value.copies>10)return "打印份数为1到10";
  return "";
}
export function deviceDefaults(storage:DevicePrintStorage) {
  return {
    get(scope:DevicePrintScope,warehouse:Warehouse):DevicePrinterDefault|undefined {
      const value=storage.get(deviceDefaultKey(scope,warehouse));
      if(!value||typeof value!=="object"||validateDeviceDefault(value as DevicePrinterDefault,scope.deviceId))return undefined;
      return {...value as DevicePrinterDefault};
    },
    set(scope:DevicePrintScope,warehouse:Warehouse,value:DevicePrinterDefault) {
      const error=validateDeviceDefault(value,scope.deviceId);if(error)throw new Error(error);
      storage.set(deviceDefaultKey(scope,warehouse),{...value});
    },
  };
}
/** A committed stock record remains successful even when label preparation or printing fails. */
export async function automaticInboundPrint(
  target:DevicePrinterDefault|undefined,
  dependencies:{sameScope:()=>boolean;label:()=>Promise<string>;print:(target:DevicePrinterDefault,labelId:string)=>Promise<DevicePrintResult>},
):Promise<DevicePrintResult> {
  if(!target)return {status:"NO_DEFAULT",error:"入库已成功，请为本设备选择本仓默认打印机"};
  const frozen={...target};
  try {
    if(!dependencies.sameScope())throw new Error("工厂或登录身份已变化，入库已保存，请在原设备核对打印");
    const labelId=await dependencies.label();
    if(!dependencies.sameScope())throw new Error("工厂或登录身份已变化，未继续打印");
    return await dependencies.print(frozen,labelId);
  }catch(error){return {status:"FAILED",error:error instanceof Error?error.message:"入库已成功，打印失败，请查看详情"};}
}
export function devicePrintText(value?:DevicePrintResult) {
  if(!value)return "";
  if(value.status==="SUBMITTED"&&value.deliveryKind==="USB_BYTES")return "入库成功，标签数据已发送，请核对出纸";
  return ({WAITING_LABEL:"入库成功，正在准备标签",PREPARING:"入库成功，正在准备打印",SENDING:"入库成功，正在发送打印",SUBMITTED:"入库成功，打印机已接收标签",COMPLETED:"入库成功，打印机已确认完成",UNKNOWN:"入库成功，打印结果待核对",FAILED:"入库成功，标签打印失败",NO_DEFAULT:"入库成功，尚未选择本仓默认打印机"} as Record<string,string>)[value.status]||value.status;
}
