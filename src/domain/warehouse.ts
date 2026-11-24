import type { Warehouse, QuantitySource } from "./types";
export const warehouses: {
  code: Warehouse;
  name: string;
  short: string;
  unit: string;
  icon: string;
}[] = [
  { code: "RAW_WOOD", name: "原木库", short: "原木", unit: "根", icon: "木" },
  { code: "PEELING", name: "旋切库", short: "旋切", unit: "张", icon: "板" },
  { code: "DRYING", name: "烘干库", short: "烘干", unit: "张", icon: "热" },
  { code: "WOOD_CORE", name: "木芯库", short: "木芯", unit: "根", icon: "芯" },
  { code: "WHITE_BARK", name: "白皮库", short: "白皮", unit: "吨", icon: "皮" },
];
export function warehouse(code: Warehouse) {
  return warehouses.find((w) => w.code === code)!;
}
export function isWarehouse(v: unknown): v is Warehouse {
  return warehouses.some((w) => w.code === v);
}
export const sourceLabels: Record<QuantitySource, string> = {
  APP_INPUT: "人工录入",
  AUTO_STACK: "机器 · 自动码垛",
  MANUAL_CODE: "机器 · 人工打码",
  DEVICE_COUNT: "机器 · 设备计数",
};
export const sourceFilters: [string, string][] = [
  ["", "全部来源"],
  ["APP_INPUT", "人工录入"],
  ["MACHINE", "机器入库"],
  ["AUTO_STACK", "自动码垛"],
  ["MANUAL_CODE", "设备人工打码"],
  ["DEVICE_COUNT", "设备计数"],
];
export const printStatusLabels: Record<string, string> = {
  WAITING_LABEL: "等待标签生成",
  QUEUED: "排队中",
  WAITING_PRINTER: "等待打印机",
  PREPARING: "准备中",
  SENDING: "发送中",
  SUBMITTED: "已提交，等待结果",
  COMPLETED: "已完成",
  FAILED: "发送前失败",
  UNKNOWN: "结果待核验",
  CANCELLED: "已取消",
};
