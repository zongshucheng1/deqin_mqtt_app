import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { businessToday, timeText, factoryTimeZone, factoryTzDataVersion, FactoryTimeError, periodRange, shiftDate } from "../src/domain/format";
import { useFactoryDate } from "../src/composables/factory-date";
import { assertContext } from "../src/domain/authorization";
const ms = (iso: string) => Date.parse(iso);

test("完整IANA随包版本与当前公开数据一致，不受终端默认区影响", () => {
  assert.equal(factoryTzDataVersion, "2026e");
  const instant = ms("2026-10-30T16:00:00Z");
  assert.equal(businessToday("Asia/Shanghai", instant), "2026-10-31");
  assert.equal(businessToday("America/New_York", instant), "2026-10-30");
  assert.equal(timeText(instant, "Asia/Shanghai"), "2026/10/31 00:00:00");
});
test("纽约春季DST缺失小时与秋季重复小时按IANA规则显示", () => {
  for (const [instant, expected] of [
    ["2026-03-08T06:59:59Z", "2026/03/08 01:59:59"], ["2026-03-08T07:00:00Z", "2026/03/08 03:00:00"],
    ["2026-11-01T05:59:59Z", "2026/11/01 01:59:59"], ["2026-11-01T06:00:00Z", "2026/11/01 01:00:00"],
  ]) assert.equal(timeText(ms(instant), "America/New_York"), expected);
});
test("半小时和四十五分钟时区的午夜不假设整小时或UTC+8", () => {
  assert.equal(timeText(ms("2026-10-30T18:15:00Z"), "Asia/Kathmandu"), "2026/10/31 00:00:00");
  assert.equal(timeText(ms("2026-10-30T18:30:00Z"), "Asia/Kolkata"), "2026/10/31 00:00:00");
  assert.equal(timeText(ms("2026-10-30T13:30:00Z"), "Australia/Lord_Howe"), "2026/10/31 00:30:00");
});
test("完整历史规则包含上海1991夏令时及Apia2011跳过的日期", () => {
  assert.equal(timeText(ms("1991-04-13T17:59:59Z"), "Asia/Shanghai"), "1991/04/14 01:59:59");
  assert.equal(timeText(ms("1991-04-13T18:00:00Z"), "Asia/Shanghai"), "1991/04/14 03:00:00");
  assert.equal(timeText(ms("2011-12-30T09:59:59Z"), "Pacific/Apia"), "2011/12/29 23:59:59");
  assert.equal(timeText(ms("2011-12-30T10:00:00Z"), "Pacific/Apia"), "2011/12/31 00:00:00");
});
test("业务日历的日周月年继续传日期，DST切换不变成客户端固定24小时窗口", () => {
  const date = businessToday("America/New_York", ms("2026-03-08T07:00:00Z"));
  assert.deepEqual(periodRange("日", date), { startDate: "2026-03-08", endDate: "2026-03-08" });
  assert.equal(shiftDate(date, "日", 1), "2026-03-09");
  assert.deepEqual(periodRange("周", "2026-11-01"), { startDate: "2026-10-26", endDate: "2026-11-01" });
  assert.deepEqual(periodRange("月", "2024-02-29"), { startDate: "2024-02-01", endDate: "2024-02-29" });
  assert.deepEqual(periodRange("年", "1991-04-14"), { startDate: "1991-01-01", endDate: "1991-12-31" });
  assert.deepEqual(periodRange("全部", ""), {});
  assert.throws(() => periodRange("日", "2026-02-30"), /业务日期无效/);
});
test("未知或缺失工厂IANA明确失败，不静默回到上海UTC或手机时区", () => {
  for (const zone of [undefined, "", "Mars/Base", "Asia/shanghai", " UTC "]) {
    assert.throws(() => businessToday(zone), error => error instanceof FactoryTimeError && /工厂时区/.test(error.message));
    assert.throws(() => timeText(0, zone), error => error instanceof FactoryTimeError && /工厂时区/.test(error.message));
  }
  assert.equal(factoryTimeZone("UTC"), "UTC");
});
test("不合法epoch不被强制转成1970时间，缺失和错误数据分别表达", () => {
  assert.equal(timeText(undefined, "UTC"), "未提供");
  for (const value of ["", " ", "1.5", "1e3", "0x100", NaN, Infinity, true, false, {}, 8640000000000001]) {
    assert.equal(timeText(value as number, "UTC"), "时间无效");
    assert.throws(() => businessToday("UTC", value as number), error => error instanceof FactoryTimeError && error.code === "INVALID_TIMESTAMP");
  }
  assert.equal(timeText("0", "UTC"), "1970/01/01 00:00:00");
  assert.equal(timeText(ms("1900-01-01T00:00:00Z"), "UTC"), "1900/01/01 00:00:00");
});
test("日期等待授权后初始化，同工厂刷新保留手选，切厂和时区更新才重置", () => {
  const calendar = useFactoryDate(), instant = ms("2026-10-30T16:00:00Z");
  assert.equal(calendar.date.value, "");
  assert.throws(() => calendar.sync("", "Asia/Shanghai", instant), /工厂授权/);
  calendar.sync("api/tenant/user/factoryA", "Asia/Shanghai", instant); assert.equal(calendar.date.value, "2026-10-31");
  calendar.date.value = "2026-02-03";
  calendar.sync("api/tenant/user/factoryA", "Asia/Shanghai", instant + 86400000); assert.equal(calendar.date.value, "2026-02-03");
  calendar.sync("api/tenant/user/factoryB", "America/New_York", instant); assert.equal(calendar.date.value, "2026-10-30");
  calendar.sync("api/tenant/user/factoryB", "Asia/Shanghai", instant); assert.equal(calendar.date.value, "2026-10-31");
  calendar.reset(); assert.equal(calendar.date.value, "");
  calendar.sync("api/tenant/user/factoryB", "Asia/Kathmandu", instant); assert.equal(calendar.date.value, "2026-10-30");
});
test("授权context中不合法工厂时区在取业务数据之前明确拒绝", () => {
  const context = { tenantId: "000000", userId: "1", permissions: ["inout:work"], roleNames: ["操作员"], capabilities: { work: true, manage: false }, factories: [{ factoryId: "1", factoryName: "工厂", timezone: "Mars/Base" }] };
  assert.throws(() => assertContext(context), /工厂时区配置无效/);
});
for (const mode of ["no-intl", "no-parts"]) test(`加载模块前${mode}，完整时区逻辑仍可运行`, () => {
  const target = pathToFileURL(fileURLToPath(new URL("../src/domain/format.ts", import.meta.url))).href;
  const bootstrap = mode === "no-intl" ? "globalThis.Intl = undefined;" : "delete Intl.DateTimeFormat.prototype.formatToParts;";
  const source = `${bootstrap}\nconst f = await import(${JSON.stringify(target)}); console.log(JSON.stringify([f.businessToday('Asia/Shanghai', Date.parse('2026-10-30T16:00:00Z')), f.timeText(Date.parse('2026-03-08T07:00:00Z'), 'America/New_York'), f.factoryTzDataVersion]));`;
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(output.trim()), ["2026-10-31", "2026/03/08 03:00:00", "2026e"]);
});
