<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, computed } from "vue";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import DeviceCommandReview from "../../components/DeviceCommandReview.vue";
import { api } from "../../services/api";
import { useSession } from "../../stores/session";
import { usePage, errorText, confirm, toast } from "../../composables/page";
import { timeText } from "../../domain/format";
import { canonical } from "../../services/journal";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
const session = useSession(),
  tab = ref("rules"),
  rules = ref<Record<string, any>[]>([]),
  devices = ref<Record<string, any>[]>([]),
  events = ref<Record<string, any>[]>([]),
  eventTotal = ref(0),
  eventPage = ref(1),
  eventStatus = ref("REVIEW_REQUIRED"),
  form = ref<Record<string, any>>(),
  mappingText = ref("{}"),
  busy = ref(false),
  actionError = ref(""),
  eventDetail = ref<Record<string, any>>();
const baseline = ref(""),
  commandReview = ref<{
    dirty: boolean;
    editing: boolean;
    busy: boolean;
    closeEditing: () => Promise<void>;
    discard: () => void;
  }>();
const ruleDirty = computed(
  () =>
    !!form.value &&
    canonical({ form: form.value, mappingText: mappingText.value }) !==
      baseline.value,
);
const dirty = computed(() => ruleDirty.value || !!commandReview.value?.dirty),
  formBusy = computed(() => busy.value || !!commandReview.value?.busy);
const exit = useUnsavedExit(dirty, formBusy),
  ruleExit = useUnsavedExit(ruleDirty, busy, { route: false });
async function closeForm() {
  if (!(await ruleExit.allowLeave())) return;
  form.value = undefined;
  exit.reset();
  ruleExit.reset();
}
const back = useGuardedBack(exit, dirty, formBusy, {
  isOpen: () => !!form.value || !!commandReview.value?.editing,
  close: async () => {
    if (form.value) await closeForm();
    else await commandReview.value?.closeEditing();
  },
});
const statuses = [
  ["", "全部事件"],
  ["APPLIED", "已应用"],
  ["REVIEW_REQUIRED", "待核验"],
  ["REJECTED", "已拒绝"],
];
const { loading, error, refresh } = usePage(async () => {
  if (exit.accepted) {
    form.value = undefined;
    commandReview.value?.discard();
  }
  exit.reset();
  if (!session.manager) throw new Error("当前角色无权维护采集设置");
  if (tab.value === "rules") {
    [rules.value, devices.value] = await Promise.all([
      api.captureRules(),
      api.captureDevices(),
    ]);
  } else if (tab.value === "events") {
    eventPage.value = 1;
    const page = await api.captureEvents({
      status: eventStatus.value || undefined,
    });
    events.value = page.rows;
    eventTotal.value = page.total;
  }
});
async function edit(rule?: Record<string, any>) {
  actionError.value = "";
  try {
    form.value = rule
      ? await api.captureRule(String(rule.ruleId || rule.id))
      : {
          ruleCode: "",
          warehouseType: "DRYING",
          deviceId: "",
          mqttBindingId: "",
          streamKey: "",
          topicFilter: "",
          resetTopic: "",
          identityMode: "EDGE_STATE",
          enabled: false,
          mapping: {
            verified: false,
            fields: {},
            triggers: {},
            quantities: {},
          },
        };
    mappingText.value = JSON.stringify(form.value.mapping, null, 2);
    baseline.value = canonical({
      form: form.value,
      mappingText: mappingText.value,
    });
    exit.reset();
  } catch (e) {
    actionError.value = errorText(e);
  }
}
function selectDevice(index: number) {
  if (!form.value) return;
  const d = devices.value[index];
  form.value.deviceId = d.deviceId;
  form.value.mqttBindingId = d.mqttBindingId;
  form.value.topicFilter = d.publishTopicFilter;
}
async function save() {
  if (!form.value || busy.value) return;
  actionError.value = "";
  let mapping;
  try {
    mapping = JSON.parse(mappingText.value);
    if (typeof mapping !== "object" || !mapping || Array.isArray(mapping))
      throw new Error();
  } catch {
    actionError.value = "字段映射须为有效的JSON对象";
    return;
  }
  if (
    !form.value.ruleCode.trim() ||
    !form.value.deviceId ||
    !form.value.streamKey.trim() ||
    !form.value.topicFilter.trim()
  ) {
    actionError.value = "请填写规则名称、设备绑定、稳定数据流和接收主题";
    return;
  }
  if (form.value.enabled && !mapping.verified) {
    actionError.value =
      "启用前必须完成设备载荷、数量倍率、枚举和触发的现场核验";
    return;
  }
  if (
    form.value.enabled &&
    !(await confirm(
      "启用已核验采集规则",
      "主机重载后将按此规则创建真实入库批次及可能的打印/复位命令。请确认已完成现场设备验证。",
    ))
  )
    return;
  busy.value = true;
  try {
    await api.saveCaptureRule({ ...form.value, mapping });
    form.value = undefined;
    toast("规则已保存，主机需重载配置建立新基线");
    await refresh();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function disable(rule: Record<string, any>) {
  if (
    !(await confirm(
      "停用采集规则",
      "停用保留原规则身份和历史证据，未执行命令会按服务端规则处理。确认继续？",
    ))
  )
    return;
  busy.value = true;
  try {
    const detail = await api.captureRule(String(rule.ruleId || rule.id));
    await api.disableCaptureRule(String(detail.id), Number(detail.version));
    await refresh();
    toast("规则已停用");
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function more() {
  if (busy.value) return;
  busy.value = true;
  try {
    const page = await api.captureEvents({
      status: eventStatus.value || undefined,
      pageNum: eventPage.value + 1,
    });
    events.value.push(...page.rows);
    eventTotal.value = page.total;
    eventPage.value++;
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function inspect(event: Record<string, any>) {
  try {
    eventDetail.value = await api.captureEvent(
      String(event.id || event.eventId),
    );
  } catch (e) {
    actionError.value = errorText(e);
  }
}
</script>
<template>
  <AppShell title="后台采集设置" back :back-handler="back"
    ><view class="chip-row"
      ><button
        class="chip"
        :class="{ active: tab === 'rules' }"
        @click="
          tab = 'rules';
          refresh();
        "
      >
        设备规则</button
      ><button
        class="chip"
        :class="{ active: tab === 'events' }"
        @click="
          tab = 'events';
          refresh();
        "
      >
        采集核验</button
      ><button
        class="chip"
        :class="{ active: tab === 'commands' }"
        @click="
          tab = 'commands';
          refresh();
        "
      >
        复位命令
      </button></view
    ><view class="notice"
      >机器入库由后台采集完成，结果进入五库统一列表。这里仅供管理员配置规则、查询采集证据。</view
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><template v-if="tab === 'rules'"
        ><button class="secondary" style="margin-bottom: 17px" @click="edit()">
          ＋ 新增采集规则</button
        ><view v-for="rule in rules" :key="rule.ruleId || rule.id" class="panel"
          ><view class="row"
            ><text class="record-title"
              >{{ rule.warehouse === "DRYING" ? "烘干" : "旋切" }} ·
              {{ rule.streamId || rule.streamKey }}</text
            ><text class="tag" :class="{ gray: !rule.verified }">{{
              rule.verified ? "核验启用" : "未启用"
            }}</text></view
          ><view class="record-meta safe-word">{{
            rule.topic || rule.topicFilter
          }}</view
          ><view class="button-row" style="margin-bottom: 0"
            ><button class="secondary" @click="edit(rule)">查看与编辑</button
            ><button
              v-if="rule.verified || rule.enabled"
              class="secondary"
              :disabled="busy"
              @click="disable(rule)"
            >
              停用
            </button></view
          ></view
        ><view v-if="!rules.length" class="empty"
          >暂无采集规则，未核验前不会自动创建库存。</view
        ></template
      ><DeviceCommandReview
        v-else-if="tab === 'commands'"
        ref="commandReview"
      /><template v-else
        ><view class="chip-row"
          ><button
            v-for="[status, label] in statuses"
            :key="status"
            class="chip"
            :class="{ active: eventStatus === status }"
            @click="
              eventStatus = status;
              refresh();
            "
          >
            {{ label }}
          </button></view
        ><button
          v-for="event in events"
          :key="event.id || event.eventId"
          class="record-card"
          @click="inspect(event)"
        >
          <view class="row"
            ><text class="record-title">{{
              event.eventType || "设备事件"
            }}</text
            ><text
              class="tag"
              :class="{
                amber:
                  event.status === 'REVIEW_REQUIRED' ||
                  event.eventStatus === 'REVIEW_REQUIRED',
              }"
              >{{
                String(event.lastError || "").startsWith("SNAPSHOT_ONLY")
                  ? "状态快照"
                  : event.status || event.eventStatus
              }}</text
            ></view
          ><view class="record-meta safe-word"
            >{{ event.sourceTopic || event.topic }}<br />{{
              event.lastError || event.errorMessage || event.message || ""
            }}</view
          ><view class="subtext">{{
            timeText(
              event.receivedAtMs || event.createdAtMs,
              session.factory?.timezone,
            )
          }}</view></button
        ><view v-if="!events.length" class="empty">暂无符合条件的采集事件</view
        ><button
          v-if="events.length < eventTotal"
          class="load-more"
          :disabled="busy"
          @click="more"
        >
          加载更多</button
        ><view class="notice amber"
          >异常事件只供核验，不能在此盲目重放为成功库存或重复执行设备复位。</view
        ></template
      ></AsyncState
    ><view v-if="actionError && !form" class="error-box">{{ actionError }}</view
    ><view v-if="form" class="modal-mask"
      ><scroll-view scroll-y class="modal" style="max-height: 85vh"
        ><view class="modal-title">{{ form.id ? "编辑" : "新增" }}采集规则</view
        ><view class="field"
          ><text class="field-label">规则代码 *</text
          ><view class="input-box"
            ><input v-model="form.ruleCode" maxlength="64" /></view></view
        ><view class="field"
          ><text class="field-label">业务仓库</text
          ><picker
            :range="['烘干', '旋切']"
            :value="form.warehouseType === 'DRYING' ? 0 : 1"
            :disabled="!!form.id"
            @change="
              form.warehouseType =
                Number($event.detail.value) === 0 ? 'DRYING' : 'PEELING'
            "
            ><view class="input-box picker-value"
              ><text class="picker-label">{{
                form.warehouseType === "DRYING" ? "烘干库" : "旋切库"
              }}</text
              ><AppArrow /></view
            ></picker
          ></view
        ><view class="field"
          ><text class="field-label">平台设备MQTT绑定 *</text
          ><picker
            :range="
              devices.map((d) => d.deviceName + ' · ' + d.publishTopicFilter)
            "
            :value="
              Math.max(
                0,
                devices.findIndex(
                  (d) =>
                    d.deviceId === form!.deviceId &&
                    d.mqttBindingId === form!.mqttBindingId,
                ),
              )
            "
            :disabled="!!form.id"
            @change="selectDevice(Number($event.detail.value))"
            ><view class="input-box picker-value"
              ><text class="picker-label">{{
                devices.find((d) => d.deviceId === form!.deviceId)
                  ?.deviceName || "请选择授权设备"
              }}</text
              ><AppArrow /></view
            ></picker
          ></view
        ><view class="field"
          ><text class="field-label">稳定数据流代码 *</text
          ><view class="input-box"
            ><input
              v-model="form.streamKey"
              maxlength="64"
              :disabled="!!form.id" /></view></view
        ><view class="field"
          ><text class="field-label">接收主题 *</text
          ><view class="input-box"
            ><input v-model="form.topicFilter" maxlength="512" /></view></view
        ><view class="field"
          ><text class="field-label">固定复位主题（可选）</text
          ><view class="input-box"
            ><input v-model="form.resetTopic" maxlength="512" /></view></view
        ><view class="field"
          ><text class="field-label">事件身份</text
          ><picker
            :range="['EDGE_STATE', 'DEVICE_SEQUENCE']"
            :value="form.identityMode === 'DEVICE_SEQUENCE' ? 1 : 0"
            @change="
              form.identityMode =
                Number($event.detail.value) === 0
                  ? 'EDGE_STATE'
                  : 'DEVICE_SEQUENCE'
            "
            ><view class="input-box">{{ form.identityMode }}</view></picker
          ></view
        ><view class="field"
          ><text class="field-label">已核验的字段、倍率、枚举与触发映射</text
          ><view class="input-box">
            <textarea
              v-model="mappingText"
              class="mono"
              style="min-height: 190px"
              maxlength="65536"
            /></view
          ><view class="subtext"
            >fields：业务字段映射；triggers：触发信号；quantities：数量与来源。未核验的映射保留
            verified:false，保持禁用。接收重连首个快照只建立基线。</view
          ></view
        ><view class="switch-line"
          ><text>启用规则</text
          ><switch
            color="#17cce9"
            :checked="!!form.enabled"
            @change="form.enabled = !!($event as any).detail.value" /></view
        ><view v-if="actionError" class="error-box">{{ actionError }}</view
        ><view class="button-row"
          ><button class="secondary" :disabled="busy" @click="closeForm">
            取消</button
          ><button
            class="primary"
            :disabled="busy"
            :loading="busy"
            @click="save"
          >
            保存
          </button></view
        ></scroll-view
      ></view
    ><view v-if="eventDetail" class="modal-mask"
      ><scroll-view scroll-y class="modal" style="max-height: 80vh"
        ><view class="modal-title">采集证据</view
        ><view class="qr-content" style="white-space: pre-wrap">{{
          JSON.stringify(eventDetail, null, 2)
        }}</view
        ><button
          class="secondary"
          style="margin-top: 15px"
          @click="eventDetail = undefined"
        >
          关闭
        </button></scroll-view
      ></view
    ></AppShell
  >
</template>
