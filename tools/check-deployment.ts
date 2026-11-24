import { createPublicKey } from "node:crypto";
import { loadEnv } from "vite";
import { resolveDeployment } from "../src/domain/deployment";
try {
  const config = resolveDeployment(
    loadEnv("production", process.cwd(), ""),
    "production",
    "app",
  );
  const pem = config.rsaPublicKey.includes("BEGIN PUBLIC KEY")
    ? config.rsaPublicKey
    : `-----BEGIN PUBLIC KEY-----\n${config.rsaPublicKey}\n-----END PUBLIC KEY-----`;
  if (createPublicKey(pem).asymmetricKeyType !== "rsa")
    throw new Error("必须预置有效的平台RSA公钥");
  console.log(
    "Production public deployment configuration PASS (HTTPS and encrypted login required)",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "部署配置检查失败");
  process.exitCode = 1;
}
