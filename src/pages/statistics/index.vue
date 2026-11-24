<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, computed, nextTick } from "vue";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import PeriodPicker from "../../components/PeriodPicker.vue";
import { api } from "../../services/api";
import { usePage } from "../../composables/page";
import type { Statistics, Warehouse } from "../../domain/types";
import { warehouses, warehouse, sourceLabels } from "../../domain/warehouse";
import {
  periodRange,
  decimalText,
  timeText,
  chineseDate,
  batchShare,
  type Period,
} from "../../domain/format";
import { useSession } from "../../stores/session";
import { useFactoryDate } from "../../composables/factory-date";
const calendar = useFactoryDate();
const kind = ref<Warehouse | "">(""),
  period = ref<Period>("周"),
  date = calendar.date,
  data = ref<Statistics>(),
  options = [{ code: "", name: "全部仓库" }, ...warehouses],
  session = useSession();
const { loading, error, refresh } = usePage(async () => {
  calendar.sync(session.currentScope(), session.factory?.timezone);
  data.value = await api.statistics(periodRange(period.value, date.value));
});
const visible = computed(
  () =>
    data.value?.warehouses.filter(
      (s) => !kind.value || kind.value === s.warehouseType,
    ) || [],
);
async function changed() {
  await nextTick();
  refresh();
}
const expandedDays = ref<Record<string, boolean>>({});
</script>
<template>
  <AppShell title="业务统计" back
    ><picker
      :range="options"
      range-key="name"
      :value="options.findIndex((o) => o.code === kind)"
      @change="
        kind = options[Number($event.detail.value)].code as Warehouse | ''
      "
      ><view class="input-box picker-value"
        ><text class="picker-label">{{ options.find((o) => o.code === kind)?.name }}</text
        ><AppArrow /></view
      ></picker
    ><PeriodPicker
      v-model:period="period"
      v-model:date="date"
      @change="changed"
    /><view class="notice"
      >当前库存按全部业务日期统计，期间入库按业务日期，期间出库按实际出库时间。五库分别计量。</view
    ><AsyncState
      :loading="loading"
      :error="error"
      :empty="!visible.length"
      empty-text="当前范围暂无可用统计"
      @retry="refresh"
      ><view v-for="s in visible" :key="s.warehouseType" class="panel"
        ><view class="row"
          ><text class="form-heading" style="margin: 0">{{
            warehouse(s.warehouseType).name
          }}</text
          ><text class="tag blue">{{
            warehouse(s.warehouseType).unit
          }}</text></view
        ><view v-if="s.currentStock.available" class="big-value"
          >{{
            decimalText(
              s.currentStock.value!,
              s.warehouseType === "WHITE_BARK" ? 3 : 0,
            )
          }}<text class="unit"
            >当前在库{{ warehouse(s.warehouseType).unit }}</text
          ></view
        ><view v-else class="notice amber">{{
          s.currentStock.reason || "库存数量暂不可用"
        }}</view
        ><view class="metric-grid"
          ><view v-if="s.currentBatches.available"
            ><text class="metric-label">在库批次</text
            ><text class="metric-value"
              >{{ s.currentBatches.value }}<text class="unit">批</text></text
            ></view
          ><view v-if="s.periodInbound.available"
            ><text class="metric-label">期间入库</text
            ><text class="metric-value"
              >{{
                decimalText(
                  s.periodInbound.value!,
                  s.warehouseType === "WHITE_BARK" ? 3 : 0,
                )
              }}<text class="unit">{{
                warehouse(s.warehouseType).unit
              }}</text></text
            ></view
          ><view v-if="s.periodOutbound.available"
            ><text class="metric-label">期间出库</text
            ><text class="metric-value"
              >{{
                decimalText(
                  s.periodOutbound.value!,
                  s.warehouseType === "WHITE_BARK" ? 3 : 0,
                )
              }}<text class="unit">{{
                warehouse(s.warehouseType).unit
              }}</text></text
            ></view
          ></view
        ><view class="divider" /><view class="row"
          ><text v-if="s.periodInboundBatches.available" class="subtext"
            >期间入库 {{ s.periodInboundBatches.value }} 批</text
          ><text v-if="s.periodOutboundBatches.available" class="subtext"
            >期间出库 {{ s.periodOutboundBatches.value }} 批</text
          ></view
        ><view
          v-if="s.manualQuantity?.available || s.machineQuantity?.available"
          class="row"
          style="margin-top: 10px"
          ><text v-if="s.manualQuantity?.available" class="subtext"
            >人工 {{ s.manualQuantity.value }}
            {{ warehouse(s.warehouseType).unit }}</text
          ><text v-if="s.machineQuantity?.available" class="subtext"
            >机器 {{ s.machineQuantity.value }}
            {{ warehouse(s.warehouseType).unit }}</text
          ></view
        ><view
          v-if="
            s.sources?.some((source) => source.inboundBatches > 0) &&
            s.periodInboundBatches.available &&
            batchShare(0, s.periodInboundBatches.value) !== ''
          "
          class="source-distribution"
          ><view class="form-heading">本期入库来源</view
          ><view class="subtext"
            >按本库本期入库批次计算，设备人工打码归机器采集。</view
          ><view
            v-for="source in s.sources.filter(
              (item) => item.inboundBatches > 0,
            )"
            :key="source.quantitySource"
            class="source-stat-row"
            ><view class="row"
              ><text>{{ sourceLabels[source.quantitySource] }}</text
              ><text>{{
                batchShare(source.inboundBatches, s.periodInboundBatches.value)
              }}</text></view
            ><view class="record-meta"
              >{{
                decimalText(
                  source.inboundQuantity,
                  s.warehouseType === "WHITE_BARK" ? 3 : 0,
                )
              }}
              {{ source.unit }} · {{ source.inboundBatches }} 批</view
            ></view
          ></view
        ><view v-if="s.daily?.length" class="daily-table"
          ><view class="daily-row muted"
            ><text>业务日期</text><text>入库</text><text>出库</text></view
          ><view
            v-for="day in expandedDays[s.warehouseType]
              ? s.daily
              : s.daily.slice(-14)"
            :key="day.date"
            class="daily-row"
            ><text>{{ chineseDate(day.date) }}</text
            ><text>{{
              decimalText(
                day.inboundQuantity,
                s.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}</text
            ><text>{{
              decimalText(
                day.outboundQuantity,
                s.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}</text></view
          ><button
            v-if="s.daily.length > 14"
            class="link"
            @click="
              expandedDays[s.warehouseType] = !expandedDays[s.warehouseType]
            "
          >
            {{
              expandedDays[s.warehouseType]
                ? "收起按日数据"
                : "展开全部按日数据"
            }}
          </button></view
        ></view
      ><view class="subtext center"
        >{{ session.factory?.factoryName }} ·
        {{ timeText(data?.updatedAtMs, session.factory?.timezone) }}
        本次读取</view
      ></AsyncState
    ></AppShell
  >
</template>
