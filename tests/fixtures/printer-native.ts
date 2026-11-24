/** Test-build alias only. Never imported by a production configuration or source module. */
import type { HostStatus } from "../../src/services/native";
import type { DiscoveredPrinter, PrinterDiscoverySnapshot } from "../../src/domain/printer-setup";
const candidates: DiscoveredPrinter[] = [
  { candidateId: "original", serviceName: "原木打印机", printerName: "原木打印机", model: "网络打印设备 A", protocol: "IPP", endpointUri: "ipp://192.168.8.50:631/ipp/print", state: "READY", advertisedFormats: ["image/pwg-raster"] },
  { candidateId: "new", serviceName: "车间打印机", printerName: "车间打印机", model: "网络打印设备 B", protocol: "IPP", endpointUri: "ipp://192.168.8.51:631/ipp/print", state: "READY", advertisedFormats: ["application/pdf"] },
  { candidateId: "unsupported", serviceName: "无法识别设备", printerName: "无法识别设备", protocol: "IPP", state: "UNSUPPORTED", reason: "PRINTER_SERVICE_UNSUPPORTED", advertisedFormats: [] },
];
const usbEndpoint = "usb://2867-152d/app_synthetic_print_device_012/" + "a".repeat(64);
const usbCandidate: DiscoveredPrinter = { candidateId: "usb-ge540", serviceName: "得力 GE540", printerName: "得力 GE540", model: "Deli GE540", protocol: "USB_TSPL", state: "READY", advertisedFormats: [] };
const state = {
  calls: [] as { method: string; args: unknown[] }[], mode: "complete", probeDelayMs: 0, probeSuccess: true,
  nativeTestStatus: "SUBMITTED", testThrows: false, statusDelay: false,
  devicePrintStatus: "SUBMITTED",
  usbMode: "complete", usbProbeReason: "", usbEndpointOverride: "",
  host: { supported: true, state: "RUNNING", running: true, bootId: "mock-boot", binding: { configured: true, hostId: "9223372036854775400", factoryId: "9007199254740993", printerIds: ["9223372036854775500"], deviceStreams: [] }, evidence: { countsAvailable: true, pendingEventCount: 0, unsettledPrintCount: 0, scope: "LOCAL_EVIDENCE_CURRENT_BINDING" } } as HostStatus,
};
(globalThis as any).__printerFixture = state;
let sequence = 0, currentId = "";
const record = (method: string, ...args: unknown[]) => { state.calls.push({ method, args }); };
function snapshot(id: string, first = false): PrinterDiscoverySnapshot {
  if(id.startsWith("usb:"))return {supported:state.usbMode!=="unsupported",scanId:id,state:state.usbMode==="unsupported"?"UNSUPPORTED":"COMPLETE",reason:state.usbMode==="unsupported"?"USB_HOST_UNSUPPORTED":undefined,message:state.usbMode==="unsupported"?"此手机不支持USB直连打印":undefined,candidates:state.usbMode==="complete"?[structuredClone(usbCandidate)]:[],warnings:[]};
  if (state.mode === "unsupported") return { supported: false, state: "UNSUPPORTED", candidates: [], warnings: [], message: "自动搜索和网络打印仅支持已安装原生模块的Android终端；网页版可查看各仓库现有配置。" };
  if (state.mode === "error") return { supported: true, scanId: id, state: "ERROR", reason: "LAN_NETWORK_UNAVAILABLE", message: "未连接可用局域网，请检查网络后重试。", candidates: [], warnings: [] };
  if (state.mode === "permission") return { supported: true, scanId: id, state: "ERROR", reason: "DISCOVERY_PERMISSION_DENIED", message: "局域网发现权限未获允许", candidates: [], warnings: [] };
  if (state.mode === "parse-error") return { supported: true, scanId: id, state: first ? "SEARCHING" : "COMPLETE", candidates: first ? [] : [{ candidateId: "parse-error", serviceName: "Brother DCP-T426W", printerName: "Brother DCP-T426W", protocol: "IPP", state: "ERROR", reason: "PRINTER_DISCOVERY_PARSE_FAILED", advertisedFormats: [] }], warnings: [] };
  return { supported: true, scanId: id, state: first ? "SEARCHING" : "COMPLETE", startedAtMs: Date.now(), expiresAtMs: Date.now() + 60000, candidates: first || state.mode === "empty" ? [] : structuredClone(candidates), warnings: [] };
}
export function initializeSessionStorage() {}
export const devicePrinting={
  identity(){return "app_synthetic_print_device_012";},
  async print(data:Record<string,unknown>){record("device.print",data);return {jobId:"9223372036854775700",status:state.devicePrintStatus,version:2,error:state.devicePrintStatus==="FAILED"?"打印机暂不可用":undefined,...(data.protocol==="USB_TSPL"&&state.devicePrintStatus==="SUBMITTED"?{deliveryKind:"USB_BYTES" as const,message:"标签数据已发送，请核对出纸"}:{})};},
  async start(data:Record<string,unknown>){record("device.start",data);return {running:true};},
  stop(){record("device.stop");return {running:false};},
};
export const printerDiscovery = {
  startUsb() { currentId = "usb:mock-scan-" + ++sequence; record("discovery.startUsb"); return snapshot(currentId); },
  start() { currentId = "mock-scan-" + ++sequence; record("discovery.start"); return snapshot(currentId, true); },
  snapshot(id: string) { record("discovery.snapshot", id); return snapshot(id); },
  cancel(id: string) { record("discovery.cancel", id); },
  async probe(scanId: string, candidateId: string, width: number, height: number) {
    record("discovery.probe", scanId, candidateId, width, height);
    if (state.probeDelayMs) await new Promise((resolve) => setTimeout(resolve, state.probeDelayMs));
    if(scanId.startsWith("usb:"))return {supported:true,success:!state.usbProbeReason,scanId,candidateId,endpointUri:state.usbEndpointOverride||usbEndpoint,protocol:"USB_TSPL" as const,printerName:usbCandidate.printerName,verificationScope:"DISCOVERY_ONLY" as const,reason:state.usbProbeReason||undefined};
    const candidate = candidates.find((item) => item.candidateId === candidateId)!;
    return { supported: true, success: state.probeSuccess, scanId, candidateId, endpointUri: candidate.endpointUri, protocol: candidate.protocol, printerName: candidate.printerName, paperWidthMm: width, paperHeightMm: height, observedAtMs: Date.now(), verificationScope: "DISCOVERY_ONLY" as const, reason: state.probeSuccess ? undefined : "PRINTER_PROBE_FAILED", message: state.probeSuccess ? undefined : "当前纸张未获打印机支持" };
  },
};
export const nativeHost = {
  status() { record("host.status"); return structuredClone(state.host); },
  stop() { record("host.stop"); if (!state.statusDelay) { state.host.running = false; state.host.state = "STOPPED"; } return structuredClone(state.host); },
  clear() { throw new Error("Fixture forbids credential/evidence clearing"); },
  async configure(hostId: string, factoryId: string) { record("host.configure", hostId, factoryId); state.host.binding = { configured: true, hostId, factoryId, printerIds: ["9223372036854775500", "9223372036854775510"], deviceStreams: [] }; return { supported: true }; },
  async start() { record("host.start"); state.host.running = true; state.host.state = "RUNNING"; return { supported: true, started: true }; },
  async probe(uri: string, width: number, height: number) { record("host.probe", uri, width, height); return { supported: true, success: true, hostId: "9223372036854775400", bootId: "mock-boot", endpointUri: uri, paperWidthMm: width, paperHeightMm: height, observedAtMs: Date.now(), capabilities: { formats: ["image/pwg-raster"], mediaSupported: ["iso_a4_210x297mm"], printerUuid: "urn:uuid:synthetic-printer" } }; },
  async test(data: Record<string, unknown>) {
    for (const field of ["requestKey", "printerResourceKey", "configFingerprint", "endpointUri", "protocol", "downloadUrl", "contentSha256"])
      if (typeof data[field] !== "string" || !data[field]) throw new Error("Invalid fixture PrinterTestRequest: " + field);
    if (!state.host.binding!.printerIds.includes(String(data.printerResourceKey)) || !["IPP", "IPPS"].includes(String(data.protocol)) || !String(data.downloadUrl).startsWith("https://") || !/^[a-f0-9]{64}$/.test(String(data.contentSha256))) throw new Error("Fixture PrinterTestRequest identity/file mismatch");
    for (const field of ["paperWidthMm", "paperHeightMm", "horizontalOffsetMm", "verticalOffsetMm"]) if (!Number.isFinite(Number(data[field]))) throw new Error("Invalid fixture paper: " + field);
    record("host.test", data); if (state.testThrows) throw new Error("原生试打响应丢失");
    return { success: true, status: "SUBMITTED", phase: "ACCEPTED", requestKey: data.requestKey, configFingerprint: data.configFingerprint, endpointUri: data.endpointUri, printerResourceKey: data.printerResourceKey, contentSha256: data.contentSha256, paperWidthMm: Number(data.paperWidthMm), paperHeightMm: Number(data.paperHeightMm), receipt: { remoteJobId: "301", remoteJobUri: String(data.endpointUri) + "/job/301", state: 5 }, leaseId: "synthetic-lease", fencingToken: "1", hostId: "9223372036854775400", bootId: "mock-boot", observedAtMs: Date.now() };
  },
  async testStatus(key: string) { record("host.testStatus", key); if (state.nativeTestStatus === "NULL") return null; return { success: state.nativeTestStatus !== "UNKNOWN", status: state.nativeTestStatus, bootId: "mock-boot", observedAtMs: Date.now() }; },
};
