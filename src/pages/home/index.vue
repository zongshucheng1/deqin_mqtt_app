<script setup lang="ts">
import { ref, computed } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import AppArrow from "../../components/AppArrow.vue";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import RecordCard from "../../components/RecordCard.vue";
import { api } from "../../services/api";
import { useSession } from "../../stores/session";
import { usePage, go } from "../../composables/page";
import type { RecordItem, Statistics } from "../../domain/types";
import { warehouses, warehouse } from "../../domain/warehouse";
import { decimalText, businessToday } from "../../domain/format";
const session = useSession(),
  stats = ref<Statistics>(),
  records = ref<RecordItem[]>([]);
const entries = [
  ["entry", "RAW_WOOD", "原木入库", "木"],
  ["entry", "PEELING", "旋切入库", "板"],
  ["entry", "DRYING", "烘干入库", "热"],
  ["scan", "", "扫码出库", "⌗"],
  ["warehouse", "WOOD_CORE", "木芯管理", "芯"],
  ["warehouse", "WHITE_BARK", "白皮管理", "皮"],
  ["print", "", "打印中心", "印"],
  ["statistics", "", "业务统计", "统"],
];
const mainWarehouse = computed(() =>
  stats.value?.warehouses.find((w) => w.warehouseType === "RAW_WOOD"),
);
const { loading, error, refresh } = usePage(async () => {
  const today = businessToday(session.factory?.timezone);
  const [s, r] = await Promise.all([
    api.statistics({ startDate: today, endDate: today }),
    api.records({ pageNum: 1, pageSize: 3 }),
  ]);
  stats.value = s;
  records.value = r.rows;
});
async function switchFactory(e: any) {
  session.selectFactory(
    session.context!.factories[Number(e.detail.value)].factoryId,
  );
  stats.value = undefined;
  records.value = [];
  await refresh();
}
</script>
<template>
  <AppShell title="**木业集团" title-icon="/static/app-icons/logo-96.png" active="home"
    ><template #right><text class="tag blue">生产业务</text></template
    ><picker
      :range="session.context?.factories || []"
      range-key="factoryName"
      :value="
        Math.max(
          0,
          session.context?.factories.findIndex(
            (f) => f.factoryId === session.factoryId,
          ) || 0,
        )
      "
      aria-label="切换工厂"
      @change="switchFactory"
      ><view class="factory-picker"
        ><text class="factory-picker-label"
          >{{ session.factory?.factoryName || "未分配工厂" }} ·
          {{ session.roleLabel }}</text
        ><AppArrow /></view
      ></picker
    ><view class="gap" /><AsyncState
      :loading="loading"
      :error="error"
      @retry="refresh"
      ><view
        ><view
          v-for="s in mainWarehouse ? [mainWarehouse] : []"
          :key="s.warehouseType"
          class="panel hero"
          @click="go('warehouse', 'warehouse=' + s.warehouseType)"
          ><view class="label"
            >{{ warehouse(s.warehouseType).short }}当前在库</view
          ><view v-if="s.currentStock.available" class="big-value"
            >{{
              decimalText(
                s.currentStock.value!,
                s.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}<text class="unit">{{
              warehouse(s.warehouseType).unit
            }}</text></view
          ><view v-else class="notice amber">{{
            s.currentStock.reason || "库存数据暂不可用"
          }}</view
          ><view class="metric-grid two"
            ><view v-if="s.periodInbound.available"
              ><text class="metric-label">今日入库</text
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
            ><view v-if="s.currentBatches.available"
              ><text class="metric-label">在库批次</text
              ><text class="metric-value"
                >{{ s.currentBatches.value }}<text class="unit">批</text></text
              ></view
            ></view
          ></view
        ></view
      ><view class="inventory-grid"
        ><view
          v-for="s in stats?.warehouses.filter(
            (w) => w.warehouseType !== 'RAW_WOOD',
          )"
          :key="s.warehouseType"
          class="inventory-mini"
          @click="go('warehouse', 'warehouse=' + s.warehouseType)"
          ><view class="row"
            ><text class="label"
              >{{ warehouse(s.warehouseType).short }}当前在库</text
            ><AppArrow direction="right" /></view
          ><view v-if="s.currentStock.available" class="mini-kpi"
            >{{
              decimalText(
                s.currentStock.value!,
                s.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}<text class="unit">{{
              warehouse(s.warehouseType).unit
            }}</text></view
          ><text v-else class="subtext">库存暂不可用</text
          ><text v-if="s.currentBatches.available" class="subtext"
            >{{ s.currentBatches.value }} 批在库</text
          ></view
        ></view
      ><view class="section-heading"
        ><text class="section-title">现场作业</text
        ><text class="subtext">五库统一管理</text></view
      ><view class="actions-grid"
        ><button
          v-for="[page, kind, label, icon] in entries"
          :key="label"
          class="entry-button"
          @click="go(page, kind ? 'warehouse=' + kind : '')"
        >
          <view class="entry-icon"><AppIcon :name="kind || page" /></view
          ><text>{{ label }}</text>
        </button></view
      ><view class="section-heading"
        ><text class="section-title">最近作业</text
        ><button class="link action-with-arrow" @click="go('records')"
          ><text>全部记录</text
          ><AppArrow direction="right" variant="plain" /></button></view
      ><RecordCard v-for="r in records" :key="r.id" :record="r" /><view
        v-if="!records.length"
        class="empty"
        >新系统暂无业务记录</view
      ></AsyncState
    ></AppShell
  >
</template>
