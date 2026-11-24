import moment from "moment-timezone";

/** The package entry loads the complete packed IANA database, never a year-limited build. */
export const factoryTzDataVersion = moment.tz.dataVersion;
const factoryZones = new Set(moment.tz.names());
export class FactoryTimeError extends Error {
  constructor(
    public code:
      | "MISSING_FACTORY_TIMEZONE"
      | "INVALID_FACTORY_TIMEZONE"
      | "INVALID_TIMESTAMP",
    message: string,
  ) {
    super(message);
  }
}
export function factoryTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new FactoryTimeError(
      "MISSING_FACTORY_TIMEZONE",
      "工厂时区尚未配置，请联系管理员核对",
    );
  if (!factoryZones.has(value) || !moment.tz.zone(value))
    throw new FactoryTimeError(
      "INVALID_FACTORY_TIMEZONE",
      "工厂时区配置无效，请联系管理员核对",
    );
  return value;
}
function timestamp(value: number | string): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
  const ms = Number(value);
  return Number.isSafeInteger(ms) && Math.abs(ms) <= 8640000000000000
    ? ms
    : null;
}
function factoryInstant(value: number | string, timezone: unknown) {
  const zone = factoryTimeZone(timezone),
    ms = timestamp(value);
  if (ms == null)
    throw new FactoryTimeError(
      "INVALID_TIMESTAMP",
      "时间数据无效，请重新读取服务器数据",
    );
  // UTC creates an instant. The explicit factory IANA zone determines its calendar;
  // neither Intl, the device zone, guessing nor a fixed offset is used.
  const date = moment.utc(ms).tz(zone).locale("en");
  if (!date.isValid() || date.year() < 1 || date.year() > 9999)
    throw new FactoryTimeError(
      "INVALID_TIMESTAMP",
      "时间数据超出支持范围，请重新读取服务器数据",
    );
  return date;
}
export function chineseDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : value;
}
export function businessToday(
  timezone: string | undefined,
  now: number | string = Date.now(),
): string {
  return factoryInstant(now, timezone).format("YYYY-MM-DD");
}
export function timeText(ms?: number | string, timezone?: string) {
  if (ms == null) return "未提供";
  if (timestamp(ms) == null) return "时间无效";
  try {
    return factoryInstant(ms, timezone).format("YYYY/MM/DD HH:mm:ss");
  } catch (error) {
    if (error instanceof FactoryTimeError && error.code === "INVALID_TIMESTAMP")
      return "时间无效";
    throw error;
  }
}
export function decimalText(value: string | number, scale?: number) {
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [a, b = ""] = s.split(".");
  const x = a.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return scale === undefined
    ? x + (b ? "." + b : "")
    : x + (scale ? "." + b.padEnd(scale, "0").slice(0, scale) : "");
}
export type Period = "日" | "周" | "月" | "年" | "全部";
export function periodRange(
  period: Period,
  date: string,
): { startDate?: string; endDate?: string } {
  if (period === "全部") return {};
  if (!validDate(date)) throw new Error("业务日期无效");
  const start = new Date(date + "T00:00:00Z"),
    end = new Date(start);
  if (Number.isNaN(start.getTime())) throw new Error("业务日期无效");
  if (period === "周") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  }
  if (period === "月") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  if (period === "年") {
    start.setUTCMonth(0, 1);
    end.setUTCMonth(11, 31);
  }
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
export function shiftDate(date: string, period: Period, offset: number) {
  if (!validDate(date) || !Number.isSafeInteger(offset))
    throw new Error("业务日期无效");
  const d = new Date(date + "T00:00:00Z");
  if (period === "月") {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + offset);
  } else if (period === "年") {
    d.setUTCFullYear(d.getUTCFullYear() + offset);
  } else d.setUTCDate(d.getUTCDate() + offset * (period === "周" ? 7 : 1));
  return d.toISOString().slice(0, 10);
}
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith("0000-")) return false;
  const date = new Date(s + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s
  );
}
export function batchShare(part: number, total: string | null): string {
  if (
    !Number.isSafeInteger(part) ||
    part < 0 ||
    !total ||
    !/^\d+$/.test(total) ||
    BigInt(total) <= 0n
  )
    return "";
  const basisPoints =
    (BigInt(part) * 10000n + BigInt(total) / 2n) / BigInt(total);
  return (
    (basisPoints / 100n).toString() +
    "." +
    (basisPoints % 100n).toString().padStart(2, "0") +
    "%"
  );
}
