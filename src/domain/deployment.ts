/** Public deployment metadata only. Never put credentials or private keys here. */
export interface DeploymentConfig {
  profile: "production" | "development";
  apiBaseUrl: string;
  clientId: string;
  rsaPublicKey: string;
  tenantMode: "fixed" | "discovery";
  tenantId: string;
  h5Proxy: boolean;
  localService?: boolean;
}
/** Canonical RFC1918 IPv4 origin only; do not use URL's legacy numeric-host coercion. */
export function isPrivateLanHttpApi(value: string): boolean {
  const match = /^http:\/\/((?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2}))(?::([1-9]\d{0,4}))?$/.exec(value);
  if (!match || match[0] !== value) return false;
  const octets = match[1].split(".").map(Number);
  if (octets.some((part) => part > 255) || (match[2] && Number(match[2]) > 65535)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}
export function resolveDeployment(
  env: Record<string, string | undefined>,
  mode: string,
  platform: string,
  reviewed: { localService?: boolean } = {},
): Readonly<DeploymentConfig> {
  const failures: string[] = [];
  const profile = mode === "development" ? "development" : "production";
  const localService = reviewed.localService === true;
  const apiBaseUrl = (env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const clientId = (env.VITE_AUTH_CLIENT_ID || "").trim();
  const rsaPublicKey = (env.VITE_AUTH_RSA_PUBLIC_KEY || "")
    .trim()
    .replace(/\\n/g, "\n");
  const tenantMode = env.VITE_AUTH_TENANT_MODE || "discovery";
  const tenantId = (env.VITE_AUTH_TENANT_ID || "").trim();
  if ((env.VITE_LOCAL_SERVICE && !["true", "false"].includes(env.VITE_LOCAL_SERVICE)) ||
      ((env.VITE_LOCAL_SERVICE === "true" || env.DEQIN_BUILD_PROFILE === "local-service") && !localService) ||
      (localService && (profile !== "development" || env.VITE_LOCAL_SERVICE !== "true" ||
        env.DEQIN_BUILD_PROFILE !== "local-service")))
    failures.push("本地服务必须使用已审核的 local-service selector，不能仅用环境变量放开 HTTP");
  if (env.VITE_APP_PROFILE && env.VITE_APP_PROFILE !== profile)
    failures.push(
      "VITE_APP_PROFILE 必须与构建 mode 一致，开发联调必须显式使用 --mode development",
    );
  if (!apiBaseUrl)
    failures.push("缺少 VITE_API_BASE_URL：请由部署人员预置统一后端地址");
  else {
    let validHttps = false;
    try {
      const url = new URL(apiBaseUrl);
      validHttps =
        url.protocol === "https:" &&
        !!url.hostname &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash;
    } catch {
      /* Report the deployment error below. */
    }
    if (localService && !isPrivateLanHttpApi(apiBaseUrl))
      failures.push("本地服务 API 必须是 HTTP 私有 IPv4 地址及有效端口，不能包含路径、凭据或查询参数");
    else if (
      !validHttps &&
      !(profile === "development" && apiBaseUrl === "http://127.0.0.1:8080") &&
      !(localService && isPrivateLanHttpApi(apiBaseUrl))
    )
      failures.push(
        "API 地址必须使用 HTTPS；显式 development 联调仅允许 http://127.0.0.1:8080",
      );
  }
  if (!clientId || !/^[A-Za-z0-9_-]{1,64}$/.test(clientId))
    failures.push(
      "缺少或无效的 VITE_AUTH_CLIENT_ID：须使用后端已授权的公开客户端 ID",
    );
  if (!rsaPublicKey || /PRIVATE KEY|PASSWORD|SECRET/i.test(rsaPublicKey))
    failures.push(
      "缺少或无效的 VITE_AUTH_RSA_PUBLIC_KEY：仅可预置平台 RSA 公钥",
    );
  if (env.VITE_AUTH_ENCRYPT === "false")
    failures.push("禁止关闭登录 RSA/AES 加密");
  if (tenantMode !== "fixed" && tenantMode !== "discovery")
    failures.push("VITE_AUTH_TENANT_MODE 仅支持 fixed 或 discovery");
  if (tenantMode === "fixed" && !/^[A-Za-z0-9_-]{1,20}$/.test(tenantId))
    failures.push("固定企业模式须由部署人员提供 VITE_AUTH_TENANT_ID");
  if (failures.length)
    throw new Error("APP 部署配置检查失败：\n- " + failures.join("\n- "));
  return Object.freeze({
    profile,
    apiBaseUrl,
    clientId,
    rsaPublicKey,
    tenantMode: tenantMode as DeploymentConfig["tenantMode"],
    tenantId: tenantMode === "fixed" ? tenantId : "",
    h5Proxy: profile === "development" && platform === "h5",
    localService,
  });
}
export function deploymentIdentity(config: Readonly<DeploymentConfig>): string {
  return JSON.stringify([
    config.profile,
    config.apiBaseUrl,
    config.clientId,
    config.tenantMode,
    config.tenantId,
    config.rsaPublicKey,
    ...(config.localService === true ? ["local-service"] : []),
  ]);
}
export function isAllowedApiBase(config: Readonly<DeploymentConfig>): boolean {
  // Keep runtime validation lexical for older Android service contexts without URL.
  if (config.localService === true)
    return config.profile === "development" && isPrivateLanHttpApi(config.apiBaseUrl);
  if (config.localService != null && config.localService !== false) return false;
  return (
    /^https:\/\/[^/?#@\s]+(?:\/[^?#\s]*)?$/.test(config.apiBaseUrl) ||
    (config.profile === "development" &&
      config.apiBaseUrl === "http://127.0.0.1:8080")
  );
}
