import type { DeploymentConfig } from "../../src/domain/deployment";
export function installTestDeployment(
  overrides: Partial<DeploymentConfig> = {},
) {
  const config: DeploymentConfig = {
    profile: "production",
    apiBaseUrl: "https://isolated.invalid",
    clientId: "isolated-test-client",
    rsaPublicKey: "synthetic-public-placeholder",
    tenantMode: "discovery",
    tenantId: "",
    h5Proxy: false,
    ...overrides,
  };
  (globalThis as any).__DEQIN_DEPLOYMENT__ = Object.freeze(config);
  return config;
}
