import { decimalCompare, rawLengthField, tallyDiameters, validateField } from "./forms";

export interface RawVolumeInput {
  factoryId: string;
  lengthMm: string;
  tallies: Record<string, string>;
}
export interface RawVolumeResult {
  lengthMm: string;
  tallyTotal: string;
  volumeM3: string;
}
export type RawVolumeState =
  | { status: "idle" | "loading" }
  | { status: "ready"; result: RawVolumeResult }
  | { status: "error"; message: string };

export function rawVolumeInput(factoryId: string, detail: Record<string, string | number>): RawVolumeInput | null {
  const lengthMm = String(detail.lengthMm ?? "");
  if (!factoryId || validateField(rawLengthField, lengthMm)) return null;
  const tallies: Record<string, string> = {};
  for (const diameter of tallyDiameters) {
    const key = `tally${diameter}cmCount`;
    const count = String(detail[key] ?? "") || "0";
    if (!/^\d+$/.test(count) || decimalCompare(count, "2147483647") > 0) return null;
    tallies[key] = count;
  }
  return { factoryId, lengthMm, tallies };
}

export function validateRawVolumeResult(value: unknown): RawVolumeResult {
  const result = value as RawVolumeResult;
  if (!result || typeof result.lengthMm !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(result.lengthMm)
    || typeof result.tallyTotal !== "string" || !/^\d+$/.test(result.tallyTotal)
    || typeof result.volumeM3 !== "string" || !/^\d+\.\d{6}$/.test(result.volumeM3))
    throw new Error("服务器方量格式异常，请重新计算");
  return result;
}

/** No writes or client-side volume arithmetic. Invalidated responses cannot become a submission preview. */
export function createRawVolumePreview(
  load: (input: RawVolumeInput) => Promise<RawVolumeResult>,
  emit: (state: RawVolumeState) => void,
  message: (error: unknown) => string,
) {
  let generation = 0;
  return {
    clear() { generation++; emit({ status: "idle" }); },
    async run(input: RawVolumeInput) {
      const current = ++generation;
      emit({ status: "loading" });
      try {
        const result = validateRawVolumeResult(await load(input));
        const expectedTotal = Object.values(input.tallies).reduce((sum, count) => sum + BigInt(count), 0n);
        if (decimalCompare(result.lengthMm, input.lengthMm) !== 0 || BigInt(result.tallyTotal) !== expectedTotal)
          throw new Error("服务器回显的长度或码单根数不一致，请重新计算");
        if (current === generation) emit({ status: "ready", result });
      } catch (error) {
        if (current === generation) emit({ status: "error", message: message(error) });
      }
    },
  };
}
