import {
  deploymentIdentity,
  isAllowedApiBase,
  isPrivateLanHttpApi,
  type DeploymentConfig,
} from "../domain/deployment";
let bootError = "";
let revision = 0;
export const deploymentRevision = () => revision;
const addressKey = "dq.localServiceAddress.v1";
interface DeploymentPorts {
  get(key: string): unknown;
  set(key: string, value: string): void;
  remove(key: string): void;
  clearSession(): void;
  stopHost(): void;
}
let runtimePorts: DeploymentPorts | undefined;
export const deploymentStartupError = () => bootError;
export function recordDeploymentStartupError(message: string) {
  bootError = message;
}

/** Display-only metadata. A missing deployment must not prevent showing its startup error. */
export function localServiceInfo(): Readonly<{ apiBaseUrl: string; defaultApiBaseUrl: string }> | null {
  if (typeof __DEQIN_DEPLOYMENT__ === "undefined") return null;
  const buildConfig = __DEQIN_DEPLOYMENT__;
  let config = buildConfig;
  try { config = effectiveDeployment(config); } catch { /* Keep the startup error screen renderable. */ }
  return config?.localService === true && typeof config.apiBaseUrl === "string"
    ? { apiBaseUrl: config.apiBaseUrl, defaultApiBaseUrl: buildConfig.apiBaseUrl }
    : null;
}

function effectiveDeployment(config: Readonly<DeploymentConfig>): Readonly<DeploymentConfig> {
  if (config.localService !== true || config.profile !== "development") return config;
  const saved = typeof uni !== "undefined" ? uni.getStorageSync(addressKey) : undefined;
  if (typeof saved !== "string" || !isPrivateLanHttpApi(saved)) return config;
  return { ...config, apiBaseUrl: saved, h5Proxy: false };
}

export function normalizeLocalServiceAddress(value: string): string {
  let address = value.trim().replace(/\/+$/, "");
  if (!address.includes("://")) address = "http://" + address;
  if (!isPrivateLanHttpApi(address))
    throw new Error("请输入有效的局域网 IP 和端口，例如 192.168.0.241:8080");
  return address;
}

/** Only the explicitly selected local package may change its public LAN origin. */
export function changeLocalServiceAddress(value: string, ports = runtimePorts): void {
  const current = deployment();
  if (current.localService !== true || current.profile !== "development")
    throw new Error("仅本地服务版支持修改连接地址");
  const address = normalizeLocalServiceAddress(value);
  if (address === current.apiBaseUrl) return;
  if (!ports) throw new Error("应用尚未初始化，请重新打开后再试");
  // Clear authorization before publishing a different endpoint; journals retain their original scope.
  ports.stopHost();
  ports.clearSession();
  for (const key of ["dq.factoryId", "dq.hostId", "dq.tokenExpiresAt", "dq.tenantId"])
    ports.remove(key);
  const identity = deploymentIdentity({ ...current, apiBaseUrl: address });
  ports.set("dq.deploymentIdentity", identity);
  ports.set(addressKey, address);
  revision++;
  bootError = "";
}

/** Vite supplies public metadata; only a local package accepts a validated LAN override. */
export function deployment(): Readonly<DeploymentConfig> {
  if (typeof __DEQIN_DEPLOYMENT__ === "undefined")
    throw new Error("当前安装包部署信息不完整，请联系管理员获取正确版本");
  const config = effectiveDeployment(__DEQIN_DEPLOYMENT__);
  if (!isAllowedApiBase(config) || !config.clientId || !config.rsaPublicKey)
    throw new Error("当前安装包部署信息异常，请联系管理员获取正确版本");
  return config;
}
export function apiIdentity(): string {
  return deployment().apiBaseUrl;
}
export function currentDeploymentIdentity(): string {
  return deploymentIdentity(deployment());
}

export function initializeDeploymentSession(ports: DeploymentPorts): void {
  runtimePorts = ports;
  const identity = currentDeploymentIdentity();
  if (ports.get("dq.deploymentIdentity") !== identity) {
    // Do not reuse a token/host belonging to an address entered in an older build.
    ports.stopHost();
    ports.clearSession();
    for (const key of ["dq.factoryId", "dq.hostId", "dq.tokenExpiresAt"])
      ports.remove(key);
    ports.set("dq.deploymentIdentity", identity);
  }
  // Pending journals keep their original API/tenant/account/factory identities.
  for (const key of ["dq.server", "dq.clientId", "dq.tenantId", "dq.publicKey"])
    ports.remove(key);
  bootError = "";
}
