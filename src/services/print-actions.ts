import type { PrintJob } from "../domain/types";
import { api } from "./api";

export function canConfirmPcNotPrinted(job: PrintJob): boolean {
  const latest = job.attempts?.reduce((current, attempt) =>
    !current || attempt.attemptNo > current.attemptNo ? attempt : current,
    undefined as NonNullable<PrintJob["attempts"]>[number] | undefined);
  return job.status === "SUBMITTED" && job.executionMode === "PC_AGENT" &&
    latest?.remoteStatus?.deliveryKind === "WINDOWS_SPOOL";
}

export async function verifyPrintJob(job: PrintJob, result: string, reason: string, queueCancelledAndNotPrinted = false) {
  if (!["SUBMITTED", "UNKNOWN"].includes(job.status)) throw new Error("当前任务无需人工核验，请刷新打印状态");
  if (!["PRINTED", "NOT_PRINTED", "UNRESOLVED"].includes(result)) throw new Error("请选择纸张核验结果");
  if (result !== "PRINTED" && !reason.trim()) throw new Error("请填写现场核验依据");
  const extra: Record<string, unknown> = { verificationResult: result, reason: reason.trim() };
  if (job.status === "SUBMITTED" && result === "NOT_PRINTED") {
    if (!canConfirmPcNotPrinted(job)) throw new Error("此任务仍可能排队，不能直接确认未出纸");
    if (!queueCancelledAndNotPrinted) throw new Error("请先取消Windows队列中的待打印任务，并确认现场未出纸");
    extra.queueCancelledAndNotPrinted = true;
  }
  return api.jobAction(job, "verify", extra);
}

export async function retryPrintJob(job: PrintJob) {
  if (job.executionMode !== "PC_AGENT")
    throw new Error("此为旧版打印任务，请先在后台核对；当前打印统一由电脑客户端执行");
  return api.jobAction(job, "retry");
}

export async function reprintJob(job: PrintJob, labelId: string, reason: string) {
  if (!labelId) throw new Error("请先选择已就绪的标签版本");
  if (job.executionMode !== "PC_AGENT")
    throw new Error("此为旧版打印任务，请先在后台核对并安排补打，勿重复入库");
  return api.jobAction(job, "reprint", { labelId, reason });
}
