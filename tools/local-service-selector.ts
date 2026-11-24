import { isPrivateLanHttpApi } from "../src/domain/deployment";

export const localServiceSelectorKeys = [
  "DEQIN_BUILD_PROFILE", "VITE_LOCAL_SERVICE", "VITE_APP_PROFILE", "VITE_API_BASE_URL",
  "VITE_AUTH_CLIENT_ID", "VITE_AUTH_RSA_PUBLIC_KEY", "VITE_AUTH_TENANT_MODE", "VITE_AUTH_ENCRYPT",
] as const;

export function parseLocalServiceSelector(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z_]+)=([^\r\n]+)$/.exec(line);
    if (!match || !localServiceSelectorKeys.includes(match[1] as typeof localServiceSelectorKeys[number]) ||
        Object.prototype.hasOwnProperty.call(result, match[1]) || match[2] !== match[2].trim())
      throw new Error("本地服务 selector 仅允许唯一公开参数，不接受重复、额外字段或多行值");
    result[match[1]] = match[2];
  }
  if (Object.keys(result).length !== localServiceSelectorKeys.length ||
      result.DEQIN_BUILD_PROFILE !== "local-service" || result.VITE_LOCAL_SERVICE !== "true" ||
      result.VITE_APP_PROFILE !== "development" || result.VITE_AUTH_TENANT_MODE !== "discovery" ||
      result.VITE_AUTH_ENCRYPT !== "true" || !isPrivateLanHttpApi(result.VITE_API_BASE_URL))
    throw new Error("本地服务 selector 模式、私有 IPv4 地址或加密配置无效");
  return result;
}

export function assertLocalServiceSelectorMatches(
  selected: Record<string, string>, production: Record<string, string>, development: Record<string, string>,
): void {
  for (const key of localServiceSelectorKeys) {
    if (production[key] !== selected[key] || (key !== "DEQIN_BUILD_PROFILE" && development[key] !== selected[key]))
      throw new Error(`本地服务 selector 与当前构建目录的公开开发配置不一致：${key}`);
  }
}
