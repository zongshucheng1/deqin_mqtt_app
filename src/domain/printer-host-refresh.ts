import type { HostStatus } from "../services/native";

export interface PrinterHostPort {
  status(): HostStatus;
  stop(): HostStatus;
  configure(hostId: string, factoryId: string): Promise<HostStatus>;
  start(): Promise<HostStatus>;
}
/** No credential clearing, evidence deletion, task retry or printer sending is allowed here. */
export async function applyPrinterToHost(
  port: PrinterHostPort,
  factoryId: string,
  printerId: string,
  stillAuthorized: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<HostStatus> {
  const assertScope = () => { if (!stillAuthorized()) throw new Error("工厂或账号已切换，本次终端更新已停止，请重新读取授权"); };
  assertScope();
  const before = port.status();
  if (!before.supported) throw new Error(before.reason || "请使用Android终端");
  const binding = before.binding;
  if (!binding?.configured || !binding.hostId || binding.factoryId !== factoryId)
    throw new Error("请先在固定主机运行页绑定当前工厂的终端");
  if (binding.printerIds.includes(printerId)) return before;
  const wasRunning = before.running === true;
  if (wasRunning) {
    if (!before.evidence?.countsAvailable || before.evidence.unsettledPrintCount !== 0 || before.evidence.pendingEventCount !== 0)
      throw new Error("本终端仍有未结执行证据或证据数量不明，请先核对固定主机诊断；不会清空证据或强制重启");
    assertScope();
    port.stop();
  }
  let stopped = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    assertScope();
    const status = port.status();
    if (status.running !== true && ["STOPPED", "CONFIGURATION_REQUIRED"].includes(status.state || "")) {
      if (!status.binding?.configured || status.binding.hostId !== binding.hostId || status.binding.factoryId !== factoryId)
        throw new Error("停止期间终端绑定已变化，保持停止；未更新授权或重启，请重新核对当前工厂终端");
      if (!status.evidence?.countsAvailable || status.evidence.unsettledPrintCount !== 0 || status.evidence.pendingEventCount !== 0)
        throw new Error("停止期间发现未结执行证据或数量不明，保持停止；未更新授权或重启，请先核对原任务");
      stopped = true;
      break;
    }
    await wait(200);
  }
  if (!stopped) throw new Error("终端尚未确认停止，未覆盖运行配置；请稍后核对主机状态");
  assertScope();
  const configured = await port.configure(binding.hostId, factoryId);
  assertScope();
  if (!configured.supported) throw new Error(configured.reason || "终端授权更新未成功");
  if (wasRunning) {
    const started = await port.start();
    assertScope();
    if (started.started !== true && started.running !== true)
      throw new Error(started.reason || "打印机授权已更新，终端未恢复运行，请到固定主机运行页检查");
  }
  const after = port.status();
  if (after.binding?.hostId !== binding.hostId || after.binding.factoryId !== factoryId || !after.binding.printerIds.includes(printerId))
    throw new Error("尚未读取到本终端的新打印机授权，请到固定主机运行页核对");
  return after;
}
