/* Create a separate, reviewable full-APK project; never rewrite the standard manifest/env/AAR. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const source = path.resolve(__dirname, "..");
const workspace = path.dirname(source);
const [apiBaseUrl, destination, nativeAar] = process.argv.slice(2);

(async () => {
  const { loadEnv } = await import("vite");
  const url = new URL(apiBaseUrl);
  const parts = url.hostname.split(".").map(Number);
  const privateIp = parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) &&
    (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (!privateIp || url.protocol !== "http:" || url.origin !== apiBaseUrl || url.hostname !== parts.join("."))
    throw new Error("Use an exact HTTP private IPv4 origin");
  const stage = path.resolve(destination);
  const allowed = path.join(workspace, ".cache") + path.sep;
  if (!stage.startsWith(allowed) || fs.existsSync(stage)) throw new Error("Use a new staging directory within workspace/.cache");
  if (!fs.statSync(nativeAar).isFile()) throw new Error("Reviewed local-service native AAR required");
  fs.mkdirSync(stage, { recursive: true });
  for (const name of ["src", "tools", "tests", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html"])
    fs.cpSync(path.join(source, name), path.join(stage, name), { recursive: true });
  fs.symlinkSync(path.join(source, "node_modules"), path.join(stage, "node_modules"), "junction");
  const manifestPath = path.join(stage, "src/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.name = "德勤智造·本地服务";
  manifest.description = "本地服务版 · 同一Wi-Fi连接 " + apiBaseUrl;
  manifest.versionName += "-local.1";
  manifest.versionCode = Number(manifest.versionCode) * 100 + 1;
  manifest.h5.title = manifest.name;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  for (const name of ["package.json", "package-lock.json"]) {
    const file = path.join(stage, name), data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.version = manifest.versionName;
    if (data.packages?.[""]) data.packages[""].version = manifest.versionName;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
  const android = path.join(stage, "src/AndroidManifest.xml");
  fs.writeFileSync(android, fs.readFileSync(android, "utf8").replace('package="com.deqin.inout"', 'package="com.deqin.inout.local"'));
  fs.copyFileSync(nativeAar, path.join(stage, "src/uni_modules/deqin-host/utssdk/app-android/libs/deqin-host-runtime.aar"));
  const env = loadEnv("development", source, "");
  const selected = {
    DEQIN_BUILD_PROFILE: "local-service", VITE_LOCAL_SERVICE: "true", VITE_APP_PROFILE: "development", VITE_API_BASE_URL: apiBaseUrl,
    VITE_AUTH_CLIENT_ID: env.VITE_AUTH_CLIENT_ID, VITE_AUTH_RSA_PUBLIC_KEY: env.VITE_AUTH_RSA_PUBLIC_KEY,
    VITE_AUTH_TENANT_MODE: "discovery", VITE_AUTH_ENCRYPT: "true",
  };
  if (!selected.VITE_AUTH_CLIENT_ID || !selected.VITE_AUTH_RSA_PUBLIC_KEY || /PRIVATE KEY/.test(selected.VITE_AUTH_RSA_PUBLIC_KEY))
    throw new Error("Reviewed public client and RSA metadata required");
  const serialize = (items) => Object.entries(items).map(([k, v]) => `${k}=${String(v).replace(/\r?\n/g, "\\n")}\n`).join("");
  fs.writeFileSync(path.join(stage, ".env.production.local"), serialize(selected));
  const { DEQIN_BUILD_PROFILE, ...development } = selected;
  fs.writeFileSync(path.join(stage, ".env.development"), serialize(development));
  fs.writeFileSync(path.join(stage, ".env.production"), "# Standard builds refuse the explicit local-service selector.\n");
  const proof = { stage, package: "com.deqin.inout.local", name: manifest.name, versionName: manifest.versionName,
    versionCode: manifest.versionCode, apiBaseUrl, nativeAarSha256: crypto.createHash("sha256").update(fs.readFileSync(nativeAar)).digest("hex"),
    sourceManifestUnchanged: true, submitted: false };
  fs.writeFileSync(path.join(stage, "local-service-build.json"), JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify(proof));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
