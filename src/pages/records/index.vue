<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, nextTick, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import PeriodPicker from "../../components/PeriodPicker.vue";
import RecordCard from "../../components/RecordCard.vue";
import RecordDetail from "../../components/RecordDetail.vue";
import { useWideLayout } from "../../composables/layout";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
import type { RecordItem, Warehouse } from "../../domain/types";
import { warehouses, isWarehouse, sourceFilters } from "../../domain/warehouse";
import { periodRange, type Period } from "../../domain/format";
import { useFactoryDate } from "../../composables/factory-date";
import { useSession } from "../../stores/session";
import { api } from "../../services/api";
import { usePage, errorText } from "../../composables/page";
import { usePageVisible } from "../../composables/page-visible";
const pageVisible = usePageVisible();
const session = useSession(),
  calendar = useFactoryDate();
const kind = ref<Warehouse | "">(""),
  status = ref(""),
  source = ref(""),
  keyword = ref(""),
  period = ref<Period>("全部"),
  date = calendar.date,
  records = ref<RecordItem[]>([]),
  total = ref(0),
  page = ref(1),
  moreBusy = ref(false),
  selectedId = ref("");
const wide = useWideLayout();
const detail = ref<{
  dirty: boolean;
  busy: boolean;
  editing: boolean;
  closeEditing: () => Promise<void>;
}>();
const editingBusy = computed(() => !!detail.value?.busy),
  dirty = computed(() => !!detail.value?.dirty);
const exit = useUnsavedExit(dirty, editingBusy);
useGuardedBack(exit, dirty, editingBusy, {
  isOpen: () => !!detail.value?.editing,
  close: async () => {
    await detail.value?.closeEditing();
  },
});
async function selectRecord(id: string) {
  if (!(await exit.allowLeave())) return;
  selectedId.value = id;
  exit.reset();
}
const warehouseOptions = [{ code: "", name: "全部仓库" }, ...warehouses];
onLoad((q) => {
  if (isWarehouse(q?.warehouse)) kind.value = q!.warehouse;
});
const query = () => ({
  warehouseType: kind.value || undefined,
  stockStatus: status.value || undefined,
  quantitySource: source.value || undefined,
  ...periodRange(period.value, date.value),
  keyword: keyword.value.trim(),
  pageSize: 20,
});
let appliedQuery = query();
const { loading, error, refresh, revision } = usePage(async () => {
  calendar.sync(session.currentScope(), session.factory?.timezone);
  exit.reset();
  page.value = 1;
  appliedQuery = query();
  const r = await api.records({ ...appliedQuery, pageNum: 1 } as any);
  records.value = r.rows;
  total.value = r.total;
  if (!r.rows.some((record) => record.id === selectedId.value))
    selectedId.value = r.rows[0]?.id || "";
});
async function changed() {
  await nextTick();
  refresh();
}
function reset() {
  kind.value = "";
  status.value = "";
  source.value = "";
  keyword.value = "";
  period.value = "全部";
  calendar.reset();
  refresh();
}
async function more() {
  if (moreBusy.value) return;
  const generation = revision.value;
  moreBusy.value = true;
  try {
    const r = await api.records({
      ...appliedQuery,
      pageNum: page.value + 1,
    } as any);
    if (generation !== revision.value) return;
    records.value.push(...r.rows);
    total.value = r.total;
    page.value++;
  } catch (e) {
    if (generation === revision.value) error.value = errorText(e);
  } finally {
    moreBusy.value = false;
  }
}
</script>
<template>
  <AppShell title="记录查询" active="records" :wide="wide"
    ><template #right
      ><button class="link" @click="reset">重置</button></template
    ><view class="input-box"
      ><input
        v-model="keyword"
        aria-label="按单号或业务字段搜索"
        confirm-type="search"
        placeholder="单号 / 供应商 / 机号 / 业务字段"
        placeholder-style="color:#739bb0"
        maxlength="100"
        @confirm="refresh"
      /><button class="link" @click="refresh">搜索</button></view
    ><view class="gap" /><picker
      :range="warehouseOptions"
      range-key="name"
      :value="warehouseOptions.findIndex((w) => w.code === kind)"
      @change="
        kind = warehouseOptions[Number($event.detail.value)].code as
          | Warehouse
          | '';
        refresh();
      "
      ><view class="input-box picker-value"
        ><text class="picker-label">{{ warehouseOptions.find((w) => w.code === kind)?.name }}</text
        ><AppArrow /></view
      ></picker
    ><view class="chip-row"
      ><button
        v-for="[value, label] in [
          ['', '全部状态'],
          ['IN_STOCK', '在库'],
          ['OUTBOUND', '已出库'],
        ]"
        :key="value"
        class="chip"
        :class="{ active: status === value }"
        @click="
          status = value;
          refresh();
        "
      >
        {{ label }}
      </button></view
    ><picker
      :range="sourceFilters.map((x) => x[1])"
      :value="sourceFilters.findIndex((x) => x[0] === source)"
      @change="
        source = sourceFilters[Number($event.detail.value)][0];
        refresh();
      "
      ><view class="input-box picker-value"
        ><text class="picker-label">{{ sourceFilters.find((x) => x[0] === source)?.[1] }}</text
        ><AppArrow /></view
      ></picker
    ><PeriodPicker
      v-model:period="period"
      v-model:date="date"
      @change="changed"
    /><view class="section-heading"
      ><text class="section-title">查询结果</text
      ><text class="subtext">{{ total }} 批</text></view
    ><view class="records-layout" :class="{ split: wide }"
      ><view class="records-list"
        ><AsyncState
          :loading="loading"
          :error="error"
          :empty="!records.length"
          @retry="refresh"
          ><RecordCard
            v-for="record in records"
            :key="record.id"
            :record="record"
            :select-mode="wide"
            :selected="wide && selectedId === record.id"
            @select="selectRecord"
          /><button
            v-if="records.length < total"
            class="load-more"
            :loading="moreBusy"
            @click="more"
          >
            加载更多
          </button></AsyncState
        ></view
      ><view v-if="wide || detail?.editing" class="records-detail-pane"
        ><template v-if="!loading && !error && selectedId"
          ><view class="section-heading"
            ><text class="section-title">批次详情</text></view
          ><RecordDetail
            ref="detail"
            :key="revision + ':' + selectedId"
            :record-id="selectedId"
            :active="pageVisible && wide"
            embedded
            @deleted="refresh" /></template
        ><view v-else-if="!loading && !error" class="panel subtext"
          >选择左侧批次查看详情</view
        ></view
      ></view
    ></AppShell
  >
</template>
