export interface LoginTenant {
  tenantId: string;
  companyName: string;
}
/** Only the platform's public tenant discovery response can supply enterprise choices. */
export function discoveredTenants(value: unknown): LoginTenant[] {
  const data = value as { tenantEnabled?: boolean; voList?: unknown };
  if (!data || data.tenantEnabled !== true || !Array.isArray(data.voList))
    throw new Error("企业信息暂不可用，请稍后重试或联系管理员");
  const seen = new Set<string>();
  const tenants = data.voList.map((item: unknown) => {
    const tenant = item as LoginTenant;
    if (
      !tenant ||
      typeof tenant.tenantId !== "string" ||
      !/^[A-Za-z0-9_-]{1,20}$/.test(tenant.tenantId) ||
      typeof tenant.companyName !== "string" ||
      !tenant.companyName.trim() ||
      seen.has(tenant.tenantId)
    )
      throw new Error("企业信息格式异常，请稍后重试或联系管理员");
    seen.add(tenant.tenantId);
    return {
      tenantId: tenant.tenantId,
      companyName: tenant.companyName.trim(),
    };
  });
  if (!tenants.length) throw new Error("当前暂无可登录的企业，请联系管理员");
  return tenants;
}
