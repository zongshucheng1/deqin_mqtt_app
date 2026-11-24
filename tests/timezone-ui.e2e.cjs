/* Compiled UI, fresh synthetic identity, no real backend or write is permitted. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { chromium } = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const version = require("../src/manifest.json").versionName;
const fixture = require("./helpers/build-isolated-h5.cjs")({ publicKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey, fixtureName: "h5-timezone-lifecycle-fixture" });
const output = path.resolve(__dirname, "../.test-artifacts", version), reads = [], forbidden = [], errors = [], checks = [];
let count = 0, browser, context, page, origin, delayed = false, release, invalidZone = false, serial = 0;
const ok = (v, why) => { count++; assert.ok(v, why); }, equal = (a, b, why) => { count++; assert.deepEqual(a, b, why); };
const testcase = async (name, fn) => { const before = count; await fn(); checks.push({ name, passed: true, assertions: count - before }); console.log("PASS " + name); };
const zoneA = "America/New_York", zoneB = "Asia/Kathmandu", idA = "9007199254740993", idB = "9007199254740994";
function file(url) { const target = path.resolve(fixture.base, "." + decodeURIComponent(url)); if (target !== fixture.base && !target.startsWith(fixture.base + path.sep)) return null; const resolved = target === fixture.base ? path.join(target, "index.html") : target; return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null; }
const server = http.createServer((req, res) => { const target = file(new URL(req.url, "http://127.0.0.1").pathname); if (req.method !== "GET" || !target) { forbidden.push(req.url); res.writeHead(404); res.end(); return; } res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] || "application/octet-stream"); res.end(fs.readFileSync(target)); });
const last = (pathname) => reads.filter(r => r.path === pathname).at(-1)?.query;
const waitRead = (pathname, predicate = () => true) => page.waitForResponse(r => { const u = new URL(r.url()); return u.pathname === pathname && predicate(u.searchParams); });
async function navigate(route) { await page.goto(origin + "/?case=" + ++serial + "#/pages/" + route); }
async function day(pathname) { const wait = waitRead(pathname, q => q.get("startDate") === q.get("endDate") && q.has("startDate")); await page.locator(".chip").getByText("日", { exact: true }).click(); await wait; }
async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: true }); }
async function pushHome() { await page.goto(origin + "/?case=" + serial + "#/pages/home/index"); await page.locator(".factory-picker").waitFor(); }
async function back() { await page.goBack(); await page.waitForTimeout(180); }
function report(passed, error) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "timezone-lifecycle-report.json"), JSON.stringify({ passed, versionName: version, namedCaseCount: checks.length, actualAssertionCount: count, checks, error: error && String(error.stack || error), source: "Compiled H5 with Intl removed before import; synthetic context only", timezoneDataVersion: "2026e", deviceTimezone: "Pacific/Honolulu", fixedEpoch: "2026-10-30T23:30:00Z", reads, forbidden, pageErrors: errors, testSha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"), isolation: { realBackendRequests: 0, realCredentialsRead: false, existingSessionRead: false, permittedWrites: 0 } }, null, 2) + "\n"); }
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r)); origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Pacific/Honolulu", locale: "zh-CN", serviceWorkers: "block" }); context.setDefaultTimeout(10000);
  await context.addInitScript(({ identity }) => {
    Object.defineProperty(globalThis, "Intl", { value: undefined, configurable: true });
    const RealDate = Date, now = 1793403000000;
    function FixedDate(...args) { return new.target ? new RealDate(...(args.length ? args : [now])) : new RealDate(now).toString(); }
    FixedDate.prototype = RealDate.prototype; Object.setPrototypeOf(FixedDate, RealDate); FixedDate.now = () => now; globalThis.Date = FixedDate;
    localStorage.setItem("dq.deploymentIdentity", identity); localStorage.setItem("dq.token", "synthetic-timezone-fixture-token"); localStorage.setItem("dq.tenantId", "000000");
  }, { identity: fixture.deploymentIdentity });
  await context.route("**/*", async route => {
    const request = route.request(), u = new URL(request.url());
    if (request.method() === "GET" && request.url() === "https://cdn.dcloud.net.cn/img/shadow-grey.png") { await route.fulfill({ status: 204 }); return; }
    if (request.method() !== "GET" || u.origin !== origin) { forbidden.push({ method: request.method(), url: request.url() }); await route.abort(); return; }
    if (u.pathname === "/favicon.ico") { await route.fulfill({ status: 204 }); return; }
    if (file(u.pathname)) { await route.continue(); return; }
    let data;
    reads.push({ path: u.pathname, query: Object.fromEntries(u.searchParams) });
    if (u.pathname === "/inout/context") { if (delayed) await new Promise(r => { release = r; }); data = { tenantId: "000000", userId: "9007199254740995", username: "synthetic_timezone_operator", permissions: ["inout:work"], roleNames: ["隔离作业员"], capabilities: { work: true, manage: false }, factories: [{ factoryId: idA, factoryName: "隔离纽约工厂", timezone: invalidZone ? "Mars/Base" : zoneA }, { factoryId: idB, factoryName: "隔离加德满都工厂", timezone: zoneB }] }; }
    else if (u.pathname === "/inout/statistics") data = { warehouses: [] };
    else if (["/inout/records", "/inout/print-jobs"].includes(u.pathname)) data = { rows: [], total: 0 };
    else if (u.pathname === "/auth/code") data = { captchaEnabled: false };
    else { forbidden.push({ path: u.pathname, method: request.method() }); await route.abort(); return; }
    await route.fulfill({ json: { code: 200, msg: "ok", data } });
  });
  page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await testcase("等待授权工厂后才查询首页业务日，不借用手机日期", async () => {
    delayed = true; await navigate("home/index"); await page.getByText("正在读取服务器数据…", { exact: true }).waitFor();
    equal(reads.filter(r => r.path === "/inout/statistics").length, 0); ok(release);
    delayed = false; release(); await page.waitForResponse(r => new URL(r.url()).pathname === "/inout/statistics");
    equal(last("/inout/statistics").startDate, "2026-10-30"); equal(last("/inout/statistics").endDate, "2026-10-30");
    equal(await page.evaluate(() => typeof Intl), "undefined");
  });
  await testcase("记录筛选初值来自纽约工厂而非默认上海", async () => {
    await navigate("records/index"); await day("/inout/records");
    equal(last("/inout/records").startDate, "2026-10-30"); await page.locator(".date-picker").getByText("2026年10月30日", { exact: true }).waitFor();
    const wait = waitRead("/inout/records", q => q.get("startDate") === "2026-10-29"); await page.getByLabel("上一期", { exact: true }).click(); await wait;
    equal(last("/inout/records").endDate, "2026-10-29");
  });
  await testcase("同工厂页面恢复保留人工选择的日期", async () => {
    await pushHome(); await back(); await page.locator(".date-picker").getByText("2026年10月29日", { exact: true }).waitFor();
    equal(last("/inout/records").startDate, "2026-10-29");
  });
  await testcase("切换授权工厂后旧日期重置到新IANA工厂业务日", async () => {
    await pushHome(); await page.locator(".factory-picker").click(); await page.locator(".uni-picker-content .uni-picker-item").filter({ hasText: /^隔离加德满都工厂$/ }).last().click(); await page.locator(".uni-picker-action-confirm").last().click();
    await page.locator(".factory-picker").filter({ hasText: "隔离加德满都工厂" }).waitFor(); await back();
    await page.locator(".date-picker").getByText("2026年10月31日", { exact: true }).waitFor(); equal(last("/inout/records").factoryId, idB); equal(last("/inout/records").startDate, "2026-10-31");
    await screenshot("timezone-factory-switch.png");
  });
  await testcase("仓库周区间继续传日期，日筛选为四十五分钟区工厂当天", async () => {
    await navigate("warehouse/index?warehouse=RAW_WOOD"); await page.locator(".date-picker").getByText("2026年10月31日", { exact: true }).waitFor();
    equal(last("/inout/statistics").startDate, "2026-10-26"); equal(last("/inout/statistics").endDate, "2026-11-01");
    await day("/inout/statistics"); equal(last("/inout/statistics").startDate, "2026-10-31");
  });
  await testcase("统计页面和打印筛选也使用授权工厂日期", async () => {
    await navigate("statistics/index"); await page.locator(".date-picker").getByText("2026年10月31日", { exact: true }).waitFor(); await day("/inout/statistics"); equal(last("/inout/statistics").startDate, "2026-10-31");
    await navigate("print/index"); await page.locator(".print-filter-toggle").click(); await day("/inout/print-jobs"); equal(last("/inout/print-jobs").startDate, "2026-10-31");
  });
  await testcase("入库先等工厂授权，表单无临时上海日期也不能提前提交", async () => {
    delayed = true; release = undefined; await navigate("entry/index?warehouse=RAW_WOOD"); await page.getByText("正在读取工厂授权与业务日期…", { exact: true }).waitFor();
    equal(await page.getByText("下一步：填写分径数量", { exact: true }).count(), 0); equal(await page.locator("#field-recordDate").count(), 0); ok(release);
    delayed = false; release(); await page.locator("#field-recordDate").getByText("2026年10月31日", { exact: true }).waitFor();
    await screenshot("timezone-entry-ready.png");
  });
  await testcase("非法工厂IANA明确报配置错误且不发任何业务查询", async () => {
    invalidZone = true; const before = reads.filter(r => r.path !== "/inout/context").length;
    await navigate("home/index"); await page.getByText("工厂时区配置无效，请联系管理员核对", { exact: true }).waitFor();
    equal(reads.filter(r => r.path !== "/inout/context").length, before); equal(await page.getByText(/升级系统/).count(), 0);
    await screenshot("timezone-invalid-factory.png"); invalidZone = false; await page.getByText("重新加载", { exact: true }).click(); await page.waitForResponse(r => new URL(r.url()).pathname === "/inout/statistics"); equal(last("/inout/statistics").startDate, "2026-10-31");
  });
  equal(forbidden, []); equal(errors, []); report(true); console.log(`TIMEZONE UI PASS ${checks.length} cases / ${count} assertions`);
})().catch(e => { report(false, e); console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
