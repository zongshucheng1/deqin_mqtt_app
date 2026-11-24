export const selectorKeys = ["DEQIN_BUILD_PROFILE", "VITE_APP_PROFILE", "VITE_API_BASE_URL", "VITE_AUTH_CLIENT_ID", "VITE_AUTH_RSA_PUBLIC_KEY", "VITE_AUTH_TENANT_MODE", "VITE_AUTH_ENCRYPT"] as const;
export function parseInternalUsbSelector(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z_]+)=([^\r\n]+)$/.exec(line);
    if (!match || !selectorKeys.includes(match[1] as typeof selectorKeys[number]) || Object.prototype.hasOwnProperty.call(result, match[1]) || match[2] !== match[2].trim())
      throw new Error("内部 USB selector 只允许工具生成的唯一公开参数，不接受重复、额外字段或多行值");
    result[match[1]] = match[2];
  }
  if (Object.keys(result).length !== selectorKeys.length || result.DEQIN_BUILD_PROFILE !== "internal-usb")
    throw new Error("内部 USB selector 参数不完整或模式不正确");
  return result;
}
export function assertSelectorMatches(selector: Record<string, string>, production: Record<string, string>, development: Record<string, string>): void {
  for (const key of selectorKeys) {
    if (production[key] !== selector[key] || (key !== "DEQIN_BUILD_PROFILE" && development[key] !== selector[key]))
      throw new Error(`内部 USB selector 与构建进程/开发公开配置不一致：${key}`);
  }
}
