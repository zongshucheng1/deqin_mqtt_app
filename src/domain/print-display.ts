import { chineseDate } from "./format";
import type { PrintJob } from "./types";
import { printStatusLabels } from "./warehouse";

export function isWindowsQueueAccepted(job: PrintJob): boolean {
  return job.executionMode === "PC_AGENT" &&
    ["INITIAL", "REPRINT"].includes(job.jobKind) &&
    job.status === "COMPLETED" && job.completionBasis === "WINDOWS_QUEUE_ACCEPTED";
}

export function printStatusText(job: PrintJob): string {
  return isWindowsQueueAccepted(job) ? "已提交打印" : printStatusLabels[job.status] || job.status;
}

export function printCompletionText(job: PrintJob): string {
  if (isWindowsQueueAccepted(job)) return "Windows 打印队列已接收，无需逐单确认";
  return job.completionBasis === "MANUAL_CONFIRMED" ? "人工核验" :
    job.completionBasis === "PRINTER_CONFIRMED" ? "打印机确认" : "服务器确认记录";
}

function queueObservation(job: PrintJob) {
  if (job.executionMode !== "PC_AGENT" ||
      !(["SUBMITTED", "UNKNOWN"].includes(job.status) || isWindowsQueueAccepted(job))) return;
  const latest = job.attempts?.reduce((current, attempt) =>
    !current || attempt.attemptNo > current.attemptNo ? attempt : current,
    undefined as NonNullable<PrintJob["attempts"]>[number] | undefined);
  // A detail response with an attempt is authoritative over an older list projection.
  const value = latest ? latest.remoteStatus?.observation : job.autoVerification;
  return typeof value?.state === "string" && value.state.trim() ? value : undefined;
}

export function printQueueObservationText(job: PrintJob): string {
  const observation = queueObservation(job);
  if (!observation) return "";
  if (observation.state === "ATTENTION_REQUIRED") {
    const flags = observation.statusFlags || 0;
    const reasons = [flags & 0x40 ? "缺纸" : "", flags & 0x20 ? "离线" : "",
      flags & 0x200 ? "驱动无法打印" : ""].filter(Boolean);
    return reasons.length ? reasons.join("、") + "，等待处理" : "打印机异常，等待处理";
  }
  return ({
    QUEUED: "电脑队列排队中", SPOOLING: "正在准备打印数据", PRINTING: "正在打印",
    PAUSED: "打印已暂停", SENT_TO_PRINTER: "已发送到打印机", SPOOLER_REPORTED_PRINTED: "驱动报告完成",
    DELETED: "队列任务已删除，出纸结果不明", NOT_FOUND: "队列任务已消失，出纸结果不明",
    IDENTITY_MISMATCH: "队列任务身份不符", QUERY_FAILED: "暂时无法读取打印队列",
    TIMED_OUT: "打印状态跟踪超时", NO_SPOOL_ID: "缺少队列编号，结果无法确认",
  } as Record<string, string>)[observation.state] || "无法识别客户端队列状态";
}

export function printNeedsAttention(job: PrintJob): boolean {
  const state = queueObservation(job)?.state;
  return !!job.lastError || job.status === "UNKNOWN" || !!state &&
    !["QUEUED", "SPOOLING", "PRINTING", "SENT_TO_PRINTER", "SPOOLER_REPORTED_PRINTED"].includes(state);
}

export function printSubmissionText(job: PrintJob): string {
  if (isWindowsQueueAccepted(job))
    return "标签已提交到工厂电脑的打印队列，无需逐单确认。提交不代表实际出纸；如需再打印，可在 APP 中明确补打或生成新版本。";
  const latest = job.attempts?.reduce((current, attempt) =>
    !current || attempt.attemptNo > current.attemptNo ? attempt : current,
  undefined as NonNullable<PrintJob["attempts"]>[number] | undefined);
  if (job.executionMode === "PC_AGENT" || latest?.remoteStatus?.deliveryKind === "WINDOWS_SPOOL")
    return "标签已提交到工厂电脑的打印队列，请核对出纸；暂不能重复发送。";
  return ["USB_BYTES", "RAW_TCP"].includes(latest?.remoteStatus?.deliveryKind || "")
    ? "标签数据已发送，请核对出纸；暂不能重复发送。"
    : "打印机已接受，等待可靠完成依据；暂不能重复发送。";
}

export function printPaper(job: PrintJob): string {
  const code = job.paperCode || "纸型未提供";
  return job.paperWidthMm != null && job.paperHeightMm != null
    ? `${code} · ${job.paperWidthMm} × ${job.paperHeightMm} mm`
    : `${code} · 尺寸未提供`;
}
/** Platform createTime is an audit-local DATETIME, never reinterpret it as UTC. */
export function printCreatedAt(job: PrintJob): string {
  if (!job.createTime) return "未提供";
  return /^\d{4}-\d{2}-\d{2}(?:[ T]|$)/.test(job.createTime)
    ? chineseDate(job.createTime.slice(0, 10)) +
        job.createTime.slice(10).replace(/^T/, " ")
    : job.createTime;
}
