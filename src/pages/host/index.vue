<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, computed, watch, onUnmounted } from "vue";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import { api } from "../../services/api";
import { usePage, errorText, toast, confirm, go } from "../../composables/page";
import { nativeHost, type HostStatus } from "../../services/native";
import { useSession } from "../../stores/session";
import type { Host, HostDiagnostics } from "../../domain/types";
import { timeText } from "../../domain/format";
import { warehouse } from "../../domain/warehouse";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
import { startCaptureHost } from "../../composables/capture-host-start";
const session = useSession(),
  hosts = ref<Host[]>([]),
  hostId = ref(uni.getStorageSync("dq.hostId") || ""),
  status = ref<HostStatus>(),
  hostCode = ref(""),
  hostName = ref(""),
  registering = ref(false),
  busy = ref(false),
  actionError = ref(""),
  diagnostics = ref<HostDiagnostics>(),
  diagnosticsLoading = ref(false),
  diagnosticsError = ref("");
const dirty = computed(
  () => registering.value && (!!hostCode.value || !!hostName.value),
);
const exit = useUnsavedExit(dirty, busy);
async function closeRegister() {
  if (!(await exit.allowLeave())) return;
  registering.value = false;
  hostCode.value = "";
  hostName.value = "";
  exit.reset();
}
const back = useGuardedBack(exit, dirty, busy);
async function toggleRegister() {
  if (registering.value) await closeRegister();
  else {
    registering.value = true;
    exit.reset();
  }
}
async function openCapture() {
  if (await exit.allowLeave()) go("capture");
}
const localBindingVisible = computed(
  () => status.value?.binding?.factoryId === session.factoryId,
);
const connectionLabels: Record<string, string> = {
  UNKNOWN: "未知",
  CONNECTED: "已连接",
  ERROR: "连接失败",
  STOPPED: "已停止",
  NOT_CONFIGURED: "未配置",
  CONNECTING: "连接中",
  RECONNECTING: "重连中",
};
const localLeaseLabels: Record<string, string> = {
  LOCAL_VALID: "本地有效快照",
  EXPIRED: "本地快照已过期",
  UNAVAILABLE: "暂不可读取",
  NOT_ACQUIRED: "尚未取得",
};
function connectionLabel(value: string) {
  return connectionLabels[value] || "未知";
}
function leaseLabel(value: string) {
  return localLeaseLabels[value] || "未知";
}
let diagnosticsRevision = 0;
async function readDiagnostics() {
  const generation = ++diagnosticsRevision,
    selectedHost = hostId.value,
    scope = session.currentScope();
  diagnostics.value = undefined;
  diagnosticsError.value = "";
  if (!selectedHost || !session.manager) {
    diagnosticsLoading.value = false;
    return;
  }
  diagnosticsLoading.value = true;
  try {
    const value = await api.hostDiagnostics(selectedHost);
    if (
      generation === diagnosticsRevision &&
      selectedHost === hostId.value &&
      scope === session.currentScope()
    )
      diagnostics.value = value;
  } catch (e) {
    if (generation === diagnosticsRevision && scope === session.currentScope())
      diagnosticsError.value = errorText(e);
  } finally {
    if (generation === diagnosticsRevision) diagnosticsLoading.value = false;
  }
}
function refreshNative() {
  status.value = nativeHost.status();
}
watch(hostId, () => {
  readDiagnostics();
});
onUnmounted(() => {
  diagnosticsRevision++;
});
const { loading, error, refresh } = usePage(async () => {
  if (exit.accepted) {
    registering.value = false;
    hostCode.value = "";
    hostName.value = "";
  }
  exit.reset();
  if (!session.manager) throw new Error("当前角色无权配置固定主机");
  const scope = session.currentScope();
  const authorizedHosts = await api.hosts();
  if (scope !== session.currentScope()) return;
  hosts.value = authorizedHosts;
  if (!hosts.value.some((host) => host.id === hostId.value)) hostId.value = "";
  refreshNative();
  await readDiagnostics();
});
async function register() {
  if (busy.value) return;
  if (!hostCode.value.trim() || !hostName.value.trim()) {
    actionError.value = "请输入稳定主机编码和名称";
    return;
  }
  busy.value = true;
  try {
    const host = await api.registerHost({
      hostCode: hostCode.value.trim(),
      hostName: hostName.value.trim(),
    });
    hostId.value = host.id;
    uni.setStorageSync("dq.hostId", host.id);
    registering.value = false;
    await refresh();
    toast("主机已登记，尚未启动执行");
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function start() {
  if (busy.value) return;
  actionError.value = "";
  if (!hostId.value) {
    actionError.value = "请先选择当前终端对应的已授权主机";
    return;
  }
  const selectedHost = hostId.value,
    factoryId = session.factoryId,
    scope = session.currentScope();
  const stillAuthorized = () =>
    !!scope &&
    scope === session.currentScope() &&
    selectedHost === hostId.value &&
    factoryId === session.factoryId;
  if (
    !(await confirm(
      "启动采集主机",
      "将先停止旧运行并重新读取后台授权。仅允许不含手机打印授权的主机执行采集；标签由工厂电脑打印。请确认这是长期通电的现场采集终端。",
    ))
  )
    return;
  if (!stillAuthorized()) return;
  busy.value = true;
  try {
    await startCaptureHost(
      nativeHost,
      selectedHost,
      factoryId,
      stillAuthorized,
    );
    uni.setStorageSync("dq.hostId", selectedHost);
    toast("采集启动请求已发送，请检查运行状态");
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    refreshNative();
    busy.value = false;
  }
}
async function stop() {
  if (busy.value) return;
  if (
    !(await confirm(
      "停止本机执行",
      "停止本机当前运行。采集与历史打印证据会保留，已发送任务不会撤回，也不会自动重新发送。确认继续？",
    ))
  )
    return;
  try {
    status.value = nativeHost.stop();
    if (!status.value.supported) throw new Error(status.value.reason);
    toast("停止请求已发送");
  } catch (e) {
    actionError.value = errorText(e);
  }
}
</script>
<template>
  <AppShell title="采集主机运行" back :back-handler="back"
    ><template #right
      ><button class="link" @click="openCapture">后台采集设置</button></template
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><view class="notice"
        >本页仅启动现场采集。所有仓库标签由后台分配到工厂电脑打印，APP
        不执行打印。</view
      ><view class="panel"
        ><view class="row"
          ><text class="form-heading" style="margin: 0">本终端执行状态</text
          ><text class="tag" :class="{ gray: !status?.running }">{{
            !status?.supported
              ? "当前平台不支持"
              : status?.running
                ? "运行中"
                : "未运行"
          }}</text></view
        ><view v-if="status?.reason" class="notice amber">{{
          status.reason
        }}</view
        ><view v-if="status?.lastError" class="notice amber">{{
          status.lastError
        }}</view
        ><view v-if="status?.bootId" class="detail-row"
          ><text class="detail-key">本机启动身份</text
          ><text class="detail-value mono">{{ status.bootId }}</text></view
        ><view v-if="status?.needsResume" class="notice amber"
          >需要人工恢复，请先核对未结证据，再重新启动授权执行。</view
        ><button class="link" @click="refreshNative">
          刷新原生运行状态
        </button></view
      ><view class="panel"
        ><view class="row" style="margin-bottom: 16px"
          ><text class="form-heading" style="margin: 0">服务端授权主机</text
          ><button class="link" @click="toggleRegister">登记本机</button></view
        ><picker
          :range="hosts"
          range-key="hostName"
          :value="
            Math.max(
              0,
              hosts.findIndex((h) => h.id === hostId),
            )
          "
          @change="hostId = hosts[Number($event.detail.value)].id"
          ><view class="input-box picker-value"
            ><text class="picker-label">{{
              hosts.find((h) => h.id === hostId)?.hostName || "请选择主机"
            }}</text
            ><AppArrow /></view
          ></picker
        ><view
          v-if="hosts.find((h) => h.id === hostId)"
          class="subtext"
          style="margin-top: 10px"
          >最后心跳
          {{
            timeText(
              hosts.find((h) => h.id === hostId)?.lastHeartbeatAtMs,
              session.factory?.timezone,
            )
          }}</view
        ><template v-if="registering"
          ><view class="gap" /><view class="field"
            ><text class="field-label">稳定主机编码 *</text
            ><view class="input-box"
              ><input v-model="hostCode" maxlength="64" /></view></view
          ><view class="field"
            ><text class="field-label">主机名称 *</text
            ><view class="input-box"
              ><input v-model="hostName" maxlength="100" /></view></view
          ><button class="secondary" :disabled="busy" @click="register">
            登记
          </button></template
        ><view class="button-row"
          ><button
            class="primary"
            :disabled="busy || !status?.supported"
            :loading="busy"
            @click="start"
          >
            启动采集</button
          ><button
            class="secondary"
            :disabled="busy || !status?.supported || !status?.running"
            @click="stop"
          >
            停止
          </button></view
        ></view
      ><view v-if="hostId" class="panel server-diagnostics"
        ><view class="row"
          ><text class="form-heading">服务端主机与工厂队列</text
          ><button
            class="link"
            :disabled="diagnosticsLoading"
            @click="readDiagnostics"
          >
            刷新诊断
          </button></view
        ><AsyncState
          :loading="diagnosticsLoading"
          :error="diagnosticsError"
          @retry="readDiagnostics"
          ><template v-if="diagnostics"
            ><view class="detail-row"
              ><text class="detail-key">服务端启动身份</text
              ><text class="detail-value mono">{{
                diagnostics.host.bootId || "尚未启动"
              }}</text></view
            ><view class="detail-row"
              ><text class="detail-key">最近主机心跳</text
              ><text>{{
                timeText(
                  diagnostics.host.lastHeartbeatAtMs,
                  session.factory?.timezone,
                )
              }}</text></view
            ><view class="detail-row"
              ><text class="detail-key">最近采集接收</text
              ><text>{{
                timeText(
                  diagnostics.lastIngestMessageAtMs,
                  session.factory?.timezone,
                )
              }}</text></view
            ><view class="notice"
              >以下为工厂队列与历史授权的只读诊断，不会在手机执行打印。</view
            ><view class="metric-grid"
              ><view
                ><text class="metric-label">待执行任务</text
                ><text class="metric-value"
                  >{{ diagnostics.pendingPrintTasks
                  }}<text class="unit">项</text></text
                ></view
              ><view
                ><text class="metric-label">执行中任务</text
                ><text class="metric-value"
                  >{{ diagnostics.activePrintTasks
                  }}<text class="unit">项</text></text
                ></view
              ><view
                ><text class="metric-label">结果待核验</text
                ><text class="metric-value"
                  >{{ diagnostics.unknownPrintTasks
                  }}<text class="unit">项</text></text
                ></view
              ></view
            ><view class="section-heading"
              ><text class="section-title">授权资源</text></view
            ><view
              v-for="resource in diagnostics.captureResources"
              :key="resource.ruleId"
              class="detail-row"
              ><text
                >{{ warehouse(resource.warehouseType).name }} ·
                {{ resource.streamKey }}</text
              ><text class="subtext"
                >设备 {{ resource.deviceId }} ·
                {{ resource.enabled ? "已启用" : "已停用" }}</text
              ></view
            ><view
              v-for="printer in diagnostics.printers"
              :key="printer.id"
              class="detail-row"
              ><text>{{ printer.printerName }}</text
              ><text class="subtext"
                >{{ printer.printerCode }} ·
                {{ printer.enabled ? "已启用" : "已停用" }}</text
              ></view
            ><view
              v-if="
                !diagnostics.captureResources.length &&
                !diagnostics.printers.length
              "
              class="subtext"
              >尚无授权规则或打印机资源</view
            ><view class="section-heading"
              ><text class="section-title">服务端租约</text></view
            ><view
              v-for="lease in diagnostics.leases"
              :key="lease.resourceType + lease.resourceKey"
              class="detail-row"
              ><view
                ><text
                  >{{ lease.resourceType === "PRINT" ? "打印" : "采集" }} ·
                  {{ lease.resourceKey }}</text
                ><view class="subtext"
                  >到期
                  {{
                    timeText(lease.expiresAtMs, session.factory?.timezone)
                  }}</view
                ></view
              ><text class="tag">{{
                lease.state === "ACTIVE"
                  ? "有效"
                  : lease.state === "FENCED"
                    ? "已失效隔离"
                    : "已过期"
              }}</text></view
            ><view v-if="!diagnostics.leases.length" class="subtext"
              >当前无服务端租约</view
            ><view class="subtext"
              >诊断读取
              {{
                timeText(diagnostics.observedAtMs, session.factory?.timezone)
              }}</view
            ></template
          ></AsyncState
        ></view
      ><view
        v-if="status?.supported && localBindingVisible"
        class="panel local-diagnostics"
        ><view class="form-heading">本终端连接与持久证据</view
        ><view class="subtext"
          >仅表示当前绑定在本机保存的状态，不代表全工厂队列或服务端实时所有权。</view
        ><view class="detail-row"
          ><text class="detail-key">本机绑定主机</text
          ><text class="detail-value mono">{{
            status.binding?.hostId
          }}</text></view
        ><view v-if="status.connection" class="detail-row"
          ><text class="detail-key">后端 / MQTT</text
          ><text
            >{{ connectionLabel(status.connection.backend) }} /
            {{ connectionLabel(status.connection.mqtt) }}</text
          ></view
        ><view class="detail-row"
          ><text class="detail-key">最近服务端联系</text
          ><text>{{
            timeText(
              status.connection?.lastServerContactAtMs,
              session.factory?.timezone,
            )
          }}</text></view
        ><view class="detail-row"
          ><text class="detail-key">最近MQTT消息</text
          ><text>{{
            timeText(
              status.connection?.lastMessageAtMs,
              session.factory?.timezone,
            )
          }}</text></view
        ><view class="detail-row"
          ><text class="detail-key">本机待同步事件</text
          ><text
            >{{
              status.evidence?.countsAvailable
                ? (status.evidence.pendingEventCount ?? "未知")
                : "暂不可读取"
            }}
            项</text
          ></view
        ><view class="detail-row"
          ><text class="detail-key">本机未结打印证据</text
          ><text
            >{{
              status.evidence?.countsAvailable
                ? (status.evidence.unsettledPrintCount ?? "未知")
                : "暂不可读取"
            }}
            项</text
          ></view
        ><view
          v-for="stream in status.binding?.deviceStreams"
          :key="stream.ruleId"
          class="detail-row"
          ><view
            ><text>设备 {{ stream.deviceId }} · {{ stream.streamId }}</text
            ><view class="subtext"
              >{{ stream.verified ? "规则已核验" : "规则未核验" }} ·
              {{
                stream.stateStatus === "EXTERNAL_INGESTION"
                  ? "统一后端接口接入"
                  : stream.requiresBaseline
                    ? "等待基线"
                    : stream.stateStatus || "状态未知"
              }}</view
            ><view
              v-if="stream.stateStatus === 'EXTERNAL_INGESTION'"
              class="subtext"
              >此旋切流由统一后端接口接入，本机不订阅，也不据此认定已收到设备消息。</view
            ></view
          ><text class="subtext">{{
            timeText(stream.lastMessageAtMs, session.factory?.timezone)
          }}</text></view
        ><view
          v-for="printerId in status.binding?.printerIds"
          :key="printerId"
          class="subtext"
          >旧手机打印授权 {{ printerId }}（需在后台分离后才能启动采集）</view
        ><view
          v-for="lease in status.leases"
          :key="lease.resourceType + lease.resourceKey"
          class="detail-row"
          ><view
            ><text>{{ lease.resourceKey }}</text
            ><view class="subtext"
              >本地快照到期
              {{ timeText(lease.expiresAtMs, session.factory?.timezone) }}</view
            ></view
          ><text>{{ leaseLabel(lease.status) }}</text></view
        ><view
          v-for="fault in status.faults"
          :key="fault.scope + fault.code + fault.occurredAtMs"
          class="notice amber"
          >{{
            fault.code === "LEGACY_EVIDENCE_ISOLATED"
              ? "旧版执行证据已隔离，需人工核验"
              : fault.scope + " · " + fault.code
          }}
          · {{ timeText(fault.occurredAtMs, session.factory?.timezone) }}</view
        ></view
      ><view
        v-if="
          status?.supported &&
          status.binding?.configured &&
          !localBindingVisible
        "
        class="notice amber"
        >本终端仍有其他工厂的绑定，请按当前授权工厂重新配置，原范围证据不在此显示。</view
      ><view v-if="actionError" class="error-box">{{ actionError }}</view
      ><view class="notice amber"
        >采集规则和短期凭据由服务器授权；未核验规则保持禁用。存在旧手机打印授权时拒绝启动，原有采集与打印证据保留供核验。</view
      ></AsyncState
    ></AppShell
  >
</template>
