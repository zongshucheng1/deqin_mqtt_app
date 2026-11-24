/* Explicit developer action only. Metadata is public; never creates a production profile. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env.production.local");
(async () => {
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  if (
    env.VITE_API_BASE_URL !== "http://127.0.0.1:8080" ||
    env.VITE_APP_PROFILE !== "development" ||
    !env.VITE_AUTH_CLIENT_ID ||
    !env.VITE_AUTH_RSA_PUBLIC_KEY ||
    env.VITE_AUTH_TENANT_MODE !== "discovery" ||
    env.VITE_AUTH_ENCRYPT === "false"
  )
    throw new Error(
      "Internal USB profile must match the explicit, complete local development configuration",
    );
  const content =
    "# Explicit internal USB build; NOT a production deployment.\nDEQIN_BUILD_PROFILE=internal-usb\n" +
    [
      "VITE_APP_PROFILE",
      "VITE_API_BASE_URL",
      "VITE_AUTH_CLIENT_ID",
      "VITE_AUTH_RSA_PUBLIC_KEY",
      "VITE_AUTH_TENANT_MODE",
      "VITE_AUTH_ENCRYPT",
    ]
      .map((key) => `${key}=${env[key] || "true"}\n`)
      .join("");
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(target, "utf8") !== content)
      throw new Error(
        "Internal USB selector differs from reviewed development metadata",
      );
  } else {
    if (process.argv.length !== 2)
      throw new Error(
        "Use no arguments to explicitly create, or --check to verify",
      );
    fs.writeFileSync(target, content, { flag: "wx" });
  }
  console.log(
    JSON.stringify({
      internalUsbProfile: target,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      productionReady: false,
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
