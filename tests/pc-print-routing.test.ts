import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ApiError } from "../src/services/http";
import { pendingWrites, write } from "../src/services/journal";
import * as warehouses from "../src/domain/warehouse";
import { printSubmissionText } from "../src/domain/print-display";
import type { PrintJob } from "../src/domain/types";
import { installTestDeployment } from "./helpers/deployment";

function loadService(name: string, mocks: Record<string, unknown>) {
  const module = { exports: {} as any };
  const source = fs.readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: (name: string) => {
    if (!(name in mocks)) throw new Error("Unexpected import " + name);
    return mocks[name];
  } });
  return module.exports;
}

const form = { warehouseType: "RAW_WOOD", recordDate: "2026-10-27", quantity: "2", detail: {} };
const enabled = { warehouses: [{ warehouseType: "RAW_WOOD", serverManagedPrinting: true, executionMode: "PC_AGENT" }] };
function inboundHarness(capability: unknown = enabled) {
  const storage = new Map<string, unknown>(), requests: any[] = [], native: string[] = [];
  const session = { scope: "tenant-a:user-a:factory-1", currentScope() { return this.scope; } };
  let uncertain = false, capabilityCalls = 0;
  (globalThis as any).uni = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      requests.push(options.data);
      if (uncertain) options.fail({ errMsg: "timeout" });
      else options.success({ statusCode: 200, data: JSON.stringify({ code: 200, data: {
        id: "101", factoryId: "1", quantity: "2", warehouseType: "RAW_WOOD",
      } }) });
    },
  };
  installTestDeployment({ apiBaseUrl: "https://pc-print-test.invalid" });
  const service = loadService("inbound-print", {
    "../domain/warehouse": warehouses,
    "../stores/session": { useSession: () => session },
    "./http": { ApiError },
    "./journal": { pendingWrites },
    "./api": { api: {
      printAgentCapabilities: async () => {
        capabilityCalls++;
        if (capability instanceof Error) throw capability;
        return typeof capability === "function" ? capability(session) : capability;
      },
      create: (data: any) => write(session.currentScope(), "create:RAW_WOOD", "/inout/records", "POST", { ...data, factoryId: "1" }),
    } },
    "./device-print": {
      currentDefault: () => { native.push("default"); return { printerId: "301" }; },
      capturePrintOrigin: () => { native.push("origin"); return {}; },
      startInboundPrint: () => { native.push("print"); },
    },
  });
  return { service, session, requests, native, setUncertain: (value: boolean) => { uncertain = value; }, capabilityCalls: () => capabilityCalls };
}

test("显式启用PC的仓库提交SERVER入库，完全不访问本机打印", async () => {
  const h = inboundHarness();
  const result = await h.service.submitInbound(form);
  assert.equal(result.printingMode, "SERVER");
  assert.equal(h.requests[0].printingMode, "SERVER");
  assert.deepEqual(h.native, []);
  assert.equal(pendingWrites().length, 0);
});

test("未启用仓库或旧后端会阻止提交，不回退到手机打印", async () => {
  for (const capability of [{ warehouses: [] }, { warehouses: [{ warehouseType: "DRYING", serverManagedPrinting: true, executionMode: "PC_AGENT" }] }, new ApiError("旧后端", 404)]) {
    const h = inboundHarness(capability);
    await assert.rejects(h.service.submitInbound(form), /后台/);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.native, []);
  }
});

test("能力读取超时、无权限或响应异常均不提交入库且不降级native", async () => {
  for (const capability of [new ApiError("超时", "NETWORK"), new ApiError("无权访问", 403), new ApiError("不可用", 503), {}, { warehouses: [{ warehouseType: "RAW_WOOD", serverManagedPrinting: true }] }]) {
    const h = inboundHarness(capability);
    await assert.rejects(h.service.submitInbound(form));
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.native, []);
    assert.equal(pendingWrites().length, 0);
  }
});

test("待确认SERVER沿用原key，旧DEVICE或缺模式只保留证据而不重放", async () => {
  for (const originalMode of ["DEVICE", "SERVER", undefined]) {
    const h = inboundHarness(new ApiError("配置现在不可用", 503));
    const payload: any = { ...form, factoryId: "1" };
    if (originalMode !== undefined) payload.printingMode = originalMode;
    h.setUncertain(true);
    await assert.rejects(write(h.session.currentScope(), "create:RAW_WOOD", "/inout/records", "POST", payload));
    const original = pendingWrites()[0];
    h.setUncertain(false);
    assert.equal(h.capabilityCalls(), 0);
    if (originalMode === "SERVER") {
      await h.service.submitInbound(form);
      assert.equal(h.requests[1].requestKey, original.key);
      assert.equal(h.requests[1].printingMode, "SERVER");
      assert.equal(pendingWrites().length, 0);
    } else {
      await assert.rejects(h.service.submitInbound(form), /旧版待确认入库/);
      assert.equal(h.requests.length, 1);
      assert.equal(pendingWrites()[0].key, original.key);
      assert.equal(pendingWrites()[0].payload.printingMode, originalMode);
    }
    assert.deepEqual(h.native, []);
    assert.equal(h.capabilityCalls(), 0);
  }
});

test("配置读取期间换工厂阻止旧表单写入新工厂", async () => {
  const h = inboundHarness((session: any) => { session.scope = "tenant-a:user-a:factory-2"; return enabled; });
  await assert.rejects(h.service.submitInbound(form), /身份或工厂已变化/);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native, []);
});

test("SERVER入库响应丢失保留同模式待确认请求，不启动打印", async () => {
  const h = inboundHarness();
  h.setUncertain(true);
  await assert.rejects(h.service.submitInbound(form));
  assert.equal(pendingWrites()[0].payload.printingMode, "SERVER");
  assert.equal(pendingWrites()[0].uncertain, true);
  assert.deepEqual(h.native, []);
});

test("切换能力后修改未确认入库内容仍被journal拒绝，不能换key新建", async () => {
  const h = inboundHarness();
  h.setUncertain(true);
  await assert.rejects(write(h.session.currentScope(), "create:RAW_WOOD", "/inout/records", "POST", { ...form, factoryId: "1", printingMode: "DEVICE" }));
  const original = pendingWrites()[0];
  h.setUncertain(false);
  await assert.rejects(h.service.submitInbound({ ...form, quantity: "3" }), /旧版待确认入库/);
  assert.equal(h.requests.length, 1);
  assert.equal(pendingWrites()[0].key, original.key);
  assert.equal(pendingWrites()[0].payload.printingMode, "DEVICE");
  assert.equal(h.capabilityCalls(), 0);
  assert.equal(h.native.includes("print"), false);
});

function actionHarness(fail = false) {
  const cloud: any[] = [], native: string[] = [];
  const service = loadService("print-actions", {
    "./api": { api: { jobAction: async (...args: any[]) => { cloud.push(args); if (fail) throw new Error("云端不可用"); return { status: "QUEUED" }; } } },
    "./device-print": {
      retryDeviceJob: async () => { native.push("retry"); return { status: "SUBMITTED" }; },
      reprintOnDevice: async () => { native.push("reprint"); return { status: "SUBMITTED" }; },
    },
  });
  return { service, cloud, native };
}

test("PC_AGENT任务的重试与补打由后端处理", async () => {
  for (const executionMode of ["PC_AGENT"]) {
    const h = actionHarness(), job = { id: "401", executionMode };
    await h.service.retryPrintJob(job);
    await h.service.reprintJob(job, "501", "现场确认需要补打");
    assert.equal(h.cloud[0][1], "retry");
    assert.equal(h.cloud[1][1], "reprint");
    assert.equal(h.cloud[1][2].labelId, "501");
    assert.deepEqual(h.native, []);
  }
});

test("后端补打失败不转本机，未就绪标签和历史DEVICE任务不会触发出纸", async () => {
  const h = actionHarness(true), job = { id: "401", executionMode: "PC_AGENT" };
  await assert.rejects(h.service.reprintJob(job, "501", "需要补打"), /云端不可用/);
  await assert.rejects(h.service.reprintJob(job, "", "需要补打"), /就绪/);
  assert.equal(h.cloud.length, 1);
  assert.deepEqual(h.native, []);
  for (const executionMode of ["DEVICE", "HOST", undefined]) {
    await assert.rejects(h.service.retryPrintJob({ ...job, executionMode }), /旧版打印任务/);
    await assert.rejects(h.service.reprintJob({ ...job, executionMode }, "501", "需要补打"), /旧版打印任务/);
  }
  assert.deepEqual(h.native, []);
  assert.equal(h.cloud.length, 1);
});

test("电脑队列接受不显示为已确认出纸", () => {
  const text = printSubmissionText({ attempts: [{ attemptNo: 1, remoteStatus: { deliveryKind: "WINDOWS_SPOOL" } }] } as PrintJob);
  assert.match(text, /电脑的打印队列/);
  assert.match(text, /核对出纸/);
  assert.match(printSubmissionText({ executionMode: "PC_AGENT" } as PrintJob), /电脑的打印队列/);
});

const submittedPc = () => ({ id: "401", status: "SUBMITTED", executionMode: "PC_AGENT", version: 7,
  attempts: [{ attemptNo: 1, remoteStatus: { deliveryKind: "WINDOWS_SPOOL" } }] });

test("确认已出纸允许空核验依据，填写时仍保留去除首尾空格后的原文", async () => {
  for (const status of ["SUBMITTED", "UNKNOWN"]) {
    for (const reason of ["", "  ", "  现场已核对纸张  "]) {
      const h = actionHarness();
      await h.service.verifyPrintJob({ ...submittedPc(), status }, "PRINTED", reason);
      assert.equal(h.cloud.length, 1);
      assert.equal(h.cloud[0][1], "verify");
      assert.equal(h.cloud[0][2].verificationResult, "PRINTED");
      assert.equal(h.cloud[0][2].reason, reason.trim());
      assert.equal(h.cloud[0][2].queueCancelledAndNotPrinted, undefined);
      assert.deepEqual(h.native, []);
    }
  }
});

test("未出纸和仍不明确保留必填依据校验，核验结果不能留空", async () => {
  const h = actionHarness();
  for (const status of ["SUBMITTED", "UNKNOWN"])
    for (const result of ["NOT_PRINTED", "UNRESOLVED"])
      await assert.rejects(h.service.verifyPrintJob({ ...submittedPc(), status }, result, "  ", true), /核验依据/);
  await assert.rejects(h.service.verifyPrintJob(submittedPc(), "", ""), /请选择纸张核验结果/);
  assert.equal(h.cloud.length, 0);
});

test("PC未出纸核验必须有最新Windows回执、清空队列确认和非空依据", async () => {
  const h = actionHarness(), job = submittedPc();
  assert.equal(h.service.canConfirmPcNotPrinted(job), true);
  await assert.rejects(h.service.verifyPrintJob(job, "NOT_PRINTED", "队列已取消，现场没有纸张", false), /取消Windows队列/);
  await assert.rejects(h.service.verifyPrintJob(job, "NOT_PRINTED", "  ", true), /核验依据/);
  assert.equal(h.cloud.length, 0);
  await h.service.verifyPrintJob(job, "NOT_PRINTED", "  队列已取消，现场核对人张师傅确认未出纸  ", true);
  assert.equal(h.cloud.length, 1);
  assert.equal(h.cloud[0][1], "verify");
  assert.equal(h.cloud[0][2].verificationResult, "NOT_PRINTED");
  assert.equal(h.cloud[0][2].queueCancelledAndNotPrinted, true);
  assert.equal(h.cloud[0][2].reason, "队列已取消，现场核对人张师傅确认未出纸");
  assert.deepEqual(h.native, []);
});

test("IPP、DEVICE、缺回执以及旧Windows回执不能放开SUBMITTED未出纸核验", async () => {
  const base = submittedPc();
  for (const job of [
    { ...base, executionMode: "HOST" },
    { ...base, executionMode: "DEVICE" },
    { ...base, attempts: [] },
    { ...base, attempts: [{ attemptNo: 1, remoteStatus: { deliveryKind: "RAW_TCP" } }] },
    { ...base, attempts: [...base.attempts, { attemptNo: 2, remoteStatus: { deliveryKind: "RAW_TCP" } }] },
  ]) {
    const h = actionHarness();
    assert.equal(h.service.canConfirmPcNotPrinted(job), false);
    await assert.rejects(h.service.verifyPrintJob(job, "NOT_PRINTED", "现场核验", true), /仍可能排队/);
    assert.equal(h.cloud.length, 0);
    assert.deepEqual(h.native, []);
  }
});

test("已打印或仍不明确不附加清空队列声明，UNKNOWN保留原人工核验规则", async () => {
  const h = actionHarness();
  for (const result of ["PRINTED", "UNRESOLVED"])
    await h.service.verifyPrintJob(submittedPc(), result, "人工核验依据", false);
  await h.service.verifyPrintJob({ ...submittedPc(), status: "UNKNOWN" }, "NOT_PRINTED", "现场确认未出纸", false);
  assert.equal(h.cloud.length, 3);
  for (const call of h.cloud) assert.equal(call[2].queueCancelledAndNotPrinted, undefined);
  assert.deepEqual(h.native, []);
});

test("队列接收自动完成后拒绝过时的逐单确认请求", async () => {
  const h = actionHarness();
  await assert.rejects(h.service.verifyPrintJob({ ...submittedPc(), status: "COMPLETED", completionBasis: "WINDOWS_QUEUE_ACCEPTED" }, "PRINTED", ""), /无需人工核验/);
  assert.equal(h.cloud.length, 0);
});
