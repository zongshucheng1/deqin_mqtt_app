import { ApiError } from "../services/http";
export function knownFieldError(
  error: unknown,
  known: string[],
): { key: string; message: string } | undefined {
  if (!(error instanceof ApiError) || !error.field) return;
  const key = error.field.startsWith("detail.")
    ? error.field.slice(7)
    : error.field;
  if (known.includes(key)) return { key, message: error.message };
}
