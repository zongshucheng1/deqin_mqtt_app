import type { CreateRecord, Warehouse } from "./types";
import { validDate } from "./format";
export interface Field {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "decimal" | "integer" | "select";
  options?: string[];
  max?: number;
  scale?: number;
  min?: string;
  maximum?: string;
  unit?: string;
  hint?: string;
  placeholder?: string;
}
const txt = (
  key: string,
  label: string,
  max = 100,
  required = true,
): Field => ({ key, label, max, required, type: "text" });
const dec = (
  key: string,
  label: string,
  scale: number,
  maximum: string,
  min = "0",
  unit = "",
): Field => ({
  key,
  label,
  type: "decimal",
  scale,
  maximum,
  min,
  unit,
  required: true,
});
const sel = (key: string, label: string, options: string[]): Field => ({
  key,
  label,
  type: "select",
  options,
  required: true,
});
export const tallyDiameters = Array.from({ length: 14 }, (_, i) => 6 + i * 2);
export const rawLengthField: Field = {
  ...dec("lengthMm", "原木长度", 3, "999999999.999", "0", "mm"),
  placeholder: "请输入长度，例如2600",
  hint: "同一批原木长度须一致，2600 mm = 2.6米；方量根据长度和径级码单自动计算。",
};
export const commonFields: Field[] = [
  txt("recordNo", "入库编号", 64),
  {
    key: "quantity",
    label: "入库数量",
    type: "integer",
    required: true,
    maximum: "999999999999999",
    min: "0",
  },
];
export const detailFields: Record<Warehouse, Field[]> = {
  RAW_WOOD: [
    rawLengthField,
    txt("woodSpecification", "原木规格"),
    txt("woodGrade", "等级", 30),
    txt("supplierName", "供应商"),
    txt("vehiclePlateNo", "车牌号", 30),
    dec("woodPercentage", "成数", 2, "9999.99"),
    dec("largeDiameterRatioPct", "大码比例", 2, "100", "0", "%"),
    dec("diameter14RatioPct", "14公分比例", 2, "100", "0", "%"),
    txt("storageArea", "存放区域"),
    {
      ...dec("unitPrice", "单价", 2, "9999999999.99"),
      hint: "沿用现场计价口径",
    },
    dec("totalPrice", "总价", 2, "999999999999.99"),
  ],
  PEELING: [
    txt("team", "班组", 50),
    txt("machineNumber", "机器编号", 64),
    dec("lengthMm", "长度", 3, "999999999.999", "0.000", "mm"),
    dec("widthMm", "宽度", 3, "999999999.999", "0.000", "mm"),
    dec("thicknessMm", "厚度", 3, "999999999.999", "0.000", "mm"),
    txt("issuerName", "开单员"),
    txt("boardAttribute", "板材属性"),
    txt("inspectorName", "质检员"),
  ],
  DRYING: [
    txt("customerName", "客户名称"),
    {
      ...dec("lengthMm", "长度", 2, "99999999.99", "0.00", "mm"),
      hint: "人工规格1270mm",
    },
    {
      ...dec("widthMm", "宽度", 2, "99999999.99", "0.00", "mm"),
      hint: "人工规格630mm",
    },
    sel("thicknessMm", "厚度 mm", [
      "1.7",
      "2.0",
      "2.2",
      "2.4",
      "2.6",
      "2.8",
      "3.0",
      "3.2",
      "3.6",
      "4.0",
      "4.2",
    ]),
    {
      key: "qualityRatioPct",
      label: "质量比",
      type: "integer",
      required: true,
      min: "0",
      maximum: "100",
      unit: "%",
    },
    sel("grade", "等级", ["A", "B", "C", "D"]),
    sel("boardInStatus", "进板状态", ["S", "H"]),
    sel("team", "班组", ["早", "中", "晚"]),
  ],
  WOOD_CORE: [
    txt("machineNumber", "机器编号", 64),
    dec("diameterMm", "木芯直径", 3, "999999999.999", "0.000", "mm"),
  ],
  WHITE_BARK: [txt("machineNumber", "机器编号", 64)],
};
export function decimalCompare(a: string, b: string): number {
  const normalize = (v: string) => {
    const [x, y = ""] = v.split(".");
    return [x.replace(/^0+(?=\d)/, ""), y];
  };
  const [x, y] = normalize(a),
    [u, v] = normalize(b);
  if (x.length !== u.length) return x.length - u.length;
  if (x !== u) return x > u ? 1 : -1;
  const n = Math.max(y.length, v.length);
  return y.padEnd(n, "0") === v.padEnd(n, "0")
    ? 0
    : y.padEnd(n, "0") > v.padEnd(n, "0")
      ? 1
      : -1;
}
export function validateField(field: Field, value: string): string | undefined {
  if (field === rawLengthField) {
    if (!value.trim()) return "请填写本批原木长度。";
    if (!/^\d+(?:\.\d+)?$/.test(value) || decimalCompare(value, "0") === 0)
      return "请输入大于0的数字，单位为毫米。";
    if ((value.split(".")[1] || "").length > 3)
      return "原木长度最多保留3位小数。";
  }
  if (!value.trim()) return field.required ? `请填写${field.label}` : undefined;
  if (field.type === "select" && !field.options?.includes(value))
    return `请选择有效的${field.label}`;
  if (field.type === "integer" || field.type === "decimal") {
    const scale = field.type === "integer" ? 0 : field.scale || 0;
    if (
      !(
        scale === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`)
      ).test(value)
    )
      return `${field.label}须为非负${scale ? `数字，最多${scale}位小数` : "整数"}`;
    if (field.maximum && decimalCompare(value, field.maximum) > 0)
      return `${field.label}超出允许范围`;
    const zeroAllowed =
      [
        "woodPercentage",
        "largeDiameterRatioPct",
        "diameter14RatioPct",
        "unitPrice",
        "totalPrice",
        "qualityRatioPct",
      ].includes(field.key) || field.key.startsWith("tally");
    if (!zeroAllowed && decimalCompare(value, "0") === 0)
      return `${field.label}必须大于0`;
  } else if (field.max && value.length > field.max)
    return `${field.label}最多${field.max}字`;
  return undefined;
}
export function validateEntry(
  data: CreateRecord,
  includeTally = true,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!validDate(data.recordDate)) errors.recordDate = "请选择有效业务日期";
  const requiredNo = ["PEELING", "DRYING"].includes(data.warehouseType);
  if (requiredNo) {
    const e = validateField(commonFields[0], data.recordNo || "");
    if (e) errors.recordNo = e;
  }
  const q = {
    ...commonFields[1],
    type: data.warehouseType === "WHITE_BARK" ? "decimal" : "integer",
    scale: 3,
    maximum:
      data.warehouseType === "WHITE_BARK"
        ? "999999999.999"
        : commonFields[1].maximum,
  } as Field;
  const qe = validateField(q, data.quantity);
  if (qe) errors.quantity = qe;
  for (const f of detailFields[data.warehouseType]) {
    const e = validateField(f, String(data.detail[f.key] ?? ""));
    if (e) errors[f.key] = e;
  }
  if (
    data.warehouseType === "DRYING" &&
    (decimalCompare(String(data.detail.lengthMm), "1270") !== 0 ||
      decimalCompare(String(data.detail.widthMm), "630") !== 0)
  )
    errors.lengthMm = "人工烘干规格须为1270 × 630 mm";
  if (data.warehouseType === "RAW_WOOD" && includeTally) {
    let total = 0n;
    for (const diameter of tallyDiameters) {
      const key = `tally${diameter}cmCount`,
        value = String(data.detail[key] ?? "") || "0";
      if (!/^\d+$/.test(value) || decimalCompare(value, "2147483647") > 0)
        errors[key] = "各径级须为0至2147483647的整数";
      else total += BigInt(value);
    }
    if (!/^\d+$/.test(data.quantity) || total !== BigInt(data.quantity || 0))
      errors.tally = "码单合计必须等于基础信息中的原木根数";
  }
  return errors;
}
export function initialEntry(
  warehouseType: Warehouse,
  date: string,
): CreateRecord {
  const detail: Record<string, string | number> = {};
  for (const f of detailFields[warehouseType]) detail[f.key] = "";
  if (warehouseType === "RAW_WOOD")
    tallyDiameters.forEach((d) => (detail[`tally${d}cmCount`] = ""));
  if (warehouseType === "DRYING") {
    detail.lengthMm = "1270";
    detail.widthMm = "630";
  }
  return {
    warehouseType,
    recordDate: date,
    recordNo: "",
    quantity: "",
    detail,
  };
}
