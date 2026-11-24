import type { CreateRecord, PrintAgentCapabilities, Warehouse } from "../domain/types";
import { isWarehouse } from "../domain/warehouse";
import { useSession } from "../stores/session";
import { api } from "./api";
import { ApiError } from "./http";
import { pendingWrites } from "./journal";

/** Every warehouse is configured by the backend; missing support never selects a phone printer. */
export async function loadPrintAgentCapabilities(): Promise<PrintAgentCapabilities> {
  try {
    const result = await api.printAgentCapabilities();
    if (!result || !Array.isArray(result.warehouses) || result.warehouses.some(row =>
      !row || !isWarehouse(row.warehouseType) || typeof row.serverManagedPrinting !== "boolean" ||
      (row.serverManagedPrinting && row.executionMode !== "PC_AGENT")))
      throw new Error("服务器打印能力响应异常，请刷新后重试");
    return result;
  } catch (error) {
    if (error instanceof ApiError && String(error.code) === "404")
      throw new Error("后台尚未提供电脑打印服务，请联系管理员更新后端");
    throw error;
  }
}

export function serverManagesWarehouse(capabilities: PrintAgentCapabilities, warehouse: Warehouse): boolean {
  return capabilities.warehouses.some(row => row.warehouseType === warehouse &&
    row.serverManagedPrinting === true && row.executionMode === "PC_AGENT");
}

export async function submitInbound(data: CreateRecord) {
  const session = useSession(), scope = session.currentScope();
  const pending = pendingWrites().find(item => item.scope === scope && item.operation === "create:" + data.warehouseType);
  if (pending) {
    // Never rewrite an uncertain legacy request or create a second inventory record.
    if (pending.payload.printingMode !== "SERVER")
      throw new Error("存在旧版待确认入库，请先到“我的→待确认操作”核对原结果，勿重复入库");
  } else {
    const capabilities = await loadPrintAgentCapabilities();
    if (!serverManagesWarehouse(capabilities, data.warehouseType))
      throw new Error("本仓库尚未在后台启用电脑打印，请联系管理员完成仓库绑定和测试确认");
  }
  if (scope !== session.currentScope()) throw new Error("登录身份或工厂已变化，请重新提交");
  const printingMode = "SERVER" as const;
  const record = await api.create({ ...data, printingMode });
  return { record, printingMode };
}
