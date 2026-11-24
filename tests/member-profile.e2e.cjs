/** Isolated compiled UI; synthetic identities only, all backend traffic intercepted. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const runName = process.env.MEMBER_PROFILE_RUN || "member-profile";
const fixture = require("./helpers/build-isolated-h5.cjs")({
  publicKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey,
  fixtureName: `h5-${runName}-fixture`,
});
const output = path.resolve(__dirname, "../.test-artifacts", fixture.version, runName);
fs.mkdirSync(output, { recursive: true });
const factoryA = "9007199254740993", factoryB = "9007199254740994";
const operator = { id: "9007199254740801", userId: "9007199254740901", username: "single_operator", nickName: "隔离操作员", sex: "2", phoneNumber: "13800138000", email: "operator@example.test", roleNames: ["操作员"], capabilities: { work: true, manage: false }, protectedSuperAdmin: false, status: "0", version: 0, canEditProfile: true, canResetPassword: true, canChangeStatus: true };
const protectedMember = { ...operator, id: "9007199254740802", userId: "9007199254740902", username: "protected_manager", nickName: "受保护管理员", capabilities: { work: true, manage: true }, protectedSuperAdmin: true, canEditProfile: false, canResetPassword: false, canChangeStatus: false, accountEditReason: "管理员账号由平台管理员维护", statusEditReason: "只有超级管理员可以维护超级管理员的工厂授权" };
const sharedMember = { ...operator, id: "9007199254740803", userId: "9007199254740903", username: "shared_operator", nickName: "共用操作员", canEditProfile: false, canResetPassword: false, accountEditReason: "多工厂共用账号由平台管理员维护" };
const legacyMember = { ...operator, id: "9007199254740804", userId: "9007199254740904", username: "legacy_operator", nickName: "旧接口操作员", canEditProfile: undefined, canResetPassword: undefined, canChangeStatus: undefined };
const writes = [], forbidden = [], errors = [], checks = [];
let browser, context, page, origin, manager = true, superadmin = false, rejectProfile = false, loseResponse = false, assertions = 0;
const eq = (a, b) => { assertions++; assert.deepEqual(a, b); };
const ok = value => { assertions++; assert.ok(value); };
async function test(name, run) { const before = assertions; await run(); checks.push({ name, assertions: assertions - before }); console.log("PASS " + name); }
function file(url) { const target = path.resolve(fixture.base, "." + decodeURIComponent(url)); if (target !== fixture.base && !target.startsWith(fixture.base + path.sep)) return null; const resolved = target === fixture.base ? path.join(target, "index.html") : target; return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null; }
const server = http.createServer((req, res) => { const target = file(new URL(req.url, "http://127.0.0.1").pathname); if (req.method !== "GET" || !target) { forbidden.push(req.url); res.writeHead(404); res.end(); return; } res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] || "application/octet-stream"); res.end(fs.readFileSync(target)); });
const input = label => page.locator(`uni-input[aria-label="${label}"] input`);
const card = username => page.locator(".panel").filter({ has: page.getByText("账号 " + username, { exact: true }) });
// uni-input throttles model events by 100 ms; allow the final edit to settle before a separate tap.
const save = async () => { await page.waitForTimeout(150); await page.locator(".modal").getByText("确认保存", { exact: true }).click(); };
async function closeDirty() { await page.locator(".modal").getByText("取消", { exact: true }).click(); await page.locator("uni-modal").getByText("确定", { exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); }
async function openProfile() { await card("single_operator").getByText("编辑资料", { exact: true }).click(); await page.getByText("编辑操作员资料", { exact: true }).waitFor(); }
async function changeScope(factoryId) {
  await page.evaluate(factoryId => {
    const element = [...document.querySelectorAll("*")].find(item => item.__vueParentComponent?.appContext?.config?.globalProperties?.$pinia);
    const session = element?.__vueParentComponent.appContext.config.globalProperties.$pinia._s.get("session");
    if (!session) throw new Error("Isolated test could not locate mounted session store");
    session.selectFactory(factoryId);
  }, factoryId);
}
function report(passed, error) { fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed, checks, assertions, error: error && String(error.stack || error), forbidden, errors, submittedActions: writes.map(item => ({ path: item.path, factoryId: item.body.factoryId, fields: Object.keys(item.body).sort() })), realBackendRequests: 0, productionCredentialsRead: false }, null, 2) + "\n"); }
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", serviceWorkers: "block" }); context.setDefaultTimeout(10000);
  await context.addInitScript(identity => { localStorage.clear(); localStorage.setItem("dq.deploymentIdentity", identity); localStorage.setItem("dq.token", "synthetic-member-profile-token"); localStorage.setItem("dq.tenantId", "000000"); }, fixture.deploymentIdentity);
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET" && request.url() === "https://cdn.dcloud.net.cn/img/shadow-grey.png") return route.fulfill({ status: 204 });
    if (url.origin !== origin) { forbidden.push(request.url()); return route.abort(); }
    if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204 });
    if (request.method() === "GET" && file(url.pathname)) return route.continue();
    let data;
    if (request.method() === "GET" && url.pathname === "/inout/context") data = { tenantId: "000000", userId: "9007199254740995", username: "factory_manager", permissions: [superadmin ? "*:*:*" : manager ? "inout:manage" : "inout:work"], roleNames: [superadmin ? "超级管理员" : manager ? "工厂管理员" : "操作员"], capabilities: { work: true, manage: manager }, factories: [{ factoryId: factoryA, factoryName: "隔离甲厂", timezone: "Asia/Shanghai" }, { factoryId: factoryB, factoryName: "隔离乙厂", timezone: "Asia/Shanghai" }] };
    else if (request.method() === "GET" && url.pathname === "/inout/members") data = { rows: [operator, { ...protectedMember, canChangeStatus: superadmin, statusEditReason: superadmin ? "" : protectedMember.statusEditReason }, sharedMember, legacyMember], total: 4 };
    else if (request.method() === "GET" && url.pathname === "/inout/members/candidates") data = [protectedMember];
    else if (request.method() === "PUT" && /^\/inout\/members\/900719925474080[12]\/status$/.test(url.pathname)) {
      const target = url.pathname.includes(operator.id) ? operator : protectedMember;
      ok(target === operator || superadmin);
      const body = request.postDataJSON(); writes.push({ path: url.pathname, body });
      eq(body.factoryId, factoryA); eq(body.version, target.version);
      target.status = body.status; target.version++; data = null;
    }
    else if (request.method() === "PUT" && /^\/inout\/members\/9007199254740801\/(profile|password)$/.test(url.pathname)) {
      const body = request.postDataJSON(); writes.push({ path: url.pathname, body });
      eq(body.factoryId, factoryA); eq(body.version, operator.version);
      if (url.pathname.endsWith("/profile")) {
        eq(Object.keys(body).sort(), ["email", "factoryId", "nickName", "phoneNumber", "requestKey", "version"]);
        if (rejectProfile) { rejectProfile = false; return route.fulfill({ json: { code: 409, msg: "手机号已被使用", field: "phoneNumber", data: null } }); }
        Object.assign(operator, { nickName: body.nickName, phoneNumber: body.phoneNumber, email: body.email });
      } else eq(Object.keys(body).sort(), ["factoryId", "password", "requestKey", "version"]);
      operator.version++; data = null;
      if (loseResponse) { loseResponse = false; return route.abort("failed"); }
    } else { forbidden.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    return route.fulfill({ json: { code: 200, msg: "ok", data } });
  });
  page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/#/pages/members/index");
  await test("工厂管理权限可维护普通操作员；管理员、多厂、缺失授权均无编辑按钮", async () => {
    await card("single_operator").waitFor();
    eq(await page.getByText("编辑资料", { exact: true }).count(), 1); eq(await page.getByText("重设密码", { exact: true }).count(), 1);
    for (const username of ["protected_manager", "shared_operator", "legacy_operator"]) { eq(await card(username).getByText("编辑资料", { exact: true }).count(), 0); eq(await card(username).getByText("重设密码", { exact: true }).count(), 0); }
    await openProfile(); eq(await input("成员姓名").inputValue(), "隔离操作员"); eq(await input("成员手机号").inputValue(), "13800138000");
    eq(await page.locator(".modal uni-input").count(), 3);
    await page.locator(".modal").getByText("取消", { exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); eq(await page.locator("uni-modal").count(), 0);
  });
  await test("姓名手机号邮箱校验，保存只发送可编辑字段", async () => {
    await openProfile(); await input("成员手机号").fill("123"); await save(); await page.getByText("请填写有效的11位手机号，或留空", { exact: true }).waitFor(); eq(writes.length, 0);
    await input("成员手机号").fill("13900139000"); await input("成员邮箱").fill("bad-email"); await save(); await page.getByText("请填写有效邮箱（不超过50字），或留空", { exact: true }).waitFor(); eq(writes.length, 0);
    await input("成员姓名").fill("新操作员"); await input("成员邮箱").fill("updated@example.test"); await save(); await page.locator(".modal").waitFor({ state: "detached" });
    eq(operator.nickName, "新操作员"); eq(operator.phoneNumber, "13900139000"); eq(operator.email, "updated@example.test");
  });
  await test("手机号和邮箱可显式清空；服务端拒绝保留编辑输入", async () => {
    await openProfile(); await input("成员手机号").fill(""); await input("成员邮箱").fill(""); await save(); await page.locator(".modal").waitFor({ state: "detached" }); eq(operator.phoneNumber, ""); eq(operator.email, "");
    await openProfile(); await input("成员手机号").fill("13700137000"); rejectProfile = true; await save(); await page.getByText("手机号已被使用", { exact: true }).waitFor(); eq(await input("成员手机号").inputValue(), "13700137000"); await closeDirty();
  });
  await test("资料响应丢失只读核对，禁止重复提交", async () => {
    await openProfile(); await input("成员姓名").fill("已提交待核对"); loseResponse = true; await save(); await page.locator(".modal .error-text").filter({ hasText: "结果待确认" }).waitFor();
    const count = writes.length; ok(await page.locator(".modal").getByText("确认保存", { exact: true }).getAttribute("disabled") !== null);
    await page.locator(".modal").getByText("确认保存", { exact: true }).click({ force: true }); eq(writes.length, count);
    await page.getByText("重新读取资料", { exact: true }).click(); await page.locator(".profile-readback").getByText("姓名：已提交待核对", { exact: true }).waitFor(); eq(writes.length, count); await closeDirty();
  });
  await test("重设密码独立确认，无全局用户权限也可操作授权目标，密码不持久化", async () => {
    await card("single_operator").getByText("重设密码", { exact: true }).click(); await input("成员密码").fill("synthetic-new-password"); await save();
    const before = writes.length; await page.locator("uni-modal").getByText("取消", { exact: true }).click(); eq(writes.length, before);
    await save(); await page.locator("uni-modal").getByText("确定", { exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" });
    eq(writes.at(-1).body.password, "synthetic-new-password"); ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("synthetic-new-password"));
  });
  await test("密码响应丢失不根据列表假定成功，也不能直接重发", async () => {
    await card("single_operator").getByText("重设密码", { exact: true }).click(); await input("成员密码").fill("synthetic-unknown-password"); loseResponse = true; await save();
    await page.locator("uni-modal").getByText("确定", { exact: true }).click(); await page.locator(".modal .error-text").filter({ hasText: "人员列表不能证明密码是否已更改" }).waitFor();
    const before = writes.length; await page.locator(".modal").getByText("确认保存", { exact: true }).click({ force: true }); eq(writes.length, before); eq(await page.getByText("重新读取资料", { exact: true }).count(), 0);
    ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("synthetic-unknown-password")); await closeDirty(); eq(writes.length, before);
  });
  await test("确认期间切换工厂关闭旧表单，不把旧账号写入新工厂", async () => {
    await card("single_operator").getByText("重设密码", { exact: true }).click(); await input("成员密码").fill("synthetic-other-password"); await save();
    const before = writes.length; await changeScope(factoryB); await page.locator("uni-modal").getByText("确定", { exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); eq(writes.length, before);
    await changeScope(factoryA); await openProfile(); await input("成员姓名").fill("不能跨厂提交"); await changeScope(factoryB); await page.locator(".modal").waitFor({ state: "detached" }); eq(writes.length, before);
  });
  await test("工厂管理员不能启停或绑定超级管理员，旧接口缺少启停能力时拒绝", async () => {
    await changeScope(factoryA); await page.reload(); await card("single_operator").waitFor();
    eq(await card("protected_manager").getByText("停用", { exact: true }).count(), 0);
    eq(await card("legacy_operator").getByText("停用", { exact: true }).count(), 0);
    await card("protected_manager").getByText(protectedMember.statusEditReason, { exact: true }).waitFor();
    await page.getByText("授权成员", { exact: true }).click();
    await page.locator(".modal uni-input input").fill("protected_manager");
    await page.waitForTimeout(150); await page.getByText("按完整账号查询", { exact: true }).click();
    const candidate = page.locator(".modal .record-card"); await candidate.waitFor();
    ok(await candidate.getAttribute("disabled") !== null);
    await candidate.click({ force: true }); eq(await page.locator(".modal").getByText("已选择", { exact: true }).count(), 0);
    const before = writes.length; await save(); eq(writes.length, before); await closeDirty();
    await card("single_operator").getByText("停用", { exact: true }).click(); await page.locator("uni-modal").getByText("确定", { exact: true }).click();
    await card("single_operator").getByText("启用", { exact: true }).waitFor(); eq(operator.status, "1");
    await card("single_operator").getByText("启用", { exact: true }).click(); await page.locator("uni-modal").getByText("确定", { exact: true }).click();
    await card("single_operator").getByText("停用", { exact: true }).waitFor(); eq(operator.status, "0");
  });
  await test("真实超级管理员可按服务端能力维护超级管理员启停", async () => {
    superadmin = true; await page.reload(); await card("protected_manager").getByText("停用", { exact: true }).click();
    await page.locator("uni-modal").getByText("确定", { exact: true }).click(); await card("protected_manager").getByText("启用", { exact: true }).waitFor(); eq(protectedMember.status, "1");
    await card("protected_manager").getByText("启用", { exact: true }).click(); await page.locator("uni-modal").getByText("确定", { exact: true }).click();
    await card("protected_manager").getByText("停用", { exact: true }).waitFor(); eq(protectedMember.status, "0");
    superadmin = false; await page.reload(); await card("protected_manager").waitFor(); eq(await card("protected_manager").getByText("停用", { exact: true }).count(), 0);
  });
  await test("普通操作员直接访问人员页面被拒绝", async () => {
    manager = false; await page.reload(); await page.getByText("当前角色无权维护工厂成员", { exact: true }).waitFor(); eq(await page.getByText("编辑资料", { exact: true }).count(), 0); eq(await page.getByText("重设密码", { exact: true }).count(), 0);
  });
  manager = true; await page.reload(); await card("single_operator").waitFor(); await openProfile(); await page.screenshot({ path: path.join(output, "profile-editor.png"), fullPage: true });
  eq(forbidden, []); eq(errors, []); report(true); console.log(`MEMBER PROFILE UI PASS ${checks.length} cases / ${assertions} assertions`);
})().catch(async error => { if (page) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(await page.locator(".modal").innerText().catch(() => "No modal")); } report(false, error); console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
