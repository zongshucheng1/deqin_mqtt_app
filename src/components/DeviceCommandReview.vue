<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import AsyncState from "./AsyncState.vue";
import { api } from "../services/api";
import type { DeviceCommand } from "../domain/types";
import { useSession } from "../stores/session";
import { confirm, errorText, toast } from "../composables/page";
import { timeText } from "../domain/format";
import { useUnsavedExit } from "../composables/unsaved";
const session = useSession(),
  commands = ref<DeviceCommand[]>([]),
  status = ref("UNKNOWN"),
  page = ref(1),
  total = ref(0),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  actionError = ref(""),
  selected = ref<DeviceCommand>(),
  reason = ref("");
const dirty = computed(() => !!selected.value && !!reason.value),
  editing = computed(() => !!selected.value);
const exit = useUnsavedExit(dirty, busy, { route: false });
async function closeEditing() {
  if (!(await exit.allowLeave())) return;
  selected.value = undefined;
  reason.value = "";
  actionError.value = "";
  exit.reset();
}
function discard() {
  selected.value = undefined;
  reason.value = "";
  actionError.value = "";
  exit.reset();
}
defineExpose({ dirty, editing, busy, closeEditing, discard });
const states = [
  ["UNKNOWN", "待核验"],
  ["CANCELLED", "已关闭追发"],
  ["ACKNOWLEDGED", "设备已回报"],
  ["", "全部命令"],
];
const labels: Record<string, string> = {
  PENDING: "待发布",
  PUBLISHING: "发布中，结果待核实",
  PUBLISHED: "Broker已接收，待设备回报",
  ACKNOWLEDGED: "设备已回报",
  UNKNOWN: "结果待核验",
  CANCELLED: "已关闭追发",
  FAILED: "执行失败",
  EXPIRED: "已过期",
};
const operationLabels: Record<string, string> = {
  COMMAND_CANCEL: "关闭命令追发",
  COMMAND_REVIEW: "记录仍待核验",
};
let generation = 0;
async function load(more = false) {
  const ticket = ++generation,
    scope = session.currentScope(),
    requestedPage = more ? page.value + 1 : 1;
  loading.value = true;
  error.value = "";
  try {
    if (!session.manager) throw new Error("当前角色无权核验复位命令");
    const data = await api.deviceCommands({
      status: status.value || undefined,
      pageNum: requestedPage,
    });
    if (ticket !== generation || scope !== session.currentScope()) return;
    commands.value = more ? [...commands.value, ...data.rows] : data.rows;
    page.value = requestedPage;
    total.value = data.total;
  } catch (e) {
    if (ticket === generation && scope === session.currentScope())
      error.value = errorText(e);
  } finally {
    if (ticket === generation) loading.value = false;
  }
}
async function inspect(command: DeviceCommand) {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  const scope = session.currentScope();
  try {
    const data = await api.deviceCommand(command.commandId);
    if (scope !== session.currentScope()) return;
    selected.value = data;
    reason.value = "";
    exit.reset();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function review(action: "CANCEL" | "REVIEW") {
  if (!selected.value || busy.value) return;
  if (!reason.value.trim()) {
    actionError.value = "请填写现场核验依据";
    return;
  }
  if (
    !(await confirm(
      action === "CANCEL" ? "关闭该命令追发？" : "记录仍待核验？",
      action === "CANCEL"
        ? "此操作只关闭服务器后续追发，不能撤回可能已发出的复位字节，也不代表设备已复位。确认继续？"
        : "只记录仍无法确认的现场证据，命令保留UNKNOWN，不发布复位或伪造设备回报。确认继续？",
    ))
  )
    return;
  busy.value = true;
  actionError.value = "";
  try {
    selected.value = await api.reviewCommand(
      selected.value,
      action,
      reason.value.trim(),
    );
    toast(
      action === "CANCEL"
        ? "已关闭追发，请核对现场状态"
        : "已保存待核验依据，未重新发布",
    );
    reason.value = "";
    await load();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  load();
});
onUnmounted(() => {
  generation++;
});
</script>
<template>
  <view class="command-review">
    <view class="notice amber"
      >复位命令的Broker接收与设备执行分别核验。本页只查看安全证据、关闭追发或记录仍待核验，不提供重新发布或人工标记设备已执行。</view
    >
    <view class="chip-row"
      ><button
        v-for="[value, label] in states"
        :key="value"
        class="chip"
        :class="{ active: status === value }"
        @click="
          status = value;
          load();
        "
      >
        {{ label }}
      </button></view
    >
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!commands.length"
      empty-text="暂无符合条件的复位命令"
      @retry="load()"
    >
      <button
        v-for="command in commands"
        :key="command.commandId"
        class="record-card command-card"
        :disabled="busy"
        @click="inspect(command)"
      >
        <view class="row"
          ><text class="record-title">复位命令 {{ command.commandId }}</text
          ><text class="tag amber">{{
            labels[command.status] || command.status
          }}</text></view
        ><view class="record-meta"
          >规则 {{ command.ruleId }} · 已尝试
          {{ command.attemptCount }} 次</view
        ><view class="subtext">{{ command.lastError || "暂无异常说明" }}</view>
      </button>
      <button
        v-if="commands.length < total"
        class="load-more"
        :disabled="loading"
        @click="load(true)"
      >
        加载更多命令
      </button>
    </AsyncState>
    <view v-if="actionError && !selected" class="error-box">{{
      actionError
    }}</view>
    <view v-if="selected" class="modal-mask"
      ><scroll-view scroll-y class="modal" style="max-height: 85vh"
        ><view class="modal-title">复位命令核验</view
        ><view class="tag amber">{{
          labels[selected.status] || selected.status
        }}</view
        ><view class="detail-row"
          ><text class="detail-key">命令 / 类型</text
          ><text class="detail-value"
            >{{ selected.commandId }} / {{ selected.commandType }}</text
          ></view
        ><view class="detail-row"
          ><text class="detail-key">关联规则 / 事件</text
          ><text class="detail-value"
            >{{ selected.ruleId }} / {{ selected.eventId }}</text
          ></view
        ><view class="detail-row"
          ><text class="detail-key">事件身份</text
          ><text class="detail-value mono">{{ selected.eventKey }}</text></view
        ><view v-if="selected.recordId" class="detail-row"
          ><text class="detail-key">业务批次</text
          ><text>{{ selected.recordId }}</text></view
        ><view class="detail-row"
          ><text class="detail-key">源代次 / 边沿代次</text
          ><text
            >{{ selected.expectedSourceEpoch }} /
            {{ selected.expectedEdgeGeneration }}</text
          ></view
        ><view class="detail-row"
          ><text class="detail-key">有效期至</text
          ><text>{{
            timeText(selected.expiresAtMs, session.factory?.timezone)
          }}</text></view
        ><view class="detail-row"
          ><text class="detail-key">Broker接收时间</text
          ><text>{{
            timeText(selected.publishedAtMs, session.factory?.timezone)
          }}</text></view
        ><view class="detail-row"
          ><text class="detail-key">设备回报时间</text
          ><text>{{
            timeText(selected.acknowledgedAtMs, session.factory?.timezone)
          }}</text></view
        ><view v-if="selected.lastError" class="notice amber">{{
          selected.lastError
        }}</view
        ><view
          v-for="operation in selected.operations"
          :key="operation.id"
          class="detail-row"
          ><view
            ><text>{{
              operationLabels[operation.operation] || operation.operation
            }}</text
            ><view class="subtext">{{ operation.reason }}</view
            ><view class="subtext">{{
              operation.actorUserId
                ? "用户 " + operation.actorUserId
                : "系统记录"
            }}</view></view
          ><text>{{
            timeText(operation.occurredAtMs, session.factory?.timezone)
          }}</text></view
        ><template v-if="selected.status === 'UNKNOWN'"
          ><view class="field"
            ><text class="field-label">现场核验依据 *</text
            ><view class="input-box">
              <textarea
                v-model="reason"
                aria-label="命令核验依据"
                maxlength="500"
                auto-height
              /></view></view
          ><view v-if="actionError" class="error-box">{{ actionError }}</view
          ><view class="button-row"
            ><button
              class="secondary"
              :disabled="busy"
              @click="review('REVIEW')"
            >
              记录仍待核验</button
            ><button class="danger" :disabled="busy" @click="review('CANCEL')">
              关闭命令追发
            </button></view
          ></template
        ><button class="secondary" :disabled="busy" @click="closeEditing">
          关闭详情
        </button></scroll-view
      ></view
    >
  </view>
</template>
