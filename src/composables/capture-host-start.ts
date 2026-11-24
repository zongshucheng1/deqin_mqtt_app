import type { HostStatus } from "../services/native";

interface CaptureHostPort {
  status(): HostStatus;
  stop(): HostStatus;
  configure(hostId: string, factoryId: string): Promise<HostStatus>;
  start(): Promise<HostStatus>;
}

const separationRequired =
  "该主机仍带旧手机打印授权，请在后台完成采集与电脑打印分离后再启动";

/** Refresh native configuration before every start; never clear persisted evidence. */
export async function startCaptureHost(
  port: CaptureHostPort,
  hostId: string,
  factoryId: string,
  stillAuthorized: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<HostStatus> {
  const assertScope = () => {
    if (!stillAuthorized())
      throw new Error("工厂、账号或主机已切换，启动已停止，请重新读取授权");
  };
  const isStopped = (value: HostStatus) =>
    value.running !== true &&
    ["STOPPED", "CONFIGURATION_REQUIRED"].includes(value.state || "");
  const assertCaptureOnly = (value: HostStatus) => {
    const binding = value.binding;
    if (
      !value.supported ||
      !binding?.configured ||
      binding.hostId !== hostId ||
      binding.factoryId !== factoryId ||
      !Array.isArray(binding.printerIds)
    )
      throw new Error("尚未读取到当前主机完整授权，保持停止，请刷新后重试");
    if (binding.printerIds.length) throw new Error(separationRequired);
  };

  assertScope();
  let current = port.status();
  if (!current.supported)
    throw new Error(current.reason || "当前平台不支持采集主机");
  if (!isStopped(current)) {
    const stopped = port.stop();
    if (!stopped.supported || stopped.reason)
      throw new Error(stopped.reason || "未能停止旧主机执行");
    for (let attempt = 0; attempt < 25; attempt++) {
      assertScope();
      current = port.status();
      if (isStopped(current)) break;
      await wait(200);
    }
  }
  if (!isStopped(current))
    throw new Error("主机尚未确认停止，未更新授权或重新启动，请稍后刷新");
  assertScope();
  const configured = await port.configure(hostId, factoryId);
  assertScope();
  if (!configured.supported || configured.reason)
    throw new Error(configured.reason || "主机授权更新未成功");
  // The installed native bridge returns only supported; status reads the saved configuration.
  if (configured.binding) assertCaptureOnly(configured);
  current = port.status();
  assertCaptureOnly(current);
  if (!isStopped(current))
    throw new Error(
      "配置更新期间主机状态发生变化，未发送启动请求，请先停止后重试",
    );
  assertScope();
  const started = await port.start();
  if (!stillAuthorized()) {
    port.stop();
    assertScope();
  }
  if (
    !started.supported ||
    started.reason ||
    (!started.started && !started.running)
  )
    throw new Error(started.reason || "采集主机未启动，请检查原生运行状态");
  return started;
}
