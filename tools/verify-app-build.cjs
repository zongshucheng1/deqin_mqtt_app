const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  dist = path.join(root, "dist/build/app"),
  sha = (p) =>
    crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const service = fs.readFileSync(path.join(dist, "app-service.js"), "utf8"),
  bridge = fs.readFileSync(
    path.join(dist, "uni_modules/deqin-host/utssdk/app-android/src/index.kt"),
    "utf8",
  );
const methods = [
  "openExternalMirrorByJs",
  "printDeviceLabelByJs",
  "getPrintDeviceIdByJs",
  "startDevicePrintingByJs",
  "stopDevicePrintingByJs",
  "configureFromServerByJs",
  "probePrinterByJs",
  "getPrinterTestByJs",
  "testPrinterByJs",
  "requestHostPermissionsByJs",
  "getHostStatusByJs",
  "getSessionTokenByJs",
  "setSessionTokenByJs",
  "clearSessionTokenByJs",
  "startHostByJs",
  "stopHostByJs",
  "clearHostCredentialsByJs",
];
// The current server-print pages no longer import printer discovery. Keep its
// native compatibility surface, while allowing unused JS proxies to tree-shake.
const compatibilityMethods = [
  "startPrinterDiscoveryByJs",
  "startUsbPrinterDiscoveryByJs",
  "getPrinterDiscoveryByJs",
  "cancelPrinterDiscoveryByJs",
  "probeDiscoveredPrinterByJs",
];
for (const name of methods) {
  assert.ok(service.includes(name), "Missing actual UTS proxy " + name);
  assert.ok(bridge.includes(name), "Missing generated Kotlin bridge " + name);
}
for (const name of compatibilityMethods)
  assert.ok(bridge.includes(name), "Missing native compatibility bridge " + name);
assert.ok(
  bridge.includes("paperWidthMm.toDouble()") &&
    bridge.includes("paperHeightMm.toDouble()"),
  "UTS Number must convert to native Kotlin Double",
);
const sourceAar = path.join(
    root,
    "src/uni_modules/deqin-host/utssdk/app-android/libs/deqin-host-runtime.aar",
  ),
  builtAar = path.join(
    dist,
    "uni_modules/deqin-host/utssdk/app-android/libs/deqin-host-runtime.aar",
  );
assert.equal(
  sha(sourceAar),
  sha(builtAar),
  "Native AAR must match the selected plugin input",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "src/manifest.json"), "utf8"),
);
assert.equal(manifest["app-plus"].distribute.android.minSdkVersion, 26);
assert.equal(manifest["app-plus"].distribute.android.targetSdkVersion, 35);
const builtManifest = JSON.parse(
  fs.readFileSync(path.join(dist, "manifest.json"), "utf8"),
);
assert.equal(
  manifest.appid,
  "__UNI__4275A0F",
  "Use the application ID registered by the user",
);
assert.equal(
  builtManifest.id,
  manifest.appid,
  "Built APP must preserve the configured real AppID",
);
assert.equal(
  builtManifest.version.name,
  manifest.versionName,
  "Built APP version must match manifest",
);
assert.equal(
  String(builtManifest.version.code),
  String(manifest.versionCode),
  "Built APP versionCode must match manifest",
);
const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ),
  packageLock = JSON.parse(
    fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
  );
assert.equal(packageJson.version, manifest.versionName);
assert.equal(packageLock.version, manifest.versionName);
assert.equal(packageLock.packages[""].version, manifest.versionName);
const report = {
  verifiedAt: new Date().toISOString(),
  resourceBuildVerified: true,
  configuredAppId: manifest.appid,
  builtAppId: builtManifest.id,
  versionName: manifest.versionName,
  versionCode: String(manifest.versionCode),
  actualUtsProxies: methods,
  nativeCompatibilityProxies: compatibilityMethods,
  generatedKotlinSha256: sha(
    path.join(dist, "uni_modules/deqin-host/utssdk/app-android/src/index.kt"),
  ),
  aarSha256: sha(builtAar),
  minSdk: 26,
  targetSdk: 35,
  scope:
    "Verifies APP resources and generated UTS bridge; does not prove signed APK, DCloud runtime loading or physical printer/PLC acceptance.",
};
const evidenceDirectory = path.join(
  root,
  ".test-artifacts",
  manifest.versionName,
);
const deploymentProof = JSON.parse(
  fs.readFileSync(
    path.join(evidenceDirectory, "deployment-build-app.json"),
    "utf8",
  ),
);
const expectedProfile = process.argv.includes("--development")
  ? "development"
  : "production";
const localService = process.argv.includes("--local-service");
assert.ok(!localService || expectedProfile === "development", "Local-service verification requires --development --local-service");
assert.equal(deploymentProof.localService === true, localService, "Explicitly select local-service verification for the LAN package");
if (localService) assert.equal(deploymentProof.buildSelector, "local-service");
assert.equal(
  deploymentProof.profile,
  expectedProfile,
  "Explicitly select development verification; production must never silently accept an internal package",
);
assert.equal(
  deploymentProof.entrySha256,
  sha(path.join(dist, "app-service.js")),
  "Deployment proof must match the actual compiled APP resources",
);
assert.equal(deploymentProof.versionName, manifest.versionName);
assert.equal(deploymentProof.encryptedLoginRequired, true);
if (expectedProfile === "development") {
  const { spawnSync } = require("node:child_process");
  const check = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", `
      import { loadEnv } from 'vite';
      import { resolveDeployment } from './src/domain/deployment.ts';
      import fs from 'node:fs';
      import { createHash } from 'node:crypto';
      import { parseLocalServiceSelector, assertLocalServiceSelectorMatches } from './tools/local-service-selector.ts';
      const localService = ${localService};
      const development = loadEnv('development', process.cwd(), '');
      let env = development;
      if (localService) {
        fs.accessSync('.env.development');
        env = loadEnv('production', process.cwd(), '');
        const selector = parseLocalServiceSelector(fs.readFileSync('.env.production.local', 'utf8'));
        assertLocalServiceSelectorMatches(selector, env, development);
      }
      const config = resolveDeployment(env, 'development', 'app', { localService });
      process.stdout.write(JSON.stringify({ apiBaseUrl: config.apiBaseUrl, localService: config.localService,
        clientId: config.clientId, tenantMode: config.tenantMode,
        rsaPublicKeySha256: createHash('sha256').update(config.rsaPublicKey).digest('hex') }));
    `],
    { cwd: root, env: process.env, encoding: "utf8" },
  );
  assert.equal(check.status, 0, "Current development configuration must pass the deployment rules");
  const currentDeployment = JSON.parse(check.stdout);
  assert.equal(
    deploymentProof.apiBaseUrl,
    currentDeployment.apiBaseUrl,
    "Development resources must match the currently configured API address",
  );
  if (localService) {
    for (const key of ["localService", "clientId", "tenantMode", "rsaPublicKeySha256"])
      assert.equal(deploymentProof[key], currentDeployment[key], "Local-service proof must match reviewed configuration: " + key);
  }
} else
  assert.ok(
    /^https:\/\//.test(deploymentProof.apiBaseUrl),
    "Production APP API must use HTTPS",
  );
report.deployment = deploymentProof;
fs.mkdirSync(evidenceDirectory, { recursive: true });
fs.writeFileSync(
  path.join(evidenceDirectory, "app-resource-verification.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  "APP resource verification PASS: real UTS proxies, explicit native numeric conversion and matching AAR.",
);
