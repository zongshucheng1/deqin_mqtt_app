<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, computed, onUnmounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AppIcon from "../../components/AppIcon.vue";
import AsyncState from "../../components/AsyncState.vue";
import PeriodPicker from "../../components/PeriodPicker.vue";
import { api } from "../../services/api";
import { useSession } from "../../stores/session";
import { useFactoryDate } from "../../composables/factory-date";
import { usePage, go, errorText, toast, confirm } from "../../composables/page";
import type { PrintJob, Warehouse } from "../../domain/types";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
import {
  retryPrintJob,
  reprintJob,
  verifyPrintJob,
  canConfirmPcNotPrinted,
} from "../../services/print-actions";
import {
  timeText,
  chineseDate,
  periodRange,
  type Period,
} from "../../domain/format";
import {
  printPaper,
  printCreatedAt,
  printSubmissionText,
  isWindowsQueueAccepted,
  printStatusText,
  printCompletionText,
  printQueueObservationText,
  printNeedsAttention,
} from "../../domain/print-display";
import {
  warehouses,
  warehouse,
  printStatusLabels,
} from "../../domain/warehouse";
const calendar = useFactoryDate();
const jobs = ref<PrintJob[]>([]),
  total = ref(0),
  page = ref(1),
  kind = ref<Warehouse | "">(""),
  recordId = ref(""),
  status = ref(""),
  period = ref<Period>("全部"),
  date = calendar.date,
  busy = ref(false),
  actionError = ref(""),
  selected = ref<PrintJob>(),
  dialog = ref<"verify" | "reprint" | "">(""),
  result = ref(""),
  queueCancelledAndNotPrinted = ref(false),
  reason = ref(""),
  labelChoice = ref(""),
  latestLabelId = ref(""),
  filters = [
    ["", "全部状态"],
    ["WAITING_LABEL", "等待标签"],
    ["QUEUED", "排队"],
    ["WAITING_PRINTER", "等待打印机"],
    ["PREPARING", "准备中"],
    ["SENDING", "发送中"],
    ["SUBMITTED", "已提交，等待结果"],
    ["UNKNOWN", "待核验"],
    ["FAILED", "发送前失败"],
    ["COMPLETED", "已完成处理（含已提交打印）"],
    ["CANCELLED", "已取消"],
  ];
const options = [{ code: "", name: "全部仓库" }, ...warehouses];
const filtersOpen = ref(false);
const filterCount = computed(
  () =>
    Number(!!kind.value) +
    Number(!!status.value) +
    Number(period.value !== "全部"),
);
const filterSummary = computed(() => {
  const range = periodRange(period.value, date.value);
  const dates = !range.startDate
    ? "全部日期"
    : range.startDate === range.endDate
      ? chineseDate(range.startDate)
      : `${chineseDate(range.startDate)} — ${chineseDate(range.endDate!)}`;
  return [
    options.find((option) => option.code === kind.value)?.name,
    filters.find(([value]) => value === status.value)?.[1],
    dates,
  ].join(" · ");
});
const emptyTitle = computed(() =>
  filterCount.value
    ? "没有符合筛选条件的任务"
    : recordId.value
      ? "本批次暂无打印任务"
      : "暂无打印任务",
);
const emptyDescription = computed(() =>
  filterCount.value
    ? `${recordId.value ? "当前批次下未找到匹配的任务。" : ""}试试调整仓库、任务状态或创建日期。`
    : recordId.value
      ? "前往批次详情查看或生成电脑标签，由后台分配到工厂电脑打印。"
      : "所有仓库的打印任务由后台统一分配，执行状态和核验记录会显示在这里。",
);
async function resetFilters() {
  kind.value = "";
  status.value = "";
  period.value = "全部";
  calendar.reset();
  await refresh();
}
async function viewAllTasks() {
  recordId.value = "";
  await resetFilters();
}
function startPrint() {
  if (filterCount.value) {
    resetFilters();
  } else if (recordId.value) {
    go("detail", "id=" + encodeURIComponent(recordId.value));
  } else {
    go("records");
  }
}
const historyOpen = ref(false),
  historyLoading = ref(false),
  historyError = ref(""),
  historyJob = ref<PrintJob>();
const phases: Record<string, string> = {
  BEFORE_SEND: "明确发送前",
  MAY_HAVE_SENT: "可能已经发送",
  ACCEPTED: "远端已接受",
  CONFIRMED: "有完成依据",
};
const historyOperations: Record<string, string> = {
  PRINT_RETRY: "重试原打印任务",
  PRINT_CANCEL: "取消待发任务",
  PRINT_VERIFY: "核验纸张结果",
};
let historyGeneration = 0;
onUnmounted(() => {
  historyGeneration++;
});
async function showHistory(job: PrintJob) {
  const generation = ++historyGeneration,
    scope = session.currentScope();
  historyOpen.value = true;
  historyLoading.value = true;
  historyError.value = "";
  historyJob.value = undefined;
  try {
    const detail = await api.job(job.id);
    if (generation === historyGeneration && scope === session.currentScope())
      historyJob.value = {
        ...job,
        ...detail,
        recordNo: detail.recordNo || job.recordNo,
        warehouseType: detail.warehouseType || job.warehouseType,
      };
  } catch (e) {
    if (generation === historyGeneration && scope === session.currentScope())
      historyError.value = errorText(e);
  } finally {
    if (generation === historyGeneration) historyLoading.value = false;
  }
}
onLoad((q) => {
  recordId.value = String(q?.recordId || "");
});
const session = useSession();
const dirty = computed(
  () =>
    !!dialog.value &&
    (!!reason.value ||
      !!result.value ||
      queueCancelledAndNotPrinted.value ||
      (dialog.value === "reprint" &&
        labelChoice.value !== selected.value?.labelId)),
);
const exit = useUnsavedExit(dirty, busy);
async function closeDialog() {
  if (!(await exit.allowLeave())) return;
  dialog.value = "";
  exit.reset();
}
const back = useGuardedBack(exit, dirty, busy, {
  isOpen: () => !!dialog.value || historyOpen.value,
  close: async () => {
    if (historyOpen.value) {
      historyOpen.value = false;
      historyGeneration++;
    } else await closeDialog();
  },
});
const verificationChoices = computed(() =>
  [
    ["PRINTED", "确认已出纸"],
    ["NOT_PRINTED", "确认未出纸"],
    ["UNRESOLVED", "仍不明确"],
  ].filter(
    ([value]) =>
      selected.value?.status !== "SUBMITTED" ||
      value !== "NOT_PRINTED" ||
      canConfirmPcNotPrinted(selected.value),
  ),
);
const reasonRequired = computed(
  () => dialog.value !== "verify" || result.value !== "PRINTED",
);
const query = () => ({
  warehouseType: kind.value || undefined,
  recordId: recordId.value || undefined,
  status: status.value || undefined,
  ...periodRange(period.value, date.value),
});
let appliedQuery = query();
const { loading, error, refresh, revision } = usePage(async () => {
  calendar.sync(session.currentScope(), session.factory?.timezone);
  if (exit.accepted) {
    dialog.value = "";
    reason.value = "";
    result.value = "";
  }
  exit.reset();
  page.value = 1;
  appliedQuery = query();
  const r = await api.jobs(appliedQuery);
  jobs.value = r.rows;
  total.value = r.total;
});
async function more() {
  if (busy.value) return;
  const generation = revision.value;
  busy.value = true;
  try {
    const r = await api.jobs({
      ...appliedQuery,
      pageNum: page.value + 1,
    });
    if (generation !== revision.value) return;
    jobs.value.push(...r.rows);
    page.value++;
  } catch (e) {
    if (generation === revision.value) actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function act(job: PrintJob, action: "retry" | "cancel") {
  if (busy.value) return;
  if (
    !(await confirm(
      action === "retry" ? "重试发送前失败任务" : "取消尚未发送任务",
      action === "retry"
        ? "保留原任务和发送证据，由服务器检查是否确实未发送。确认继续？"
        : "取消仅限服务器确认尚未进入发送的任务。确认继续？",
    ))
  )
    return;
  busy.value = true;
  actionError.value = "";
  try {
    if (action === "retry") await retryPrintJob(job);
    else await api.jobAction(job, action);
    toast("操作已确认");
    await refresh();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function open(job: PrintJob, type: "verify" | "reprint") {
  if (busy.value) return;
  actionError.value = "";
  if (type === "verify") {
    // The list omits attempt receipts; verify against a fresh job and its current Windows evidence.
    const scope = session.currentScope();
    busy.value = true;
    try {
      job = await api.job(job.id);
      if (scope !== session.currentScope()) return;
    } catch (e) {
      actionError.value = errorText(e);
      return;
    } finally {
      busy.value = false;
    }
    if (!["SUBMITTED", "UNKNOWN"].includes(job.status)) {
      await refresh();
      actionError.value = "任务状态已更新，当前无需人工核验";
      return;
    }
  }
  exit.reset();
  selected.value = job;
  dialog.value = type;
  reason.value = "";
  result.value = "";
  queueCancelledAndNotPrinted.value = false;
  labelChoice.value = job.labelId || "";
  latestLabelId.value = "";
  actionError.value = "";
  if (type === "reprint") {
    try {
      const label = await api.latestLabel(job.recordId);
      if (label.status === "READY") latestLabelId.value = label.id;
    } catch {
      /* Original immutable label can still be explicitly chosen. */
    }
  }
}
async function submit() {
  if (!selected.value || busy.value) return;
  if (dialog.value === "verify" && !result.value) {
    actionError.value = "请选择纸张核验结果";
    return;
  }
  if (reasonRequired.value && !reason.value.trim()) {
    actionError.value =
      dialog.value === "verify" ? "请填写核验依据" : "请填写补打原因";
    return;
  }
  busy.value = true;
  actionError.value = "";
  try {
    if (dialog.value === "reprint") {
      await reprintJob(selected.value, labelChoice.value, reason.value.trim());
    } else
      await verifyPrintJob(
        selected.value,
        result.value,
        reason.value,
        queueCancelledAndNotPrinted.value,
      );
    dialog.value = "";
    toast("操作已确认");
    await refresh();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AppShell title="打印中心" back :back-handler="back"
    ><template #right
      ><button v-if="session.worker" class="link" @click="go('printers')">
        工厂打印状态
      </button></template
    ><view v-if="recordId" class="print-scope"
      ><view
        ><text class="print-scope-label">查看范围</text
        ><view class="print-scope-title">当前批次</view></view
      ><button class="link" @click="viewAllTasks">查看全部任务</button></view
    ><view class="print-list-heading"
      ><view class="print-list-context"
        ><view class="row-start"
          ><text class="print-list-title">打印任务</text
          ><text v-if="!loading && !error" class="print-total"
            >{{ total }} 个</text
          ></view
        ><view class="print-filter-summary">{{ filterSummary }}</view></view
      ><button
        class="print-filter-toggle"
        :class="{ active: filtersOpen || filterCount }"
        :aria-expanded="filtersOpen"
        aria-controls="print-filters"
        @click="filtersOpen = !filtersOpen"
      >
        {{ filtersOpen ? "收起筛选" : "筛选"
        }}{{ filterCount ? ` (${filterCount})` : "" }}
      </button></view
    ><view v-if="filtersOpen" id="print-filters" class="panel print-filters"
      ><view class="row print-filter-heading"
        ><text>任务筛选</text
        ><button class="link" @click="resetFilters">重置条件</button></view
      ><picker
        :range="options"
        range-key="name"
        :value="options.findIndex((o) => o.code === kind)"
        @change="
          kind = options[Number($event.detail.value)].code as Warehouse | '';
          refresh();
        "
        ><view class="input-box picker-value"
          ><text class="picker-label">{{ options.find((o) => o.code === kind)?.name }}</text
          ><AppArrow /></view
        ></picker
      ><view class="chip-row"
        ><button
          v-for="[s, label] in filters"
          :key="s"
          class="chip"
          :class="{ active: status === s }"
          @click="
            status = s;
            refresh();
          "
        >
          {{ label }}
        </button></view
      ><PeriodPicker
        v-model:period="period"
        v-model:date="date"
        all-label="全部任务创建日期"
        @change="refresh"
      />
      <view class="subtext center" style="margin: 10px 0 16px"
        >按打印任务创建日期筛选，与入库业务日期独立。</view
      ></view
    >
    <AsyncState :loading="loading" :error="error" @retry="refresh"
      ><view v-if="!jobs.length" class="print-empty" role="status"
        ><view class="print-empty-icon" aria-hidden="true"
          ><AppIcon name="print" :size="42" color="#65c7df" /></view
        ><view class="print-empty-title">{{ emptyTitle }}</view
        ><view class="print-empty-description">{{ emptyDescription }}</view
        ><button class="primary print-empty-action" @click="startPrint">
          {{
            filterCount
              ? "清除筛选条件"
              : recordId
                ? "查看批次并打印"
                : "选择入库批次"
          }}
        </button></view
      ><view v-for="job in jobs" :key="job.id" class="panel"
        ><view class="row"
          ><text class="record-title"
            >{{ warehouse(job.warehouseType).name }} · {{ job.recordNo }}</text
          ><text
            class="tag"
            :class="{
              amber: ['UNKNOWN', 'SENDING', 'SUBMITTED'].includes(job.status) || printNeedsAttention(job),
              red: job.status === 'FAILED',
              gray: job.status === 'CANCELLED',
            }"
            >{{ printStatusText(job) }}</text
          ></view
        ><view class="record-meta"
          >{{ job.jobKind === "REPRINT" ? "明确补打" : "首次打印" }} ·
          {{ job.copies }} 份{{
            job.labelRevision ? " · 标签版本" + job.labelRevision : ""
          }}</view
        ><view class="record-meta safe-word"
          >目标打印机：{{
            job.printerName ||
            (job.printerId ? "打印机 " + job.printerId : "未提供")
          }}</view
        ><view class="record-meta">纸张：{{ printPaper(job) }}</view
        ><view class="record-meta">创建时间：{{ printCreatedAt(job) }}</view
        ><view v-if="job.lastError" class="notice amber">{{
          job.lastError
        }}</view
        ><view v-if="job.status === 'SUBMITTED' || isWindowsQueueAccepted(job)" class="subtext">{{
          printSubmissionText(job)
        }}</view
        ><view v-if="printQueueObservationText(job)" class="notice" :class="{ amber: printNeedsAttention(job) }"
          >队列跟踪：{{ printQueueObservationText(job) }}</view
        ><view v-if="job.status === 'SENDING'" class="subtext"
          >任务可能已经发送；断线后应核验结果。</view
        ><view v-if="job.status === 'COMPLETED'" class="subtext"
          >完成依据：{{
            printCompletionText(job)
          }}</view
        ><view class="button-row" style="margin-bottom: 0"
          ><button class="secondary" @click="showHistory(job)">执行记录</button
          ><button
            class="secondary"
            @click="go('detail', 'id=' + job.recordId)"
          >
            查看批次</button
          ><button
            v-if="
              ['WAITING_LABEL', 'QUEUED', 'WAITING_PRINTER', 'FAILED'].includes(
                job.status,
              )
            "
            class="secondary"
            :disabled="busy"
            @click="act(job, 'cancel')"
          >
            取消任务</button
          ><button
            v-if="job.status === 'FAILED' && job.executionMode === 'PC_AGENT'"
            class="primary"
            :disabled="busy"
            @click="act(job, 'retry')"
          >
            重试原任务</button
          ><button
            v-if="
              session.manager && ['UNKNOWN', 'SUBMITTED'].includes(job.status)
            "
            class="primary"
            @click="open(job, 'verify')"
          >
            核验纸张结果</button
          ><button
            v-if="
              session.can('inout:print:reprint') &&
              job.executionMode === 'PC_AGENT' &&
              (job.status === 'COMPLETED' ||
                job.status === 'CANCELLED' ||
                (job.status === 'UNKNOWN' &&
                  job.verificationResult === 'NOT_PRINTED'))
            "
            class="secondary"
            @click="open(job, 'reprint')"
          >
            明确补打
          </button></view
        ></view
      ><button
        v-if="jobs.length < total"
        class="load-more"
        :disabled="busy"
        @click="more"
      >
        加载更多
      </button></AsyncState
    ><view v-if="actionError && !dialog" class="error-box">{{
      actionError
    }}</view
    ><view v-if="dialog" class="modal-mask"
      ><view class="modal"
        ><view class="modal-title">{{
          dialog === "verify" ? "核验实际出纸结果" : "明确创建补打任务"
        }}</view
        ><template v-if="dialog === 'verify'"
          ><view class="subtext"
            >请结合现场纸张、打印机任务记录和扫码结果选择。</view
          ><view class="chip-row"
            ><button
              v-for="[value, label] in verificationChoices"
              :key="value"
              class="chip"
              :class="{ active: result === value }"
              @click="result = value"
            >
              {{ label }}
            </button></view
          ><view
            v-if="selected && canConfirmPcNotPrinted(selected)"
            class="notice amber"
          >
            确认未出纸前，请在工厂电脑的Windows打印队列中取消本标签所有待打印任务，确认任务已移除，再现场核对纸张。仍在队列中或结果不明确时，请选择“仍不明确”。核验不会自动补打。 </view
          ><view v-else class="notice amber">{{
            selected?.status === "SUBMITTED"
              ? "打印机已接受的任务仍可能排队，不能直接认定未出纸；请先在打印机端取消并由主机核查终态。"
              : "确认未出纸只记录核验结论，需再次明确补打才会创建新任务。取消不改变队列。"
          }}</view
          ><button
            v-if="
              selected &&
              canConfirmPcNotPrinted(selected) &&
              result === 'NOT_PRINTED'
            "
            class="secondary"
            :aria-pressed="queueCancelledAndNotPrinted"
            :disabled="busy"
            @click="queueCancelledAndNotPrinted = !queueCancelledAndNotPrinted"
          >
            {{ queueCancelledAndNotPrinted ? "☑" : "☐" }}
            已取消Windows队列任务并确认未出纸
          </button></template
        ><template v-else
          ><view class="notice amber"
            >补打关联原任务和同一批次，不重新入库。请先确认现场需要。</view
          ><view class="chip-row"
            ><button
              v-if="selected?.labelId"
              class="chip"
              :class="{ active: labelChoice === selected?.labelId }"
              @click="labelChoice = selected!.labelId || ''"
            >
              原任务标签</button
            ><button
              v-if="latestLabelId && latestLabelId !== selected?.labelId"
              class="chip"
              :class="{ active: labelChoice === latestLabelId }"
              @click="labelChoice = latestLabelId"
            >
              最新就绪标签
            </button></view
          ></template
        ><view class="field"
          ><text class="field-label"
            >{{ dialog === "verify" ? "核验依据" : "补打原因" }}{{
              reasonRequired ? " *" : "（选填）"
            }}</text
          ><view class="input-box">
            <textarea
              v-model="reason"
              auto-height
              maxlength="500"
            /></view></view
        ><view
          v-if="
            selected &&
            canConfirmPcNotPrinted(selected) &&
            result === 'NOT_PRINTED'
          "
          class="subtext"
          >核验依据请填写队列任务取消情况、现场纸张核查结果及核对人。确认后如需打印，请另外选择明确补打。</view
        ><view v-if="actionError" class="error-text">{{ actionError }}</view
        ><view class="button-row"
          ><button class="secondary" :disabled="busy" @click="closeDialog">
            取消</button
          ><button
            class="primary"
            :disabled="busy"
            :loading="busy"
            @click="submit"
          >
            确认{{ dialog === "verify" ? "核验" : "补打" }}
          </button></view
        ></view
      ></view
    ><view v-if="historyOpen" class="modal-mask"
      ><scroll-view
        scroll-y
        class="modal print-history"
        style="max-height: 85vh"
        ><view class="modal-title">打印执行记录</view
        ><AsyncState :loading="historyLoading" :error="historyError"
          ><template v-if="historyJob"
            ><view class="record-title">{{ historyJob.recordNo }}</view
            ><view class="subtext"
              >标签版次：{{ historyJob.labelRevision ?? "未提供" }} ·
              {{ historyJob.copies }} 份</view
            ><view class="subtext safe-word"
              >目标打印机：{{
                historyJob.printerName ||
                (historyJob.printerId
                  ? "打印机 " + historyJob.printerId
                  : "未提供")
              }}</view
            ><view class="subtext">纸张：{{ printPaper(historyJob) }}</view
            ><view class="subtext"
              >创建时间：{{ printCreatedAt(historyJob) }}</view
            ><view class="notice"
              >当前状态：{{
                printStatusText(historyJob)
              }}。{{ isWindowsQueueAccepted(historyJob) ? printSubmissionText(historyJob) : '远端接受只表示已提交，纸张完成仍以可靠协议或人工核验依据为准。' }}</view
            ><view v-if="printQueueObservationText(historyJob)" class="notice" :class="{ amber: printNeedsAttention(historyJob) }"
              >队列跟踪：{{ printQueueObservationText(historyJob) }}</view
            ><view
              v-for="attempt in historyJob.attempts"
              :key="attempt.id"
              class="panel print-attempt"
              ><view class="row"
                ><text>第 {{ attempt.attemptNo }} 次执行</text
                ><text class="tag">{{
                  historyJob.executionMode === 'PC_AGENT' && attempt.status === 'SUBMITTED' ? '已提交打印' : printStatusLabels[attempt.status] || attempt.status
                }}</text></view
              ><view class="subtext">{{
                phases[attempt.sendPhase] || attempt.sendPhase
              }}</view
              ><view class="detail-row"
                ><text class="detail-key">开始</text
                ><text>{{
                  timeText(attempt.startedAtMs, session.factory?.timezone)
                }}</text></view
              ><view v-if="attempt.sendingAtMs" class="detail-row"
                ><text class="detail-key">进入发送</text
                ><text>{{
                  timeText(attempt.sendingAtMs, session.factory?.timezone)
                }}</text></view
              ><view v-if="attempt.submittedAtMs" class="detail-row"
                ><text class="detail-key">远端接受</text
                ><text>{{
                  timeText(attempt.submittedAtMs, session.factory?.timezone)
                }}</text></view
              ><view v-if="attempt.finishedAtMs" class="detail-row"
                ><text class="detail-key">本次结束</text
                ><text>{{
                  timeText(attempt.finishedAtMs, session.factory?.timezone)
                }}</text></view
              ><view
                v-if="attempt.remoteJobId || attempt.remoteJobUri"
                class="subtext safe-word"
                >远端任务引用 {{ attempt.remoteJobId }}
                {{ attempt.remoteJobUri }}</view
              ><view
                v-if="
                  attempt.remoteStatus?.state || attempt.remoteStatus?.message
                "
                class="notice"
                >远端状态 {{ attempt.remoteStatus.state || "未提供" }} ·
                {{ attempt.remoteStatus.message || "未提供说明" }}</view
              ><view
                v-if="attempt.errorCode || attempt.errorMessage"
                class="notice amber"
                >{{ attempt.errorCode }} · {{ attempt.errorMessage }}</view
              ></view
            ><view v-if="!historyJob.attempts?.length" class="subtext"
              >尚未发生发送尝试</view
            ><view class="section-heading"
              ><text class="section-title">人工操作与核验</text></view
            ><view
              v-for="operation in historyJob.operations"
              :key="operation.id"
              class="detail-row"
              ><view
                ><text>{{
                  historyOperations[operation.operation] || operation.operation
                }}</text
                ><view class="subtext">{{
                  operation.reason || "未填写依据"
                }}</view
                ><view class="subtext">{{
                  operation.actorUserId
                    ? "用户 " + operation.actorUserId
                    : "系统记录"
                }}</view></view
              ><text>{{
                timeText(operation.occurredAtMs, session.factory?.timezone)
              }}</text></view
            ><view v-if="!historyJob.operations?.length" class="subtext"
              >尚无人工核验记录</view
            ></template
          ></AsyncState
        ><button
          class="secondary"
          @click="
            historyOpen = false;
            historyGeneration++;
          "
        >
          关闭执行记录
        </button></scroll-view
      ></view
    ></AppShell
  >
</template>
<style scoped lang="scss">
.print-scope {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 13px 16px;
  border: 1px solid #17506b;
  border-radius: 12px;
  background: #062c43;
}
.print-scope-label {
  color: #91b5cc;
  font-size: 11px;
}
.print-scope-title {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
}
.print-scope .link {
  min-height: 44px;
  flex-shrink: 0;
}
.print-list-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.print-list-context {
  min-width: 0;
  flex: 1;
}
.print-list-title {
  font-size: 16px;
  font-weight: 600;
}
.print-total {
  color: #91b5cc;
  font-size: 12px;
}
.print-filter-summary {
  margin-top: 6px;
  color: #91b5cc;
  font-size: 11px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.print-filter-toggle {
  flex-shrink: 0;
  padding: 10px 14px;
  min-height: 44px;
  border: 1px solid #255b70;
  border-radius: 10px;
  background: #062c43;
  color: #b6dbea;
  font-size: 12px;
}
.print-filter-toggle.active {
  border-color: #30c8e8;
  color: #8eefff;
  background: #0a4057;
}
.print-filter-heading {
  margin-bottom: 12px;
  font-size: 13px;
}
.print-filter-heading .link {
  min-height: 44px;
}
.print-filters .chip {
  flex: none;
  min-height: 40px;
}
.print-filters .chip-row {
  justify-content: flex-start;
}
.print-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 350px;
  padding: 44px 18px 30px;
  text-align: center;
  border: 1px dashed #174158;
  border-radius: 16px;
  background: linear-gradient(180deg, #062b4038, #02192f00);
}
.print-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 82px;
  height: 82px;
  margin-bottom: 22px;
  border: 1px solid #20526a;
  border-radius: 25px;
  background: #082d42;
}
.print-empty-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}
.print-empty-description {
  max-width: 310px;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.9;
  color: #91b5cc;
}
.print-empty-action {
  flex: none;
  width: 100%;
  max-width: 250px;
  margin-top: 26px;
}
@media (min-width: 600px) {
  .print-empty {
    min-height: 400px;
    padding-top: 55px;
  }
}
</style>
