// #ifdef APP-PLUS
import {
  configureFromServer,
  startHost,
  stopHost,
  getHostStatus,
  clearHostCredentials,
  probePrinter,
  testPrinter,
  getPrinterTest,
  requestHostPermissions,
  getSessionToken,
  setSessionToken,
  clearSessionToken,
  startPrinterDiscovery,
  startUsbPrinterDiscovery,
  getPrinterDiscovery,
  cancelPrinterDiscovery,
  probeDiscoveredPrinter,
  printDeviceLabel,
  getPrintDeviceId,
  startDevicePrinting,
  stopDevicePrinting,
  openExternalMirror,
} from "@/uni_modules/deqin-host";
// #endif
import { endpoint } from "./http";
import { deployment } from "./deployment";
import type { PrinterDiscoverySnapshot, DiscoveredPrinterProbe } from "../domain/printer-setup";
import {
  createSessionTokenStore,
  createKeychainSessionPort,
  installSessionTokenStore,
  uniSessionStorage,
  sessionToken,
} from "./session-token";

export function supportsExternalMirror(): boolean {
  // #ifdef APP-PLUS
  return uni.getSystemInfoSync().platform === "android";
  // #endif
  // #ifndef APP-PLUS
  return false;
  // #endif
}

export async function openExternalMirrorSettings(): Promise<void> {
  // #ifdef APP-PLUS
  if (supportsExternalMirror() && await openExternalMirror()) return;
  // #endif
  throw new Error("请在 Android APP 前台打开外接屏镜像");
}

export function initializeSessionStorage() {
  // #ifdef APP-PLUS
  const platform = uni.getSystemInfoSync().platform;
  const bridge = { get: getSessionToken, set: setSessionToken, clear: clearSessionToken };
  installSessionTokenStore(
    createSessionTokenStore(
      platform === "android" || platform === "ios"
        ? platform
        : "unsupported",
      uniSessionStorage,
      platform === "ios" ? createKeychainSessionPort(bridge) : bridge,
    ),
  );
  // #endif
}
export interface HostStatus {
  supported: boolean;
  running?: boolean;
  started?: boolean;
  state?: string;
  reason?: string;
  bootId?: string;
  lastError?: string;
  needsResume?: boolean;
  binding?: {
    configured: boolean;
    hostId?: string;
    factoryId?: string;
    deviceStreams: {
      ruleId: string;
      deviceId: string;
      streamId: string;
      warehouse: string;
      verified: boolean;
      stateStatus?: string;
      requiresBaseline?: boolean;
      lastMessageAtMs?: string;
    }[];
    printerIds: string[];
  };
  connection?: {
    backend: string;
    mqtt: string;
    lastHeartbeatAtMs?: string;
    lastServerContactAtMs?: string;
    lastMessageAtMs?: string;
  };
  evidence?: {
    pendingEventCount?: number | null;
    unsettledPrintCount?: number | null;
    countsAvailable: boolean;
    scope: "LOCAL_EVIDENCE_CURRENT_BINDING";
  };
  leases?: {
    resourceType: string;
    resourceKey: string;
    status: string;
    expiresAtMs?: string;
    observedAtMs?: string;
    errorCode?: string;
  }[];
  faults?: {
    scope: string;
    code: string;
    occurredAtMs: string;
    resourceKey?: string;
  }[];
}
function unsupported(): HostStatus {
  return {
    supported: false,
    running: false,
    reason:
      "当前平台不支持持续采集和网络打印执行，请在已安装原生模块的Android固定主机上操作。",
  };
}
export const devicePrinting = {
  identity():string|undefined {
    // #ifdef APP-PLUS
    if(uni.getSystemInfoSync().platform==="android")return getPrintDeviceId();
    // #endif
    return undefined;
  },
  async print(data:Record<string,unknown>):Promise<import("../domain/device-print").DevicePrintResult> {
    // #ifdef APP-PLUS
    if(uni.getSystemInfoSync().platform!=="android")throw new Error("请在Android APP中打印标签");
    return JSON.parse(await printDeviceLabel(endpoint(),deployment().clientId,JSON.stringify(data)));
    // #endif
    // #ifndef APP-PLUS
    throw new Error("请在Android APP中使用本设备默认打印机，网页仅查看打印记录");
    // #endif
  },
  async start(data:Record<string,unknown>) {
    // #ifdef APP-PLUS
    if(uni.getSystemInfoSync().platform!=="android")return;
    const permission=JSON.parse(await requestHostPermissions());
    if(!permission.granted)throw new Error("请允许后台打印通知，以便本设备持续打印机器入库标签");
    return JSON.parse(startDevicePrinting(endpoint(),deployment().clientId,JSON.stringify(data)));
    // #endif
  },
  stop() {
    // #ifdef APP-PLUS
    return JSON.parse(stopDevicePrinting());
    // #endif
  },
};
function nativeReason(reason?: string) {
  if (!reason) return undefined;
  return (
    (
      {
        FOREGROUND_ACTIVITY_REQUIRED: "请保持APP前台后启动固定主机",
        NOTIFICATION_PERMISSION_REQUIRED: "请允许出入库固定主机通知",
        ENABLE_NOTIFICATIONS_IN_SYSTEM_SETTINGS:
          "通知权限已被拒绝，请到系统设置中开启固定主机通知",
        HOST_NOT_CONFIGURED: "请先配置当前授权固定主机",
        CONNECTED_DEVICE_ROLE_NOT_CONFIRMED:
          "请先确认当前终端作为现场固定设备执行主机",
      } as Record<string, string>
    )[reason] || reason
  );
}
function parsed(value: string): HostStatus {
  try {
    const result = JSON.parse(value) as HostStatus;
    if (result.running === undefined && result.state)
      result.running = ["RUNNING", "STARTING", "CONNECTING"].includes(
        result.state,
      );
    result.reason = nativeReason(result.reason);
    return result;
  } catch {
    throw new Error("原生模块返回异常，请检查插件版本");
  }
}
export const nativeHost = {
  status(): HostStatus {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return unsupported();
    return parsed(getHostStatus());
    // #endif
    // #ifndef APP-PLUS
    return unsupported();
    // #endif
  },
  async configure(hostId: string, factoryId: string): Promise<HostStatus> {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return unsupported();
    return parsed(
      await configureFromServer(
        endpoint(),
        sessionToken.get(),
        hostId,
        factoryId,
        deployment().clientId,
      ),
    );
    // #endif
    // #ifndef APP-PLUS
    return unsupported();
    // #endif
  },
  async start(): Promise<HostStatus> {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return unsupported();
    const permission = JSON.parse(await requestHostPermissions()) as {
      granted: boolean;
      reason?: string;
    };
    if (!permission.granted)
      return {
        supported: true,
        started: false,
        running: false,
        reason:
          nativeReason(permission.reason) ||
          "请允许出入库固定主机通知；若已永久拒绝，请到系统设置中开启通知权限。",
      };
    return parsed(startHost());
    // #endif
    // #ifndef APP-PLUS
    return unsupported();
    // #endif
  },
  stop(): HostStatus {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return unsupported();
    return parsed(stopHost());
    // #endif
    // #ifndef APP-PLUS
    return unsupported();
    // #endif
  },
  clear() {
    // #ifdef APP-PLUS
    clearHostCredentials();
    // #endif
  },
  async probe(
    endpointUri: string,
    width: number,
    height: number,
  ): Promise<Record<string, unknown>> {
    // #ifdef APP-PLUS
    return JSON.parse(await probePrinter(endpointUri, width, height));
    // #endif
    // #ifndef APP-PLUS
    throw new Error(unsupported().reason);
    // #endif
  },
  async test(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    // #ifdef APP-PLUS
    return JSON.parse(await testPrinter(JSON.stringify(data)));
    // #endif
    // #ifndef APP-PLUS
    throw new Error(unsupported().reason);
    // #endif
  },
  async testStatus(key: string): Promise<Record<string, unknown> | null> {
    // #ifdef APP-PLUS
    return JSON.parse(await getPrinterTest(key));
    // #endif
    // #ifndef APP-PLUS
    throw new Error(unsupported().reason);
    // #endif
  },
};

const discoveryUnsupported = (): PrinterDiscoverySnapshot => ({
  supported: false, state: "UNSUPPORTED", candidates: [], warnings: [],
  message: "自动搜索和标签打印仅支持已安装原生模块的Android终端；网页版可查看各仓库现有配置。",
});
export const printerDiscovery = {
  startUsb(): PrinterDiscoverySnapshot {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return discoveryUnsupported();
    return JSON.parse(startUsbPrinterDiscovery());
    // #endif
    // #ifndef APP-PLUS
    return discoveryUnsupported();
    // #endif
  },
  start(timeoutMs = 12000): PrinterDiscoverySnapshot {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return discoveryUnsupported();
    return JSON.parse(startPrinterDiscovery(timeoutMs));
    // #endif
    // #ifndef APP-PLUS
    return discoveryUnsupported();
    // #endif
  },
  snapshot(scanId: string): PrinterDiscoverySnapshot {
    // #ifdef APP-PLUS
    if (uni.getSystemInfoSync().platform !== "android") return discoveryUnsupported();
    return JSON.parse(getPrinterDiscovery(scanId));
    // #endif
    // #ifndef APP-PLUS
    return discoveryUnsupported();
    // #endif
  },
  cancel(scanId: string): void {
    // #ifdef APP-PLUS
    cancelPrinterDiscovery(scanId);
    // #endif
  },
  async probe(scanId: string, candidateId: string, width: number, height: number): Promise<DiscoveredPrinterProbe> {
    // #ifdef APP-PLUS
    return JSON.parse(await probeDiscoveredPrinter(scanId, candidateId, width, height));
    // #endif
    // #ifndef APP-PLUS
    throw new Error(discoveryUnsupported().message);
    // #endif
  },
};
