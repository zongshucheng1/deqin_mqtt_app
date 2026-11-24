import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialEntry,
  validateEntry,
  decimalCompare,
} from "../src/domain/forms";
import {
  periodRange,
  chineseDate,
  decimalText,
  validDate,
  batchShare,
} from "../src/domain/format";
import {
  recordDetailFields,
  detailValue,
  sourceChannel,
  codingModeLabel,
} from "../src/domain/record-display";
import { printPaper, printCreatedAt } from "../src/domain/print-display";
import type { PrintJob } from "../src/domain/types";
test("设备只读批次字段不加入人工默认，来源明确且缺值不伪造", () => {
  assert.ok(
    recordDetailFields("DRYING").some((field) => field.key === "customerCode"),
  );
  assert.ok(
    recordDetailFields("DRYING").some((field) => field.key === "batchNo"),
  );
  const manual = initialEntry("DRYING", "2026-10-30");
  assert.equal(manual.detail.customerCode, undefined);
  assert.equal(manual.detail.batchNo, undefined);
  assert.equal(detailValue(null), "未提供");
  assert.equal(detailValue(""), "未提供");
  assert.equal(detailValue(0), "0");
  assert.equal(sourceChannel("APP_INPUT"), "APP");
  assert.equal(sourceChannel("MANUAL_CODE"), "设备采集");
  assert.equal(codingModeLabel("MANUAL"), "设备人工打码");
  assert.equal(codingModeLabel(undefined), "未提供");
});
test("打印冻结纸张尺寸保留精确字符串，审计创建时间仅转换中文日期而不套工厂时区", () => {
  const job = {
    paperCode: "CUSTOM",
    paperWidthMm: "101.234",
    paperHeightMm: "50.001",
    createTime: "2026-10-30 23:59:59",
  } as PrintJob;
  assert.equal(printPaper(job), "CUSTOM · 101.234 × 50.001 mm");
  assert.equal(printCreatedAt(job), "2026年10月30日 23:59:59");
  assert.equal(printPaper({} as PrintJob), "纸型未提供 · 尺寸未提供");
});
test("来源占比只用同库服务端期内批次，整数精确计算且不造空账本百分比", () => {
  assert.equal(batchShare(1, "2"), "50.00%");
  assert.equal(batchShare(1, "3"), "33.33%");
  assert.equal(batchShare(2, "3"), "66.67%");
  assert.equal(batchShare(0, "0"), "");
  assert.equal(batchShare(1, null), "");
});
test("原木独立根数与14档码单严格一致，比例不从码单推导", () => {
  const d = initialEntry("RAW_WOOD", "2026-10-30");
  d.quantity = "600";
  Object.assign(d.detail, {
    lengthMm: "2600",
    woodSpecification: "2.6m",
    woodGrade: "A",
    supplierName: "供应商",
    vehiclePlateNo: "鲁A12345",
    woodPercentage: "8.5",
    largeDiameterRatioPct: "20",
    diameter14RatioPct: "30",
    storageArea: "A区",
    unitPrice: "1.00",
    totalPrice: "600.00",
    tally12cmCount: "600",
  });
  assert.deepEqual(validateEntry(d), {});
  d.detail.tally12cmCount = "590";
  assert.equal(validateEntry(d).tally, "码单合计必须等于基础信息中的原木根数");
  assert.equal(d.detail.largeDiameterRatioPct, "20");
});
test("白皮吨数精确且最多3位，原木数量不得小数", () => {
  const d = initialEntry("WHITE_BARK", "2026-10-30");
  d.quantity = "2.450";
  d.detail.machineNumber = "03号";
  assert.deepEqual(validateEntry(d), {});
  d.quantity = "2.4501";
  assert.ok(validateEntry(d).quantity);
  assert.equal(decimalText("999999999.999", 3), "999,999,999.999");
  assert.equal(decimalCompare("999999999999.99", "999999999999.98"), 1);
});
test("旋切人工路径不因存在机号而放过人员必填", () => {
  const d = initialEntry("PEELING", "2026-10-30");
  d.recordNo = "XQ-01";
  d.quantity = "900";
  Object.assign(d.detail, {
    team: "甲班",
    machineNumber: "01",
    lengthMm: "1270",
    widthMm: "840",
    thicknessMm: "1.8",
  });
  assert.ok(validateEntry(d).issuerName);
  assert.ok(validateEntry(d).inspectorName);
});
test("烘干人工规格和离散选项受限，质量比可为0", () => {
  const d = initialEntry("DRYING", "2026-10-30");
  d.recordNo = "HG-01";
  d.quantity = "900";
  Object.assign(d.detail, {
    customerName: "客户",
    thicknessMm: "1.7",
    qualityRatioPct: "0",
    grade: "A",
    boardInStatus: "S",
    team: "早",
  });
  assert.deepEqual(validateEntry(d), {});
  d.detail.widthMm = "840";
  assert.ok(validateEntry(d).lengthMm);
  d.detail.widthMm = "630";
  d.detail.qualityRatioPct = "101";
  assert.ok(validateEntry(d).qualityRatioPct);
});
test("中文日期和周一至周日窗口不受终端时区转换", () => {
  assert.equal(chineseDate("2026-10-30"), "2026年10月30日");
  assert.deepEqual(periodRange("周", "2026-11-01"), {
    startDate: "2026-10-26",
    endDate: "2026-11-01",
  });
  assert.deepEqual(periodRange("月", "2026-02-28"), {
    startDate: "2026-02-01",
    endDate: "2026-02-28",
  });
  assert.deepEqual(periodRange("全部", "2026-10-30"), {});
});

test("非法业务日期返回校验失败而非抛出格式异常", () => {
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-10-30"), true);
});
