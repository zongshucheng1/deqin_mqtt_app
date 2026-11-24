/* Deployment/login UI acceptance with generated in-memory RSA and strict network fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const {
  chromium,
} = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { decryptServerEnvelope } = require("./helpers/server-envelope.cjs");
const pair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const fixture = require("./helpers/build-isolated-h5.cjs")({
  publicKey: pair.publicKey,
  fixtureName: "h5-login-captcha-recovery-20261025",
});
const out = path.resolve(__dirname, "../.test-artifacts", fixture.version, "login-captcha-recovery-20261025");
fs.mkdirSync(out, { recursive: true });
const reportPath = path.join(out, "login-deployment-report.json");
const checks = [],
  forbidden = [],
  unknown = [],
  errors = [],
  loginBodies = [];
let assertions = 0,
  activeCase = "",
  serial = 0,
  authMode = "reject",
  contextFail = false;
let tenantsMode = "multi",
  captchaMode = "enabled",
  captchaSerial = 0,
  tenantReads = 0,
  loginRequests = 0;
let browser, context, page, origin;
const companies = [
  { tenantId: "000000", companyName: "隔离客户甲" },
  { tenantId: "000001", companyName: "隔离客户乙" },
];
function eq(a, b, label) {
  assertions++;
  assert.deepEqual(a, b, label);
}
function ok(value, label) {
  assertions++;
  assert.ok(value, label);
}
async function test(name, run) {
  activeCase = name;
  const before = assertions;
  await run();
  checks.push({ name, passed: true, assertions: assertions - before });
  process.stdout.write(`PASS ${checks.length}: ${name}\n`);
}
function staticFile(urlPath) {
  const file = path.resolve(fixture.base, "." + decodeURIComponent(urlPath));
  const resolved = file === fixture.base ? path.join(file, "index.html") : file;
  return resolved.startsWith(fixture.base + path.sep) &&
    fs.existsSync(resolved) &&
    fs.statSync(resolved).isFile()
    ? resolved
    : null;
}
const server = http.createServer((req, res) => {
  const name = staticFile(new URL(req.url, "http://127.0.0.1").pathname);
  if (!name || req.method !== "GET") {
    unknown.push(req.url);
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type":
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[path.extname(name)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(name));
});
const input = (label) => page.locator(`uni-input[aria-label="${label}"] input`);
async function fresh(mode = "multi") {
  tenantsMode = mode;
  await page.goto(origin + "/?isolatedLogin=" + ++serial + "#/");
  await page.getByText("MOM生成运行管理系统", { exact: true }).waitFor();
  if (mode === "multi") await page.locator(".enterprise-field").waitFor();
  if (mode === "single") await page.locator(".enterprise-name").waitFor();
}
async function fill() {
  await input("登录账号").fill("synthetic_operator");
  await input("登录密码").fill("synthetic_password");
  await input("验证码").fill("test-only");
}
async function chooseCompany(name) {
  await page.locator(".enterprise-field uni-picker").click();
  await page
    .locator(".uni-picker-content .uni-picker-item")
    .filter({ hasText: new RegExp("^" + name + "$") })
    .last()
    .click();
  await page.locator(".uni-picker-action-confirm").last().click();
}
const submit = () => page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).click();
function report(passed, error) {
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        passed,
        versionName: fixture.version,
        scenarios: checks.length,
        actualAssertions: assertions,
        checks,
        currentCase: activeCase,
        error: error && String(error.stack || error),
        forbiddenWrites: forbidden,
        unknownRequests: unknown,
        pageErrors: errors,
        encryptedLogins: loginRequests,
        tenantReads,
        submittedTenantIds: loginBodies.map((x) => x.tenantId),
        buildFixture: fixture.output,
        screenshots: [
          "login-deployment-multi.png",
          "login-deployment-single.png",
          "login-deployment-tenant-error.png",
          "login-deployment-mine.png",
        ],
        scope:
          "Isolated compiled H5 fixtures only; generated RSA private key remains exclusively in this process; no real sessions or credentials read.",
      },
      null,
      2,
    ) + "\n",
  );
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    serviceWorkers: "block",
  });
  context.setDefaultTimeout(10000);
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("dq.server", "http://obsolete.invalid");
    localStorage.setItem("dq.clientId", "obsolete-client");
    localStorage.setItem("dq.publicKey", "invalid-old-public");
    localStorage.setItem("dq.tenantId", "000000");
    localStorage.setItem("dq.token", "obsolete-session");
  });
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      pathname = url.pathname;
    if (
      req.url() === "https://cdn.dcloud.net.cn/img/shadow-grey.png" &&
      req.method() === "GET"
    )
      return route.fulfill({ status: 204 });
    if (url.origin !== origin) {
      unknown.push(req.url());
      return route.abort("blockedbyclient");
    }
    if (pathname === "/favicon.ico") return route.fulfill({ status: 204 });
    if (!pathname.startsWith("/auth/") && !pathname.startsWith("/inout/")) {
      if (req.method() === "GET" && staticFile(pathname))
        return route.continue();
      unknown.push(pathname);
      return route.abort("blockedbyclient");
    }
    if (req.headers().clientid !== fixture.clientId) {
      errors.push("preset client header mismatch");
      return route.abort("blockedbyclient");
    }
    let data;
    if (pathname === "/auth/login" && req.method() === "POST") {
      loginRequests++;
      ok(!!req.headers()["encrypt-key"], "RSA envelope header");
      ok(
        !req.postData().includes("synthetic_password"),
        "password must not be plaintext",
      );
      const body = JSON.parse(
        decryptServerEnvelope(
          req.postData(),
          req.headers()["encrypt-key"],
          pair.privateKey,
        ),
      );
      eq(body.clientId, fixture.clientId);
      eq(body.username, "synthetic_operator");
      eq(body.password, "synthetic_password");
      loginBodies.push({ tenantId: body.tenantId });
      if (authMode === "captcha-expired")
        return route.fulfill({ json: { code: 400, msg: "验证码已失效", data: null } });
      if (authMode === "reject")
        return route.fulfill({
          status: 401,
          json: { code: 401, msg: "isolated rejection" },
        });
      data = {
        access_token: "synthetic-session-never-valid-on-server",
        expire_in: 1800,
      };
    } else if (req.method() !== "GET") {
      forbidden.push({ method: req.method(), pathname });
      return route.abort("blockedbyclient");
    } else if (pathname === "/auth/tenant/list") {
      tenantReads++;
      if (tenantsMode === "failure")
        return route.fulfill({
          status: 503,
          json: { code: 503, msg: "isolated tenant failure" },
        });
      data =
        tenantsMode === "malformed"
          ? {
              tenantEnabled: true,
              voList: [{ tenantId: 123, companyName: "错误身份" }],
            }
          : tenantsMode === "disabled"
            ? { tenantEnabled: false, voList: [] }
            : {
                tenantEnabled: true,
                voList:
                  tenantsMode === "single"
                    ? [{ tenantId: "000123", companyName: "唯一隔离企业" }]
                    : tenantsMode === "empty"
                      ? []
                      : companies,
              };
    } else if (pathname === "/auth/code") {
      if (captchaMode === "failure") return route.abort("connectionrefused");
      data = {
        captchaEnabled: true,
        uuid: "synthetic-captcha-" + ++captchaSerial,
        img: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGf8AAAAASUVORK5CYII=",
      };
      if (captchaMode === "disabled") data = { captchaEnabled: false };
      if (captchaMode === "malformed") data = {};
      if (captchaMode === "missing-image") delete data.img;
    }
    else if (pathname === "/inout/context") {
      if (contextFail) {
        contextFail = false;
        return route.fulfill({
          status: 503,
          json: { code: 503, msg: "isolated context failure" },
        });
      }
      data = {
        tenantId: loginBodies.at(-1)?.tenantId || "000001",
        userId: "9007199254740995",
        username: "synthetic_operator",
        permissions: ["inout:work"],
        roleNames: ["隔离操作员"],
        capabilities: { work: true, manage: false },
        factories: [
          {
            factoryId: "9007199254740993",
            factoryName: "隔离工厂",
            timezone: "Asia/Shanghai",
          },
        ],
      };
    } else if (pathname === "/inout/records") data = { rows: [], total: 0 };
    else if (pathname === "/inout/statistics")
      data = {
        warehouses: [
          "RAW_WOOD",
          "PEELING",
          "DRYING",
          "WOOD_CORE",
          "WHITE_BARK",
        ].map((warehouseType, i) => ({
          warehouseType,
          unit: i === 4 ? "吨" : i === 0 || i === 3 ? "根" : "张",
          currentQuantity: "0",
          currentBatches: 0,
          inboundQuantity: "0",
          inboundBatches: 0,
          outboundQuantity: "0",
          outboundBatches: 0,
          sources: [],
          daily: [],
        })),
      };
    else {
      unknown.push(pathname);
      return route.fulfill({
        status: 404,
        json: { code: 404, msg: "undeclared isolated API" },
      });
    }
    return route.fulfill({ json: { code: 200, data, msg: "ok" } });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await test("USB连接中断后企业与验证码都失败，禁止无验证码登录", async () => {
    captchaMode = "failure";
    await fresh("failure");
    await page.getByText("重新加载验证码", { exact: true }).waitFor();
    await input("登录账号").fill("synthetic_operator");
    await input("登录密码").fill("synthetic_password");
    eq(await input("验证码").count(), 0);
    eq(await page.locator(".login > uni-button.primary").getAttribute("disabled"), "true");
    eq(loginRequests, 0);
  });
  await test("连接恢复后重新加载企业同时恢复验证码并保留账号密码", async () => {
    tenantsMode = "multi";
    captchaMode = "enabled";
    const before = captchaSerial;
    await page.getByText("重新加载企业", { exact: true }).click();
    await input("验证码").waitFor();
    await page.locator(".enterprise-field").waitFor();
    ok(captchaSerial > before);
    eq(await input("验证码").inputValue(), "");
    eq(await input("登录密码").inputValue(), "synthetic_password");
    eq(await page.getByText("重新加载验证码", { exact: true }).count(), 0);
    eq(loginRequests, 0);
  });
  for (const mode of ["failure", "malformed", "missing-image"])
    await test(`验证码${mode}不视为关闭验证码，单独重试后恢复`, async () => {
      captchaMode = mode;
      await fresh("single");
      await page.getByText("重新加载验证码", { exact: true }).waitFor();
      eq(await page.locator(".login > uni-button.primary").getAttribute("disabled"), "true");
      eq(await input("验证码").count(), 0);
      eq(loginRequests, 0);
      captchaMode = "enabled";
      await page.getByText("重新加载验证码", { exact: true }).click();
      await input("验证码").waitFor();
      eq(await page.locator(".login > uni-button.primary").getAttribute("disabled"), null);
    });
  await test("明确关闭验证码时不显示输入框且允许登录", async () => {
    captchaMode = "disabled";
    await fresh("single");
    await page.waitForFunction(() => !document.querySelector('.login > uni-button.primary')?.hasAttribute('disabled'));
    eq(await input("验证码").count(), 0);
    eq(await page.getByText("重新加载验证码", { exact: true }).count(), 0);
    eq(loginRequests, 0);
    captchaMode = "enabled";
  });
  await test("普通登录仅账号密码验证码与企业名称，没有服务器客户端公钥技术设置", async () => {
    await fresh();
    eq(await page.getByText("连接设置", { exact: true }).count(), 0);
    eq(await page.getByText("服务器连接设置", { exact: true }).count(), 0);
    eq(await page.locator("uni-input").count(), 3);
    eq(await page.locator("textarea").count(), 0);
    eq(
      await page.locator(".enterprise-field .picker-value").innerText(),
      "请选择企业",
    );
    await page.screenshot({
      path: path.join(out, "login-deployment-multi.png"),
      fullPage: true,
    });
  });
  await test("未选择企业不默认000000且不发送认证，保留已输入账号密码", async () => {
    await fill();
    await submit();
    await page.getByText("请选择所属企业", { exact: true }).waitFor();
    eq(loginRequests, 0);
    eq(await input("登录密码").inputValue(), "synthetic_password");
  });
  await test("企业按公开名称选择，密文认证发送所选000001而非默认000000", async () => {
    await chooseCompany("隔离客户乙");
    await submit();
    await page
      .getByText("登录请求未获授权，请核对账号或联系管理员", { exact: true })
      .waitFor();
    eq(loginBodies.at(-1).tenantId, "000001");
    eq(await input("登录账号").inputValue(), "synthetic_operator");
    eq(await input("登录密码").inputValue(), "synthetic_password");
  });
  await test("刷新验证码只更新验证码，不丢账号密码或企业选择", async () => {
    await input("验证码").fill("old-code");
    const before = captchaSerial;
    await page.locator(".captcha-image").click();
    await page.waitForFunction(
      () =>
        document.querySelector('uni-input[aria-label="验证码"] input')
          ?.value === "",
    );
    ok(captchaSerial > before);
    eq(await input("登录密码").inputValue(), "synthetic_password");
    ok(
      (
        await page.locator(".enterprise-field .picker-value").innerText()
      ).includes("隔离客户乙"),
    );
  });
  await test("已有验证码刷新失败后清除旧输入并禁止登录，重试保留账号密码", async () => {
    const before = loginRequests;
    await input("验证码").fill("old-code");
    captchaMode = "failure";
    await page.locator(".captcha-image").click();
    await page.getByText("重新加载验证码", { exact: true }).waitFor();
    eq(await input("验证码").count(), 0);
    eq(await page.locator(".login > uni-button.primary").getAttribute("disabled"), "true");
    eq(loginRequests, before);
    captchaMode = "enabled";
    await page.getByText("重新加载验证码", { exact: true }).click();
    await input("验证码").waitFor();
    eq(await input("验证码").inputValue(), "");
    eq(await input("登录密码").inputValue(), "synthetic_password");
  });
  await test("后端提示验证码过期时换新验证码，保留账号密码且不自动重发登录", async () => {
    authMode = "captcha-expired";
    const before = loginRequests, previousCaptcha = captchaSerial;
    await input("验证码").fill("expired-test-code");
    await submit();
    await page.getByText("验证码已失效", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('uni-input[aria-label="验证码"] input')?.value === "");
    eq(loginRequests, before + 1);
    ok(captchaSerial > previousCaptcha);
    eq(await input("登录账号").inputValue(), "synthetic_operator");
    eq(await input("登录密码").inputValue(), "synthetic_password");
    await submit();
    await page.getByText("请输入验证码", { exact: true }).waitFor();
    eq(loginRequests, before + 1);
    authMode = "reject";
  });
  await test("认证后权限读取暂时失败保留原输入，可重新登录", async () => {
    authMode = "success";
    contextFail = true;
    await input("验证码").fill("test-only");
    await submit();
    await page.getByText("服务器暂时不可用", { exact: true }).waitFor();
    eq(await input("登录密码").inputValue(), "synthetic_password");
    eq(loginBodies.at(-1).tenantId, "000001");
  });
  await test("重试采用所选企业及既有统一角色契约进入工作台", async () => {
    await page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).waitFor();
    await input("验证码").fill("test-only");
    await submit();
    await page
      .locator(".factory-picker")
      .filter({ hasText: "隔离工厂" })
      .waitFor();
    eq(loginBodies.at(-1).tenantId, "000001");
    ok(page.url().includes("/pages/home/index"));
  });
  await test("我的页面无服务器设置入口，保留角色并隐藏空的待确认区域", async () => {
    await page
      .locator(".bottom-nav uni-button")
      .filter({ hasText: /^我的$/ })
      .click();
    await page.getByText("退出登录", { exact: true }).waitFor();
    eq(await page.getByText("待确认操作", { exact: true }).count(), 0);
    eq(await page.getByText("暂无结果待确认的写入请求", { exact: true }).count(), 0);
    eq(await page.getByText("连接设置", { exact: true }).count(), 0);
    eq(await page.getByText("隔离操作员", { exact: true }).count(), 1);
    ok((await page.locator(".app-version").innerText()).includes(fixture.version));
    await page.screenshot({
      path: path.join(out, "login-deployment-mine.png"),
      fullPage: true,
    });
  });
  await test("单企业自动采用平台唯一身份并显示名称，无技术数字输入", async () => {
    await fresh("single");
    eq(await page.locator(".enterprise-name").innerText(), "唯一隔离企业");
    eq(await page.locator(".enterprise-field").count(), 0);
    await page.screenshot({
      path: path.join(out, "login-deployment-single.png"),
      fullPage: true,
    });
  });
  await test("单企业登录使用真实000123，不静默改为000000", async () => {
    await fill();
    await submit();
    await page
      .locator(".factory-picker")
      .filter({ hasText: "隔离工厂" })
      .waitFor();
    eq(loginBodies.at(-1).tenantId, "000123");
  });
  await test("企业发现失败明确报错并禁止登录，不回退旧storage租户", async () => {
    await fresh("failure");
    await page
      .locator(".error-box")
      .filter({ hasText: "服务器暂时不可用" })
      .waitFor();
    await fill();
    const before = loginRequests;
    eq(
      await page
        .locator(".login > uni-button.primary")
        .getAttribute("disabled"),
      "true",
    );
    eq(loginRequests, before);
    eq(await page.locator(".enterprise-field").count(), 0);
    await page.screenshot({
      path: path.join(out, "login-deployment-tenant-error.png"),
      fullPage: true,
    });
  });
  await test("企业发现重试保留账号密码，恢复多企业后仍需明确选择", async () => {
    tenantsMode = "multi";
    await page.getByText("重新加载企业", { exact: true }).click();
    await page.locator(".enterprise-field").waitFor();
    eq(await input("登录密码").inputValue(), "synthetic_password");
    eq(
      await page.locator(".enterprise-field .picker-value").innerText(),
      "请选择企业",
    );
  });
  for (const mode of ["malformed", "disabled", "empty"])
    await test(`企业发现${mode}响应不生成默认企业`, async () => {
      await fresh(mode);
      await page.getByText("重新加载企业", { exact: true }).waitFor();
      eq(await page.locator(".enterprise-field").count(), 0);
      eq(await page.locator(".enterprise-name").count(), 0);
      eq(
        await page
          .locator(".login > uni-button.primary")
          .getAttribute("disabled"),
        "true",
      );
    });
  await test("旧技术storage和旧会话均已清除，不能覆盖预置配置", async () => {
    const values = await page.evaluate(() =>
      [
        "dq.server",
        "dq.clientId",
        "dq.publicKey",
        "dq.tenantId",
        "dq.token",
      ].map((key) => localStorage.getItem(key)),
    );
    eq(values, [null, null, null, null, null]);
    eq(errors, []);
  });
  await test("320和390常见小屏企业名称布局无横向溢出", async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await fresh();
      const dimensions = await page.evaluate(() => [
        innerWidth,
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ]);
      ok(
        dimensions[1] <= width + 1 && dimensions[2] <= width + 1,
        JSON.stringify(dimensions),
      );
    }
  });
  await test("测试只使用声明夹具，没有真实业务写入、未知请求或页面异常", async () => {
    eq(forbidden, []);
    eq(unknown, []);
    eq(errors, []);
    ok(loginRequests >= 4);
  });
  report(true);
  console.log(
    JSON.stringify({
      passed: true,
      scenarios: checks.length,
      actualAssertions: assertions,
      reportPath,
    }),
  );
})()
  .catch(async (error) => {
    if (page)
      await page
        .screenshot({
          path: path.join(out, "login-deployment-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    report(false, error);
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  });
