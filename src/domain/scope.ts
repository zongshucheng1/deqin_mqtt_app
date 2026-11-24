/** A request identity never crosses an API, tenant, account or factory boundary. */
export function normalizedApiBase(value: string): string {
  const base = value.trim().replace(/\/+$/, "");
  if (!base) return "same-origin";
  // Use a lexical fallback as older Android WebViews may not expose the URL constructor.
  const match = /^(https?):\/\/([^/]+)(.*)$/i.exec(base);
  if (!match) return base;
  const scheme = match[1].toLowerCase();
  const authority = match[2]
    .toLowerCase()
    .replace(scheme === "https" ? /:443$/ : /:80$/, "");
  return scheme + "://" + authority + match[3];
}
export function requestScope(
  apiBase: string,
  tenantId: string,
  userId: string,
  factoryId: string,
): string {
  return JSON.stringify([
    normalizedApiBase(apiBase),
    tenantId.trim(),
    userId,
    factoryId,
  ]);
}
