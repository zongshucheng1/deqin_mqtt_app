<script setup lang="ts">
import { computed } from "vue";
import AppArrow from "./AppArrow.vue";
import AppIcon from "./AppIcon.vue";
import {
  chineseDate,
  periodRange,
  shiftDate,
  validDate,
  type Period,
} from "../domain/format";
const props = defineProps<{
  period: Period;
  date: string;
  allLabel?: string;
}>();
const emit = defineEmits<{
  (e: "update:period", value: Period): void;
  (e: "update:date", value: string): void;
  (e: "change"): void;
}>();
const ready = computed(() => validDate(props.date));
const pickerFields = computed(() =>
  props.period === "年" ? "year" : props.period === "月" ? "month" : "day",
);
const pickerValue = computed(() =>
  props.date.slice(
    0,
    pickerFields.value === "year" ? 4 : pickerFields.value === "month" ? 7 : 10,
  ),
);
const dateLabel = computed(() => {
  if (props.period === "年") return `${props.date.slice(0, 4)}年`;
  if (props.period === "月")
    return `${props.date.slice(0, 4)}年${Number(props.date.slice(5, 7))}月`;
  return chineseDate(props.date);
});
const range = computed(() =>
  ready.value ? periodRange(props.period, props.date) : {},
);
function setPeriod(v: Period) {
  emit("update:period", v);
  emit("change");
}
function setDate(v: string) {
  emit("update:date", v);
  emit("change");
}
function selectDate(value: string) {
  // Keep a complete business date for queries when the picker returns only a year or month.
  const date =
    props.period === "年"
      ? `${value.slice(0, 4)}-01-01`
      : props.period === "月"
        ? `${value.slice(0, 7)}-01`
        : value;
  if (validDate(date)) setDate(date);
}
</script>
<template>
  <view v-if="!ready" class="subtext" role="status">正在读取工厂日期…</view>
  <template v-else>
    <view class="chip-row"
      ><button
        v-for="p in ['日', '周', '月', '年', '全部'] as Period[]"
        :key="p"
        class="chip"
        :class="{ active: period === p }"
        @click="setPeriod(p)"
      >
        {{ p }}
      </button></view
    ><view v-if="period !== '全部'" class="date-range-controls"
      ><button
        class="date-arrow"
        aria-label="上一期"
        @click="setDate(shiftDate(date, period, -1))"
      >
        <AppArrow direction="left" variant="plain" :size="20" /></button
      ><picker
        :key="pickerFields"
        mode="date"
        :fields="pickerFields"
        :value="pickerValue"
        class="date-picker"
        @change="selectDate(String($event.detail.value))"
        ><view class="picker-value"
          ><text>{{ dateLabel }}</text
          ><AppIcon name="calendar" :size="18" aria-hidden="true" /></view
        ></picker
      ><button
        class="date-arrow"
        aria-label="下一期"
        @click="setDate(shiftDate(date, period, 1))"
      >
        <AppArrow direction="right" variant="plain" :size="20" />
      </button></view
    ><view class="subtext center" style="margin-top: 9px">{{
      period === "全部"
        ? allLabel || "全部业务日期"
        : chineseDate(range.startDate!) + " — " + chineseDate(range.endDate!)
    }}</view>
  </template>
</template>
