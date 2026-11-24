import type { PrintConfig, Printer, PrinterProtocol } from "./types";

export interface DiscoveredPrinter {
  candidateId: string;
  serviceName: string;
  printerName: string;
  model?: string;
  protocol: PrinterProtocol;
  endpointUri?: string;
  address?: string;
  port?: number;
  state: "RESOLVING" | "READY" | "LOST" | "ERROR" | "UNSUPPORTED";
  reason?: string;
  message?: string;
  printerUuid?: string;
  advertisedFormats: string[];
}
export interface PrinterDiscoverySnapshot {
  supported: boolean;
  scanId?: string;
  state: "SEARCHING" | "COMPLETE" | "CANCELED" | "ERROR" | "UNSUPPORTED";
  reason?: string;
  message?: string;
  startedAtMs?: number;
  deadlineAtMs?: number;
  expiresAtMs?: number;
  candidates: DiscoveredPrinter[];
  warnings: string[];
}
export interface DiscoveredPrinterProbe extends Record<string, unknown> {
  supported: boolean;
  success: boolean;
  scanId: string;
  candidateId: string;
  endpointUri?: string;
  protocol?: PrinterProtocol;
  printerName?: string;
  reason?: string;
  message?: string;
  verificationScope?: "DISCOVERY_ONLY";
}

const usbEndpoint = /^usb:\/\/2867-152d\/(app_[A-Za-z0-9_-]{16,60})\/([a-f0-9]{64})$/;
/** USB endpoints contain only the owning app device ID and a hashed printer identity. */
export function usbPrinterOwner(uri: string): string | undefined {
  return typeof uri === "string" ? usbEndpoint.exec(uri)?.[1] : undefined;
}
/** Works in Android's service JS engine without a browser URL implementation. */
export function printerEndpointKey(uri: string): string {
  if (usbPrinterOwner(uri)) return uri;
  const match = /^(ipps?):\/\/(\[[a-f\d:.]+(?:%25[a-z\d_.-]+)?\]|[^\s\/:@?#\[\]]+)(?::(\d+))?(\/[^\s?#]*)$/i.exec(uri.trim());
  if (!match) throw new Error("发现的打印机地址无效，请重新搜索");
  const port = Number(match[3] || "631");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("发现的打印机端口无效，请重新搜索");
  const host = match[2].includes("%25") ? match[2].slice(0, match[2].indexOf("%25")).toLowerCase() + match[2].slice(match[2].indexOf("%25")) : match[2].toLowerCase();
  return `${match[1].toLowerCase()}://${host}:${port}${match[4]}`;
}
/** Permission may reveal a USB endpoint only after the selected candidate is probed. */
export function validateDiscoveryIdentity(scanId: string, candidate: DiscoveredPrinter,
  result: DiscoveredPrinterProbe, ownerDeviceId: string): string {
  const invalid = () => new Error("打印机识别结果已变化，请重新搜索");
  if (!result.success || result.scanId !== scanId || result.candidateId !== candidate.candidateId ||
      result.verificationScope !== "DISCOVERY_ONLY" || !result.endpointUri || result.protocol !== candidate.protocol)
    throw invalid();
  if (candidate.protocol === "USB_TSPL") {
    if (!scanId.startsWith("usb:") || usbPrinterOwner(result.endpointUri) !== ownerDeviceId) throw invalid();
  } else if (scanId.startsWith("usb:") || !candidate.endpointUri ||
    printerEndpointKey(result.endpointUri) !== printerEndpointKey(candidate.endpointUri)) throw invalid();
  return printerEndpointKey(result.endpointUri);
}
export function registeredPrinter(rows: Printer[], candidate: DiscoveredPrinter): Printer | undefined {
  if (!candidate.endpointUri || candidate.state !== "READY") return;
  let key: string;
  try { key = printerEndpointKey(candidate.endpointUri); } catch { return; }
  return rows.find((printer) => {
    try { return printerEndpointKey(printer.endpointUri) === key; }
    catch { return false; }
  });
}
export function paperError(config: PrintConfig): string {
  if (!/^\d+(\.\d{1,3})?$/.test(config.paperWidthMm) ||
      !/^\d+(\.\d{1,3})?$/.test(config.paperHeightMm) ||
      Number(config.paperWidthMm) < 10 || Number(config.paperWidthMm) > 600 ||
      Number(config.paperHeightMm) < 10 || Number(config.paperHeightMm) > 1200)
    return "请填写10至600mm纸张宽度、10至1200mm纸张高度（最多3位小数）";
  if (!Number.isInteger(config.copies) || config.copies < 1 || config.copies > 10)
    return "打印份数须为1至10的整数";
  for (const [offset, size] of [[config.horizontalOffsetMm, config.paperWidthMm], [config.verticalOffsetMm, config.paperHeightMm]]) {
    if (!/^-?\d+(\.\d{1,3})?$/.test(offset) || Math.abs(Number(offset)) >= Number(size) / 2)
      return "打印偏移须小于对应纸张尺寸的一半（最多3位小数）";
  }
  return "";
}
export function configValues(config: PrintConfig): string {
  // Deliberately excludes server version, timestamps and verification evidence.
  return JSON.stringify([config.warehouseType, config.printerId, config.paperCode || "", config.paperWidthMm,
    config.paperHeightMm, config.templateCode, config.templateRevision, config.copies,
    config.horizontalOffsetMm, config.verticalOffsetMm, config.autoPrint]);
}
export function changeDefault(config: PrintConfig, printerId: string): boolean {
  // Re-selecting the same default is a true no-op, including an enabled autoPrint.
  if (config.printerId === printerId) return false;
  config.printerId = printerId;
  config.autoPrint = 0;
  config.verifiedFingerprint = undefined;
  return true;
}
export const discoveryMessage = (reason?: string, fallback?: string) => ({
  LAN_NETWORK_UNAVAILABLE: "未连接可用局域网，请连接打印机所在的Wi-Fi或有线网络后重试。",
  DISCOVERY_PERMISSION_DENIED: "局域网发现权限未获允许，请在系统设置中允许后重新搜索。",
  LOCAL_NETWORK_PERMISSION_REQUIRED: "需要局域网访问权限，请允许后重新搜索。",
  DISCOVERY_UNSUPPORTED: "此设备不支持局域网自动发现，请使用受支持的Android终端。",
  DISCOVERY_EXPIRED: "本次搜索已过期，请重新搜索后选择设备。",
  DISCOVERY_STALE: "本次搜索已失效，请重新搜索后选择设备。",
  CANDIDATE_LOST: "该打印机已离线或离开当前网络，请重新搜索。",
  PRINTER_DISCOVERY_PARSE_FAILED: "读取打印机信息失败，请重新搜索；这不代表打印机不支持A4。",
  PRINTER_RESOLVE_FAILED: "未能读取打印机地址，请检查连接后重新搜索。",
  USB_HOST_UNSUPPORTED: "此手机暂不支持USB直连打印，请确认设备支持OTG。",
  USB_PERMISSION_REQUIRED: "选择打印机后，请在系统提示中允许访问USB设备。",
  USB_PERMISSION_DENIED: "USB访问未获允许，请重新选择打印机并在系统提示中允许。",
  USB_PERMISSION_TIMEOUT: "等待USB授权超时，请重新选择打印机并在系统提示中允许。",
  USB_DEVICE_DISCONNECTED: "USB打印机已断开，请检查OTG和打印机数据线后重新搜索。",
  USB_PAPER_UNSUPPORTED: "这台USB打印机不支持当前标签尺寸，请核对纸张设置。",
  USB_DEVICE_UNSUPPORTED: "当前USB设备不是支持的得力GE540，请核对打印机型号。",
  USB_SERIAL_UNAVAILABLE: "无法确认这台打印机的身份，请重新连接后再试。",
  USB_ENDPOINT_OWNER_MISMATCH: "这台USB打印机尚未在当前设备上连接，请重新搜索并选择。",
  UNSUPPORTED: "此打印机当前无法通过支持的网络打印方式使用。",
}[reason || ""] || fallback || "搜索未完成，请检查局域网连接后重试。");
