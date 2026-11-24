import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as domain from "../src/domain/device-print";

const owner="app_synthetic_print_device_012";
const network={printerId:"101",printerName:"网络打印机",protocol:"IPP",endpointUri:"ipp://192.168.8.50:631/ipp/print",paperWidthMm:"210",paperHeightMm:"297",copies:1};
const usb={...network,printerId:"102",printerName:"旧USB",protocol:"USB_TSPL",endpointUri:`usb://2867-152d/${owner}/${"a".repeat(64)}`,paperWidthMm:"80",paperHeightMm:"80"};
const record={id:"201",warehouseType:"RAW_WOOD"};
function service(){
  const storage=new Map<string,any>(),printed:any[]=[],requests:string[]=[];
  const session={ready:true,context:{tenantId:"tenant-a",userId:"user-a"},factoryId:"factory-a",currentScope:()=>"session-a"};
  const module={exports:{} as any};
  const mocks:Record<string,any>={
    vue:{reactive:(v:any)=>v},"../stores/session":{useSession:()=>session},"./deployment":{apiIdentity:()=>"https://api.example/prod-api"},
    "./journal":{requestKey:()=>"synthetic-intent-012"},"./api":{api:{latestLabel:async()=>{requests.push("label");return{id:"301",status:"READY"};}}},
    "./session-token":{sessionToken:{get:()=>"synthetic-token"}},"../services/native":{devicePrinting:{identity:()=>owner,print:async(data:any)=>{printed.push(data);return{status:"SUBMITTED",jobId:"401"};}}},
    "../domain/device-print":domain,
  };
  const js=ts.transpileModule(fs.readFileSync(new URL("../src/services/device-print.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:(id:string)=>{if(!(id in mocks))throw new Error("Unexpected import "+id);return mocks[id];},uni:{getStorageSync:(k:string)=>storage.get(k),setStorageSync:(k:string,v:any)=>storage.set(k,v),removeStorageSync:(k:string)=>storage.delete(k)},setTimeout,clearTimeout});
  return {api:module.exports,storage,printed,requests};
}
function job(){return{id:"401",recordId:record.id,labelId:"301",warehouseType:"RAW_WOOD",deviceId:owner,status:"FAILED",version:1,attempts:[{remoteStatus:{deliveryKind:"USB_BYTES"}}]};}

test("发布版读取旧USB默认不会激活或删除原配置",()=>{
  const s=service(),scope=s.api.printScope();s.api.localPrinterDefaults.set(scope,"RAW_WOOD",usb);
  assert.equal(s.api.currentDefault("RAW_WOOD"),undefined);
  assert.equal(s.api.localPrinterDefaults.get(scope,"RAW_WOOD").endpointUri,usb.endpointUri);
  assert.equal(s.storage.size,1);assert.equal(s.printed.length,0);
});
test("已有网络默认及原纸张尺寸保持，正常入库仍自动发送",async()=>{
  const s=service();s.api.localPrinterDefaults.set(s.api.printScope(),"RAW_WOOD",network);
  const target=s.api.currentDefault("RAW_WOOD");assert.equal(target.paperWidthMm,"210");assert.equal(target.paperHeightMm,"297");
  const result=await s.api.printRecordOnDevice(record);assert.equal(result.status,"SUBMITTED");assert.equal(s.printed.length,1);assert.equal(s.printed[0].protocol,"IPP");assert.equal(s.printed[0].paperWidthMm,"210");
});
test("显式冻结的旧USB默认在准备标签前被拒绝",async()=>{
  const s=service();const result=await s.api.printRecordOnDevice(record,usb);
  assert.equal(result.status,"NO_DEFAULT");assert.match(result.error,/网络打印机/);assert.equal(s.requests.length,0);assert.equal(s.printed.length,0);
});
test("旧USB回执任务不能直接失败重试",async()=>{
  const s=service();await assert.rejects(s.api.retryDeviceJob(job()),/USB打印目标已停用/);assert.equal(s.printed.length,0);
});
test("已持久化USB补打意图不改投网络，不删除且不发送",async()=>{
  const s=service(),scope=s.api.printScope();s.api.localPrinterDefaults.set(scope,"RAW_WOOD",network);
  const key="dq.deviceReprint:dq.devicePrint:"+JSON.stringify([scope.api,scope.tenantId,scope.factoryId,scope.deviceId,record.id])+":"+job().id;
  const intent={...usb,labelId:"301",reason:"核对后补打",requestKey:"prior-usb-intent"};s.storage.set(key,intent);
  await assert.rejects(s.api.reprintOnDevice(job(),"301","核对后补打"),/旧补打目标已停用/);
  assert.equal(s.storage.get(key),intent);assert.equal(s.printed.length,0);
});
test("用户明确新补打可使用网络默认并保留USB父任务身份",async()=>{
  const s=service();s.api.localPrinterDefaults.set(s.api.printScope(),"RAW_WOOD",network);
  const result=await s.api.reprintOnDevice(job(),"301","核对后补打");assert.equal(result.status,"SUBMITTED");assert.equal(s.printed.length,1);
  assert.equal(s.printed[0].protocol,"IPP");assert.equal(s.printed[0].parentJobId,job().id);assert.equal(s.printed[0].requestKey,"synthetic-intent-012");
});
