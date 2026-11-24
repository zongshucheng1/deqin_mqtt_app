<script setup lang="ts">
import type { RecordItem } from "../domain/types";
import { warehouse, sourceLabels } from "../domain/warehouse";
import { chineseDate, decimalText } from "../domain/format";
const props = defineProps<{
  record: RecordItem;
  selectMode?: boolean;
  selected?: boolean;
}>();
const emit = defineEmits<{ (e: "select", id: string): void }>();
function open(id: string) {
  if (props.selectMode) {
    emit("select", id);
    return;
  }
  uni.navigateTo({ url: "/pages/detail/index?id=" + encodeURIComponent(id) });
}
</script>
<template>
  <button
    class="record-card"
    :class="{ selected }"
    :aria-pressed="selectMode ? !!selected : undefined"
    @click="open(record.id)"
  >
    <view class="row"
      ><text class="record-title"
        >{{ warehouse(record.warehouseType).name }} ·
        {{
          record.detail.woodSpecification ||
          record.detail.customerName ||
          record.detail.machineNumber ||
          record.recordNo
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
    ><view class="row"
      ><view class="record-meta"
        ><view class="safe-word">{{ record.recordNo }}</view
        ><view v-if="record.detail.lengthMm"
          >{{ record.detail.lengthMm }} × {{ record.detail.widthMm }} ×
          {{ record.detail.thicknessMm }} mm</view
        ><view v-if="record.detail.supplierName"
          >{{ record.detail.supplierName }} ·
          {{ record.detail.vehiclePlateNo }}</view
        ><view v-if="record.detail.diameterMm"
          >直径 {{ record.detail.diameterMm }} mm</view
        ></view
      ><text class="record-value"
        >{{
          decimalText(
            record.quantity,
            record.warehouseType === "WHITE_BARK" ? 3 : 0,
          )
        }}<text class="unit">{{
          warehouse(record.warehouseType).unit
        }}</text></text
      ></view
    ><view class="record-foot"
      ><text>{{ sourceLabels[record.quantitySource] }}</text
      ><text>{{ chineseDate(record.recordDate) }}</text></view
    >
  </button>
</template>
