<script setup lang="ts">
import { ref, computed, toRef, watch, onUnmounted } from "vue";
import AsyncState from "./AsyncState.vue";
import type { RecordItem, Label, PrintJob } from "../domain/types";
import {
  warehouse,
  sourceLabels,
} from "../domain/warehouse";
import { isWindowsQueueAccepted, printStatusText, printSubmissionText, printQueueObservationText, printNeedsAttention } from "../domain/print-display";
import { tallyDiameters } from "../domain/forms";
import {
  recordDetailFields,
  detailValue,
  sourceChannel,
  codingModeLabel,
} from "../domain/record-display";
import {
  chineseDate,
  decimalText,
  timeText,
  factoryTimeZone,
} from "../domain/format";
import { api } from "../services/api";
import { ApiError } from "../services/http";
import {
  pendingWrites,
  resolvePending,
  type PendingWrite,
} from "../services/journal";
import { requireSession, useSession } from "../stores/session";
import { go, confirm, toast, errorText } from "../composables/page";
import { useUnsavedExit } from "../composables/unsaved";
import {
  loadPrintAgentCapabilities,
  serverManagesWarehouse,
} from "../services/inbound-print";
const props = defineProps<{ recordId: string; embedded?: boolean; active?: boolean }>();
const emit = defineEmits<{ (e: "deleted", id: string): void }>();
const id = toRef(props, "recordId"),
  record = ref<RecordItem>(),
  label = ref<Label | null>(),
  labelError = ref(""),
  cloudPrint = ref<PrintJob>(),
  cloudPrintError = ref(""),
  printJobsLoaded = ref(false),
  serverManaged = ref(false),
  routeError = ref(""),
  recordScope = ref(""),
  recordTimezone = ref<string>(),
  operationError = ref(""),
  pendingLabelPrint = ref<PendingWrite>(),
  busy = ref(false),
  deleteDialog = ref(false),
  reason = ref(""),
  session = useSession();
const dirty = computed(() => deleteDialog.value && !!reason.value);
const visibleRecord = computed(
  () =>
    !!record.value &&
    !!recordScope.value &&
    recordScope.value === session.currentScope(),
);
const canQueue = computed(
  () =>
    visibleRecord.value &&
    !busy.value &&
    !loading.value &&
    !labelError.value &&
    !pendingLabelPrint.value &&
    !record.value?.voidFlag &&
    printJobsLoaded.value &&
    !cloudPrint.value &&
    !cloudPrintError.value &&
    label.value?.status === "READY" &&
    label.value.templateCode === "PC_80",
);
const generatePrintBlockReason = computed(() => {
  if (!visibleRecord.value || loading.value) return "正在读取批次与标签状态";
  if (!session.worker) return "当前账号没有本工厂作业权限";
  if (record.value?.voidFlag) return "已作废批次不能生成打印标签";
  if (label.value === undefined || labelError.value)
    return "标签状态尚未读取成功，请刷新后再生成";
  if (!printJobsLoaded.value || cloudPrintError.value)
    return "打印任务尚未读取成功，请刷新后再生成";
  const job = cloudPrint.value;
  if (!job) return "";
  if (job.executionMode !== "PC_AGENT")
    return "请先在原打印设备核对历史任务，再安排电脑打印";
  if (job.status === "UNKNOWN" && job.verificationResult !== "NOT_PRINTED")
    return "原打印结果尚不明确，请先核对原任务";
  // A submitted PC job can remain SUBMITTED after the paper is printed. This
  // explicit new-version action creates an extra copy without changing its evidence.
  if (!["SUBMITTED", "COMPLETED", "CANCELLED", "FAILED", "UNKNOWN"].includes(job.status))
    return "原打印任务仍在处理中，请先查看打印任务";
  return "";
});
function syncPendingLabelPrint() {
  pendingLabelPrint.value = pendingWrites().find(
    (pending) =>
      pending.scope === session.currentScope() &&
      pending.operation === "label-print:" + id.value,
  );
}
function recordTime(value?: string | number) {
  if (value == null) return "未提供";
  // The timezone was validated with this exact factory response, not a transient global login state.
  return recordTimezone.value
    ? timeText(value, recordTimezone.value)
    : "工厂时区尚未读取";
}
const exit = useUnsavedExit(dirty, busy, { route: false });
async function closeEditing() {
  if (!(await exit.allowLeave())) return;
  deleteDialog.value = false;
  reason.value = "";
  exit.reset();
}
const loading = ref(false),
  error = ref("");
let generation = 0;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusReadRunning = false, statusGeneration = 0, statusReadFailures = 0, disposed = false;
const canRefreshStatus = computed(() =>
  props.active !== false && visibleRecord.value && !!id.value &&
  !loading.value && !busy.value && !deleteDialog.value && !record.value?.voidFlag,
);
function stopStatusRefresh() {
  statusGeneration++;
  if (statusTimer !== undefined) clearTimeout(statusTimer);
  statusTimer = undefined;
}
function scheduleStatusRefresh() {
  if (disposed || !canRefreshStatus.value || statusReadRunning || statusTimer !== undefined) return;
  const processing = ["PENDING", "GENERATING"].includes(label.value?.status || "") ||
    ["WAITING_LABEL", "QUEUED", "WAITING_PRINTER", "PREPARING", "SENDING"].includes(cloudPrint.value?.status || "");
  const delay = statusReadFailures > 0 ? Math.min(30000, statusReadFailures * 15000) : processing ? 3000 : 15000;
  statusTimer = setTimeout(() => {
    statusTimer = undefined;
    void refreshStatus();
  }, delay);
}
async function refreshStatus() {
  if (disposed || !canRefreshStatus.value || statusReadRunning) return;
  statusReadRunning = true;
  const ticket = statusGeneration, recordGeneration = generation,
    requestedId = id.value, scope = session.currentScope();
  const current = () => !disposed && canRefreshStatus.value &&
    ticket === statusGeneration && recordGeneration === generation &&
    requestedId === id.value && scope === session.currentScope();
  try {
    // Only read these two states: do not reload the record, clear a form or submit printing.
    const [latest, jobs] = await Promise.allSettled([
      api.latestLabel(requestedId),
      api.jobs({ recordId: requestedId, pageSize: 1 }),
    ]);
    if (!current()) return;
    const labelMissing = latest.status === "rejected" &&
      latest.reason instanceof ApiError && String(latest.reason.code) === "404";
    statusReadFailures = (latest.status === "rejected" && !labelMissing) || jobs.status === "rejected"
      ? statusReadFailures + 1 : 0;
    if (latest.status === "fulfilled") {
      label.value = latest.value;
      labelError.value = "";
    } else if (labelMissing) {
      label.value = null;
      labelError.value = "";
    } else {
      // Keep the last visible result but block actions until its state is known again.
      labelError.value = errorText(latest.reason);
    }
    if (jobs.status === "fulfilled") {
      cloudPrint.value = jobs.value.rows[0];
      printJobsLoaded.value = true;
      cloudPrintError.value = "";
    } else cloudPrintError.value = errorText(jobs.reason);
  } finally {
    statusReadRunning = false;
    scheduleStatusRefresh();
  }
}
// Synchronous invalidation also rejects a read started before a confirmation/write,
// even if it arrives after that operation has already finished.
watch([canRefreshStatus, id, () => session.currentScope()], () => {
  stopStatusRefresh();
  statusReadFailures = 0;
  scheduleStatusRefresh();
}, { immediate: true, flush: "sync" });
async function refresh() {
  const ticket = ++generation,
    requestedId = id.value;
  loading.value = true;
  error.value = "";
  operationError.value = "";
  labelError.value = "";
  cloudPrint.value = undefined;
  cloudPrintError.value = "";
  printJobsLoaded.value = false;
  serverManaged.value = false;
  routeError.value = "";
  record.value = undefined;
  label.value = undefined;
  recordScope.value = "";
  recordTimezone.value = undefined;
  deleteDialog.value = false;
  try {
    if (!requestedId) throw new Error("缺少批次编号");
    if (!(await requireSession())) return;
    const scope = session.currentScope(),
      factoryId = session.factoryId;
    syncPendingLabelPrint();
    const timezone = factoryTimeZone(session.factory?.timezone);
    const current = () =>
      ticket === generation &&
      scope === session.currentScope() &&
      requestedId === id.value;
    const data = await api.record(requestedId);
    if (!current()) return;
    if (data.factoryId !== factoryId)
      throw new Error("批次所属工厂与当前工厂不一致，请重新读取");
    recordScope.value = scope;
    recordTimezone.value = timezone;
    record.value = data;
    try {
      const currentLabel = await api.latestLabel(requestedId);
      if (current()) label.value = currentLabel;
    } catch (e) {
      if (current()) {
        label.value = null;
        labelError.value =
          e instanceof ApiError && String(e.code) === "404" ? "" : errorText(e);
      }
    }
    try {
      const jobs = await api.jobs({ recordId: requestedId, pageSize: 1 });
      if (current()) {
        cloudPrint.value = jobs.rows[0];
        printJobsLoaded.value = true;
      }
    } catch (e) {
      if (current()) cloudPrintError.value = errorText(e);
    }
    if (!current()) return;
    try {
      const capabilities = await loadPrintAgentCapabilities();
      if (current())
        serverManaged.value = serverManagesWarehouse(
          capabilities,
          data.warehouseType,
        );
    } catch (e) {
      if (current()) routeError.value = errorText(e);
    }
  } catch (e) {
    if (ticket === generation) error.value = errorText(e);
  } finally {
    if (ticket === generation) loading.value = false;
  }
}
watch(id, refresh, { immediate: true });
watch(
  () => session.currentScope(),
  (scope) => {
    if (scope && recordScope.value && scope !== recordScope.value)
      void refresh();
  },
);
onUnmounted(() => {
  disposed = true;
  stopStatusRefresh();
  generation++;
});
defineExpose({ refresh, dirty, busy, editing: deleteDialog, closeEditing });
const fields = computed(() =>
  record.value ? recordDetailFields(record.value.warehouseType) : [],
);
const traceFields = computed(() => {
  const trace = record.value?.sourceTrace;
  return trace
    ? [
        { label: "来源设备ID", value: trace.deviceId },
        { label: "设备名称", value: trace.deviceName },
        { label: "来源主题", value: trace.sourceTopic },
        { label: "来源事件键", value: trace.sourceEventKey },
        {
          label: "服务器接收时间",
          value: recordTime(trace.receivedAtMs),
        },
        { label: "采集规则ID", value: trace.ruleId },
        { label: "事件规则版本", value: trace.ruleRevision },
        {
          label: "事件类型",
          value: {
            AUTO_INBOUND: "自动入库",
            MANUAL_CODE: "设备人工打码",
            VOID: "设备作废",
          }[trace.eventType],
        },
        { label: "触发字段", value: trace.triggerField },
        { label: "原始数量字段", value: trace.quantityField },
        {
          label: "数量换算",
          value:
            trace.quantityDivisor == null
              ? null
              : "原始数量 ÷ " + trace.quantityDivisor,
        },
      ]
    : [];
});
async function regenerate() {
  if (busy.value || !visibleRecord.value) return;
  syncPendingLabelPrint();
  if (!pendingLabelPrint.value && generatePrintBlockReason.value) return;
  const scope = session.currentScope(),
    requestedId = id.value,
    ticket = generation,
    sourceLabelId = label.value?.id ?? null,
    pending = pendingLabelPrint.value;
  const current = () =>
    scope === session.currentScope() &&
    requestedId === id.value &&
    ticket === generation;
  // Guard the confirmation as well as the request so two taps cannot create two intents.
  busy.value = true;
  operationError.value = "";
  try {
    if (!(await confirm(
      pending ? "核对生成与打印结果" : "生成标签并打印",
      pending
        ? "按原请求核对标签和打印任务，结果未确认前不会另建新版本。继续？"
        : cloudPrint.value && (cloudPrint.value.status === "SUBMITTED" || isWindowsQueueAccepted(cloudPrint.value))
          ? "原任务已交给电脑打印队列，仍可能排队或出纸。本次将生成新版本，并额外打印一张二维码标签；原任务和入库记录保留。确认需要再打印一张？"
          : "为当前批次生成新的二维码标签版本，并交给工厂电脑打印一张。旧标签和打印记录保留，不新增入库。确认继续？",
    ))) return;
    if (!current()) return;
    if (!pending && (generatePrintBlockReason.value || sourceLabelId !== (label.value?.id ?? null))) return;
    const job = pending
      ? await resolvePending<PrintJob>(pending, () => session.currentScope())
      : await api.generateLabelAndPrint(requestedId, sourceLabelId);
    if (!current()) return;
    cloudPrint.value = job;
    cloudPrintError.value = "";
    printJobsLoaded.value = true;
    label.value = undefined;
    labelError.value = "";
    try {
      const latest = await api.latestLabel(requestedId);
      if (current()) label.value = latest;
    } catch (e) {
      if (current()) labelError.value = errorText(e);
    }
    if (current()) toast("已提交电脑打印，标签就绪后自动打印");
  } catch (e) {
    if (current()) operationError.value = errorText(e);
  } finally {
    syncPendingLabelPrint();
    busy.value = false;
  }
}
async function queuePrinting() {
  if (!canQueue.value || !record.value || !label.value) return;
  const scope = session.currentScope(),
    requestedId = record.value.id,
    labelId = label.value.id;
  busy.value = true;
  operationError.value = "";
  try {
    if (!(await confirm(
      "提交后台首次打印",
      "只为当前已入库批次提交首次打印，由后台选择已绑定的工厂电脑执行。不会新增入库。确认继续？",
    ))) return;
    if (scope !== session.currentScope() || requestedId !== id.value ||
        labelId !== label.value?.id || !visibleRecord.value || loading.value ||
        record.value?.voidFlag || labelError.value || cloudPrintError.value ||
        !printJobsLoaded.value || cloudPrint.value || pendingLabelPrint.value ||
        label.value?.status !== "READY" || label.value.templateCode !== "PC_80") return;
    const job = await api.queue(requestedId, labelId);
    if (scope !== session.currentScope() || requestedId !== id.value) return;
    cloudPrint.value = job;
    printJobsLoaded.value = true;
    toast("已交给后台安排打印，请核对任务与现场出纸");
  } catch (e) {
    if (scope === session.currentScope() && requestedId === id.value)
      operationError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function retryCurrentLabel() {
  if (busy.value || !label.value || labelError.value || !visibleRecord.value) return;
  const scope = session.currentScope(), requestedId = id.value,
    original = label.value, ticket = generation;
  const current = () => scope === session.currentScope() && requestedId === id.value && ticket === generation;
  busy.value = true;
  operationError.value = "";
  try {
    const retried = await api.retryLabel(requestedId, original);
    if (!current()) return;
    label.value = retried;
    labelError.value = "";
    try {
      const jobs = await api.jobs({ recordId: requestedId, pageSize: 1 });
      if (current()) {
        cloudPrint.value = jobs.rows[0];
        cloudPrintError.value = "";
        printJobsLoaded.value = true;
      }
    } catch (e) {
      if (current()) cloudPrintError.value = errorText(e);
    }
    if (current()) toast("已重试当前标签，原打印任务将在标签就绪后继续");
  } catch (e) {
    if (current()) operationError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!record.value || !reason.value.trim()) {
    operationError.value = "请填写删除原因";
    return;
  }
  if (busy.value) return;
  busy.value = true;
  operationError.value = "";
  try {
    await api.delete(record.value, reason.value.trim());
    toast("已删除业务记录");
    deleteDialog.value = false;
    emit("deleted", id.value);
    if (!props.embedded) uni.redirectTo({ url: "/pages/records/index" });
  } catch (e) {
    operationError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
const operationLabels: Record<string, string> = {
  CREATE: "入库",
  OUTBOUND: "整批出库",
  DELETE: "删除",
  VOID: "作废",
  PRINT_RETRY: "重试打印",
  PRINT_CANCEL: "取消待发打印",
  PRINT_VERIFY: "核验打印结果",
};
</script>
<template>
  <view class="record-detail"
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><template v-if="record && visibleRecord"
        ><view class="panel hero"
          ><view class="row"
            ><text class="label">{{
              warehouse(record.warehouseType).name
            }}</text
            ><text
              class="tag"
              :class="{
                gray: record.stockStatus === 'OUTBOUND',
                red: record.voidFlag,
              }"
              >{{
                record.voidFlag
                  ? "已作废"
                  : record.stockStatus === "OUTBOUND"
                    ? "已出库"
                    : "在库"
              }}</text
            ></view
          ><view class="big-value"
            >{{
              decimalText(
                record.quantity,
                record.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}<text class="unit">{{
              warehouse(record.warehouseType).unit
            }}</text></view
          ><view class="record-meta safe-word">{{ record.recordNo }}</view
          ><view class="record-meta">{{
            sourceLabels[record.quantitySource]
          }}</view></view
        ><view class="panel"
          ><view class="form-heading">批次信息</view
          ><view class="detail-row"
            ><text class="detail-key">来源渠道</text
            ><text class="detail-value">{{
              sourceChannel(record.quantitySource)
            }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">数量来源</text
            ><text class="detail-value">{{
              sourceLabels[record.quantitySource] || "未提供"
            }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">打码方式</text
            ><text class="detail-value">{{
              codingModeLabel(record.codingMode)
            }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">业务日期</text
            ><text class="detail-value">{{
              chineseDate(record.recordDate)
            }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">登记时间</text
            ><text class="detail-value">{{
              recordTime(record.inboundAtMs)
            }}</text></view
          ><view v-if="record.outboundAtMs" class="detail-row"
            ><text class="detail-key">出库时间</text
            ><text class="detail-value">{{
              recordTime(record.outboundAtMs)
            }}</text></view
          ><view class="detail-row" v-for="field in fields" :key="field.key"
            ><text class="detail-key"
              >{{ field.label
              }}{{ field.unit ? " (" + field.unit + ")" : "" }}</text
            ><text class="detail-value">{{
              detailValue(record.detail[field.key])
            }}</text></view
          ></view
        ><view v-if="record.warehouseType === 'RAW_WOOD'" class="panel"
          ><view class="form-heading">14档径级码单</view
          ><view class="tally-grid"
            ><view v-for="d in tallyDiameters" :key="d" class="detail-row"
              ><text class="detail-key">{{ d }} 公分</text
              ><text
                >{{ record.detail[`tally${d}cmCount`] || "0" }} 根</text
              ></view
            ></view
          ></view
        ><view class="panel"
          ><view class="row"
            ><text class="form-heading" style="margin: 0">二维码与标签</text
            ><text
              v-if="label"
              class="tag"
              :class="{ amber: label.status !== 'READY' }"
              >{{
                {
                  READY: "已就绪",
                  FAILED: "生成失败",
                  PENDING: "待生成",
                  GENERATING: "生成中",
                }[label.status]
              }}</text
            ></view
          ><view v-if="labelError" class="notice amber">{{ labelError }}</view
          ><view v-if="label?.errorMessage" class="notice amber">{{
            label.errorMessage
          }}</view
          ><button
            v-if="label?.status === 'FAILED'"
            class="secondary"
            :disabled="busy || !!labelError"
            @click="retryCurrentLabel"
          >
            重试当前标签版本</button
          ><view class="button-row"
            ><button class="secondary" @click="go('qr', 'id=' + record.id)">
              查看凭证</button
            ><button
              class="secondary"
              :disabled="busy || (!pendingLabelPrint && !!generatePrintBlockReason)"
              :loading="busy"
              @click="regenerate"
            >
              {{
                pendingLabelPrint
                  ? "核对生成与打印结果"
                  : label?.templateCode === "PC_80"
                    ? "生成新版本并打印"
                    : "生成电脑标签并打印"
              }}
            </button></view
          ><view v-if="pendingLabelPrint" class="notice amber"
            >上次生成与打印结果尚未确认，请先核对原请求，避免重复打印。</view
          ><view v-else-if="generatePrintBlockReason" class="subtext"
            >{{ generatePrintBlockReason }}</view
          ></view
        ><view v-if="cloudPrint" class="panel device-print-result">
          <view class="form-heading">{{
            cloudPrint.executionMode !== "PC_AGENT"
              ? "历史终端打印任务"
              : "工厂标签打印"
          }}</view>
          <view class="notice">{{
            printStatusText(cloudPrint)
          }}</view>
          <view class="subtext">{{
            cloudPrint.printerName ||
            (cloudPrint.printerId
              ? "打印机 " + cloudPrint.printerId
              : "等待分配打印机")
          }}</view>
          <view v-if="cloudPrint.status === 'SUBMITTED' || isWindowsQueueAccepted(cloudPrint)" class="subtext">{{
            printSubmissionText(cloudPrint)
          }}</view>
          <view v-if="printQueueObservationText(cloudPrint)" class="notice" :class="{ amber: printNeedsAttention(cloudPrint) }">
            队列跟踪：{{ printQueueObservationText(cloudPrint) }}
          </view>
          <view v-if="cloudPrint.lastError" class="subtext">{{
            cloudPrint.lastError
          }}</view>
          <view
            v-if="cloudPrint.executionMode !== 'PC_AGENT'"
            class="notice amber"
            >保留此任务的历史和发送证据。APP
            不再执行手机打印，请先核对原任务，不会将它自动改投其他打印机。</view
          >
          <button
            class="secondary"
            @click="go('print', 'recordId=' + record.id)"
          >
            查看打印任务
          </button> </view
        ><view
          v-else-if="printJobsLoaded && !cloudPrintError"
          class="panel device-print-result"
        >
          <view class="form-heading">后台首次打印</view>
          <view v-if="!serverManaged" class="notice amber"
            >本仓未确认启用自动打印。已有电脑标签仍可手动提交，由后台核对当前电脑绑定；APP
            不选择打印机。</view
          >
          <view
            v-if="label?.status === 'READY' && label.templateCode !== 'PC_80'"
            class="notice amber"
            >当前为旧版标签，点击“生成电脑标签并打印”即可生成并交给电脑打印。旧标签和入库记录均保留。</view
          >
          <view v-else-if="label?.status !== 'READY'" class="subtext"
            >点击“生成电脑标签并打印”后，标签就绪时电脑会自动打印。</view
          >
          <view v-else class="subtext"
            >当前批次尚无打印任务，由后台分配执行电脑，无需在 APP
            选择打印机。</view
          >
          <button
            class="primary"
            :disabled="!canQueue"
            :loading="busy"
            @click="queuePrinting"
          >
            提交后台首次打印
          </button> </view
        ><view class="button-row"
          ><button
            class="secondary"
            :disabled="busy || loading"
            @click="refresh"
          >
            刷新标签与打印状态</button
          ><button
            class="link"
            @click="go('printers', 'warehouse=' + record.warehouseType)"
          >
            工厂打印状态
          </button></view
        >
        <view v-if="routeError" class="notice amber"
          >后台打印配置暂未读取成功：{{ routeError }}</view
        ><view v-if="cloudPrintError" class="notice amber"
          >打印状态暂未读取成功：{{
            cloudPrintError
          }}。可进入打印状态核对。</view
        ><view v-if="record.quantitySource !== 'APP_INPUT'" class="panel"
          ><view class="form-heading">机器采集追溯</view
          ><view class="detail-row"
            ><text class="detail-key">来源事件</text
            ><text class="detail-value mono">{{
              record.sourceEventId || "未提供"
            }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">设备发生时间</text
            ><text class="detail-value">{{
              recordTime(record.deviceOccurredAtMs)
            }}</text></view
          ><view
            v-for="item in traceFields"
            :key="item.label"
            class="detail-row source-trace-row"
            ><text class="detail-key">{{ item.label }}</text
            ><text class="detail-value safe-word" selectable>{{
              detailValue(item.value)
            }}</text></view
          ><view v-if="!record.sourceTrace" class="subtext"
            >未提供更详细的采集证据</view
          ></view
        ><view v-if="record.operations?.length" class="panel"
          ><view class="form-heading">业务操作记录</view
          ><view
            v-for="operation in record.operations"
            :key="operation.id"
            class="detail-row operation-row"
            ><view class="operation-info"
              ><view style="font-size: 12px"
                >{{
                  operationLabels[operation.operation] || operation.operation
                }}
                ·
                {{
                  operation.actorName ||
                  (operation.actorUserId
                    ? "用户 " + operation.actorUserId
                    : "设备采集")
                }}</view
              ><view v-if="operation.reason" class="subtext">{{
                operation.reason
              }}</view></view
            ><text class="detail-value operation-time">{{
              recordTime(operation.occurredAtMs)
            }}</text></view
          ></view
        ><view v-if="operationError" class="error-box">{{
          operationError
        }}</view
        ><view class="button-row"
          ><button
            class="primary"
            :disabled="record.stockStatus !== 'IN_STOCK' || !!record.voidFlag"
            @click="go('checkout', 'id=' + record.id)"
          >
            {{
              record.stockStatus === "OUTBOUND" ? "该批已出库" : "整批出库"
            }}</button
          ><button
            class="secondary"
            @click="go('print', 'recordId=' + record.id)"
          >
            打印状态
          </button></view
        ><button
          v-if="session.can('inout:record:delete')"
          class="link"
          style="color: #ffadb0"
          @click="
            deleteDialog = true;
            reason = '';
            exit.reset();
          "
        >
          删除本批记录
        </button></template
      ></AsyncState
    ><view v-if="deleteDialog" class="modal-mask"
      ><view class="modal"
        ><view class="modal-title">确认删除记录</view
        ><view class="notice amber"
          >删除会影响库存和统计，并保留操作记录。已发送的纸张无法撤回。</view
        ><view class="field"
          ><text class="field-label">删除原因 *</text
          ><view class="input-box">
            <textarea
              v-model="reason"
              maxlength="500"
              auto-height
              placeholder="请输入删除原因"
            /></view></view
        ><view v-if="operationError" class="error-text">{{
          operationError
        }}</view
        ><view class="button-row"
          ><button class="secondary" :disabled="busy" @click="closeEditing">
            取消</button
          ><button
            class="danger"
            :disabled="busy"
            :loading="busy"
            @click="remove"
          >
            确认删除
          </button></view
        ></view
      ></view
    ></view
  >
</template>
<style scoped>
.record-detail .operation-row {
  align-items: flex-start;
  flex-wrap: nowrap;
  gap: 10px;
}
.operation-info {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
.operation-time {
  flex-shrink: 0;
  white-space: nowrap;
  word-break: normal;
}
</style>
