/** Runs compiled H5 UI with intercepted, explicitly isolated test fixtures. Never talks to production. */
const { generateKeyPairSync } = require("node:crypto");
const { decryptServerEnvelope } = require("./helpers/server-envelope.cjs");
const loginKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
let encryptedLogins = 0;
let rejectLogin = false,
  failContextOnce = false;
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const {
  chromium,
} = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const appVersion = require("../src/manifest.json").versionName;
const intlMode = process.env.DEQIN_TEST_INTL_MODE || "normal";
assert.ok(["normal", "no-intl", "no-parts"].includes(intlMode));
const fixtureTimezone = process.env.DEQIN_TEST_FACTORY_TIMEZONE || "Asia/Shanghai";
const fixedNow = process.env.DEQIN_TEST_FIXED_NOW ? Number(process.env.DEQIN_TEST_FIXED_NOW) : undefined;
const expectedFactoryDate = process.env.DEQIN_TEST_EXPECTED_DATE || "";
let firstHomeStatistics = true;
const fixture = require("./helpers/build-isolated-h5.cjs")({ publicKey: loginKey.publicKey, fixtureName: "h5-business-fixture" + (intlMode === "normal" ? "" : "-" + intlMode) });
const base = fixture.base,
  out = path.resolve(__dirname, "../.test-artifacts", appVersion, ...(intlMode === "normal" ? [] : ["timezone-" + intlMode]));
fs.mkdirSync(out, { recursive: true });
const types = ["RAW_WOOD", "PEELING", "DRYING", "WOOD_CORE", "WHITE_BARK"],
  units = ["根", "张", "张", "根", "吨"];
let created = [],
  roleManage = true,
  roleNames = ["仓库主管"],
  activeFactory = "9007199254740993",
  loseMemberResponse = false,
  nextMemberId = 9007199254740804n,
  roleUiChecks = [],
  platformPermissions = [
    "inout:record:delete",
    "inout:print:reprint",
    "system:user:add",
    "system:user:resetPwd",
  ],
  commandReviews = 0,
  loseCommandReviewResponse = true,
  rejectBusinessField = "",
  showFailedPrint = false,
  rejectPrinterOnce = false,
  losePrinterResponse = false,
  malformedCreateOnce = false,
  retryPrintCount = 0,
  serverReads = [],
  volumePreviews = [],
  writes = [],
  verifyCount = 0,
  reprintCount = 0,
  activeBrowser,
  activePage;
const platformRoles = [
  { roleId: "1952400000000000201", roleName: "仓库主管", roleKey: "inout_factory_admin" },
  { roleId: "1952400000000000202", roleName: "质检作业员", roleKey: "custom_quality" },
];
const candidate = { userId: "9007199254740901", username: "bind_account", nickName: "已有平台人员",
  roleNames: ["质检作业员"], capabilities: { work: true, manage: false }, protectedSuperAdmin: false };
let members = [
  { id: "9007199254740801", userId: "9007199254740902", username: "regular_fixture", nickName: "普通成员",
    roleNames: ["质检作业员"], capabilities: { work: true, manage: false }, protectedSuperAdmin: false, status: "0", version: 0, phoneNumber: "", email: "", canEditProfile: true, canResetPassword: true },
  { id: "9007199254740802", userId: "9007199254740903", username: "root_fixture", nickName: "受保护平台账号",
    roleNames: ["平台超级管理员"], capabilities: { work: true, manage: true }, protectedSuperAdmin: true, status: "0", version: 0, canEditProfile: false, canResetPassword: false, accountEditReason: "管理员账号由平台管理员维护" },
];
const sample = (kind = "RAW_WOOD", id = "9223372036854775806") => ({
  id,
  factoryId: "9007199254740993",
  warehouseType: kind,
  recordNo: kind + "-E2E",
  recordDate: "2026-10-23",
  quantity: kind === "WHITE_BARK" ? "2.450" : "600.000",
  stockStatus: "IN_STOCK",
  quantitySource: "APP_INPUT",
  version: 0,
  inboundAtMs: "1792713600000",
  codingMode: "NONE",
  detail:
    kind === "RAW_WOOD"
      ? {
          lengthMm: "2600.000",
          volumeM3: "17.643184",
          woodSpecification: "2.6m",
          woodGrade: "A",
          supplierName: "测试供应商",
          vehiclePlateNo: "鲁A12345",
          woodPercentage: "8",
          largeDiameterRatioPct: "20",
          diameter14RatioPct: "30",
          storageArea: "A区",
          unitPrice: "1.00",
          totalPrice: "600.00",
          tally12cmCount: "600",
        }
      : { machineNumber: "01号机" },
});
const unknownJob = {
  id: "9223372036854775700",
  recordId: "9223372036854775806",
  labelId: "9223372036854775600",
  printerId: "9223372036854775500",
  warehouseType: "RAW_WOOD",
  recordNo: "RAW_WOOD-E2E",
  status: "UNKNOWN",
  copies: 1,
  version: 0,
  jobKind: "INITIAL",
  labelRevision: 3,
  paperCode: "A4",
  paperWidthMm: "210.000",
  paperHeightMm: "297.000",
  printerName: "隔离测试打印机",
  createTime: "2026-10-23 10:30:00",
};
const machineRecord = {
  ...sample("DRYING", "9223372036854775200"),
  recordNo: "DRYING-MACHINE-E2E",
  quantitySource: "MANUAL_CODE",
  codingMode: "MANUAL",
  sourceEventId: "9223372036854775201",
  deviceOccurredAtMs: "1792713599000",
  sourceTrace: {
    deviceId: "55",
    deviceName: "隔离烘干设备",
    sourceTopic: "isolated/drying/01",
    sourceEventKey: "synthetic-edge-007",
    receivedAtMs: "1792713600000",
    ruleId: "22",
    ruleRevision: 3,
    eventType: "MANUAL_CODE",
    triggerField: "offon",
    quantityField: "qty",
    quantityDivisor: "10.000",
  },
  detail: {
    customerName: null,
    customerCode: "CUSTOMER-007",
    batchNo: "DEVICE-BATCH-009",
    machineNumber: "01号",
    lengthMm: "1270.000",
    widthMm: "840.000",
    thicknessMm: "1.800",
    qualityRatioPct: null,
    grade: "A",
    boardInStatus: "S",
    team: null,
  },
};
let physicalPrinter = {
  id: "9223372036854775500",
  printerName: "隔离测试打印机",
  endpointUri: "ipp://192.168.8.50:631/ipp/print",
  protocol: "IPP",
  version: 1,
  enabled: 0,
};
const requestResults = new Map();
const storedPrintConfigs = new Map();
const unknownCommand = {
  commandId: "9223372036854775400",
  ruleId: "22",
  eventId: "33",
  eventKey: "isolated-command-evidence",
  recordId: "44",
  commandType: "RESET_SD",
  status: "UNKNOWN",
  expectedSourceEpoch: "2",
  expectedEdgeGeneration: "9",
  expiresAtMs: "1792714600000",
  attemptCount: 1,
  lastError: "设备回报未确认",
  version: 0,
  operations: [],
};
const failedPrint = {
  ...unknownJob,
  id: "9223372036854775300",
  status: "FAILED",
  lastError: "历史纸张准备失败",
  attempts: [
    {
      id: "9223372036854775301",
      attemptNo: 1,
      status: "FAILED",
      sendPhase: "BEFORE_SEND",
      startedAtMs: "1792713600000",
      finishedAtMs: "1792713601000",
      errorCode: "FILE_DOWNLOAD_FAILED",
      errorMessage: "历史下载失败证据保留",
    },
  ],
  operations: [],
};
const server = http.createServer((req, res) => {
  let filename = path.resolve(
    base,
    "." + decodeURIComponent((req.url || "/").split("?")[0]),
  );
  if (!filename.startsWith(base + path.sep) && filename !== base) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (filename === base || filename.endsWith(path.sep))
    filename = path.join(filename, "index.html");
  if (!fs.existsSync(filename)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filename);
  res.setHeader(
    "Content-Type",
    {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream",
  );
  res.end(fs.readFileSync(filename));
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(({ mode, now }) => {
    if (mode === "no-intl") Object.defineProperty(globalThis, "Intl", { value: undefined, configurable: true, writable: true });
    else if (mode === "no-parts") delete Intl.DateTimeFormat.prototype.formatToParts;
    if (Number.isSafeInteger(now)) {
      const OriginalDate = Date;
      function FixedDate(...args) { return new.target ? new OriginalDate(...(args.length ? args : [now])) : new OriginalDate(now).toString(); }
      FixedDate.prototype = OriginalDate.prototype;
      Object.setPrototypeOf(FixedDate, OriginalDate);
      FixedDate.now = () => now;
      globalThis.Date = FixedDate;
    }
  }, { mode: intlMode, now: fixedNow });
  const errors = [];
  await context.route("**/auth/**", (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname === "/auth/login") {
      assert.ok(req.headers()["encrypt-key"]);
      assert.equal(req.headers().clientid, "isolated-test-client");
      assert.ok(!req.postData().includes("e2e_password"));
      const decryptedLogin = JSON.parse(decryptServerEnvelope(
        req.postData(), req.headers()["encrypt-key"], loginKey.privateKey,
      ));
      assert.equal(decryptedLogin.grantType, "password");
      assert.equal(decryptedLogin.clientId, "isolated-test-client");
      assert.equal(decryptedLogin.password, "e2e_password");
      encryptedLogins++;
      if (rejectLogin)
        return route.fulfill({
          status: 401,
          json: { code: 401, msg: "隔离认证拒绝" },
        });
      return route.fulfill({
        json: {
          code: 200,
          data: { access_token: "isolated-test-token", expire_in: 1800 },
        },
      });
    }
    return route.fulfill({
      json: { code: 200, data: new URL(req.url()).pathname === "/auth/tenant/list" ? { tenantEnabled: true, voList: [{ tenantId: "000000", companyName: "隔离验收客户" }, { tenantId: "000001", companyName: "隔离第二客户" }] } : { captchaEnabled: false } },
    });
  });
  await context.route("**/inout/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      routePath = url.pathname,
      method = req.method();
    let payload;
    try {
      payload = req.postDataJSON();
    } catch {
      payload = {};
    }
    if (routePath === "/inout/raw-wood/volume-preview") volumePreviews.push(payload);
    else if (method !== "GET") writes.push({ routePath, payload });
    else
      serverReads.push({
        routePath,
        query: Object.fromEntries(url.searchParams),
      });
    let data;
    if (routePath === "/inout/context" && failContextOnce) {
      failContextOnce = false;
      return route.fulfill({
        status: 500,
        json: { code: 500, msg: "隔离权限信息读取失败" },
      });
    }
    if (routePath === "/inout/context")
      data = {
        tenantId: "000000",
        userId: "9007199254740995",
        username: "e2e_operator",
        permissions: [roleManage ? "inout:manage" : "inout:work", ...platformPermissions],
        roleNames,
        capabilities: { work: true, manage: roleManage },
        factories: [
          {
            factoryId: activeFactory,
            factoryName: activeFactory === "9007199254740993" ? "隔离验收工厂" : "隔离第二工厂",
            timezone: fixtureTimezone,
            memberRole: "MANAGER",
          },
        ],
      };
    else if (routePath === "/inout/print-agent/capabilities")
      data = { warehouses: types.map(warehouseType => ({ warehouseType, serverManagedPrinting: true, executionMode: "PC_AGENT" })) };
    else if (routePath === "/inout/statistics") {
      if (firstHomeStatistics && expectedFactoryDate) {
        assert.equal(url.searchParams.get("startDate"), expectedFactoryDate, "首页以授权工厂日期查询而非手机日期");
        assert.equal(url.searchParams.get("endDate"), expectedFactoryDate);
        firstHomeStatistics = false;
      }
      assert.equal(
        url.searchParams.has("startDate"),
        url.searchParams.has("endDate"),
        "统计日期应成对提供或全部省略",
      );
      data = {
        warehouses: types.map((warehouseType, i) => ({
          warehouseType,
          unit: units[i],
          currentQuantity: i === 4 ? "2.450" : "600",
          currentBatches: 1,
          inboundQuantity: i === 4 ? "2.450" : "600",
          inboundBatches: i === 1 ? 2 : 1,
          outboundQuantity: "0",
          outboundBatches: 0,
          sources:
            i === 1
              ? ["APP_INPUT", "MANUAL_CODE"].map((quantitySource) => ({
                  quantitySource,
                  recordSource: quantitySource === "APP_INPUT" ? "APP" : "MQTT",
                  codingMode:
                    quantitySource === "APP_INPUT" ? "NONE" : "MANUAL",
                  unit: units[i],
                  currentQuantity: "300",
                  currentBatches: 1,
                  inboundQuantity: "300",
                  inboundBatches: 1,
                  outboundQuantity: "0",
                  outboundBatches: 0,
                }))
              : [],
          daily: url.searchParams.has("startDate")
            ? []
            : [
                {
                  date: "2020-01-03",
                  inboundQuantity: i === 4 ? "2.450" : "600",
                  inboundBatches: 1,
                  outboundQuantity: "0",
                  outboundBatches: 0,
                },
              ],
        })),
      };
    } else if (routePath === "/inout/raw-wood/volume-preview" && method === "POST") {
      assert.equal(payload.factoryId, activeFactory);
      assert.equal(payload.requestKey, undefined);
      assert.equal(payload.volumeM3, undefined);
      assert.equal(Object.keys(payload.tallies).length, 14);
      const count = Object.values(payload.tallies).reduce((sum, n) => sum + BigInt(n), 0n);
      // Fixed isolated vectors; business volume is always supplied by the server.
      assert.equal(payload.lengthMm, "2600");
      const expected = { "0": "0.000000", "590": "17.349131", "600": "17.643184" };
      assert.ok(expected[count.toString()], "未声明的隔离方量向量");
      data = { lengthMm: "2600.000", tallyTotal: count.toString(), volumeM3: expected[count.toString()] };
    } else if (routePath === "/inout/records" && method === "GET") {
      const selectedRows = created.filter(
        (r) =>
          (!url.searchParams.get("warehouseType") ||
            r.warehouseType === url.searchParams.get("warehouseType")) &&
          (!url.searchParams.get("recordNo") ||
            r.recordNo === url.searchParams.get("recordNo")),
      );
      data = {
        rows: created.length
          ? selectedRows
          : [sample(url.searchParams.get("warehouseType") || "RAW_WOOD")],
        total: created.length ? selectedRows.length : 1,
      };
      const requestedStatus = url.searchParams.get("stockStatus");
      if (requestedStatus) {
        await new Promise((resolve) =>
          setTimeout(resolve, requestedStatus === "IN_STOCK" ? 90 : 5),
        );
        data = {
          rows: [
            {
              ...sample(),
              recordNo: "FILTER-" + requestedStatus,
              stockStatus: requestedStatus,
            },
          ],
          total: 1,
        };
      }
    } else if (routePath === "/inout/records" && method === "POST") {
      if (expectedFactoryDate) assert.equal(payload.recordDate, expectedFactoryDate, "人工入库初始日期来自授权工厂时区");
      if (rejectBusinessField) {
        const field = rejectBusinessField;
        rejectBusinessField = "";
        return route.fulfill({
          status: 400,
          json: {
            code: 400,
            errorCode: "INVALID_ARGUMENT",
            field,
            msg: "现场机号已停用，请核对归属机号",
          },
        });
      }
      assert.equal(typeof payload.factoryId, "string");
      assert.equal(typeof payload.quantity, "string");
      assert.ok(payload.requestKey);
      data = {
        ...sample(payload.warehouseType),
        ...payload,
        id: (9223372036854775800n + BigInt(created.length)).toString(),
        stockStatus: "IN_STOCK",
        version: 0,
        quantitySource: "APP_INPUT",
      };
      if (payload.warehouseType === "RAW_WOOD") {
        assert.equal(payload.detail.volumeM3, undefined);
        data.detail = { ...payload.detail, lengthMm: "2600.000", volumeM3: "17.643184" };
      }
      created.push(data);
      requestResults.set(payload.requestKey, data);
      if (malformedCreateOnce) {
        malformedCreateOnce = false;
        return route.fulfill({ json: { code: 200 } });
      }
    } else if (/\/records\/[^/]+\/labels\/latest$/.test(routePath))
      data = {
        id: "9223372036854775600",
        status: "READY",
        versionNo: 1,
        qrContent:
          "RAW_WOOD|factory_id=9007199254740993|record_id=9223372036854775806",
        fileOssId: "9223372036854775000",
      };
    else if (/\/records\/[^/]+\/outbound$/.test(routePath)) {
      data = {
        ...(created.find((r) => r.id === routePath.split("/")[3]) || sample()),
        stockStatus: "OUTBOUND",
        version: 1,
        outboundAtMs: "1792714600000",
      };
    } else if (/^\/inout\/records\/[^/]+$/.test(routePath))
      data = routePath.endsWith("/" + machineRecord.id)
        ? machineRecord
        : created.find((r) => r.id === routePath.split("/")[3]) || sample();
    else if (routePath === "/inout/print-jobs") {
      assert.equal(
        url.searchParams.has("startDate"),
        url.searchParams.has("endDate"),
      );
      const row = showFailedPrint ? failedPrint : unknownJob;
      const filtered = url.searchParams.get("status");
      const rows = !filtered || filtered === row.status ? [row] : [];
      data = { rows, total: rows.length };
    } else if (routePath === "/inout/print-jobs/" + failedPrint.id)
      data = failedPrint;
    else if (routePath === "/inout/print-jobs/" + failedPrint.id + "/retry") {
      assert.ok(payload.requestKey);
      retryPrintCount++;
      failedPrint.status = "QUEUED";
      failedPrint.version++;
      failedPrint.operations.push({
        id: "retry-1",
        operation: "PRINT_RETRY",
        actorUserId: "9007199254740995",
        occurredAtMs: "1792714600000",
        reason: "管理员明确重试发送前失败",
      });
      data = failedPrint;
    } else if (routePath.endsWith("/verify")) {
      assert.equal(payload.verificationResult, "NOT_PRINTED");
      verifyCount++;
      unknownJob.verificationResult = "NOT_PRINTED";
      unknownJob.version++;
      data = unknownJob;
    } else if (routePath.endsWith("/reprint")) {
      reprintCount++;
      assert.ok(payload.requestKey);
      data = {
        ...unknownJob,
        status: "QUEUED",
        jobKind: "REPRINT",
        id: "9223372036854775701",
      };
    } else if (routePath === "/inout/hosts")
      data = [
        {
          id: "host-a",
          hostId: "host-a",
          hostName: "隔离测试主机A",
          hostCode: "HOST_A",
          bootId: "boot-a",
          version: 1,
          enabled: 1,
        },
      ];
    else if (/^\/inout\/hosts\/[^/]+\/diagnostics$/.test(routePath))
      data = {
        host: {
          id: "host-a",
          hostCode: "HOST_A",
          hostName: "隔离测试主机A",
          bootId: "boot-a",
          enabled: 1,
          version: 1,
          lastHeartbeatAtMs: "1792713600000",
        },
        factoryId: "9007199254740993",
        observedAtMs: "1792714600000",
        captureResources: [
          {
            ruleId: "22",
            deviceId: "55",
            streamKey: "DRYING-01",
            warehouseType: "DRYING",
            enabled: 1,
          },
        ],
        printers: [
          {
            id: "66",
            printerCode: "PRINTER_01",
            printerName: "隔离测试打印机",
            enabled: 1,
          },
        ],
        leases: [
          {
            resourceType: "CAPTURE",
            resourceKey: "55:DRYING-01",
            state: "ACTIVE",
            expiresAtMs: "1792714600000",
          },
        ],
        lastIngestMessageAtMs: null,
        pendingPrintTasks: 7,
        activePrintTasks: 2,
        unknownPrintTasks: 1,
      };
    else if (
      routePath === "/inout/ingest-rules" ||
      routePath === "/inout/capture-devices"
    )
      data = [];
    else if (routePath === "/inout/device-commands" && method === "GET")
      data = {
        rows:
          !url.searchParams.get("status") ||
          url.searchParams.get("status") === unknownCommand.status
            ? [unknownCommand]
            : [],
        total:
          !url.searchParams.get("status") ||
          url.searchParams.get("status") === unknownCommand.status
            ? 1
            : 0,
      };
    else if (/^\/inout\/device-commands\/[^/]+\/review$/.test(routePath)) {
      assert.ok(payload.requestKey);
      assert.ok(payload.reason);
      assert.ok(["CANCEL", "REVIEW"].includes(payload.action));
      commandReviews++;
      unknownCommand.status =
        payload.action === "CANCEL" ? "CANCELLED" : "UNKNOWN";
      unknownCommand.version++;
      unknownCommand.operations.push({
        id: String(commandReviews),
        operation:
          payload.action === "CANCEL" ? "COMMAND_CANCEL" : "COMMAND_REVIEW",
        actorUserId: "9007199254740995",
        occurredAtMs: "1792714600000",
        reason: payload.reason,
      });
      data = unknownCommand;
      if (payload.action === "REVIEW" && loseCommandReviewResponse) {
        loseCommandReviewResponse = false;
        return route.abort("failed");
      }
    } else if (/^\/inout\/device-commands\/[^/]+$/.test(routePath))
      data = unknownCommand;
    else if (routePath.startsWith("/inout/requests/"))
      data = requestResults.has(routePath.split("/").at(-1))
        ? {
            operation: "CREATE",
            record: requestResults.get(routePath.split("/").at(-1)),
          }
        : {
            operation: "COMMAND_ACTION",
            completed: true,
            resultId: unknownCommand.commandId,
            result: unknownCommand,
          };
    else if (routePath === "/inout/roles/options") {
      assert.equal(url.searchParams.get("factoryId"), activeFactory);
      assert.ok(roleManage && platformPermissions.includes("system:user:add"));
      data = { rows: platformRoles };
    } else if (routePath === "/inout/members/candidates") data = [candidate];
    else if (routePath === "/inout/members" && method === "GET") data = { rows: members, total: members.length };
    else if (routePath === "/inout/members" && method === "POST") {
      assert.equal(payload.factoryId, activeFactory);
      assert.equal(payload.memberRole, undefined);
      if (payload.userId) {
        assert.equal(payload.roleIds, undefined);
        data = { ...candidate, id: "9007199254740803", status: "0", version: 0, phoneNumber: "", email: "", canEditProfile: true, canResetPassword: true };
      } else {
        assert.ok(platformPermissions.includes("system:user:add"));
        assert.deepEqual(payload.roleIds, [platformRoles[1].roleId]);
        const memberId = nextMemberId++;
        data = { ...members[0], id: String(memberId), userId: String(memberId + 100n),
          username: payload.username, nickName: payload.nickName, roleNames: [platformRoles[1].roleName] };
      }
      if (!members.some(m => m.userId === data.userId)) members.push(data);
      if (loseMemberResponse) { loseMemberResponse = false; return route.fulfill({ status: 502, body: "isolated lost member response" }); }
    } else if (/^\/inout\/members\/\d+\/password$/.test(routePath)) {
      assert.ok(roleManage);
      const member = members.find(row => row.id === routePath.split("/")[3]);
      assert.equal(member?.canResetPassword, true);
      assert.equal(payload.version, member.version);
      member.version++;
      assert.equal(payload.roleIds, undefined); data = null;
    } else if (/^\/inout\/members\/\d+\/status$/.test(routePath)) data = null;
    else if (routePath === "/inout/printers" && method === "GET")
      data = [physicalPrinter];
    else if (routePath.startsWith("/inout/print-configs/")) {
      const warehouseType = routePath.split("/").at(-1);
      const previous = storedPrintConfigs.get(warehouseType) || {
        id: "9223372036854775100", warehouseType, printerId: physicalPrinter.id,
        paperCode: "A4", paperWidthMm: "210", paperHeightMm: "297", templateCode: "STANDARD",
        templateRevision: 1, copies: 1, horizontalOffsetMm: "0", verticalOffsetMm: "0",
        autoPrint: 0, version: 1, configFingerprint: "test-fingerprint",
      };
      data = previous;
      if (method === "PUT") {
        assert.equal(payload.version, previous.version);
        if (rejectPrinterOnce) {
          rejectPrinterOnce = false;
          return route.fulfill({status:400,json:{code:400,field:"paperWidthMm",errorCode:"INVALID_ARGUMENT",msg:"测试服务端拒绝此纸张宽度"}});
        }
        data = {...previous,...payload,version:previous.version+1};
        storedPrintConfigs.set(warehouseType,data);
        if (losePrinterResponse) { losePrinterResponse=false; return route.abort("failed"); }
      }
    }
    else
      return route.fulfill({
        status: 404,
        json: { code: 404, msg: "未声明的隔离测试接口 " + routePath },
      });
    await route.fulfill({ json: { code: 200, msg: "ok", data } });
  });
  const page = await context.newPage();
  activePage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByText("MOM生成运行管理系统", { exact: true }).waitFor();
  assert.equal(await page.getByText("连接现场", { exact: true }).count(), 0);
  assert.equal(await page.locator("input").first().inputValue(), "");
  await page.screenshot({ path: path.join(out, "login.png"), fullPage: true });
  await page
    .locator('uni-input[aria-label="登录账号"] input')
    .fill("e2e_operator");
  await page
    .locator('uni-input[aria-label="登录密码"] input')
    .fill("e2e_password");
  await page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).click();
  await page.getByText("请选择所属企业", { exact: true }).waitFor();
  assert.equal(encryptedLogins, 0, "未选择企业不得发出登录请求或默认000000");
  assert.equal(await page.getByText("连接设置", { exact: true }).count(), 0);
  assert.equal(await page.locator('uni-input[aria-label="服务器HTTPS地址"]').count(), 0);
  await page.locator(".enterprise-field uni-picker").click();
  await page.locator(".uni-picker-content .uni-picker-item").filter({ hasText: /^隔离验收客户$/ }).last().click();
  await page.locator(".uni-picker-action-confirm").last().click();
  assert.equal(await page.locator(".enterprise-field .picker-value").innerText(), "隔离验收客户");
  assert.equal(await page.locator('uni-input[aria-label="登录账号"] input').inputValue(), "e2e_operator");
  assert.equal(await page.locator('uni-input[aria-label="登录密码"] input').inputValue(), "e2e_password");
  rejectLogin = true;
  await page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).click();
  await page
    .getByText("登录请求未获授权，请核对账号或联系管理员", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator('uni-input[aria-label="登录账号"] input').inputValue(),
    "e2e_operator",
  );
  assert.equal(
    await page.locator('uni-input[aria-label="登录密码"] input').inputValue(),
    "e2e_password",
  );
  rejectLogin = false;
  failContextOnce = true;
  await page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).click();
  await page.getByText("服务器暂时不可用", { exact: true }).waitFor();
  assert.equal(
    await page.locator('uni-input[aria-label="登录密码"] input').inputValue(),
    "e2e_password",
  );
  await page.locator("uni-button").filter({ hasText: /^\s*进入工作台\s*$/ }).click();
  await page
    .locator(".factory-picker")
    .filter({ hasText: "隔离验收工厂" })
    .waitFor();
  await page.getByText("原木当前在库", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("白皮当前在库", { exact: true }).count(),
    1,
  );
  await page.screenshot({ path: path.join(out, "home.png"), fullPage: true });
  await page.goto(origin + "/#/pages/entry/index?warehouse=WHITE_BARK");
  await page.getByText("白皮入库", { exact: true }).waitFor();
  const input = (label) =>
    page.locator(`uni-input[aria-label="${label}"] input`);
  await input("入库吨数").fill("2.450");
  await input("机器编号").fill("03号");
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.equal(created[0].quantity, "2.450");
  assert.equal(created[0].factoryId, "9007199254740993");
  assert.equal(created[0].detail.machineNumber, "03号");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(out, "detail.png"), fullPage: true });

  await page.goto(origin + "/#/pages/detail/index?id=" + machineRecord.id);
  await page.getByText("CUSTOMER-007", { exact: true }).waitFor();
  await page.getByText("DEVICE-BATCH-009", { exact: true }).waitFor();
  await page.getByText("设备采集", { exact: true }).waitFor();
  await page
    .locator(".detail-row")
    .filter({ hasText: "打码方式" })
    .getByText("设备人工打码", { exact: true })
    .waitFor();
  await page
    .locator(".detail-row")
    .filter({ hasText: "客户名称" })
    .getByText("未提供", { exact: true })
    .waitFor();
  await page
    .locator(".source-trace-row")
    .getByText("isolated/drying/01", { exact: true })
    .waitFor();
  await page
    .locator(".source-trace-row")
    .getByText("synthetic-edge-007", { exact: true })
    .waitFor();
  await page
    .locator(".source-trace-row")
    .getByText("原始数量 ÷ 10.000", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".source-trace-row").count(), 11);
  await page.screenshot({
    path: path.join(out, "machine-detail.png"),
    fullPage: true,
  });

  await page.goto(origin + "/#/pages/entry/index?warehouse=RAW_WOOD");
  await page.getByText("原木入库", { exact: true }).waitFor();
  assert.equal(await input("原木长度").inputValue(), "");
  await page.getByText("请输入长度，例如2600", { exact: true }).waitFor();
  for (const [label, value] of Object.entries({
    入库数量: "600",
    原木长度: "2600",
    原木规格: "2.6m",
    等级: "A",
    供应商: "测试供应商",
    车牌号: "鲁a12345",
    成数: "8.50",
    大码比例: "20",
    "14公分比例": "30",
    存放区域: "A区",
    单价: "1.00",
    总价: "600.00",
  }))
    await input(label).fill(value);
  await page.locator("uni-button").filter({ hasText: /^\s*下一步 · 码单录入\s*$/ }).click();
  await input("12公分根数").fill("590");
  await page.getByText("与填写根数差额：-10 根", { exact: true }).waitFor();
  await page.getByText("确认入库", { exact: true }).click();
  await page
    .getByText("码单合计必须等于基础信息中的原木根数", { exact: true })
    .waitFor();
  assert.equal(created.length, 1);
  await page.locator(".topbar .back").click();
  assert.equal(await input("供应商").inputValue(), "测试供应商");
  assert.equal(await input("原木长度").inputValue(), "2600");
  await page.locator("uni-button").filter({ hasText: /^\s*下一步 · 码单录入\s*$/ }).click();
  await input("12公分根数").fill("600");
  await page.getByText("与填写根数差额：0 根", { exact: true }).waitFor();
  await page.locator(".big-value").filter({ hasText: /^17\.643184\s*m³$/ }).waitFor();
  await page.screenshot({ path: path.join(out, "raw-volume-preview.png"), fullPage: true });
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.equal(created.length, 2);
  assert.equal(created[1].detail.tally12cmCount, "600");
  assert.equal(created[1].detail.vehiclePlateNo, "鲁A12345");
  assert.equal(created[1].detail.lengthMm, "2600.000");
  assert.equal(created[1].detail.volumeM3, "17.643184");
  assert.ok(volumePreviews.length > 0);
  await page.locator(".detail-row").filter({ hasText: "计算方量 (m³)" }).getByText("17.643184", { exact: true }).waitFor();
  if (process.env.DEQIN_TEST_SCENARIO === "raw-volume") {
    assert.deepEqual(errors, []);
    const rawWrites = writes.filter(w => w.routePath === "/inout/records" && w.payload.warehouseType === "RAW_WOOD");
    assert.equal(rawWrites.length, 1);
    assert.equal(rawWrites[0].payload.detail.volumeM3, undefined);
    fs.writeFileSync(path.join(out, "raw-volume-ui-result.json"), JSON.stringify({ passed: true,
      scope: "isolated compiled H5, 390x844, no production API", volumePreviewCount: volumePreviews.length,
      rawInboundWrites: rawWrites.length, checks: ["长度无默认值且有填写提示", "返回第一步保留长度", "码单不等于根数禁止入库", "实时显示码单与填写根数差额", "后端6位方量可预览", "预览无requestKey和业务写入", "实际入库不提交客户端方量", "详情显示服务端长度和方量", "无页面脚本错误"] }, null, 2));
    console.log("RAW VOLUME UI PASS: 9 acceptance checks; no production API called.");
    await browser.close();
    server.close();
    return;
  }
  await page.goto(origin + "/#/pages/entry/index?warehouse=WOOD_CORE");
  await page.getByText("木芯入库", { exact: true }).waitFor();
  for (const [label, value] of Object.entries({
    入库数量: "1200",
    机器编号: "02号",
    木芯直径: "28.000",
  }))
    await input(label).fill(value);
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.equal(created.length, 3);
  await page.goto(origin + "/#/pages/entry/index?warehouse=PEELING");
  await page.getByText("旋切入库", { exact: true }).waitFor();
  for (const [label, value] of Object.entries({
    入库编号: "XQ-E2E",
    入库数量: "920",
    班组: "甲班",
    机器编号: "01号",
    长度: "1270",
    宽度: "840",
    厚度: "1.8",
    开单员: "开单测试员",
    板材属性: "杨木",
  }))
    await input(label).fill(value);
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("请填写质检员", { exact: true }).waitFor();
  assert.equal(created.length, 3);
  await input("质检员").fill("质检测试员");
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.equal(created.length, 4);
  await page.goto(origin + "/#/pages/entry/index?warehouse=DRYING");
  await page.getByText("烘干入库", { exact: true }).waitFor();
  for (const [label, value] of Object.entries({
    入库编号: "HG-E2E",
    入库数量: "800",
    客户名称: "测试客户",
    质量比: "90",
  }))
    await input(label).fill(value);
  for (const label of ["厚度 mm", "等级", "进板状态", "班组"]) {
    await page
      .locator(".field")
      .filter({ hasText: label })
      .locator("uni-picker")
      .click();
    await page.locator(".uni-picker-action-confirm").last().click();
  }
  await page.getByText("确认入库", { exact: true }).click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.equal(created.length, 5);
  assert.equal(created[4].detail.thicknessMm, "1.7");
  await page.goto(origin + "/#/pages/checkout/index?id=" + created[4].id);
  await page.getByText("出库确认", { exact: true }).waitFor();
  await page.getByText("确认整批出库", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.getByText("出库完成", { exact: true }).waitFor();
  assert.equal(
    writes.filter((w) => w.routePath.endsWith("/outbound")).length,
    1,
  );
  await page.goto(origin + "/#/pages/print/index");
  await page.getByText("结果待核验", { exact: true }).waitFor();
  await page.getByText("目标打印机：隔离测试打印机", { exact: true }).waitFor();
  await page
    .getByText("纸张：A4 · 210.000 × 297.000 mm", { exact: true })
    .waitFor();
  await page
    .getByText("首次打印 · 1 份 · 标签版本3", { exact: true })
    .waitFor();
  await page
    .getByText("创建时间：2026年10月23日 10:30:00", { exact: true })
    .waitFor();
  await page.locator(".print-filter-toggle").click();
  for (const [state, label] of [
    ["WAITING_PRINTER", "等待打印机"],
    ["PREPARING", "准备中"],
    ["SENDING", "发送中"],
    ["SUBMITTED", "已提交，等待结果"],
    ["CANCELLED", "已取消"],
  ]) {
    const filteredResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/inout/print-jobs" &&
        new URL(response.url()).searchParams.get("status") === state,
    );
    await page.locator(".chip").getByText(label, { exact: true }).click();
    await filteredResponse;
    await page.getByText("没有符合筛选条件的任务", { exact: true }).waitFor();
  }
  await page.locator(".chip").getByText("全部状态", { exact: true }).click();
  await page.getByText("结果待核验", { exact: true }).waitFor();
  const datedPrintResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/inout/print-jobs" &&
      url.searchParams.has("startDate") &&
      url.searchParams.has("endDate")
    );
  });
  await page.locator(".chip").getByText("日", { exact: true }).click();
  const printDateQuery = new URL((await datedPrintResponse).url()).searchParams;
  assert.equal(printDateQuery.get("startDate"), printDateQuery.get("endDate"));
  await page
    .locator(".date-picker")
    .getByText(/年.*月.*日/)
    .waitFor();
  const allPrintResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/inout/print-jobs" &&
      !url.searchParams.has("startDate") &&
      !url.searchParams.has("endDate")
    );
  });
  await page.locator(".chip").getByText("全部", { exact: true }).click();
  await allPrintResponse;
  await page.getByText("全部任务创建日期", { exact: true }).waitFor();
  assert.equal(await page.getByText("重试原任务", { exact: true }).count(), 0);
  await page.getByText("核验纸张结果", { exact: true }).click();
  await page
    .locator(".modal uni-button")
    .filter({ hasText: /^\s*取消\s*$/ })
    .click();
  assert.equal(verifyCount, 0);
  assert.equal(reprintCount, 0);
  await page.getByText("核验纸张结果", { exact: true }).click();
  await page.getByText("确认未出纸", { exact: true }).click();
  await page
    .locator(".modal textarea")
    .fill("已核对现场标签及打印机记录，确认未出纸");
  await page.getByText("确认核验", { exact: true }).click();
  await page.getByText("明确补打", { exact: true }).waitFor();
  assert.equal(verifyCount, 1);
  assert.equal(reprintCount, 0);
  await page.getByText("明确补打", { exact: true }).click();
  await page.locator(".modal textarea").fill("现场确认需要补打一份");
  await page.getByText("确认补打", { exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(reprintCount, 1);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, "print.png"), fullPage: true });
  await page.goto(origin + "/#/pages/host/index");
  await page.getByText("当前平台不支持", { exact: true }).waitFor();
  await page.getByText("启动本机执行", { exact: true }).waitFor();
  const button = page.locator("uni-button").filter({ hasText: "启动本机执行" });
  assert.equal((await button.getAttribute("disabled")) !== null, true);
  await page.goto(origin + "/#/pages/records/index");
  await page.getByText("记录查询", { exact: true }).waitFor();
  await page
    .locator(".chip")
    .filter({ hasText: /^在库$/ })
    .click();
  await page
    .locator(".chip")
    .filter({ hasText: /^已出库$/ })
    .click();
  await page.getByText("FILTER-OUTBOUND", { exact: true }).waitFor();
  await page.waitForTimeout(180);
  assert.equal(
    await page.getByText("FILTER-IN_STOCK", { exact: true }).count(),
    0,
  );
  for (const route of ["warehouse", "statistics"]) {
    await page.goto(origin + "/#/pages/" + route + "/index");
    await page.getByText("全部", { exact: true }).waitFor();
    const allRange = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/inout/statistics" &&
        !url.searchParams.has("startDate") &&
        !url.searchParams.has("endDate")
      );
    });
    let allRecords;
    if (route === "warehouse")
      allRecords = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/inout/records" &&
          !url.searchParams.has("startDate") &&
          !url.searchParams.has("endDate")
        );
      });
    await page.getByText("全部", { exact: true }).click();
    assert.equal((await allRange).status(), 200);
    if (allRecords) assert.equal((await allRecords).status(), 200);
    await page.getByText("全部业务日期", { exact: true }).waitFor();
    if (route === "warehouse")
      await page
        .locator(".panel.hero .label")
        .filter({ hasText: "当前在库数量" })
        .waitFor();
    else
      await page.getByText("2020年1月3日", { exact: true }).first().waitFor();
    assert.equal(await page.locator(".error-box").count(), 0);
    assert.equal(await page.locator(".date-range-controls").count(), 0);
  }
  await page.getByText("本期入库来源", { exact: true }).waitFor();
  assert.equal(await page.locator(".source-stat-row").count(), 2);
  assert.equal(
    await page
      .locator(".source-stat-row")
      .getByText("50.00%", { exact: true })
      .count(),
    2,
  );
  await page
    .locator(".source-stat-row")
    .getByText("机器 · 人工打码", { exact: true })
    .waitFor();

  await page.goto(origin + "/#/pages/entry/index?warehouse=WHITE_BARK");
  await page.getByText("白皮入库", { exact: true }).waitFor();
  await page.getByText("确认入库", { exact: true }).click();
  await page.waitForTimeout(300);
  const firstInvalid = page.locator('uni-input[aria-label="入库吨数"] input');
  assert.equal(
    await firstInvalid.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  );
  const invalidBox = await page.locator("#field-quantity").boundingBox();
  assert.ok(invalidBox.y >= 65 && invalidBox.y < 600, "首错可见且未被标题遮挡");
  await firstInvalid.fill("1.250");
  const writesBeforeLeave = writes.length;
  await page.locator(".topbar .back").click();
  await page
    .locator("uni-modal")
    .getByText("放弃未保存内容？", { exact: true })
    .waitFor();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  assert.equal(await firstInvalid.inputValue(), "1.250");
  assert.ok(page.url().includes("/pages/entry/index"), page.url());
  await page.evaluate(() => history.back());
  await page
    .locator("uni-modal")
    .getByText("放弃未保存内容？", { exact: true })
    .waitFor();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  await page.waitForTimeout(120);
  assert.ok(page.url().includes("/pages/entry/index"), page.url());
  assert.equal(await firstInvalid.inputValue(), "1.250");
  await page.locator(".topbar .back").click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.waitForTimeout(180);
  assert.ok(!page.url().includes("/pages/entry/index"));
  assert.equal(writes.length, writesBeforeLeave);

  await page.goto(origin + "/#/pages/entry/index?warehouse=WHITE_BARK");
  await input("入库吨数").fill("1.250");
  await input("机器编号").fill("现场停用机");
  rejectBusinessField = "detail.machineNumber";
  const beforeRejectedCreate = created.length;
  await page.getByText("确认入库", { exact: true }).click();
  await page
    .locator("#field-machineNumber .error-text")
    .getByText("现场机号已停用，请核对归属机号", { exact: true })
    .waitFor();
  await page.waitForTimeout(250);
  assert.equal(await input("机器编号").inputValue(), "现场停用机");
  assert.equal(await input("入库吨数").inputValue(), "1.250");
  assert.equal(
    await input("机器编号").evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  );
  assert.equal(created.length, beforeRejectedCreate);
  await page.locator(".topbar .back").click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();

  await page.goto(origin + "/#/pages/printers/index");
  await page.locator(".settings-toggle").click();
  await input("纸张宽度").fill("211");
  await page.locator(".topbar .back").click();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  assert.equal(await input("纸张宽度").inputValue(), "211");
  await page.locator(".topbar .back").click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.goto(origin + "/#/pages/capture/index");
  await page.getByText("＋ 新增采集规则", { exact: true }).click();
  await page.locator(".modal uni-input input").first().fill("DIRTY-RULE");
  await page
    .locator(".modal uni-button")
    .filter({ hasText: /^\s*取消\s*$/ })
    .click();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  assert.equal(
    await page.locator(".modal uni-input input").first().inputValue(),
    "DIRTY-RULE",
  );
  await page
    .locator(".modal uni-button")
    .filter({ hasText: /^\s*取消\s*$/ })
    .click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.goto(origin + "/#/pages/members/index");
  await page.getByText("授权成员", { exact: true }).click();
  await page.locator(".modal uni-input input").first().fill("unsaved_operator");
  await page
    .locator(".modal uni-button")
    .filter({ hasText: /^\s*取消\s*$/ })
    .click();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  assert.equal(
    await page.locator(".modal uni-input input").first().inputValue(),
    "unsaved_operator",
  );
  await page
    .locator(".modal uni-button")
    .filter({ hasText: /^\s*取消\s*$/ })
    .click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();

  // Global roles are platform authority; factory membership only supplies scope.
  const memberPosts = () => writes.filter(w => w.routePath === "/inout/members");
  const modalInput = label => page.locator(".modal .field").filter({ hasText: label }).locator("uni-input input");
  const saveMember = () => page.locator(".modal uni-button").filter({ hasText: /^\s*确认保存\s*$/ }).click();
  const cancelMember = async () => {
    await page.locator(".modal uni-button").filter({ hasText: /^\s*取消\s*$/ }).click();
    if (await page.locator("uni-modal").count()) await page.locator("uni-modal").getByText("确定", { exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
  };
  const memberPanel = username => page.locator(".panel").filter({ has: page.getByText("账号 " + username, { exact: true }) });
  await memberPanel("regular_fixture").getByText("重设密码", { exact: true }).waitFor();
  assert.equal(await memberPanel("root_fixture").getByText("重设密码", { exact: true }).count(), 0);
  roleUiChecks.push("受保护平台超级管理员不显示密码重置，普通成员保留独立重置入口");
  await page.screenshot({ path: path.join(out, "global-role-members.png"), fullPage: true });
  await page.getByText("授权成员", { exact: true }).click();
  await modalInput("登录账号").fill(candidate.username);
  await page.getByText("按完整账号查询", { exact: true }).click();
  await page.locator(".modal .record-card").filter({ hasText: candidate.username }).click();
  await page.locator(".modal").getByText("质检作业员", { exact: true }).waitFor();
  await saveMember();
  await page.locator(".modal").waitFor({ state: "detached" });
  assert.equal(memberPosts().at(-1).payload.userId, candidate.userId);
  assert.equal(memberPosts().at(-1).payload.roleIds, undefined);
  roleUiChecks.push("绑定已有账号只增加工厂范围，保留只读平台角色且不发送角色字段");

  await page.getByText("授权成员", { exact: true }).click();
  await page.getByText("新建平台账号", { exact: true }).click();
  await page.locator(".modal").getByText("质检作业员", { exact: true }).waitFor();
  assert.equal(await page.locator(".modal").getByText("平台超级管理员", { exact: true }).count(), 0);
  await saveMember();
  await page.locator(".modal .error-text").getByText("请读取并选择可授予的平台角色", { exact: true }).waitFor();
  await modalInput("登录账号").fill("new_quality_fixture");
  await modalInput("姓名").fill("新平台人员");
  await modalInput("初始密码").fill("FixtureOnly2026");
  await page.locator(".modal .record-card").filter({ hasText: "质检作业员" }).click();
  await page.screenshot({ path: path.join(out, "global-role-create.png"), fullPage: true });
  await saveMember();
  await page.locator("uni-modal").getByText("确认新增平台账号", { exact: true }).waitFor();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });
  assert.deepEqual(memberPosts().at(-1).payload.roleIds, [platformRoles[1].roleId]);
  roleUiChecks.push("新账号必须选择服务端动态可授予角色，准确字符串ID及跨工厂一致确认后提交");

  await memberPanel("regular_fixture").getByText("重设密码", { exact: true }).click();
  await modalInput("新密码").fill("ResetFixture2026");
  await saveMember();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });
  assert.ok(writes.some(w => w.routePath === "/inout/members/9007199254740801/password"));
  roleUiChecks.push("本厂普通操作员密码重置按服务端目标授权执行且不变更角色");

  await page.getByText("授权成员", { exact: true }).click();
  await page.getByText("新建平台账号", { exact: true }).click();
  await page.locator(".modal .record-card").filter({ hasText: "质检作业员" }).click();
  await modalInput("登录账号").fill("lost_response_fixture");
  await modalInput("姓名").fill("待核对平台人员");
  await modalInput("初始密码").fill("LostFixture2026");
  loseMemberResponse = true;
  const beforeUnknownMember = memberPosts().length;
  await saveMember();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.locator(".modal .error-text").filter({ hasText: "已停止重复提交" }).waitFor();
  const blockedSave = page.locator(".modal uni-button").filter({ hasText: /^\s*确认保存\s*$/ });
  assert.notEqual(await blockedSave.getAttribute("disabled"), null);
  assert.equal(memberPosts().length, beforeUnknownMember + 1);
  assert.equal(await modalInput("登录账号").inputValue(), "lost_response_fixture");
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("LostFixture2026")), false);
  await cancelMember();
  await page.reload();
  await memberPanel("lost_response_fixture").waitFor();
  assert.equal(memberPosts().length, beforeUnknownMember + 1);
  roleUiChecks.push("新增账号响应丢失后禁止重复保存，关闭读取已提交成员，密码不持久化");

  platformPermissions = platformPermissions.filter(p => p !== "system:user:add" && p !== "system:user:resetPwd");
  await page.reload();
  await memberPanel("regular_fixture").waitFor();
  assert.equal(await memberPanel("regular_fixture").getByText("重设密码", { exact: true }).count(), 1);
  assert.equal(await memberPanel("root_fixture").getByText("重设密码", { exact: true }).count(), 0);
  await page.getByText("授权成员", { exact: true }).click();
  assert.equal(await page.getByText("新建平台账号", { exact: true }).count(), 0);
  await cancelMember();
  roleUiChecks.push("本厂操作员维护不要求全局重置密码权限，创建平台账号仍需独立授权");

  await page.goto(origin + "/#/pages/mine/index");
  await page.locator(".hero").getByText("仓库主管", { exact: true }).waitFor();
  activeFactory = "9007199254740994";
  await page.reload();
  await page.locator(".hero").getByText("仓库主管", { exact: true }).waitFor();
  await page.getByText("人员管理", { exact: true }).waitFor();
  roleUiChecks.push("同一账号切换授权工厂保持服务端平台角色及管理能力一致");
  roleManage = false;
  roleNames = ["工厂管理员"];
  await page.reload();
  await page.locator(".hero").getByText("工厂管理员", { exact: true }).waitFor();
  assert.equal(await page.getByText("人员管理", { exact: true }).count(), 0);
  assert.equal(await page.getByText("仓库打印设置", { exact: true }).count(), 0);
  roleUiChecks.push("下一页刷新即时撤销管理入口，不信任管理员名称或旧MANAGER字段");
  activeFactory = "9007199254740993";
  roleManage = true; roleNames = ["仓库主管"];
  platformPermissions = ["inout:record:delete", "inout:print:reprint", "system:user:add", "system:user:resetPwd"];

  await page.goto(origin + "/#/pages/scan/index?warehouse=PEELING");
  await page.getByText("打开摄像头扫码", { exact: true }).click();
  await page
    .getByText(
      "浏览器不支持原生扫码，请使用Android APP或输入标签上的完整二维码内容。",
      { exact: true },
    )
    .waitFor();
  await input("完整业务单号").fill("XQ-E2E");
  await page.getByText("查询业务单号", { exact: true }).click();
  await page.locator(".manual-number-lookup .record-card").waitFor();
  const manualRead = serverReads.findLast(
    (read) => read.routePath === "/inout/records" && read.query.recordNo,
  );
  assert.equal(manualRead.query.recordNo, "XQ-E2E");
  assert.equal(manualRead.query.warehouseType, "PEELING");
  assert.equal(manualRead.query.factoryId, "9007199254740993");
  const outboundBeforeManual = writes.filter((w) =>
    w.routePath.endsWith("/outbound"),
  ).length;
  await page.locator(".manual-number-lookup .record-card").click();
  await page.getByText("出库确认", { exact: true }).waitFor();
  assert.equal(
    writes.filter((w) => w.routePath.endsWith("/outbound")).length,
    outboundBeforeManual,
  );

  await page.setViewportSize({ width: 1000, height: 860 });
  await page.goto(origin + "/#/pages/records/index");
  await page
    .locator(".records-layout.split .records-detail-pane .record-detail")
    .waitFor();
  await page.getByText("重置", { exact: true }).click();
  await page.locator(".records-list .record-card").nth(1).waitFor();
  await page.locator(".records-list .record-card").nth(1).click();
  await page
    .locator(".records-detail-pane")
    .getByText(created[1].recordNo, { exact: true })
    .waitFor();
  assert.ok(page.url().includes("/pages/records/index"));
  const leftBox = await page.locator(".records-list").boundingBox(),
    rightBox = await page.locator(".records-detail-pane").boundingBox();
  assert.ok(rightBox.x >= leftBox.x + leftBox.width, "列表详情实际分栏");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(out, "tablet-records.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".records-detail-pane").count(), 0);
  await page.locator(".records-list .record-card").first().click();
  await page.getByText("记录详情", { exact: true }).waitFor();
  assert.ok(page.url().includes("/pages/detail/index"));

  platformPermissions = [];
  await page.reload();
  await page.getByText("记录详情", { exact: true }).waitFor();
  await page.locator(".record-detail .panel.hero").waitFor();
  assert.equal(
    await page.getByText("删除本批记录", { exact: true }).count(),
    0,
  );
  await page.goto(origin + "/#/pages/print/index");
  await page.getByText("结果待核验", { exact: true }).waitFor();
  assert.equal(await page.getByText("明确补打", { exact: true }).count(), 0);
  await page.getByText("核验纸张结果", { exact: true }).waitFor();
  platformPermissions = [
    "inout:record:delete",
    "inout:print:reprint",
    "system:user:add",
    "system:user:resetPwd",
  ];
  await page.reload();
  await page.getByText("明确补打", { exact: true }).waitFor();

  await page.evaluate(() => localStorage.setItem("dq.hostId", "host-a"));
  await page.goto(origin + "/#/pages/host/index");
  await page.reload();
  await page
    .locator(".server-diagnostics")
    .getByText("boot-a", { exact: true })
    .waitFor();
  await page
    .locator(".server-diagnostics")
    .getByText("隔离测试打印机", { exact: true })
    .waitFor();
  await page
    .locator(".server-diagnostics")
    .getByText("待执行任务", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".local-diagnostics").count(),
    0,
    "H5不伪造本机持久证据",
  );
  assert.ok(
    serverReads.some(
      (read) =>
        read.routePath === "/inout/hosts/host-a/diagnostics" &&
        read.query.factoryId === "9007199254740993",
    ),
  );

  await page.goto(origin + "/#/pages/capture/index");
  await page.getByText("复位命令", { exact: true }).click();
  await page.locator(".command-card").click();
  await page.getByText("关闭命令追发", { exact: true }).click();
  await page.getByText("请填写现场核验依据", { exact: true }).waitFor();
  assert.equal(commandReviews, 0);
  await page
    .locator('uni-textarea[aria-label="命令核验依据"] textarea')
    .fill("现场仍无法确认设备复位状态");
  await page.getByText("记录仍待核验", { exact: true }).click();
  await page.locator("uni-modal").getByText("取消", { exact: true }).click();
  assert.equal(commandReviews, 0);
  await page.getByText("记录仍待核验", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page
    .locator(".modal .error-box")
    .filter({ hasText: "网络中断" })
    .waitFor();
  assert.equal(commandReviews, 1);
  await page.getByText("关闭详情", { exact: true }).click();

  await page.locator("uni-modal").getByText("确定", { exact: true }).click();

  showFailedPrint = true;
  await page.goto(origin + "/#/pages/print/index");
  await page.getByText("重试原任务", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.getByText("排队中", { exact: true }).waitFor();
  assert.equal(retryPrintCount, 1);
  await page.getByText("执行记录", { exact: true }).click();
  await page
    .locator(".print-history")
    .getByText("打印执行记录", { exact: true })
    .waitFor();
  await page
    .locator(".print-attempt")
    .getByText("发送前失败", { exact: true })
    .waitFor();
  await page
    .locator(".print-attempt")
    .getByText("FILE_DOWNLOAD_FAILED · 历史下载失败证据保留", { exact: true })
    .waitFor();
  await page
    .locator(".print-history")
    .getByText("管理员明确重试发送前失败", { exact: true })
    .waitFor();
  assert.equal(
    writes.filter((write) => write.routePath.endsWith("/retry")).length,
    1,
  );
  await page.getByText("关闭执行记录", { exact: true }).click();
  await page.goto(origin + "/#/pages/mine/index");
  await page.getByText("复位命令核验", { exact: true }).waitFor();
  await page.getByText("核对原提交结果", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.getByText("待确认操作", { exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.getByText("核对原提交结果", { exact: true }).count(), 0);
  assert.equal(commandReviews, 1, "响应丢失核对只读原结果，不重复执行命令动作");
  await page.goto(origin + "/#/pages/capture/index");
  await page.getByText("复位命令", { exact: true }).click();
  await page.locator(".command-card").click();
  await page
    .locator('uni-textarea[aria-label="命令核验依据"] textarea')
    .fill("现场已接管，关闭该命令后续追发");
  await page.getByText("关闭命令追发", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page
    .locator(".modal")
    .getByText("已关闭追发", { exact: true })
    .waitFor();
  assert.equal(commandReviews, 2);
  assert.equal(unknownCommand.status, "CANCELLED");
  assert.equal(
    writes.filter(
      (write) =>
        write.routePath.includes("/device-commands/") &&
        !write.routePath.endsWith("/review"),
    ).length,
    0,
    "无重新发布或人工设备ACK",
  );
  await page.getByText("关闭详情", { exact: true }).click();
  await page.goto(origin + "/#/pages/printers/index");
  await page.getByText("自动搜索和网络打印仅支持已安装原生模块的Android终端；网页版可查看各仓库现有配置。", {exact:true}).waitFor();
  assert.equal(await page.getByText("新增网络打印机", {exact:true}).count(), 0);
  assert.equal(await page.locator('uni-input[aria-label="完整打印机URI"]').count(), 0);
  await page.locator(".settings-toggle").click();
  await input("纸张宽度").fill("211");
  rejectPrinterOnce = true;
  await page.getByText("保存本仓配置", {exact:true}).click();
  await page.locator("#field-paperWidthMm .error-text").getByText("测试服务端拒绝此纸张宽度", {exact:true}).waitFor();
  assert.equal(await input("纸张宽度").inputValue(), "211");
  await page.getByText("保存本仓配置", {exact:true}).click();
  await page.getByText("本仓打印配置已保存", {exact:true}).waitFor();
  assert.equal(storedPrintConfigs.get("RAW_WOOD").version,2);
  await page.locator("uni-toast").waitFor({state:"hidden"});
  await input("纸张宽度").fill("212");
  losePrinterResponse = true;
  const lostConfigRequest = page.waitForRequest(req => req.method() === "PUT" && new URL(req.url()).pathname === "/inout/print-configs/RAW_WOOD" && req.postDataJSON()?.paperWidthMm === "212");
  await page.getByText("保存本仓配置", {exact:true}).click();
  await lostConfigRequest;
  await page.getByText("核对服务端结果", {exact:true}).waitFor();
  assert.notEqual(await page.getByText("保存本仓配置",{exact:true}).getAttribute("disabled"),null);
  const uncertainPrinterWrites = writes.length;
  await page.getByText("核对服务端结果", {exact:true}).click();
  await page.getByText("采用服务端结果", {exact:true}).waitFor();
  assert.equal(await input("纸张宽度").inputValue(),"212");
  await page.screenshot({path:path.join(out,"printer-config-readback.png"),fullPage:true});
  await page.getByText("采用服务端结果", {exact:true}).click();
  await page.locator("uni-modal").getByText("确定", {exact:true}).click();
  await page.locator(".uncertain-setting").waitFor({state:"detached"});
  assert.equal(writes.length,uncertainPrinterWrites,"配置未知结果只读核对，不自动重复PUT");

  await page.goto(origin + "/#/pages/entry/index?warehouse=WHITE_BARK");
  await input("入库吨数").fill("3.250");
  await input("机器编号").fill("05号");
  const committedBeforeMalformed = created.length;
  malformedCreateOnce = true;
  await page.getByText("确认入库", { exact: true }).click();
  await page
    .getByText("服务器未返回业务结果，请核对原提交结果", { exact: true })
    .waitFor();
  assert.equal(await input("入库吨数").inputValue(), "3.250");
  assert.equal(created.length, committedBeforeMalformed + 1);
  await page.locator(".topbar .back").click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.goto(origin + "/#/pages/mine/index");
  await page.getByText("核对原提交结果", { exact: true }).click();
  await page.locator("uni-modal").getByText("确定", { exact: true }).click();
  await page.getByText("待确认操作", { exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.getByText("核对原提交结果", { exact: true }).count(), 0);
  assert.equal(
    created.length,
    committedBeforeMalformed + 1,
    "缺data写响应核对只读原结果，不重复入库",
  );
  await page
    .getByText("DEQIN PRODUCTION OS · " + appVersion, { exact: true })
    .waitFor();
  for (const route of [
    "warehouse",
    "records",
    "statistics",
    "mine",
    "members",
    "printers",
  ]) {
    await page.goto(origin + "/#/pages/" + route + "/index");
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, "水平溢出 " + route);
  }
  assert.equal(encryptedLogins, 3);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "e2e-report.json"),
    JSON.stringify(
      {
        passed: true,
        versionName: appVersion,
        timezoneCompatibility: { intlMode, fixtureTimezone, fixedNow: fixedNow ?? null, expectedFactoryDate, initializedBeforeApplicationImport: true },
        target:
          "Compiled H5 with intercepted fixtures; does not validate Android runtime or physical devices",
        checks: [
          "登录标题/无模拟账号/RSA+AES请求按后端UTF8协议实际解密",
          "普通登录无服务器/clientId/RSA技术配置入口",
          "多企业按平台公开名称选择且未选择不默认000000、不发送登录请求",
          "认证401保留当前登录页和账号密码，不触发会话重定向",
          "登录后context暂时失败保留密码，恢复后可以再次提交",
          "五库独立库存",
          "真实调用格式/字符串ID和吨数",
          "五库人工入库结果详情",
          "原木两步返回保留输入/14档数量核验",
          "旋切人员必填不跳过",
          "烘干固定人工规格和离散选择",
          "整批出库确认一次",
          "UNKNOWN禁止普通重试",
          "核验取消无写入",
          "核验未出纸不自动补打",
          "明确补打一次",
          "H5不启动原生执行",
          "6页无水平溢出",
          "快速切换筛选后旧响应不覆盖最新结果",
          "仓库全部范围不发送起止日期并显示全量库存",
          "统计全部范围不发送起止日期并显示早期稀疏日明细",
          "来源按服务端同库批次显示50%且设备人工打码归机器",
          "表单首错滚动定位并聚焦数量",
          "顶部退出取消保留未保存输入",
          "浏览器返回取消保留未保存输入",
          "明确放弃表单不写库存",
          "摄像头不可用时精确业务单号查询并再次核对",
          "平板查询实际列表详情分栏且选择不跳路由",
          "窄屏选择仍进入详情路由",
          "工厂经理无平台细分权限时不显示删除补打",
          "主机服务端诊断显示授权资源和工厂队列且H5不造本机证据",
          "复位命令原因必填且二次确认取消无写入",
          "命令动作响应丢失只查询原结果不重新发布",
          "明确关闭追发不伪造设备ACK",
          "服务端结构化字段拒绝回显定位且保留全部输入",
          "打印配置离开取消保留修改",
          "采集规则弹窗取消保留输入并明确放弃",
          "人员编辑弹窗取消保留输入并明确放弃",
          "重试后执行记录仍能读取历史FAILED证据和人工原因",
          "机器烘干客户代码设备批次只读展示且NULL业务字段不造值",
          "数量来源渠道与打码方式分别显示设备人工打码仍属机器",
          "打印九状态均可筛选，新增状态向真实API传递精确状态码",
          "打印任务日期成对发送且全部范围省略日期，日期显示中文",
          "打印任务真实纸型尺寸目标打印机标签版次及审计时间可读",
          "H5无手填打印机入口且纸张字段拒绝保留输入与版本",
          "仓库打印配置未知保存仅只读核对后明确采用，不重复PUT",
          "缺data入库响应保留原输入与台账，只读取原结果而不重复建批",
          "我的页从manifest读取" + appVersion + "版本",
          "原木长度必填有提示且返回保留，码单方量只读预览不进入写入队列，入库只发送长度和根数",
          "机器追溯仅显示安全白名单设备主题事件接收时间规则触发数量换算",
          ...roleUiChecks,
        ],
        writes: writes.map((w) => ({
          path: w.routePath,
          requestKey: w.payload.requestKey,
        })),
        volumePreviewCount: volumePreviews.length,
        screenshots: [
          "login.png",
          "home.png",
          "detail.png",
          "print.png",
          "tablet-records.png",
          "machine-detail.png",
          "raw-volume-preview.png",
          "printer-config-readback.png",
          "global-role-members.png",
          "global-role-create.png",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "E2E PASS: " + (49 + roleUiChecks.length) + " acceptance checks, " +
      writes.length +
      " intercepted writes; no production API called.",
  );
  await browser.close();
  server.close();
})().catch(async (e) => {
  console.error(e);
  if (activePage)
    await activePage
      .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
      .catch(() => {});
  await activeBrowser?.close();
  server.close();
  process.exitCode = 1;
});
