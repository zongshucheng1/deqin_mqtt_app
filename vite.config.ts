import { defineConfig, loadEnv } from "vite";
import { createPublicKey, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDeployment } from "./src/domain/deployment";
import { parseInternalUsbSelector, assertSelectorMatches } from "./tools/deployment-selector";
import { parseLocalServiceSelector, assertLocalServiceSelectorMatches } from "./tools/local-service-selector";
import uniImport from "@dcloudio/vite-plugin-uni";
const uni =
  typeof uniImport === "function"
    ? uniImport
    : (uniImport as unknown as { default: typeof uniImport }).default;
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  let deploymentMode = mode;
  let localService = false;
  if (env.DEQIN_BUILD_PROFILE) {
    const selectorPath = path.resolve(".env.production.local");
    if (
      !["internal-usb", "local-service"].includes(env.DEQIN_BUILD_PROFILE) ||
      !fs.existsSync(selectorPath)
    )
      throw new Error(
        "内部构建须由显式工具创建并审核 .env.production.local selector",
      );
    const development = loadEnv("development", process.cwd(), "");
    const selectorText = fs.readFileSync(selectorPath, "utf8");
    if (env.DEQIN_BUILD_PROFILE === "local-service") {
      if (mode !== "production" || !fs.existsSync(path.resolve(".env.development")))
        throw new Error("本地服务打包须使用当前构建目录的 .env.development 和 production selector");
      const selected = parseLocalServiceSelector(selectorText);
      assertLocalServiceSelectorMatches(selected, env, development);
      localService = true;
    } else {
      const selected = parseInternalUsbSelector(selectorText);
      assertSelectorMatches(selected, env, development);
      if (env.VITE_API_BASE_URL !== "http://127.0.0.1:8080")
        throw new Error("内部 USB 构建仅限精确本机回环地址");
    }
    deploymentMode = "development";
  }
  const deployment = resolveDeployment(
    env,
    deploymentMode,
    process.env.UNI_PLATFORM || "h5",
    { localService },
  );
  const publicKey = deployment.rsaPublicKey.includes("BEGIN PUBLIC KEY")
    ? deployment.rsaPublicKey
    : `-----BEGIN PUBLIC KEY-----\n${deployment.rsaPublicKey}\n-----END PUBLIC KEY-----`;
  try {
    if (createPublicKey(publicKey).asymmetricKeyType !== "rsa")
      throw new Error("Expected RSA");
  } catch {
    throw new Error(
      "APP 部署配置检查失败：VITE_AUTH_RSA_PUBLIC_KEY 必须是有效的平台 RSA 公钥",
    );
  }
  return {
    // Only the explicitly selected public deployment object reaches the app.
    envPrefix: "DEQIN_DISABLED_AUTO_EXPOSURE_",
    define: { __DEQIN_DEPLOYMENT__: JSON.stringify(deployment) },
    plugins: [
      uni(),
      {
        name: "deqin-public-deployment-proof",
        closeBundle() {
          if (command !== "build") return;
          const platform = process.env.UNI_PLATFORM || "h5";
          const output = path.resolve(
            process.env.UNI_OUTPUT_DIR || `dist/build/${platform}`,
          );
          const entry = path.join(
            output,
            platform === "h5" ? "index.html" : "app-service.js",
          );
          if (!fs.existsSync(entry)) return;
          const manifest = JSON.parse(
            fs.readFileSync(path.resolve("src/manifest.json"), "utf8"),
          );
          const evidence = path.resolve(
            ".test-artifacts",
            manifest.versionName,
          );
          fs.mkdirSync(evidence, { recursive: true });
          const suffix = output.includes(
            `${path.sep}.test-artifacts${path.sep}`,
          )
            ? `-${path.basename(output)}`
            : "";
          fs.writeFileSync(
            path.join(evidence, `deployment-build-${platform}${suffix}.json`),
            JSON.stringify(
              {
                builtAt: new Date().toISOString(),
                versionName: manifest.versionName,
                profile: deployment.profile,
                localService: deployment.localService === true,
                apiBaseUrl: deployment.apiBaseUrl,
                clientId: deployment.clientId,
                tenantMode: deployment.tenantMode,
                rsaPublicKeySha256: createHash("sha256")
                  .update(deployment.rsaPublicKey)
                  .digest("hex"),
                platform,
                output,
                entrySha256: createHash("sha256")
                  .update(fs.readFileSync(entry))
                  .digest("hex"),
                releaseReady: deployment.profile === "production",
                encryptedLoginRequired: true,
                buildSelector: env.DEQIN_BUILD_PROFILE || null,
              },
              null,
              2,
            ) + "\n",
          );
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      proxy: {
        "/inout": {
          target: deployment.apiBaseUrl,
          changeOrigin: true,
        },
        "/auth": {
          target: deployment.apiBaseUrl,
          changeOrigin: true,
        },
        "/resource": {
          target: deployment.apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
