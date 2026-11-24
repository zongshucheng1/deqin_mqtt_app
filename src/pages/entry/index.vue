<script setup lang="ts">
import { ref, computed, nextTick, watch, onUnmounted } from "vue";
import { onLoad, onShow, onHide, onBackPress } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AppArrow from "../../components/AppArrow.vue";
import AppIcon from "../../components/AppIcon.vue";
import FormField from "../../components/FormField.vue";
import {
  detailFields,
  initialEntry,
  tallyDiameters,
  validateEntry,
  rawLengthField,
  type Field,
} from "../../domain/forms";
import type { CreateRecord, Warehouse } from "../../domain/types";
import { warehouse, isWarehouse } from "../../domain/warehouse";
import {
  businessToday,
  chineseDate,
  factoryTimeZone,
} from "../../domain/format";
import { requireSession, useSession } from "../../stores/session";
import { errorText, go, toast } from "../../composables/page";
import { useUnsavedExit } from "../../composables/unsaved";
import { canonical } from "../../services/journal";
import { knownFieldError } from "../../composables/field-errors";
import { submitInbound } from "../../services/inbound-print";
import { api } from "../../services/api";
import { createRawVolumePreview, rawVolumeInput, type RawVolumeState } from "../../domain/raw-wood-volume";
const session = useSession(),
  kind = ref<Warehouse>("RAW_WOOD"),
  form = ref<CreateRecord>(initialEntry("RAW_WOOD", "")),
  factoryReady = ref(false),
  step = ref(1),
  busy = ref(false),
  error = ref(""),
  errors = ref<Record<string, string>>({}),
  scope = ref(""),
  baseline = ref(canonical(form.value)),
  focusedField = ref(""),
  focusedTally = ref<number>();
const dirty = computed(() => canonical(form.value) !== baseline.value);
const exit = useUnsavedExit(dirty, busy);
const info = computed(() => warehouse(kind.value));
const businessFields = computed(() => detailFields[kind.value].filter((field) => kind.value !== "RAW_WOOD" || field.key !== "lengthMm"));
const volumeState = ref<RawVolumeState>({ status: "idle" });
const preview = createRawVolumePreview(api.previewRawVolume, (state) => { volumeState.value = state; }, errorText);
const volumeInput = computed(() => factoryReady.value && kind.value === "RAW_WOOD"
  ? rawVolumeInput(session.factoryId, form.value.detail) : null);
const volumeIdentity = computed(() => JSON.stringify([session.currentScope(), volumeInput.value]));
let previewTimer: ReturnType<typeof setTimeout> | undefined;
function clearPreview() { clearTimeout(previewTimer); preview.clear(); }
function refreshVolume() {
  clearPreview();
  if (volumeInput.value) void preview.run(volumeInput.value);
}
watch(volumeIdentity, () => {
  clearPreview();
  if (volumeInput.value) previewTimer = setTimeout(refreshVolume, 300);
}, { flush: "sync" });
onHide(() => { factoryReady.value = false; clearPreview(); });
onUnmounted(clearPreview);
async function leaveEntry() {
  if (!(await exit.allowLeave())) return;
  if (getCurrentPages().length > 1) uni.navigateBack();
  else
    uni.redirectTo({ url: "/pages/warehouse/index?warehouse=" + kind.value });
}
function backWithinEntry() {
  if (busy.value) return;
  if (kind.value === "RAW_WOOD" && step.value === 2) {
    step.value = 1;
    return;
  }
  leaveEntry();
}
onBackPress(() => {
  if (exit.accepted) return false;
  if (busy.value) return true;
  if (kind.value === "RAW_WOOD" && step.value === 2) {
    step.value = 1;
    return true;
  }
  if (dirty.value) {
    leaveEntry();
    return true;
  }
  return false;
});
onLoad((query) => {
  if (isWarehouse(query?.warehouse)) kind.value = query!.warehouse;
  form.value = initialEntry(kind.value, "");
  baseline.value = canonical(form.value);
});
onShow(async () => {
  const discarded = exit.accepted;
  factoryReady.value = false;
  exit.reset();
  try {
    if (!(await requireSession())) return;
    const factoryIdentity = JSON.stringify([
      session.currentScope(),
      factoryTimeZone(session.factory?.timezone),
    ]);
    if (discarded || !scope.value || scope.value !== factoryIdentity) {
      form.value = initialEntry(
        kind.value,
        businessToday(session.factory?.timezone),
      );
      step.value = 1;
      baseline.value = canonical(form.value);
      errors.value = {};
      if (scope.value && scope.value !== factoryIdentity)
        toast("工厂或时区已变化，已清空临时输入");
    }
    scope.value = factoryIdentity;
    factoryReady.value = true;
  } catch (e) {
    error.value = errorText(e);
  }
});
const qtyField = computed<Field>(() => ({
  key: "quantity",
  label: kind.value === "WHITE_BARK" ? "入库吨数" : "入库数量",
  required: true,
  type: kind.value === "WHITE_BARK" ? "decimal" : "integer",
  unit: info.value.unit,
  scale: 3,
}));
const total = computed(() =>
  tallyDiameters
    .reduce((n, d) => {
      const s = String(form.value.detail[`tally${d}cmCount`] || "0");
      return n + (/^\d+$/.test(s) ? BigInt(s) : 0n);
    }, 0n)
    .toString(),
);
const tallyDifference = computed(() => {
  if (!volumeInput.value || !/^\d+$/.test(form.value.quantity)) return null;
  const difference = BigInt(total.value) - BigInt(form.value.quantity);
  return (difference > 0n ? "+" : "") + difference.toString();
});
function focusTally(diameter: number) {
  focusedTally.value = diameter;
  const key = `tally${diameter}cmCount`;
  if (/^0+$/.test(String(form.value.detail[key]))) form.value.detail[key] = "";
}
async function locateFirstError() {
  const key = Object.keys(errors.value)[0];
  if (!key) return;
  if (!key.startsWith("tally")) step.value = 1;
  focusedField.value = "";
  await nextTick();
  const query = uni.createSelectorQuery();
  query.select("#field-" + key).boundingClientRect();
  query.selectViewport().scrollOffset(() => {});
  query.exec((results) => {
    const field = results[0],
      viewport = results[1];
    if (field)
      uni.pageScrollTo({
        scrollTop: Math.max(
          0,
          Number(field.top) + Number(viewport?.scrollTop || 0) - 110,
        ),
        duration: 150,
      });
    focusedField.value = key;
  });
}
function next() {
  errors.value = validateEntry(form.value, false);
  error.value = "";
  if (Object.keys(errors.value).length) {
    error.value = "请检查标红的必填项和输入范围";
    locateFirstError();
    return;
  }
  focusedTally.value = undefined;
  step.value = 2;
  uni.pageScrollTo({ scrollTop: 0, duration: 150 });
}
async function submit() {
  if (busy.value) return;
  errors.value = validateEntry(form.value);
  error.value = "";
  if (Object.keys(errors.value).length) {
    error.value =
      "请检查标红的项目" +
      (errors.value.tally ? "，" + errors.value.tally : "");
    locateFirstError();
    return;
  }
  if (kind.value === "RAW_WOOD" && volumeState.value.status !== "ready") {
    error.value = "请等待方量计算完成，失败时点击重新计算";
    return;
  }
  busy.value = true;
  try {
    const data: CreateRecord = JSON.parse(JSON.stringify(form.value));
    if (!data.recordNo) data.recordNo = undefined;
    if (kind.value === "RAW_WOOD") {
      data.detail.vehiclePlateNo = String(
        data.detail.vehiclePlateNo,
      ).toUpperCase();
      for (const diameter of tallyDiameters) {
        const key = `tally${diameter}cmCount`;
        data.detail[key] = String(data.detail[key] ?? "") || "0";
      }
    }
    const { record } = await submitInbound(data);
    exit.saved();
    form.value = initialEntry(
      kind.value,
      businessToday(session.factory?.timezone),
    );
    step.value = 1;
    toast("入库成功，标签由后台分配给工厂电脑打印");
    uni.redirectTo({ url: "/pages/detail/index?id=" + record.id });
  } catch (e) {
    error.value = errorText(e);
    const fieldError = knownFieldError(e, [
      "quantity",
      "recordDate",
      "recordNo",
      "tally",
      ...detailFields[kind.value].map((field) => field.key),
      ...tallyDiameters.map((d) => `tally${d}cmCount`),
    ]);
    if (fieldError) {
      errors.value = { [fieldError.key]: fieldError.message };
      locateFirstError();
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AppShell
    :title="info.short + '入库'"
    back
    :nav="false"
    :back-handler="backWithinEntry"
    ><view v-if="!factoryReady" class="subtext" role="status"
      >正在读取工厂授权与业务日期…</view
    >
    <template v-if="factoryReady">
      <view v-if="kind === 'RAW_WOOD'" class="progress"
        ><text class="step" :class="{ active: step === 1 }">1 基础信息</text
        ><AppArrow direction="right" variant="plain" :size="14"
        /><text class="step" :class="{ active: step === 2 }"
          >2 径级码单</text
        ></view
      ><view v-if="step === 1"
        ><view class="panel"
          ><view class="form-heading">入库信息</view
          ><view
            id="field-recordDate"
            class="field"
            :class="{ invalid: errors.recordDate }"
            ><text class="field-label"
              >业务日期 <text class="required">*</text></text
            ><picker
              mode="date"
              :value="form.recordDate"
              @change="form.recordDate = String($event.detail.value)"
              ><view class="input-box picker-value"
                ><text>{{ chineseDate(form.recordDate) }}</text
                ><AppIcon name="calendar" :size="18" /></view
              ></picker
            ><text v-if="errors.recordDate" class="error-text">{{
              errors.recordDate
            }}</text></view
          ><FormField
            v-if="kind === 'PEELING' || kind === 'DRYING'"
            v-model="form.recordNo!"
            :field="{
              key: 'recordNo',
              label: '入库编号',
              required: true,
              max: 64,
            }"
            :error="errors.recordNo"
            :focused="focusedField === 'recordNo'"
          /><FormField
            v-model="form.quantity"
            :field="qtyField"
            :error="errors.quantity"
            :focused="focusedField === 'quantity'"
          /><view v-if="kind === 'RAW_WOOD'" class="subtext"
            >根数独立填写，下一步核对14档码单合计。</view
          ><FormField v-if="kind === 'RAW_WOOD'" style="margin-top: 16px" v-model="form.detail.lengthMm" :field="rawLengthField"
            :error="errors.lengthMm" :focused="focusedField === 'lengthMm'" /></view
        ><view class="panel"
          ><view class="form-heading">{{ info.short }}业务明细</view
          ><view class="field-grid"
            ><FormField
              v-for="field in businessFields"
              :key="field.key"
              v-model="form.detail[field.key]"
              :field="field"
              :error="errors[field.key]"
              :focused="focusedField === field.key"
              :disabled="
                kind === 'DRYING' && ['lengthMm', 'widthMm'].includes(field.key)
              "
              :class="{ wide: field.type === 'text' }" /></view></view
        ><view v-if="kind === 'PEELING' || kind === 'DRYING'" class="notice"
          >本页为人工新增。机器采集记录自动进入同一仓库列表，用来源标识区分。</view
        ></view
      ><view v-else
        ><view class="panel hero"
          ><view class="label">基础信息 · 原木数量</view
          ><view class="big-value"
            >{{ form.quantity }}<text class="unit">根</text></view
          ><view class="subtext">原木长度：{{ form.detail.lengthMm }} mm（本批一致）</view
          ><view class="row"
            ><text class="subtext"
              >{{ form.detail.supplierName }} ·
              {{ form.detail.vehiclePlateNo }}</text
            ><button class="link" @click="step = 1">修改</button></view
          ></view
        ><view id="field-tally" class="panel" :class="{ invalid: errors.tally }"
          ><view class="form-heading">径级码单 · 公分</view
          ><view class="tally-grid"
            ><view
              v-for="d in tallyDiameters"
              :id="'field-tally' + d + 'cmCount'"
              :key="d"
              class="tally-cell"
              :class="{ invalid: errors['tally' + d + 'cmCount'] }"
              ><text>{{ d }} 公分</text
              ><input
                v-model="form.detail[`tally${d}cmCount`]"
                type="number"
                maxlength="10"
                :placeholder="focusedTally === d ? '' : '0'"
                :focus="focusedField === 'tally' + d + 'cmCount'"
                :aria-label="d + '公分根数'"
                @focus="focusTally(d)"
                @blur="focusedTally = undefined"
              /><view
                v-if="errors['tally' + d + 'cmCount']"
                class="error-text"
                >{{ errors["tally" + d + "cmCount"] }}</view
              ></view
            ></view
          ><view class="divider" /><view class="row"
            ><text>码单合计</text
            ><text class="record-value"
              >{{ total }}<text class="unit">根</text></text
            ></view
          ><view v-if="tallyDifference !== null" :class="tallyDifference === '0' ? 'subtext' : 'error-text'"
            >与填写根数差额：{{ tallyDifference }} 根</view
          ><view class="error-text" v-if="errors.tally">{{ errors.tally }}</view
          ><view class="subtext"
            >合计须等于独立录入的原木根数。两项比例保留基础信息中的人工填写值。</view
          ></view
        ></view
      ><view v-if="kind === 'RAW_WOOD' && step === 2" class="panel" aria-live="polite">
        <view class="form-heading">计算方量</view>
        <view v-if="volumeState.status === 'ready'" class="big-value">{{ volumeState.result.volumeM3 }}<text class="unit">m³</text></view>
        <view v-else-if="volumeState.status === 'loading'" class="subtext">计算中…</view>
        <view v-else-if="volumeState.status === 'error'" class="error-text">{{ volumeState.message }}</view>
        <view v-else class="subtext">待计算，请填写有效长度和径级码单。</view>
        <button v-if="volumeState.status === 'error'" class="link" :disabled="busy" @click="refreshVolume">重新计算</button>
        <view class="subtext">按所填长度和径级根数计算。提交前请核对长度、根数和方量。</view>
      </view
      ><view v-if="error" class="error-box">{{ error }}</view
      ><view class="button-row"
        ><button
          v-if="step === 2"
          class="secondary"
          :disabled="busy"
          @click="step = 1"
        >
          上一步</button
        ><button
          v-if="kind === 'RAW_WOOD' && step === 1"
          class="primary action-with-arrow"
          @click="next"
        >
          <text>下一步 · 码单录入</text
          ><AppArrow direction="right" variant="plain" color="#023145" /></button
        ><button
          v-else
          class="primary"
          :loading="busy"
          :disabled="busy"
          @click="submit"
        >
          确认入库
        </button></view
      ><view class="subtext center"
        >提交结果由服务器确认，网络中断时不会显示入库成功。</view
      ></template
    >
    <view v-else-if="error" class="error-box">{{ error }}</view></AppShell
  >
</template>
