/* Isolated compiled H5 and synthetic native bridge: no real backend, login or printing. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fixture = require("./helpers/build-isolated-h5.cjs")({
  publicKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey,
  fixtureName: "h5-server-print-submission-ui-20261102",
  printerNativeFixture: true,
});
const output = path.resolve(__dirname, "../.test-artifacts", fixture.version, "server-print-submission-ui-20261102");
fs.mkdirSync(output, { recursive: true });
const factoryId = "9007199254740993", recordId = "9007199254741100", printerId = "9007199254741200";
const checks = [], requests = [], writes = [], forbidden = [], pageErrors = [], nativeEvidence = [];
const records = new Map(), labels = new Map(), jobs = new Map();
const labelPrintIntents = new Map();
let browser, context, page, origin, serial = 0, assertions = 0, activeCase = "setup", capabilityEnabled = true;
let holdContext = false, releaseContext;
let atomicSequence = 0, loseAtomicResponseOnce = false, rejectAtomicOnce = false;
let manager = false, canReprint = false, failLatestLabel = false, failJobs = false;
let holdNextLabel = false, releaseLabel;
const equal = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const text = (value) => page.getByText(value, { exact: true });
const button = (value) => page.locator("uni-button").filter({ hasText: new RegExp("^\\s*" + value + "\\s*$") });
const input = (value) => page.locator('uni-input[aria-label="' + value + '"] input');
const makeRecord = (id, warehouseType = "RAW_WOOD") => ({
  id, factoryId, warehouseType, recordNo: "SYNTHETIC-" + id, recordDate: "2026-10-27", quantity: "2",
  stockStatus: "IN_STOCK", quantitySource: "APP_INPUT", codingMode: "NONE", version: 0,
  inboundAtMs: "1793088000000", detail: { woodSpecification: "2.6m", woodGrade: "A", supplierName: "隔离供应商" }, operations: [],
});
const makeLabel = (id, templateCode, versionNo = 1) => ({ id, recordId, status: "READY", templateCode, versionNo, qrContent: "SYNTHETIC", contentSha256: "a".repeat(64) });
const makeJob = (id, businessId, status = "QUEUED", executionMode = "PC_AGENT") => ({
  id, factoryId, recordId: businessId, recordNo: records.get(businessId)?.recordNo, warehouseType: records.get(businessId)?.warehouseType || "RAW_WOOD",
  labelId: labels.get(businessId)?.id, printerId, printerName: "隔离工厂 GE540", jobKind: "INITIAL", status, executionMode,
  copies: 1, paperWidthMm: "80", paperHeightMm: "80", labelRevision: labels.get(businessId)?.versionNo || 1, version: 1, createdAtMs: "1793088000000", attempts: [], operations: [],
});
records.set(recordId, makeRecord(recordId));
labels.set(recordId, makeLabel("9007199254741300", "STANDARD"));
function file(urlPath) {
  const candidate = path.resolve(fixture.base, "." + decodeURIComponent(urlPath));
  if (candidate !== fixture.base && !candidate.startsWith(fixture.base + path.sep)) return;
  const resolved = candidate === fixture.base ? path.join(candidate, "index.html") : candidate;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : undefined;
}
const server = http.createServer((req, res) => {
  const target = file(new URL(req.url, "http://127.0.0.1").pathname);
  if (req.method !== "GET" || !target) { forbidden.push({ surface: "static", case: activeCase, method: req.method, path: req.url }); res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" })[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(target));
});
async function navigate(route) {
  await page.goto(origin + "/?serverPrintCase=" + (++serial) + "#/pages/" + route, { waitUntil: "networkidle" });
}
async function noPhoneExecution() {
  const calls = await page.evaluate(() => globalThis.__printerFixture?.calls || []);
  nativeEvidence.push({ case: activeCase, calls });
  equal(calls.filter(call => /^(device\.(print|start)|discovery\.|host\.(start|probe|test))/.test(call.method)), []);
}
async function testcase(name, run) {
  activeCase = name;
  const before = assertions;
  await run();
  await noPhoneExecution();
  equal(pageErrors, []);
  checks.push({ name, passed: true, assertions: assertions - before });
  console.log("PASS " + checks.length + ": " + name);
}
async function modalAccept() {
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.locator("uni-modal").waitFor({ state: "hidden" });
}
async function modalCancel() {
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  await page.locator("uni-modal").waitFor({ state: "hidden" });
}
const recordJobs = id => [...jobs.values()].filter(job => job.recordId === id);
const latestJob = id => recordJobs(id).at(-1);
function completeCurrentPrint(id = recordId) {
  const job = latestJob(id);
  if (job) { job.status = "COMPLETED"; job.version++; }
  const label = labels.get(id);
  if (label) { label.status = "READY"; delete label.lastError; }
}
async function assertGenerateBlocked() {
  const generate = button("生成新版本并打印").or(button("生成电脑标签并打印"));
  equal(await generate.count(), 1, "Keep the unavailable generation action visible with its disabled state");
  equal(await generate.evaluate(el => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"), true);
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: true }); }
const labelReads = (id = recordId) => requests.filter(request => request.method === "GET" && request.path === "/inout/records/" + id + "/labels/latest").length;
const jobReads = (id = recordId) => requests.filter(request => request.method === "GET" && request.path === "/inout/print-jobs" && request.query.recordId === id).length;
const recordReads = (id = recordId) => requests.filter(request => request.method === "GET" && request.path === "/inout/records/" + id).length;
async function advance(ms) { await page.clock.runFor(ms); await page.waitForTimeout(80); }
async function waitForHeldLabel() {
  for (let n = 0; n < 50 && !releaseLabel; n++) await page.waitForTimeout(20);
  ok(releaseLabel, "Synthetic delayed label request must have started");
}
function report(passed, error) {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({
    passed, generatedAt: new Date().toISOString(), version: fixture.version, namedCaseCount: checks.length, actualAssertionCount: assertions,
    checks, activeCase, error: error && String(error.stack || error), requests, syntheticWrites: writes, forbiddenRequests: forbidden,
    pageErrors, nativeEvidence, isolatedBuild: fixture.base,
    isolation: { realBackendRequests: 0, actualPrints: 0, actualInventoryWrites: 0, existingBrowserSessionsRead: false, realCredentialsRead: false },
  }, null, 2) + "\n");
}
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Pacific/Honolulu", serviceWorkers: "block" });
  context.setDefaultTimeout(12000);
  await context.addInitScript(identity => {
    localStorage.setItem("dq.deploymentIdentity", identity);
    localStorage.setItem("dq.token", "synthetic-server-print-token");
    localStorage.setItem("dq.tenantId", "synthetic-tenant");
  }, fixture.deploymentIdentity);
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url()), pathname = url.pathname, method = req.method();
    if (method === "GET" && req.url() === "https://cdn.dcloud.net.cn/img/shadow-grey.png") return route.fulfill({ status: 204 });
    if (url.origin !== origin) { forbidden.push({ surface: "external", method, url: req.url() }); return route.abort("blockedbyclient"); }
    if (pathname === "/favicon.ico") return route.fulfill({ status: 204 });
    if (method === "GET" && file(pathname)) return route.continue();
    const body = req.postDataJSON() || {};
    requests.push({ case: activeCase, method, path: pathname, query: Object.fromEntries(url.searchParams) });
    if (method !== "GET") writes.push({ case: activeCase, method, path: pathname, body });
    let data;
    if (pathname === "/inout/context" && method === "GET") {
      if (holdContext) await new Promise(resolve => { releaseContext = resolve; });
      data = { tenantId: "synthetic-tenant", userId: "9007199254740995", username: "synthetic-operator", permissions: ["inout:work", ...(manager ? ["inout:manage"] : []), ...(canReprint ? ["inout:print:reprint"] : [])], roleNames: [manager ? "隔离管理员" : "隔离操作员"], capabilities: { work: true, manage: manager }, factories: [{ factoryId, factoryName: "隔离打印工厂", timezone: "Asia/Shanghai" }] };
    } else if (pathname === "/inout/print-agent/capabilities" && method === "GET") {
      data = { warehouses: ["RAW_WOOD", "PEELING", "DRYING", "WOOD_CORE", "WHITE_BARK"].map(warehouseType => ({ warehouseType, serverManagedPrinting: capabilityEnabled, executionMode: "PC_AGENT" })) };
    } else if (pathname.startsWith("/inout/print-configs/") && method === "GET") {
      data = { id: "9007199254741400", factoryId, warehouseType: pathname.split("/").at(-1), templateCode: "PC_80", printerId, paperWidthMm: "80", paperHeightMm: "80", copies: 1, autoPrint: 1, version: 1 };
    } else if (pathname === "/inout/printers" && method === "GET") {
      data = [{ id: printerId, printerName: "隔离工厂 GE540", protocol: "WINDOWS_SPOOL", enabled: 1 }];
    } else if (pathname === "/inout/records" && method === "POST") {
      equal(body.printingMode, "SERVER"); equal("printerId" in body, false); equal("deviceId" in body, false);
      const id = "9007199254741101";
      data = { ...makeRecord(id, body.warehouseType), ...body, id, quantity: String(body.quantity) };
      records.set(id, data); labels.set(id, { ...makeLabel("9007199254741302", "PC_80"), recordId: id });
      const job = makeJob("9007199254741501", id); jobs.set(job.id, job);
    } else if (/^\/inout\/records\/\d+\/labels\/latest$/.test(pathname) && method === "GET") {
      if (failLatestLabel) return route.fulfill({ status: 500, json: { code: 500, msg: "隔离标签读取失败", data: null } });
      data = structuredClone(labels.get(pathname.split("/")[3]));
      if (holdNextLabel) {
        holdNextLabel = false;
        await new Promise(resolve => { releaseLabel = resolve; });
      }
    } else if (/^\/inout\/records\/\d+\/labels\/print$/.test(pathname) && method === "POST") {
      const id = pathname.split("/")[3];
      ok(records.has(id)); equal(body.factoryId, factoryId); ok(body.requestKey);
      equal(Object.keys(body).sort(), ["factoryId", "requestKey", "sourceLabelId"]);
      const original = labelPrintIntents.get(body.requestKey);
      if (original) {
        equal(original.sourceLabelId, body.sourceLabelId);
        data = original.job;
      } else {
        equal(body.sourceLabelId, labels.get(id)?.id ?? null);
        if (rejectAtomicOnce) {
          rejectAtomicOnce = false;
          return route.fulfill({ status: 409, json: { code: 409, msg: "电脑打印绑定不可用，请联系管理员", data: null } });
        }
        const previous = latestJob(id), revision = (labels.get(id)?.versionNo || 0) + 1;
        atomicSequence++;
        const generated = {
          ...makeLabel(String(9007199254741800n + BigInt(atomicSequence)), "PC_80", revision),
          recordId: id, status: "PENDING", requestKey: "synthetic-render-" + body.requestKey,
        };
        labels.set(id, generated);
        data = { ...makeJob(String(9007199254741900n + BigInt(atomicSequence)), id, "WAITING_LABEL"),
          jobKind: previous ? "REPRINT" : "INITIAL", parentJobId: previous?.id, labelId: generated.id, labelRevision: revision };
        jobs.set(data.id, data);
        labelPrintIntents.set(body.requestKey, { sourceLabelId: body.sourceLabelId, job: data });
      }
      if (loseAtomicResponseOnce) {
        loseAtomicResponseOnce = false;
        return route.abort("failed");
      }
    } else if (/^\/inout\/records\/\d+\/labels$/.test(pathname) && method === "POST") {
      const id = pathname.split("/")[3];
      equal(id, recordId); equal(body.factoryId, factoryId); equal(body.requestKey, labels.get(id).requestKey);
      data = { ...labels.get(id), status: "READY" }; delete data.lastError; labels.set(id, data);
      const job = latestJob(id);
      equal(job.labelId, data.id); job.status = "QUEUED";
    } else if (/^\/inout\/requests\/[^/]+$/.test(pathname) && method === "GET") {
      const key = decodeURIComponent(pathname.split("/").at(-1));
      equal(url.searchParams.get("factoryId"), factoryId);
      const intent = labelPrintIntents.get(key);
      ok(intent, "Recovery must use a committed synthetic intent's original key");
      data = { completed: true, result: intent.job };
    } else if (/^\/inout\/records\/\d+$/.test(pathname) && method === "GET") {
      data = records.get(pathname.split("/").at(-1));
    } else if (pathname === "/inout/records" && method === "GET") {
      data = { rows: [...records.values()], total: records.size };
    } else if (pathname === "/inout/print-jobs" && method === "GET") {
      if (failJobs) return route.fulfill({ status: 500, json: { code: 500, msg: "隔离打印状态读取失败", data: null } });
      const rows = [...jobs.values()].reverse().filter(job => !url.searchParams.has("recordId") || job.recordId === url.searchParams.get("recordId"));
      data = { rows, total: rows.length };
    } else if (pathname === "/inout/print-jobs" && method === "POST") {
      equal(body.recordId, recordId); equal(body.labelId, labels.get(recordId).id); equal("printerId" in body, false); ok(body.requestKey);
      data = makeJob("9007199254741500", recordId); jobs.set(data.id, data);
    } else if (/^\/inout\/print-jobs\/\d+$/.test(pathname) && method === "GET") {
      data = jobs.get(pathname.split("/").at(-1));
    } else if (/^\/inout\/print-jobs\/\d+\/verify$/.test(pathname) && method === "POST") {
      const id = pathname.split("/")[3], previous = jobs.get(id);
      if (previous.executionMode === "DEVICE") {
        equal(body.verificationResult, "UNRESOLVED"); ok(body.reason);
        data = { ...previous, verificationResult: "UNRESOLVED", version: previous.version + 1 };
      } else {
        equal(previous.executionMode, "PC_AGENT"); equal(body.verificationResult, "PRINTED");
        equal(body.reason, ""); equal(body.queueCancelledAndNotPrinted, undefined);
        data = { ...previous, status: "COMPLETED", completionBasis: "MANUAL_CONFIRMED", verificationResult: "PRINTED", version: previous.version + 1 };
      }
      jobs.set(id, data);
    } else if (pathname === "/auth/code" && method === "GET") data = { captchaEnabled: false };
    else if (pathname === "/inout/statistics" && method === "GET") data = { warehouses: [] };
    else { forbidden.push({ surface: "api", method, path: pathname }); return route.fulfill({ status: 404, json: { code: 404, msg: "Undeclared isolated route" } }); }
    return route.fulfill({ json: { code: 200, msg: "ok", data } });
  });
  page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  await testcase("打印状态只读后台能力与配置，不搜索或设置手机打印机", async () => {
    await navigate("printers/index?warehouse=RAW_WOOD");
    await text("后台已启用").waitFor(); await text("隔离工厂 GE540").waitFor();
    equal(await page.locator("input").count(), 0);
    for (const label of ["重新搜索", "设为本仓默认", "USB直连", "保存纸张设置", "由本设备自动打印机器入库"]) equal(await text(label).count(), 0);
    equal(writes.length, 0);
    for (const api of ["/inout/print-agent/capabilities", "/inout/print-configs/RAW_WOOD", "/inout/printers"]) ok(requests.some(request => request.path === api && request.method === "GET"));
    capabilityEnabled = false; await text("刷新后台状态").click(); await text("后台尚未启用").waitFor();
    equal(writes.length, 0); await screenshot("readonly-print-status.png"); capabilityEnabled = true;
  });
  await testcase("取消生成并打印保留原标签，不创建任何打印或入库请求", async () => {
    await navigate("detail/index?id=" + recordId);
    const before = writes.length, original = labels.get(recordId).id;
    await button("生成电脑标签并打印").click();
    await page.locator("uni-modal").getByText("生成标签并打印", { exact: true }).waitFor();
    await modalCancel();
    equal(writes.length, before); equal(labels.get(recordId).id, original); equal(jobs.size, 0);
  });
  await testcase("旧STANDARD无任务批次确认一次即原子生成并排队，快速重复点击不重复提交", async () => {
    const before = writes.length;
    // Manual printing is still authorized by the backend when automatic inbound printing is off.
    capabilityEnabled = false;
    await navigate("detail/index?id=" + recordId);
    const original = labels.get(recordId).id;
    await button("生成电脑标签并打印").evaluate(el => { el.click(); el.click(); });
    await page.locator("uni-modal").getByText("生成标签并打印", { exact: true }).waitFor();
    equal(writes.length, before); await modalAccept(); await text("工厂标签打印").waitFor();
    equal(writes.slice(before).map(write => write.path), ["/inout/records/" + recordId + "/labels/print"]);
    equal(writes.at(-1).body.sourceLabelId, original);
    equal(latestJob(recordId).labelId, labels.get(recordId).id);
    equal(latestJob(recordId).status, "WAITING_LABEL"); equal(labels.get(recordId).status, "PENDING");
    equal(recordJobs(recordId).length, 1);
    equal(writes.filter(write => write.path === "/inout/print-jobs").length, 0);
    equal(writes.filter(write => write.path === "/inout/records").length, 0);
    equal(records.size, 1); equal(await button("提交后台首次打印").count(), 0); await screenshot("existing-record-pc-first-print.png");
    capabilityEnabled = true;
  });
  await testcase("已完成电脑任务生成新标签对应新的REPRINT，保留旧任务和入库", async () => {
    completeCurrentPrint();
    const previous = structuredClone(latestJob(recordId)), originalLabel = labels.get(recordId).id;
    const before = writes.length;
    await navigate("detail/index?id=" + recordId);
    await button("生成新版本并打印").click(); await modalAccept();
    await text("工厂标签打印").waitFor(); await text("等待标签生成").waitFor();
    equal(writes.slice(before).map(write => write.path), ["/inout/records/" + recordId + "/labels/print"]);
    equal(writes.at(-1).body.sourceLabelId, originalLabel);
    equal(recordJobs(recordId).length, 2); equal(jobs.get(previous.id), previous);
    equal(latestJob(recordId).jobKind, "REPRINT"); equal(latestJob(recordId).parentJobId, previous.id);
    equal(latestJob(recordId).labelId, labels.get(recordId).id); ok(latestJob(recordId).labelId !== originalLabel);
    equal(latestJob(recordId).labelRevision, previous.labelRevision + 1);
    equal(records.size, 1); await screenshot("new-label-reprint.png");
  });
  await testcase("正常电脑提交后确认额外打印新版本，无需把旧任务改成已出纸", async () => {
    const submitted = latestJob(recordId);
    submitted.status = "SUBMITTED";
    submitted.attempts = [{ attemptNo: 1, status: "SUBMITTED", sendPhase: "ACCEPTED", remoteStatus: { deliveryKind: "WINDOWS_SPOOL", spoolJobId: "61" } }];
    labels.get(recordId).status = "READY";
    const previous = structuredClone(submitted), originalLabel = labels.get(recordId).id;
    const before = writes.length, jobsBefore = jobs.size;
    await navigate("detail/index?id=" + recordId); await text("工厂标签打印").waitFor();
    await button("生成新版本并打印").click();
    await page.locator("uni-modal").getByText(/仍可能排队或出纸.*额外打印一张/).waitFor();
    await modalCancel();
    equal(writes.length, before); equal(jobs.size, jobsBefore); equal(labels.get(recordId).id, originalLabel);
    await button("生成新版本并打印").click(); await modalAccept();
    await text("等待标签生成").waitFor();
    equal(writes.slice(before).map(write => write.path), ["/inout/records/" + recordId + "/labels/print"]);
    equal(writes.at(-1).body.sourceLabelId, originalLabel);
    equal(jobs.size, jobsBefore + 1); equal(jobs.get(previous.id), previous);
    equal(latestJob(recordId).jobKind, "REPRINT"); equal(latestJob(recordId).parentJobId, previous.id);
    equal(latestJob(recordId).labelId, labels.get(recordId).id); ok(latestJob(recordId).labelId !== originalLabel);
    equal(latestJob(recordId).labelRevision, previous.labelRevision + 1); equal(records.size, 1);
    equal(await text("已打印").count(), 0);
  });
  await testcase("未完成或结果不明的电脑任务禁止生成新版本，保留原标签和任务", async () => {
    completeCurrentPrint();
    const job = latestJob(recordId), before = writes.length, jobsBefore = jobs.size;
    const originalLabel = labels.get(recordId).id;
    for (const status of ["WAITING_LABEL", "QUEUED", "WAITING_PRINTER", "PREPARING", "SENDING", "UNKNOWN"]) {
      job.status = status; delete job.verificationResult;
      await navigate("detail/index?id=" + recordId); await text("工厂标签打印").waitFor();
      await assertGenerateBlocked();
      equal(writes.length, before); equal(jobs.size, jobsBefore); equal(labels.get(recordId).id, originalLabel);
      equal(await page.locator("uni-modal").isVisible(), false);
    }
    completeCurrentPrint();
  });
  await testcase("结果不明但已核实未出纸可进入新版本确认，取消不新增任务", async () => {
    const job = latestJob(recordId), before = writes.length, jobsBefore = jobs.size;
    job.status = "UNKNOWN"; job.verificationResult = "NOT_PRINTED";
    await navigate("detail/index?id=" + recordId); await text("工厂标签打印").waitFor();
    await button("生成新版本并打印").click(); await modalCancel();
    equal(writes.length, before); equal(jobs.size, jobsBefore);
    delete job.verificationResult; completeCurrentPrint();
  });
  await testcase("最新标签读取失败不能当作无标签生成，恢复读取后才允许操作", async () => {
    const before = writes.length, originalLabel = labels.get(recordId).id;
    failLatestLabel = true;
    try {
      await navigate("detail/index?id=" + recordId); await text("服务器暂时不可用").waitFor();
      await assertGenerateBlocked(); equal(writes.length, before); equal(labels.get(recordId).id, originalLabel);
    } finally { failLatestLabel = false; }
    await button("刷新标签与打印状态").click(); await text("已就绪").waitFor();
    equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
    equal(writes.length, before);
  });
  await testcase("操作员和管理员均可生成新版本并打印，无需另授补打权限", async () => {
    try {
      for (const permissions of [{ manager: false, canReprint: false }, { manager: false, canReprint: true }, { manager: true, canReprint: false }, { manager: true, canReprint: true }]) {
        manager = permissions.manager; canReprint = permissions.canReprint;
        completeCurrentPrint();
        const previous = structuredClone(latestJob(recordId)), originalLabel = labels.get(recordId).id;
        const before = writes.length, jobsBefore = jobs.size;
        await navigate("detail/index?id=" + recordId); await text("工厂标签打印").waitFor();
        equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
        await button("生成新版本并打印").click(); await modalAccept();
        await text("等待标签生成").waitFor();
        equal(writes.slice(before).map(write => write.path), ["/inout/records/" + recordId + "/labels/print"]);
        equal(writes.at(-1).body.sourceLabelId, originalLabel);
        equal(jobs.size, jobsBefore + 1); equal(jobs.get(previous.id), previous);
        equal(latestJob(recordId).jobKind, "REPRINT"); equal(latestJob(recordId).parentJobId, previous.id);
        equal(latestJob(recordId).labelId, labels.get(recordId).id); ok(latestJob(recordId).labelId !== originalLabel);
        equal(latestJob(recordId).labelRevision, previous.labelRevision + 1); equal(records.size, 1);
      }
    } finally { manager = false; canReprint = false; completeCurrentPrint(); }
  });
  await testcase("操作员生成新版本权限不开放打印核验和原版本明确补打", async () => {
    const job = latestJob(recordId), before = writes.length;
    for (const status of ["COMPLETED", "SUBMITTED", "UNKNOWN"]) {
      job.status = status;
      await navigate("print/index?recordId=" + recordId); await text("执行记录").first().waitFor();
      equal(await text("核验纸张结果").count(), 0); equal(await text("明确补打").count(), 0);
      equal(writes.length, before);
    }
    completeCurrentPrint();
  });
  await testcase("已作废批次不可通过新标签版本再次派发打印", async () => {
    const before = writes.length, jobsBefore = jobs.size, business = records.get(recordId);
    business.voidFlag = 1;
    try {
      await navigate("detail/index?id=" + recordId); await text("已作废").waitFor();
      await assertGenerateBlocked(); equal(writes.length, before); equal(jobs.size, jobsBefore);
    } finally { delete business.voidFlag; }
  });
  await testcase("明确失败不创建标签或任务，也不宣称已经出纸", async () => {
    completeCurrentPrint();
    const before = writes.length, jobsBefore = jobs.size, originalLabel = labels.get(recordId).id;
    rejectAtomicOnce = true;
    await navigate("detail/index?id=" + recordId);
    await button("生成新版本并打印").click(); await modalAccept();
    await text("电脑打印绑定不可用，请联系管理员").waitFor();
    equal(writes.length, before + 1); equal(jobs.size, jobsBefore); equal(labels.get(recordId).id, originalLabel);
    equal(await button("核对生成与打印结果").count(), 0);
    equal(await text("已打印").count(), 0); equal(records.size, 1);
  });
  await testcase("生成打印响应丢失后重进详情只查原key，恢复原标签和原任务", async () => {
    const before = writes.length, jobsBefore = jobs.size;
    loseAtomicResponseOnce = true;
    await navigate("detail/index?id=" + recordId);
    await button("生成新版本并打印").click(); await modalAccept();
    await button("核对生成与打印结果").waitFor();
    equal(writes.length, before + 1); equal(jobs.size, jobsBefore + 1);
    const originalKey = writes.at(-1).body.requestKey, originalJob = latestJob(recordId).id, originalLabel = labels.get(recordId).id;
    await navigate("detail/index?id=" + recordId);
    await button("核对生成与打印结果").click();
    const confirmation = page.locator("uni-modal");
    if (await confirmation.isVisible()) await modalAccept();
    await button("核对生成与打印结果").waitFor({ state: "hidden" });
    equal(writes.length, before + 1); equal(jobs.size, jobsBefore + 1);
    equal(latestJob(recordId).id, originalJob); equal(labels.get(recordId).id, originalLabel);
    equal(requests.filter(request => request.case === activeCase && request.path === "/inout/requests/" + originalKey).map(request => request.method), ["GET"]);
    equal(writes.filter(write => write.path === "/inout/print-jobs").length, 0);
    await screenshot("label-print-unknown-recovered.png");
  });
  await testcase("标签渲染失败重试原版本后等待任务继续，不创建第二标签或任务", async () => {
    const failed = labels.get(recordId); failed.status = "FAILED"; failed.lastError = "隔离渲染失败";
    const job = latestJob(recordId), before = writes.length, jobsBefore = jobs.size, revision = failed.versionNo;
    await navigate("detail/index?id=" + recordId);
    await text("隔离渲染失败").waitFor(); await button("重试当前标签版本").click();
    await text("已就绪").waitFor();
    equal(writes.slice(before).map(write => write.path), ["/inout/records/" + recordId + "/labels"]);
    equal(writes.at(-1).body.requestKey, failed.requestKey);
    equal(labels.get(recordId).id, failed.id); equal(labels.get(recordId).versionNo, revision);
    equal(jobs.size, jobsBefore); equal(latestJob(recordId).id, job.id); equal(job.status, "QUEUED");
  });
  await testcase("已渲染详情导航触发requireSession清空context期间不抛时区异常", async () => {
    holdContext = true; releaseContext = undefined;
    const seen = page.waitForRequest(req => new URL(req.url()).pathname === "/inout/context");
    seen.catch(() => {});
    await text("查看打印任务").click(); await seen;
    await page.waitForTimeout(150); ok(releaseContext); equal(pageErrors, []);
    holdContext = false; releaseContext(); releaseContext = undefined;
    await page.waitForURL(/pages\/print\/index/); await text("执行记录").first().waitFor();
    equal(pageErrors, []); equal(writes.filter(write => write.path === "/inout/records").length, 0);
  });
  await testcase("新人工入库提交SERVER且无需手机选择打印机", async () => {
    const before = writes.length;
    await navigate("entry/index?warehouse=WHITE_BARK");
    await input("机器编号").fill("SYNTHETIC-01"); await input("入库吨数").fill("2.450");
    equal(await text("选择打印机").count(), 0);
    await text("确认入库").click(); await page.waitForURL(/pages\/detail\/index/); await text("工厂标签打印").waitFor();
    equal(writes.slice(before).map(write => write.path), ["/inout/records"]);
    equal(writes.at(-1).body.printingMode, "SERVER"); equal(records.size, 2);
    equal(writes.filter(write => write.path === "/inout/print-jobs").length, 0);
    await screenshot("new-server-inbound.png");
  });
  await testcase("历史DEVICE任务仅查看核验，不提供手机重试补打或新首次任务", async () => {
    manager = true; canReprint = true;
    const historyId = "9007199254741102", jobId = "9007199254741502";
    records.set(historyId, makeRecord(historyId)); labels.set(historyId, { ...makeLabel("9007199254741303", "STANDARD"), recordId: historyId });
    jobs.set(jobId, makeJob(jobId, historyId, "UNKNOWN", "DEVICE"));
    await navigate("detail/index?id=" + historyId); await text("历史终端打印任务").waitFor();
    equal(await button("提交后台首次打印").count(), 0); equal(await button("重试打印标签").count(), 0);
    await text("查看打印任务").click(); await page.waitForURL(/pages\/print\/index/); await text("核验纸张结果").waitFor();
    equal(await text("重试原任务").count(), 0); equal(await text("明确补打").count(), 0);
    const before = writes.length; await text("核验纸张结果").click(); await text("核验实际出纸结果").waitFor();
    await text("仍不明确").click(); await page.locator("textarea").fill("隔离核验：原手机发送证据尚待确认，不重新发送");
    await text("确认核验").click(); await page.locator(".modal-mask").waitFor({ state: "hidden" });
    equal(writes.slice(before).map(write => write.path), ["/inout/print-jobs/" + jobId + "/verify"]);
    equal(await text("明确补打").count(), 0); await screenshot("legacy-device-review-only.png");
  });
  await testcase("确认已出纸的依据选填且空白可提交，其他核验及补打继续必填", async () => {
    const verifyId = "9007199254741197", jobId = "9007199254741597";
    records.set(verifyId, makeRecord(verifyId));
    labels.set(verifyId, { ...makeLabel("9007199254741397", "PC_80"), recordId: verifyId });
    try {
      for (const status of ["SUBMITTED", "UNKNOWN"]) {
        jobs.set(jobId, { ...makeJob(jobId, verifyId, status), attempts: [{ attemptNo: 1, remoteStatus: { deliveryKind: "WINDOWS_SPOOL" } }] });
        await navigate("print/index?recordId=" + verifyId);
        await text("核验纸张结果").click(); await text("核验实际出纸结果").waitFor();
        const before = writes.length;
        await text("确认已出纸").click();
        equal(await text("核验依据（选填）").count(), 1); equal(await text("核验依据 *").count(), 0);
        if (status === "SUBMITTED") await screenshot("printed-verification-optional-reason.png");
        for (const choice of ["确认未出纸", "仍不明确"]) {
          await text(choice).click();
          equal(await text("核验依据 *").count(), 1); equal(await text("核验依据（选填）").count(), 0);
          await page.locator("textarea").fill("  "); await text("确认核验").click();
          await text("请填写核验依据").waitFor(); equal(writes.length, before);
        }
        await text("确认已出纸").click();
        equal(await text("核验依据（选填）").count(), 1); equal(await text("核验依据 *").count(), 0);
        await page.locator("textarea").fill(status === "SUBMITTED" ? "" : "  ");
        await text("确认核验").click(); await page.locator(".modal-mask").waitFor({ state: "hidden" });
        equal(writes.slice(before).map(write => write.path), ["/inout/print-jobs/" + jobId + "/verify"]);
        equal(writes.at(-1).body.reason, ""); equal(jobs.get(jobId).status, "COMPLETED");
        await text("已完成").waitFor();
        await text("明确补打").click(); await text("补打原因 *").waitFor();
        await text("确认补打").click(); await text("请填写补打原因").waitFor();
        equal(writes.length, before + 1);
        await page.locator(".modal-mask").getByText("取消", { exact: true }).click();
        await page.locator(".modal-mask").waitFor({ state: "hidden" });
      }
    } finally { jobs.delete(jobId); labels.delete(verifyId); records.delete(verifyId); }
  });
  await testcase("队列接收后的电脑业务任务免逐单确认，显式新版本打印保留原提交证据", async () => {
    const businessId = "9007199254741196", jobId = "9007199254741596";
    records.set(businessId, makeRecord(businessId));
    labels.set(businessId, { ...makeLabel("9007199254741396", "PC_80"), recordId: businessId });
    const accepted = { ...makeJob(jobId, businessId, "COMPLETED"), completionBasis: "WINDOWS_QUEUE_ACCEPTED",
      attempts: [{ id: "9007199254741696", attemptNo: 1, status: "SUBMITTED", sendPhase: "ACCEPTED", remoteStatus: { deliveryKind: "WINDOWS_SPOOL", spoolJobId: "81" } }] };
    jobs.set(jobId, accepted); const original = structuredClone(accepted), before = writes.length;
    try {
      manager = true; canReprint = true;
      await navigate("print/index?recordId=" + businessId); await text("已提交打印").waitFor();
      await page.getByText(/无需逐单确认/).first().waitFor();
      equal(await button("核验纸张结果").count(), 0); equal(await button("明确补打").count(), 1);
      equal(await button("重试原任务").count(), 0); equal(writes.length, before);
      await button("执行记录").click(); await text("打印执行记录").waitFor();
      await page.locator(".modal-mask").getByText(/当前状态：已提交打印/).waitFor();
      equal(await page.locator(".modal-mask").getByText("已提交，等待结果", { exact: true }).count(), 0);
      await screenshot("windows-queue-accepted-history.png");
      await page.locator(".modal-mask").getByText("关闭执行记录", { exact: true }).click();
      await button("明确补打").click(); await text("明确创建补打任务").waitFor();
      await page.locator(".modal-mask").getByText("取消", { exact: true }).click();
      equal(writes.length, before);
      await navigate("detail/index?id=" + businessId); await text("已提交打印").waitFor();
      await page.getByText(/无需逐单确认/).waitFor(); await screenshot("windows-queue-accepted-detail.png");
      await button("生成新版本并打印").click();
      await page.locator("uni-modal").getByText(/仍可能排队或出纸.*额外打印一张/).waitFor();
      await modalAccept(); await text("等待标签生成").waitFor();
      equal(writes.slice(before).map(write => write.path), ["/inout/records/" + businessId + "/labels/print"]);
      equal(jobs.get(jobId), original); equal(latestJob(businessId).parentJobId, jobId);
      equal(recordJobs(businessId).length, 2);
    } finally { for (const job of recordJobs(businessId)) jobs.delete(job.id); labels.delete(businessId); records.delete(businessId); }
  });
  await testcase("已提交任务后续缺纸或队列消失仍可见，不自动核验或重发", async () => {
    const businessId = "9007199254741196", jobId = "9007199254741596", before = writes.length;
    records.set(businessId, makeRecord(businessId));
    labels.set(businessId, { ...makeLabel("9007199254741396", "PC_80"), recordId: businessId });
    const job = { ...makeJob(jobId, businessId, "COMPLETED"), completionBasis: "WINDOWS_QUEUE_ACCEPTED" };
    jobs.set(jobId, job);
    try {
      for (const [state, statusFlags, expected] of [["ATTENTION_REQUIRED", 0x40, "缺纸，等待处理"], ["NOT_FOUND", 0, "队列任务已消失，出纸结果不明"]]) {
        job.autoVerification = { sequence: 1, state, statusFlags, observedAtMs: 1793580000000, printerName: job.printerName, physicalCompletionConfirmed: false };
        await navigate("print/index?recordId=" + businessId); await text("已提交打印").waitFor();
        await page.getByText("队列跟踪：" + expected, { exact: true }).waitFor();
        equal(await page.locator(".notice.amber").filter({ hasText: expected }).count(), 1);
        equal(await button("核验纸张结果").count(), 0); equal(await button("重试原任务").count(), 0);
        equal(await button("明确补打").count(), 1); equal(writes.length, before);
        if (state === "ATTENTION_REQUIRED") await screenshot("windows-queue-accepted-paperout.png");
        await navigate("detail/index?id=" + businessId); await page.getByText("队列跟踪：" + expected, { exact: true }).waitFor();
        equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
        equal(writes.length, before); equal(job.status, "COMPLETED");
      }
      job.status = "UNKNOWN"; job.autoVerification.state = "SPOOLER_REPORTED_PRINTED";
      await navigate("print/index?recordId=" + businessId); await text("结果待核验").waitFor();
      equal(await button("核验纸张结果").count(), 1); equal(await button("明确补打").count(), 0);
      equal(await text("已提交打印").count(), 0); equal(writes.length, before);
      await navigate("detail/index?id=" + businessId); await text("结果待核验").waitFor();
      await assertGenerateBlocked(); equal(writes.length, before);
    } finally { jobs.delete(jobId); labels.delete(businessId); records.delete(businessId); }
  });
  await testcase("旧列表待核验在打开前已自动提交完成时不出现确认弹窗", async () => {
    const businessId = "9007199254741196", jobId = "9007199254741596", before = writes.length;
    records.set(businessId, makeRecord(businessId));
    labels.set(businessId, { ...makeLabel("9007199254741396", "PC_80"), recordId: businessId });
    const job = makeJob(jobId, businessId, "SUBMITTED"); jobs.set(jobId, job);
    try {
      await navigate("print/index?recordId=" + businessId); await button("核验纸张结果").waitFor();
      job.status = "COMPLETED"; job.completionBasis = "WINDOWS_QUEUE_ACCEPTED";
      await button("核验纸张结果").click(); await text("已提交打印").waitFor();
      await text("任务状态已更新，当前无需人工核验").waitFor();
      equal(await page.locator(".modal-mask").count(), 0); equal(await button("核验纸张结果").count(), 0);
      equal(writes.length, before);
    } finally { jobs.delete(jobId); labels.delete(businessId); records.delete(businessId); }
  });
  // Subsequent cases advance only this isolated page's clock; no real production
  // polling, native printing, application mutation or existing browser is involved.
  await page.clock.install({ time: new Date("2026-10-30T04:00:00Z") });
  await testcase("停留详情自动同步待生成到就绪及电脑提交，仅轻量读取且不制造打印", async () => {
    const label = labels.get(recordId), job = latestJob(recordId), before = writes.length;
    label.status = "PENDING"; job.status = "WAITING_LABEL";
    await navigate("detail/index?id=" + recordId);
    await text("待生成").waitFor(); await text("等待标签生成").waitFor();
    const originalUrl = page.url(), baseline = recordReads();
    await assertGenerateBlocked();
    label.status = "RENDERING";
    await advance(3200); await text("生成中").waitFor();
    label.status = "READY"; job.status = "QUEUED";
    await advance(3200); await text("已就绪").waitFor(); await text("排队中").waitFor();
    await assertGenerateBlocked();
    job.status = "SUBMITTED";
    await advance(3200); await text("已提交，等待结果").waitFor();
    equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
    equal(page.url(), originalUrl); equal(recordReads(), baseline);
    equal(writes.length, before); equal(await text("已打印").count(), 0);
    await screenshot("detail-status-auto-ready.png");
  });
  await testcase("稳定状态采用低频读取并自动看到后台取消，不需要离开详情", async () => {
    const label = labels.get(recordId), job = latestJob(recordId), before = writes.length;
    label.status = "FAILED"; label.lastError = "隔离字体旧失败"; job.status = "WAITING_LABEL";
    await navigate("detail/index?id=" + recordId);
    await text("生成失败").waitFor(); await text("等待标签生成").waitFor();
    job.status = "CANCELLED";
    await advance(3200); await text("已取消").waitFor();
    equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
    const baseline = labelReads();
    await advance(9000); equal(labelReads(), baseline, "Stable state should not keep polling every 3 seconds");
    label.status = "READY"; delete label.lastError;
    await advance(6500); await text("已就绪").waitFor();
    equal(labelReads(), baseline + 1); equal(writes.length, before);
  });
  await testcase("轮询失败保留原状态并禁用操作，15秒与30秒退避后自动恢复", async () => {
    const label = labels.get(recordId), job = latestJob(recordId), before = writes.length;
    label.status = "READY"; job.status = "COMPLETED";
    await navigate("detail/index?id=" + recordId); await text("已就绪").waitFor();
    failLatestLabel = true;
    try {
      await advance(15200); await text("服务器暂时不可用").waitFor();
      await text("已就绪").waitFor(); await text("已完成").waitFor(); await assertGenerateBlocked();
      const baseline = labelReads();
      await advance(9000); equal(labelReads(), baseline, "First failure must back off beyond processing cadence");
      await advance(6500); equal(labelReads(), baseline + 1);
      const secondFailure = labelReads();
      await advance(16000); equal(labelReads(), secondFailure, "Repeated failure must use 30-second backoff");
      failLatestLabel = false;
      await advance(14500); await text("服务器暂时不可用").waitFor({ state: "hidden" });
      equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
      failJobs = true;
      await advance(15200); await page.getByText(/打印状态暂未读取成功/).waitFor();
      await text("已完成").waitFor(); await assertGenerateBlocked();
      failJobs = false;
      await advance(15200); await page.getByText(/打印状态暂未读取成功/).waitFor({ state: "hidden" });
      equal(await button("生成新版本并打印").evaluate(el => el.hasAttribute("disabled")), false);
      equal(writes.length, before);
    } finally { failLatestLabel = false; failJobs = false; }
  });
  await testcase("查看凭证隐藏详情时停止轮询，返回后继续自动更新", async () => {
    const label = labels.get(recordId), job = latestJob(recordId), before = writes.length;
    label.status = "PENDING"; job.status = "WAITING_LABEL";
    await navigate("detail/index?id=" + recordId); await text("待生成").waitFor();
    await button("查看凭证").click(); await page.waitForURL(/pages\/qr\/index/);
    await text("标签尚未就绪，请返回详情处理").waitFor();
    const labelCount = labelReads(), jobCount = jobReads();
    await advance(20000);
    equal(labelReads(), labelCount, "Hidden detail must not poll behind the voucher page");
    equal(jobReads(), jobCount);
    await page.goBack(); await page.waitForURL(/pages\/detail\/index/);
    await text("待生成").waitFor();
    label.status = "READY"; job.status = "SUBMITTED";
    await advance(3200); await text("已就绪").waitFor(); await text("已提交，等待结果").waitFor();
    equal(writes.length, before);
  });
  await testcase("浏览器页面隐藏停止读取，重新可见后恢复同步", async () => {
    const label = labels.get(recordId), job = latestJob(recordId);
    label.status = "PENDING"; job.status = "WAITING_LABEL";
    await navigate("detail/index?id=" + recordId); await text("待生成").waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const baseline = labelReads();
    await advance(20000); equal(labelReads(), baseline);
    label.status = "READY"; job.status = "COMPLETED";
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(3200); await text("已就绪").waitFor(); await text("已完成").waitFor();
  });
  await testcase("慢轮询不重叠，生成新版本后迟到的旧响应不能覆盖新状态", async () => {
    completeCurrentPrint();
    labels.get(recordId).status = "RENDERING";
    await navigate("detail/index?id=" + recordId); await text("生成中").waitFor();
    releaseLabel = undefined; holdNextLabel = true;
    await advance(3200); await waitForHeldLabel();
    const readCount = labelReads(), readJobs = jobReads(), before = writes.length;
    // Span two processing intervals but stay below the real request timeout.
    await advance(6200);
    equal(labelReads(), readCount, "Only one background read may be in flight"); equal(jobReads(), readJobs);
    await button("生成新版本并打印").click();
    await advance(100); await modalAccept(); await text("待生成").waitFor(); await text("等待标签生成").waitFor();
    equal(writes.length, before + 1);
    const newId = labels.get(recordId).id;
    const release = releaseLabel; releaseLabel = undefined; release();
    await page.waitForTimeout(200);
    equal(await text("生成中").count(), 0); await text("待生成").waitFor();
    await text("等待标签生成").waitFor(); await assertGenerateBlocked();
    equal(labels.get(recordId).id, newId); equal(writes.length, before + 1);
    labels.get(recordId).status = "READY"; latestJob(recordId).status = "SUBMITTED";
    await advance(3200); await text("已就绪").waitFor();
  });
  await testcase("宽屏切换批次后丢弃旧批次迟到响应，继续同步当前批次", async () => {
    const otherId = "9007199254741199";
    records.set(otherId, makeRecord(otherId));
    labels.set(otherId, { ...makeLabel("9007199254741399", "PC_80"), recordId: otherId, status: "PENDING" });
    jobs.set("9007199254741599", makeJob("9007199254741599", otherId, "WAITING_LABEL"));
    completeCurrentPrint();
    await page.setViewportSize({ width: 1280, height: 900 });
    try {
      await navigate("records/index");
      await page.locator(".record-detail").getByText("已就绪", { exact: true }).waitFor();
      releaseLabel = undefined; holdNextLabel = true;
      await advance(15200); await waitForHeldLabel();
      await page.locator(".record-card").filter({ hasText: "SYNTHETIC-" + otherId }).click();
      await page.locator(".record-detail").getByText("SYNTHETIC-" + otherId, { exact: true }).waitFor();
      await page.locator(".record-detail").getByText("待生成", { exact: true }).waitFor();
      const release = releaseLabel; releaseLabel = undefined; release();
      await page.waitForTimeout(200);
      equal(await page.locator(".record-detail").getByText("已就绪", { exact: true }).count(), 0);
      const oldReadCount = labelReads();
      labels.get(otherId).status = "READY"; latestJob(otherId).status = "SUBMITTED";
      await advance(3200);
      await page.locator(".record-detail").getByText("已就绪", { exact: true }).waitFor();
      equal(labelReads(), oldReadCount, "Unmounted previous batch must stop reading");
      equal(await page.locator(".record-detail").getByText("SYNTHETIC-" + otherId, { exact: true }).count(), 1);
      await screenshot("wide-current-batch-auto-refresh.png");
    } finally { await page.setViewportSize({ width: 390, height: 844 }); }
  });
  await testcase("首次打印在标签读取失败时禁用，保留已就绪展示并自动恢复", async () => {
    const firstPrintId = "9007199254741198", before = writes.length;
    records.set(firstPrintId, makeRecord(firstPrintId));
    labels.set(firstPrintId, { ...makeLabel("9007199254741398", "PC_80"), recordId: firstPrintId });
    await navigate("detail/index?id=" + firstPrintId);
    await page.getByText(/当前批次尚无打印任务，由后台分配执行电脑/).waitFor();
    equal(await button("提交后台首次打印").evaluate(el => el.hasAttribute("disabled")), false);
    failLatestLabel = true;
    try {
      await advance(15200); await text("服务器暂时不可用").waitFor();
      await text("已就绪").waitFor();
      equal(await button("提交后台首次打印").evaluate(el => el.hasAttribute("disabled")), true);
      await assertGenerateBlocked();
      failLatestLabel = false;
      await advance(15200); await text("服务器暂时不可用").waitFor({ state: "hidden" });
      equal(await button("提交后台首次打印").evaluate(el => el.hasAttribute("disabled")), false);
      equal(writes.length, before); equal(recordJobs(firstPrintId).length, 0);
    } finally { failLatestLabel = false; }
  });
  equal(forbidden, []); equal(pageErrors, []); report(true);
  console.log("SERVER PRINT UI PASS " + checks.length + " cases / " + assertions + " assertions");
})().catch(error => { report(false, error); console.error(error); process.exitCode = 1; }).finally(async () => {
  holdContext = false; releaseContext?.(); releaseLabel?.();
  if (browser) await browser.close();
  server.close();
});
