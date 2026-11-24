import test from "node:test";
import assert from "node:assert/strict";
import {
  isWindowsQueueAccepted, printStatusText, printCompletionText, printSubmissionText,
  printQueueObservationText, printNeedsAttention,
} from "../src/domain/print-display";
import type { PrintJob, PrintObservation } from "../src/domain/types";

const accepted = (): PrintJob => ({
  id: "401", recordId: "301", labelId: "501", printerId: "201", warehouseType: "RAW_WOOD",
  recordNo: "R1", status: "COMPLETED", executionMode: "PC_AGENT", jobKind: "INITIAL",
  copies: 1, version: 3, completionBasis: "WINDOWS_QUEUE_ACCEPTED",
});
const observation = (state: string, statusFlags = 0): PrintObservation => ({
  state, statusFlags, sequence: 1, observedAtMs: 1793580000000, printerName: "GP-1934T",
  physicalCompletionConfirmed: false,
});

test("电脑队列接收完成显示已提交打印并免逐单确认，不冒充出纸", () => {
  const job = accepted();
  assert.equal(isWindowsQueueAccepted(job), true);
  assert.equal(printStatusText(job), "已提交打印");
  assert.match(printCompletionText(job), /Windows 打印队列已接收/);
  assert.match(printSubmissionText(job), /无需逐单确认/);
  assert.match(printSubmissionText(job), /提交不代表实际出纸/);
  assert.doesNotMatch(printSubmissionText(job), /请核对出纸|暂不能重复发送/);
  assert.equal(printNeedsAttention(job), false);
});

test("显式补打与首次打印使用同一队列提交完成语义", () => {
  const job = { ...accepted(), jobKind: "REPRINT" as const };
  assert.equal(isWindowsQueueAccepted(job), true);
  assert.equal(printStatusText(job), "已提交打印");
});

test("UNKNOWN或无完成依据不能仅凭队列观测变为免确认", () => {
  for (const job of [
    { ...accepted(), status: "UNKNOWN" as const, autoVerification: observation("SPOOLER_REPORTED_PRINTED") },
    { ...accepted(), status: "SUBMITTED" as const, autoVerification: observation("NOT_FOUND") },
    { ...accepted(), completionBasis: undefined },
  ]) {
    assert.equal(isWindowsQueueAccepted(job), false);
    assert.notEqual(printStatusText(job), "已提交打印");
  }
  const job = { ...accepted(), status: "UNKNOWN" as const };
  assert.equal(printStatusText(job), "结果待核验");
  assert.equal(printNeedsAttention(job), true);
});

test("首次配置TEST、DEVICE及人工出纸确认不被新标准覆盖", () => {
  for (const job of [
    { ...accepted(), jobKind: "TEST" as const },
    { ...accepted(), executionMode: "DEVICE" as const },
    { ...accepted(), executionMode: "HOST" as const },
    { ...accepted(), completionBasis: "MANUAL_CONFIRMED" },
    { ...accepted(), completionBasis: "PRINTER_CONFIRMED" },
  ]) assert.equal(isWindowsQueueAccepted(job), false);
  assert.equal(printCompletionText({ ...accepted(), completionBasis: "MANUAL_CONFIRMED" }), "人工核验");
  assert.equal(printCompletionText({ ...accepted(), completionBasis: "PRINTER_CONFIRMED" }), "打印机确认");
});

test("队列提交完成后的缺纸离线仍突出显示且保持提交依据", () => {
  const job = { ...accepted(), autoVerification: observation("ATTENTION_REQUIRED", 0x40 | 0x20) };
  assert.equal(printStatusText(job), "已提交打印");
  assert.equal(printQueueObservationText(job), "缺纸、离线，等待处理");
  assert.equal(printNeedsAttention(job), true);
  assert.equal(job.status, "COMPLETED");
  assert.equal(job.autoVerification.physicalCompletionConfirmed, false);
});

test("任务消失删除或跟踪失败只展示观察，不冒充打印失败或已出纸", () => {
  for (const state of ["DELETED", "NOT_FOUND", "QUERY_FAILED", "TIMED_OUT", "IDENTITY_MISMATCH", "UNRECOGNIZED"]) {
    const job = { ...accepted(), autoVerification: observation(state) };
    assert.equal(printNeedsAttention(job), true);
    assert.ok(printQueueObservationText(job));
    assert.equal(printStatusText(job), "已提交打印");
  }
});

test("最新尝试状态优先，旧尝试或过时列表观察不得覆盖", () => {
  const job: PrintJob = { ...accepted(), autoVerification: observation("ATTENTION_REQUIRED", 0x40), attempts: [
    { id: "2", attemptNo: 2, status: "SUBMITTED", sendPhase: "ACCEPTED", remoteStatus: { deliveryKind: "WINDOWS_SPOOL", observation: observation("PRINTING") } },
    { id: "1", attemptNo: 1, status: "UNKNOWN", sendPhase: "MAY_HAVE_SENT", remoteStatus: { observation: observation("ATTENTION_REQUIRED", 0x40) } },
  ] };
  assert.equal(printQueueObservationText(job), "正在打印");
  assert.equal(printNeedsAttention(job), false);
  delete job.attempts![0].remoteStatus!.observation;
  assert.equal(printQueueObservationText(job), "");
});

test("不把DEVICE或新发送阶段的历史队列观察显示为当前状态", () => {
  assert.equal(printQueueObservationText({ ...accepted(), executionMode: "DEVICE", autoVerification: observation("PRINTING") }), "");
  assert.equal(printQueueObservationText({ ...accepted(), status: "QUEUED", autoVerification: observation("ATTENTION_REQUIRED", 0x40) }), "");
});
