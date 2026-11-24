import type { Context, Member, PlatformRoleOption } from "./types";
import { factoryTimeZone } from "./format";

export function assertContext(value: unknown): asserts value is Context {
  const context = value as Context;
  if (
    !context ||
    typeof context.tenantId !== "string" ||
    !context.tenantId ||
    typeof context.userId !== "string" ||
    !/^[1-9][0-9]{0,18}$/.test(context.userId) ||
    !Array.isArray(context.permissions) ||
    context.permissions.some((p) => typeof p !== "string") ||
    !Array.isArray(context.roleNames) ||
    context.roleNames.some((n) => typeof n !== "string" || !n.trim()) ||
    typeof context.capabilities?.work !== "boolean" ||
    typeof context.capabilities?.manage !== "boolean" ||
    !Array.isArray(context.factories) ||
    context.factories.some(
      (f) =>
        typeof f.factoryId !== "string" ||
        !/^[1-9][0-9]{0,18}$/.test(f.factoryId),
    )
  )
    throw new Error("服务器尚未提供统一角色与工厂授权，请更新后端后重新登录");
  context.factories.forEach((factory) => factoryTimeZone(factory.timezone));
}

export function platformRoleText(names: readonly string[] | undefined): string {
  return names?.length ? names.join("、") : "未分配平台角色";
}

export function canBindMemberTarget(
  permissions: readonly string[] | undefined,
  target: Pick<Member, "protectedSuperAdmin"> | undefined,
): boolean {
  return !!target && (target.protectedSuperAdmin === false || permissions?.includes("*:*:*") === true);
}

export function canChangeMemberStatus(
  permissions: readonly string[] | undefined,
  target: Pick<Member, "protectedSuperAdmin" | "canChangeStatus"> | undefined,
): boolean {
  return target?.canChangeStatus === true && canBindMemberTarget(permissions, target);
}

export function assertRoleOptions(
  value: unknown,
): asserts value is { rows: PlatformRoleOption[] } {
  const data = value as { rows: PlatformRoleOption[] };
  if (!data || !Array.isArray(data.rows))
    throw new Error("平台角色列表格式异常，请重新读取");
  const seen = new Set<string>();
  for (const role of data.rows) {
    if (
      !role ||
      typeof role.roleId !== "string" ||
      !/^[1-9][0-9]{0,18}$/.test(role.roleId) ||
      typeof role.roleName !== "string" ||
      !role.roleName.trim() ||
      typeof role.roleKey !== "string" ||
      !role.roleKey.trim() ||
      seen.has(role.roleId)
    )
      throw new Error("平台角色列表格式异常，请重新读取");
    seen.add(role.roleId);
  }
}
