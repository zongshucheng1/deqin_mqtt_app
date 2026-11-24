const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
module.exports = function buildIsolatedH5({
  publicKey,
  clientId = "isolated-test-client",
  fixtureName = "h5-ui-fixture",
  printerNativeFixture = false,
}) {
  if (!/^[a-z0-9-]+$/.test(fixtureName))
    throw new Error("Invalid fixture directory");
  const root = path.resolve(__dirname, "../..");
  const version = require(path.join(root, "src/manifest.json")).versionName;
  const output = path.join(root, ".test-artifacts", version, fixtureName);
  fs.mkdirSync(output, { recursive: true });
  const fixtureConfig = path.join(output, "isolated-vite.config.ts");
  if (printerNativeFixture) {
    const original = path.join(root, "vite.config.ts").replaceAll("\\", "/");
    const nativeFixture = path.join(root, "tests/fixtures/printer-native.ts").replaceAll("\\", "/");
    fs.writeFileSync(fixtureConfig, `import original from ${JSON.stringify(original)};
export default async (env) => {
  const config = typeof original === 'function' ? await original(env) : original;
  return {...config, plugins: [{ name: 'isolated-printer-native-fixture', enforce: 'pre', resolveId(id) {
    if (/\\/services\\/native$/.test(id)) return ${JSON.stringify(nativeFixture)};
  }}, ...(config.plugins || [])]};
};\n`);
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/@dcloudio/vite-plugin-uni/bin/uni.js"),
      "build",
      ...(printerNativeFixture ? ["--config", fixtureConfig] : []),
      "--mode",
      "development",
      "--outDir",
      output,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        UNI_OUTPUT_DIR: output,
        VITE_API_BASE_URL: "http://127.0.0.1:8080",
        VITE_AUTH_CLIENT_ID: clientId,
        VITE_AUTH_RSA_PUBLIC_KEY: publicKey,
        VITE_AUTH_TENANT_MODE: "discovery",
        VITE_AUTH_TENANT_ID: "",
        VITE_AUTH_ENCRYPT: "true",
        VITE_APP_PROFILE: "development",
      },
    },
  );
  fs.writeFileSync(
    path.join(root, ".test-artifacts", version, fixtureName + "-build.log"),
    (result.stdout || "") + (result.stderr || ""),
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Isolated H5 fixture build failed: " +
        (result.error?.message ||
          (result.stderr || result.stdout || "").slice(-3500)),
    );
  return {
    base: output,
    deploymentIdentity: JSON.stringify([
      "development",
      "http://127.0.0.1:8080",
      clientId,
      "discovery",
      "",
      publicKey.trim(),
    ]),
    clientId,
    publicKey,
    output,
    version,
  };
};
