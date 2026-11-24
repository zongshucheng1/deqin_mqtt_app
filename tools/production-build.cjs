const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const selector = path.join(root, ".env.production.local");
if (
  process.env.DEQIN_BUILD_PROFILE ||
  (fs.existsSync(selector) &&
    /^\s*DEQIN_BUILD_PROFILE\s*=/m.test(fs.readFileSync(selector, "utf8")))
) {
  console.error(
    "正式构建/打包已拒绝：检测到内部 USB 联调 selector。请先完成内部任务、归档并移除该 selector，不能将开发包当正式包发布。",
  );
  process.exit(1);
}
if (process.argv[2] === "--check") {
  const validation = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(root, "tools/check-deployment.ts")],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  if (validation.error) console.error(validation.error.message);
  process.exit(validation.status ?? 1);
}
if (!["app", "h5"].includes(process.argv[2])) {
  console.error("Expected app, h5 or --check");
  process.exit(2);
}
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/@dcloudio/vite-plugin-uni/bin/uni.js"),
    "build",
    ...(process.argv[2] === "app" ? ["-p", "app"] : []),
    "--mode",
    "production",
  ],
  { cwd: root, env: process.env, stdio: "inherit" },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
