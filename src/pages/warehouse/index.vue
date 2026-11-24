<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import AppIcon from "../../components/AppIcon.vue";
import { ref, computed, nextTick } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import PeriodPicker from "../../components/PeriodPicker.vue";
import RecordCard from "../../components/RecordCard.vue";
import { api } from "../../services/api";
import { useSession } from "../../stores/session";
import { useFactoryDate } from "../../composables/factory-date";
import { usePage, go } from "../../composables/page";
import type { RecordItem, Warehouse, Statistics } from "../../domain/types";
import {
  warehouses,
  warehouse,
  isWarehouse,
  sourceFilters,
} from "../../domain/warehouse";
import { periodRange, decimalText, type Period } from "../../domain/format";
const calendar = useFactoryDate();
const kind = ref<Warehouse>("RAW_WOOD"),
  period = ref<Period>("周"),
  date = calendar.date,
  source = ref(""),
  records = ref<RecordItem[]>([]),
  stats = ref<Statistics>(),
  page = ref(1),
  total = ref(0),
  moreBusy = ref(false),
  session = useSession();
const info = computed(() => warehouse(kind.value)),
  summary = computed(() =>
    stats.value?.warehouses.find((w) => w.warehouseType === kind.value),
  );
onLoad((query) => {
  if (isWarehouse(query?.warehouse)) kind.value = query!.warehouse;
});
const { loading, error, refresh, revision } = usePage(async () => {
  calendar.sync(session.currentScope(), session.factory?.timezone);
  page.value = 1;
  const [s, r] = await Promise.all([
    api.statistics(periodRange(period.value, date.value)),
    api.records({
      warehouseType: kind.value,
      ...periodRange(period.value, date.value),
      quantitySource: source.value as any,
      pageNum: 1,
      pageSize: 20,
    }),
  ]);
  stats.value = s;
  records.value = r.rows;
  total.value = r.total;
});
async function select(e: any) {
  kind.value = warehouses[Number(e.detail.value)].code;
  source.value = "";
  await refresh();
}
async function changed() {
  await nextTick();
  refresh();
}
async function more() {
  if (moreBusy.value) return;
  const generation = revision.value;
  moreBusy.value = true;
  try {
    const r = await api.records({
      warehouseType: kind.value,
      ...periodRange(period.value, date.value),
      quantitySource: source.value as any,
      pageNum: page.value + 1,
      pageSize: 20,
    });
    if (generation !== revision.value) return;
    records.value.push(...r.rows);
    page.value++;
    total.value = r.total;
  } catch (e) {
    if (generation === revision.value) error.value = (e as Error).message;
  } finally {
    moreBusy.value = false;
  }
}
</script>
<template>
  <AppShell :title="info.name" active="warehouse"
    ><template #right
      ><button class="link" @click="go('records', 'warehouse=' + kind)">
        查记录
      </button></template
    ><picker
      :range="warehouses"
      range-key="name"
      :value="warehouses.findIndex((w) => w.code === kind)"
      @change="select"
      ><view class="input-box picker-value"
        ><text class="picker-label">{{ info.name }}</text
        ><view class="picker-affordance"
          ><text class="subtext">切换仓库</text><AppArrow /></view
        ></view
      ></picker
    ><view class="gap" /><view
      v-if="summary && !loading && !error"
      class="panel hero"
      ><view class="label"
        >当前在库数量<text class="subtext" style="float: right"
          >全部日期</text
        ></view
      ><view v-if="summary.currentStock.available" class="big-value"
        >{{
          decimalText(
            summary.currentStock.value!,
            kind === "WHITE_BARK" ? 3 : 0,
          )
        }}<text class="unit">{{ info.unit }}</text></view
      ><view class="metric-grid two"
        ><view v-if="summary.currentBatches.available"
          ><text class="metric-label">在库批次</text
          ><text class="metric-value"
            >{{ summary.currentBatches.value
            }}<text class="unit">批</text></text
          ></view
        ><view
          ><text class="metric-label">记录渠道</text
          ><text class="metric-value" style="font-size: 12px">{{
            kind === "PEELING" || kind === "DRYING" ? "人工 / 机器" : "人工录入"
          }}</text></view
        ></view
      ></view
    ><view class="button-row"
      ><button class="primary" @click="go('entry', 'warehouse=' + kind)">
        ＋ 新增入库</button
      ><button class="secondary" @click="go('scan', 'warehouse=' + kind)">
        <AppIcon name="qr-scan" :size="20" color="#c2e7f3" aria-hidden="true" />
        <text>扫码出库</text>
      </button></view
    ><PeriodPicker
      v-model:period="period"
      v-model:date="date"
      @change="changed"
    /><view v-if="kind === 'PEELING' || kind === 'DRYING'" class="chip-row"
      ><button
        v-for="[s, label] in sourceFilters.slice(0, 3)"
        :key="s"
        class="chip"
        :class="{ active: source === s }"
        @click="
          source = s;
          refresh();
        "
      >
        {{ label }}
      </button></view
    ><view
      v-if="summary && !loading && !error"
      class="metric-grid"
      style="margin: 16px 0"
      ><view v-if="summary.periodInbound.available"
        ><text class="metric-label">本期入库</text
        ><text class="metric-value"
          >{{ summary.periodInbound.value
          }}<text class="unit">{{ info.unit }}</text></text
        ></view
      ><view v-if="summary.periodOutbound.available"
        ><text class="metric-label">本期出库</text
        ><text class="metric-value"
          >{{ summary.periodOutbound.value
          }}<text class="unit">{{ info.unit }}</text></text
        ></view
      ><view v-if="summary.periodInboundBatches.available"
        ><text class="metric-label">入库批次</text
        ><text class="metric-value"
          >{{ summary.periodInboundBatches.value
          }}<text class="unit">批</text></text
        ></view
      ></view
    ><view class="section-heading"
      ><text class="section-title">本期入库批次</text
      ><text class="subtext">{{ total }} 批</text></view
    ><AsyncState
      :loading="loading"
      :error="error"
      :empty="!records.length"
      @retry="refresh"
      ><RecordCard v-for="r in records" :key="r.id" :record="r" /><button
        v-if="records.length < total"
        class="load-more"
        :loading="moreBusy"
        @click="more"
      >
        加载更多
      </button></AsyncState
    ></AppShell
  >
</template>
