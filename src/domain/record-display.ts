import { detailFields, type Field } from "./forms";
import type { RecordItem, Warehouse } from "./types";

/** Device-only business fields remain read-only and never become manual defaults. */
export function recordDetailFields(warehouse: Warehouse): Field[] {
  if (warehouse === "RAW_WOOD") return [
    ...detailFields[warehouse],
    { key: "volumeM3", label: "计算方量", unit: "m³" },
  ];
  return warehouse === "DRYING"
    ? [
        ...detailFields[warehouse],
        { key: "customerCode", label: "客户代码" },
        { key: "batchNo", label: "设备批次号" },
      ]
    : detailFields[warehouse];
}
export function detailValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "未提供"
    : String(value);
}
export function sourceChannel(source: RecordItem["quantitySource"]): string {
  if (source === "APP_INPUT") return "APP";
  if (["AUTO_STACK", "MANUAL_CODE", "DEVICE_COUNT"].includes(source))
    return "设备采集";
  return "未提供";
}
export function codingModeLabel(mode: RecordItem["codingMode"]): string {
  return mode
    ? { NONE: "不涉及设备打码", AUTO: "设备自动打码", MANUAL: "设备人工打码" }[
        mode
      ] || "未提供"
    : "未提供";
}
