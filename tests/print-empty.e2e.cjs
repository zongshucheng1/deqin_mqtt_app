/* Isolated print-center UX acceptance. No real backend, session or printer is used. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const version = require("../src/manifest.json").versionName;
const fixture = require("./helpers/build-isolated-h5.cjs")({
  publicKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey,
  fixtureName: "h5-print-empty-fixture",
});
const base = fixture.base;
const out = path.resolve(__dirname, "../.test-artifacts", version);
fs.mkdirSync(out, { recursive: true });
const reportPath = path.join(out, "print-empty-report.json");
const recordId = "9223372036854775806";
const factoryId = "9007199254740993";
const checks = [];
const reads = [];
const forbiddenWrites = [];
const unknownRequests = [];
const pageErrors = [];
const screenshots = [];
const sourceSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(__dirname, "../src/pages/print/index.vue"))).digest("hex");
const compiledAssets = ["index.html", ...fs.readdirSync(path.join(base, "assets")).filter(name => /^pages-print-index.*\.(?:js|css)$/.test(name)).map(name => "assets/" + name)].map(name => ({
  path: name, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(base, name))).digest("hex"),
}));
let assertionCount = 0;
let activeCase = "setup";
let browser;
let context;
let page;
let roleManage = true;
let jobsMode = "empty";
let releaseJobs;
let origin;
let navigationSerial = 0;
const mockedFrameworkAssets = [];
const record = {
  id: recordId, factoryId, warehouseType: "RAW_WOOD", recordNo: "RAW-ISOLATED-EMPTY-TEST",
  recordDate: "2026-10-30", quantity: "12.000", stockStatus: "IN_STOCK",
  quantitySource: "APP_INPUT", version: 0, inboundAtMs: "1793318400000",
  codingMode: "NONE", detail: { woodSpecification: "2.6m", woodGrade: "A", supplierName: "隔离测试供应商" },
};
function equal(actual, expected, description) {
  assertionCount++;
  assert.deepEqual(actual, expected, description);
}
function ok(value, description) {
  assertionCount++;
  assert.ok(value, description);
}
async function testcase(name, fn) {
  activeCase = name;
  const before = assertionCount;
  const startedAt = Date.now();
  await fn();
  checks.push({ name, passed: true, assertions: assertionCount - before, elapsedMs: Date.now() - startedAt });
  process.stdout.write(`PASS ${checks.length}: ${name}\n`);
}
function writeReport(passed, error) {
  fs.writeFileSync(reportPath, JSON.stringify({
    passed, versionName: version, generatedAt: new Date().toISOString(),
    target: "Compiled H5 served from a temporary loopback-only static server; isolated synthetic token/context; no Android runtime or physical printer acceptance",
    sourceSha256, testSha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"), compiledAssets,
    namedCaseCount: checks.length, actualAssertionCount: assertionCount,
    setupAssertionCount: 2,
    checks, currentCase: activeCase, error: error && String(error.stack || error),
    forbiddenWrites, unknownRequests, mockedFrameworkAssets, pageErrors, reads, screenshots,
    isolation: { realCredentialsRead: false, existingSessionRead: false, realBackendRequests: 0, permittedWrites: 0 },
  }, null, 2) + "\n");
}
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
function staticFile(urlPath) {
  const filename = path.resolve(base, "." + decodeURIComponent(urlPath));
  if (filename !== base && !filename.startsWith(base + path.sep)) return null;
  const resolved = filename === base ? path.join(base, "index.html") : filename;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const filename = staticFile(pathname);
  if (req.method !== "GET" || !filename) {
    unknownRequests.push({ method: req.method, path: pathname, surface: "static-server" });
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(filename));
});
const waitEmpty = () => page.locator(".print-empty-title").waitFor({ state: "visible" });
const waitReady = async () => {
  await waitEmpty();
  await page.locator(".print-total").waitFor({ state: "visible" });
};
const jobsRequest = (predicate = () => true) => {
  const pending = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname === "/inout/print-jobs" && predicate(url.searchParams);
  });
  // The paired click may itself fail first; do not let its still-pending waiter
  // become an unhandled rejection before the outer test records the failure.
  pending.catch(() => {});
  return pending;
};
async function printPage(batch = false) {
  // Force a new document so each independent case starts with a fresh uni-app page lifecycle.
  await page.goto(origin + "/?isolatedCase=" + (++navigationSerial) + "#/pages/print/index" + (batch ? "?recordId=" + recordId : ""));
  if (jobsMode === "empty") await waitReady();
}
async function openFilters() {
  if (!(await page.locator("#print-filters").count())) await page.locator(".print-filter-toggle").click();
  await page.locator("#print-filters").waitFor({ state: "visible" });
}
async function chooseStatus(code, label) {
  const pending = jobsRequest(query => query.get("status") === code);
  await page.locator("#print-filters .chip").getByText(label, { exact: true }).click();
  const request = await pending;
  await waitReady();
  return new URL(request.url()).searchParams;
}
async function choosePeriod(label) {
  const pending = jobsRequest();
  await page.locator("#print-filters .chip").getByText(label, { exact: true }).click();
  const request = await pending;
  await waitReady();
  return new URL(request.url()).searchParams;
}
async function chooseWarehouse(label) {
  await page.locator("#print-filters uni-picker").first().click();
  const pending = jobsRequest(query => query.get("warehouseType") === "PEELING");
  await page.locator(".uni-picker-content .uni-picker-item").filter({ hasText: new RegExp("^" + label + "$") }).last().click();
  await page.locator(".uni-picker-action-confirm").last().click();
  const request = await pending;
  await waitReady();
  return new URL(request.url()).searchParams;
}
async function screenshot(filename) {
  await page.screenshot({ path: path.join(out, filename), fullPage: true });
  screenshots.push(filename);
}
async function noHorizontalOverflow() {
  return page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
}
(async () => {
  equal(version, "0.1.9", "This acceptance script targets the current deployment-config release");
  ok(staticFile("/index.html"), "Compile build:h5 before running this acceptance script");
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Shanghai", locale: "zh-CN", serviceWorkers: "block" });
  context.setDefaultTimeout(10000);
  // A fresh browser context receives only deliberately invented session data.
  await context.addInitScript(({ identity }) => {
    localStorage.setItem("dq.deploymentIdentity", identity);
    localStorage.setItem("dq.token", "isolated-print-empty-token-never-valid-on-server");
    localStorage.setItem("dq.clientId", "isolated-print-empty-client");
    localStorage.setItem("dq.tenantId", "000000");
    localStorage.removeItem("dq.server");
  }, { identity: fixture.deploymentIdentity });
  await context.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    // uni-h5 preloads this decorative SDK shadow from CSS. Fulfil the exact known URL
    // locally; no request reaches the CDN, and every other external URL still fails.
    if (req.method() === "GET" && req.url() === "https://cdn.dcloud.net.cn/img/shadow-grey.png") {
      mockedFrameworkAssets.push(req.url());
      await route.fulfill({ status: 204 }); return;
    }
    if (url.origin !== origin) {
      unknownRequests.push({ method: req.method(), url: req.url(), surface: "external-network" });
      await route.abort("blockedbyclient"); return;
    }
    if (req.method() !== "GET") {
      forbiddenWrites.push({ method: req.method(), path: url.pathname });
      await route.abort("blockedbyclient"); return;
    }
    if (url.pathname === "/favicon.ico") { await route.fulfill({ status: 204 }); return; }
    if (!url.pathname.startsWith("/inout/") && !url.pathname.startsWith("/auth/")) {
      if (staticFile(url.pathname)) { await route.continue(); return; }
      unknownRequests.push({ method: req.method(), path: url.pathname, surface: "unknown-static" });
      await route.abort("blockedbyclient"); return;
    }
    reads.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), testCase: activeCase });
    let data;
    if (url.pathname === "/inout/context") data = {
      tenantId: "000000", userId: "9007199254740995", username: "isolated_print_operator",
      permissions: [roleManage ? "inout:manage" : "inout:work"],
      roleNames: [roleManage ? "隔离工厂管理员" : "隔离操作员"],
      capabilities: { work: true, manage: roleManage },
      factories: [{ factoryId, factoryName: "隔离打印验收工厂", timezone: "Asia/Shanghai" }],
    };
    else if (url.pathname === "/auth/code") data = { captchaEnabled: false };
    else if (url.pathname === "/inout/print-jobs") {
      if (jobsMode === "503") { await route.fulfill({ status: 503, json: { code: 503, msg: "隔离服务不可用" } }); return; }
      if (jobsMode === "offline") { await route.abort("internetdisconnected"); return; }
      if (jobsMode === "held") await new Promise(resolve => { releaseJobs = resolve; });
      data = { rows: [], total: 0 };
    } else if (url.pathname === "/inout/records") data = { rows: [record], total: 1 };
    else if (url.pathname === "/inout/records/" + recordId) data = record;
    else if (url.pathname === "/inout/records/" + recordId + "/labels/latest") data = {
      id: "9223372036854775600", status: "READY", versionNo: 1,
      qrContent: "RAW_WOOD|factory_id=" + factoryId + "|record_id=" + recordId,
      fileOssId: "9223372036854775000",
    };
    else {
      unknownRequests.push({ method: req.method(), path: url.pathname, surface: "unknown-api" });
      await route.fulfill({ status: 404, json: { code: 404, msg: "未声明的隔离接口" } }); return;
    }
    await route.fulfill({ json: { code: 200, msg: "ok", data } });
  });
  page = await context.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));

  await testcase("全工厂空态提供明确下一步，默认隐藏复杂筛选", async () => {
    await printPage();
    equal(await page.locator(".print-empty-title").innerText(), "暂无打印任务");
    equal(await page.locator(".print-empty-action").innerText(), "选择入库批次");
    equal(await page.locator(".print-filter-summary").innerText(), "全部仓库 · 全部状态 · 全部日期");
    equal(await page.locator("#print-filters").count(), 0);
    equal(await page.locator(".print-total").innerText(), "0 个");
    equal(await page.getByText("五库共用一个队列。原木A4与其他标签按仓库选择纸张、模板和打印机。", { exact: true }).count(), 0);
    await screenshot("print-empty-global.png");
  });
  await testcase("全工厂空态主按钮只导航已有批次，不创建任务", async () => {
    await page.locator(".print-empty-action").click();
    await page.getByText("记录查询", { exact: true }).waitFor();
    ok(page.url().endsWith("#/pages/records/index"));
    equal(forbiddenWrites.length, 0);
  });
  await testcase("指定批次空态明确范围，不误称全工厂无任务", async () => {
    await printPage(true);
    equal(await page.locator(".print-scope-title").innerText(), "当前批次");
    equal(await page.locator(".print-empty-title").innerText(), "本批次暂无打印任务");
    equal(await page.locator(".print-empty-action").innerText(), "查看批次并打印");
    equal(reads.filter(x => x.path === "/inout/print-jobs").at(-1).query.recordId, recordId);
    await screenshot("print-empty-batch.png");
  });
  await testcase("批次空态主按钮只到对应详情，不自动生成标签或打印", async () => {
    await page.locator(".print-empty-action").click();
    await page.getByText("记录详情", { exact: true }).waitFor();
    await page.locator(".record-detail").getByText(record.recordNo, { exact: true }).waitFor();
    equal(new URL(page.url().split("#")[1], origin).searchParams.get("id"), recordId);
    equal(forbiddenWrites.length, 0);
  });
  await testcase("展开筛选保留九个精确状态和全部状态及五个日期范围", async () => {
    await printPage(); await openFilters();
    equal(await page.locator(".print-filter-toggle").getAttribute("aria-expanded"), "true");
    equal(await page.locator("#print-filters .chip-row").first().locator(".chip").count(), 10);
    equal(await page.locator("#print-filters .chip-row").nth(1).locator(".chip").count(), 5);
    equal(await page.getByText("按打印任务创建日期筛选，与入库业务日期独立。", { exact: true }).count(), 1);
  });
  await testcase("状态筛选空态提供清除条件，摘要与数量标签准确", async () => {
    const query = await chooseStatus("FAILED", "发送前失败");
    equal(query.get("status"), "FAILED");
    equal(await page.locator(".print-empty-title").innerText(), "没有符合筛选条件的任务");
    equal(await page.locator(".print-empty-action").innerText(), "清除筛选条件");
    equal(await page.locator(".print-filter-summary").innerText(), "全部仓库 · 发送前失败 · 全部日期");
    equal((await page.locator(".print-filter-toggle").innerText()).trim(), "收起筛选 (1)");
  });
  await testcase("折叠筛选保留已选条件摘要和条件数量", async () => {
    await page.locator(".print-filter-toggle").click();
    equal(await page.locator("#print-filters").count(), 0);
    equal(await page.locator(".print-filter-toggle").getAttribute("aria-expanded"), "false");
    equal((await page.locator(".print-filter-toggle").innerText()).trim(), "筛选 (1)");
    ok((await page.locator(".print-filter-summary").innerText()).includes("发送前失败"));
    await screenshot("print-empty-filter.png");
  });
  await testcase("全范围清除条件恢复默认，API不携带旧状态或日期", async () => {
    const pending = jobsRequest(q => !q.get("status"));
    await page.locator(".print-empty-action").click();
    const query = new URL((await pending).url()).searchParams; await waitReady();
    for (const key of ["status", "warehouseType", "recordId", "startDate", "endDate"]) equal(!!query.get(key), false, key);
    equal(await page.locator(".print-empty-title").innerText(), "暂无打印任务");
  });
  await testcase("仓库筛选发送精确库码并进入筛选空态", async () => {
    await openFilters(); const query = await chooseWarehouse("旋切库");
    equal(query.get("warehouseType"), "PEELING");
    equal(await page.locator(".print-empty-title").innerText(), "没有符合筛选条件的任务");
    ok((await page.locator(".print-filter-summary").innerText()).startsWith("旋切库 · "));
  });
  await testcase("按日筛选日期成对发送，日期控件和折叠摘要使用中文年月日", async () => {
    const query = await choosePeriod("日");
    equal(query.get("startDate"), query.get("endDate"));
    ok(/^\d{4}-\d{2}-\d{2}$/.test(query.get("startDate")));
    const [year, month, day] = query.get("startDate").split("-").map(Number);
    const expected = `${year}年${month}月${day}日`;
    equal((await page.locator(".date-picker").innerText()).trim(), expected);
    ok((await page.locator(".print-filter-summary").innerText()).includes(expected));
  });
  await testcase("全部日期省略两个日期参数，不把任务创建日期与业务日期混淆", async () => {
    const query = await choosePeriod("全部");
    equal(query.has("startDate"), false); equal(query.has("endDate"), false);
    equal(await page.locator(".date-range-controls").count(), 0);
    equal(await page.getByText("全部任务创建日期", { exact: true }).count(), 1);
  });
  await testcase("批次内重置筛选保留recordId与批次范围", async () => {
    await printPage(true); await openFilters(); await chooseStatus("UNKNOWN", "待核验");
    await chooseWarehouse("旋切库"); await choosePeriod("周");
    const pending = jobsRequest(q => !q.get("status") && !q.get("warehouseType") && !q.has("startDate"));
    await page.locator("#print-filters").getByText("重置条件", { exact: true }).click();
    const query = new URL((await pending).url()).searchParams; await waitReady();
    equal(query.get("recordId"), recordId);
    equal(query.has("endDate"), false);
    equal(await page.locator(".print-empty-title").innerText(), "本批次暂无打印任务");
    equal(await page.locator(".print-scope").count(), 1);
  });
  await testcase("查看全部任务同时解除批次仓库状态日期，不留下隐形限制", async () => {
    await chooseStatus("WAITING_PRINTER", "等待打印机"); await chooseWarehouse("旋切库"); await choosePeriod("日");
    const pending = jobsRequest(q => !q.get("recordId") && !q.get("status") && !q.get("warehouseType") && !q.has("startDate"));
    await page.locator(".print-scope").getByText("查看全部任务", { exact: true }).click();
    const query = new URL((await pending).url()).searchParams; await waitReady();
    for (const key of ["recordId", "warehouseType", "status", "startDate", "endDate"]) equal(!!query.get(key), false, key);
    equal(await page.locator(".print-scope").count(), 0);
    equal(await page.locator(".print-empty-title").innerText(), "暂无打印任务");
    equal(await page.locator(".print-filter-summary").innerText(), "全部仓库 · 全部状态 · 全部日期");
  });
  await testcase("九个任务状态仍逐一发送真实精确状态码，不做前端假分组", async () => {
    await printPage(); await openFilters();
    for (const [code, label] of [["QUEUED", "排队"], ["WAITING_PRINTER", "等待打印机"], ["PREPARING", "准备中"], ["SENDING", "发送中"], ["SUBMITTED", "已提交，等待结果"], ["UNKNOWN", "待核验"], ["FAILED", "发送前失败"], ["COMPLETED", "已完成"], ["CANCELLED", "已取消"]]) {
      const query = await chooseStatus(code, label); equal(query.get("status"), code);
      ok((await page.locator(".print-filter-summary").innerText()).includes(label), label);
    }
  });
  await testcase("批次筛选空态主按钮只清条件，保留当前批次且不创建任务", async () => {
    await printPage(true); await openFilters(); await chooseStatus("FAILED", "发送前失败");
    const pending = jobsRequest(q => q.get("recordId") === recordId && !q.get("status"));
    await page.locator(".print-empty-action").click(); await pending; await waitReady();
    equal(await page.locator(".print-empty-title").innerText(), "本批次暂无打印任务");
    equal(forbiddenWrites.length, 0);
  });
  await testcase("服务503优先显示错误，隐藏成功空态及0个并可重试恢复", async () => {
    jobsMode = "503"; await printPage();
    await page.getByText("服务器暂时不可用", { exact: true }).waitFor();
    equal(await page.locator(".print-empty").count(), 0); equal(await page.locator(".print-total").count(), 0);
    equal(await page.getByText("重新加载", { exact: true }).count(), 1);
    await screenshot("print-empty-error.png");
    jobsMode = "empty"; const pending = jobsRequest();
    await page.getByText("重新加载", { exact: true }).click(); await pending; await waitReady();
    equal(await page.locator(".error-box").count(), 0);
    equal(await page.locator(".print-empty-title").innerText(), "暂无打印任务");
  });
  await testcase("网络中断显示连接失败，不误报暂无任务或0个", async () => {
    jobsMode = "offline"; await printPage();
    await page.getByText("连接服务器失败，请检查网络后重试", { exact: true }).waitFor();
    equal(await page.locator(".print-empty").count(), 0); equal(await page.locator(".print-total").count(), 0);
    jobsMode = "empty"; await page.getByText("重新加载", { exact: true }).click(); await waitReady();
    equal(await page.locator(".error-box").count(), 0);
  });
  await testcase("请求未返回时只显示加载中，不短暂显示空态或0个", async () => {
    jobsMode = "held"; const requested = jobsRequest(); await printPage(); await requested;
    await page.getByText("正在读取服务器数据…", { exact: true }).waitFor();
    equal(await page.locator(".print-empty").count(), 0); equal(await page.locator(".print-total").count(), 0);
    ok(typeof releaseJobs === "function"); jobsMode = "empty"; releaseJobs(); releaseJobs = undefined;
    await waitReady(); equal(await page.locator(".print-empty-title").innerText(), "暂无打印任务");
  });
  await testcase("普通作业角色不能看到打印设置，但能选择合法批次", async () => {
    roleManage = false; await printPage();
    equal(await page.getByText("打印设置", { exact: true }).count(), 0);
    equal(await page.locator(".print-empty-action").innerText(), "选择入库批次");
  });
  await testcase("管理员设置入口保留，不从空队列伪造打印机就绪或未配置", async () => {
    roleManage = true; await printPage();
    equal(await page.getByText("打印设置", { exact: true }).count(), 1);
    equal(await page.getByText(/打印机就绪|请先配置打印机|尚未配置打印机/).count(), 0);
  });
  for (const width of [320, 390, 768]) await testcase(`${width}px下批次空态和展开筛选均无横向溢出`, async () => {
    await page.setViewportSize({ width, height: 844 }); await printPage(true);
    const closed = await noHorizontalOverflow(); ok(closed.documentWidth <= width + 1 && closed.bodyWidth <= width + 1, JSON.stringify(closed));
    await openFilters(); const opened = await noHorizontalOverflow();
    ok(opened.documentWidth <= width + 1 && opened.bodyWidth <= width + 1, JSON.stringify(opened));
    equal(await page.locator("#print-filters .chip-row").first().locator(".chip").count(), 10);
  });
  await testcase("全部交互仅访问明确声明的隔离只读接口，无写入未知网络或页面异常", async () => {
    equal(forbiddenWrites, []); equal(unknownRequests, []); equal(pageErrors, []);
    ok(reads.some(x => x.path === "/inout/print-jobs"));
    equal(screenshots.length, 4);
  });
  writeReport(true);
  process.stdout.write(JSON.stringify({ passed: true, namedCases: checks.length, actualAssertions: assertionCount, report: reportPath, screenshots }) + "\n");
})().catch(async error => {
  if (page) await page.screenshot({ path: path.join(out, "print-empty-failure.png"), fullPage: true }).catch(() => {});
  writeReport(false, error);
  process.stderr.write(String(error.stack || error) + "\n"); process.exitCode = 1;
}).finally(async () => {
  if (releaseJobs) releaseJobs();
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
});
