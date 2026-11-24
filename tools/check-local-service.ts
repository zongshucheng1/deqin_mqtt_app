import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { resolveDeployment } from "../src/domain/deployment";
import { parseLocalServiceSelector, assertLocalServiceSelectorMatches } from "./local-service-selector";

const root = process.cwd();
const selected = parseLocalServiceSelector(fs.readFileSync(path.join(root, ".env.production.local"), "utf8"));
const env = loadEnv("production", root, "");
assertLocalServiceSelectorMatches(selected, env, loadEnv("development", root, ""));
const config = resolveDeployment(env, "development", "app", { localService: true });
console.log(JSON.stringify({ localService: config.localService, apiBaseUrl: config.apiBaseUrl, productionReady: false }));
