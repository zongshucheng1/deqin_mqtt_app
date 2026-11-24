<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import type { RecordItem } from "../../domain/types";
import { warehouse, sourceLabels } from "../../domain/warehouse";
import { api } from "../../services/api";
import { usePage, confirm, errorText, go } from "../../composables/page";
import { decimalText, chineseDate } from "../../domain/format";
const id = ref(""),
  record = ref<RecordItem>(),
  busy = ref(false),
  operationError = ref(""),
  done = ref(false);
onLoad((q) => (id.value = String(q?.id || "")));
const { loading, error, refresh } = usePage(async () => {
  record.value = await api.record(id.value);
});
async function outbound() {
  if (busy.value || !record.value) return;
  if (
    !(await confirm(
      "确认整批出库",
      `本次出库 ${record.value.quantity} ${warehouse(record.value.warehouseType).unit}，不拆分批次。确认继续？`,
    ))
  )
    return;
  busy.value = true;
  operationError.value = "";
  try {
    record.value = await api.outbound(record.value);
    done.value = true;
  } catch (e) {
    operationError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
const detailLabels: Record<string, string> = {
  supplierName: "供应商",
  vehiclePlateNo: "车牌号",
  customerName: "客户",
  machineNumber: "机号",
  woodSpecification: "原木规格",
  lengthMm: "长 mm",
  widthMm: "宽 mm",
  thicknessMm: "厚 mm",
  grade: "等级",
  team: "班组",
};
</script>
<template>
  <AppShell :title="done ? '出库完成' : '出库确认'" back
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><template v-if="record"
        ><view v-if="done" class="panel center" style="padding: 32px"
          ><view style="font-size: 54px; color: #53dfb3">✓</view
          ><view style="font-size: 22px; margin: 13px 0">整批出库已确认</view
          ><text class="subtext">库存和批次状态已由服务器更新</text></view
        ><view class="panel hero"
          ><view class="label"
            >{{ warehouse(record.warehouseType).name }} ·
            {{ record.recordNo }}</view
          ><view class="big-value"
            >{{
              decimalText(
                record.quantity,
                record.warehouseType === "WHITE_BARK" ? 3 : 0,
              )
            }}<text class="unit">{{
              warehouse(record.warehouseType).unit
            }}</text></view
          ><view
            class="tag"
            :class="{ gray: record.stockStatus === 'OUTBOUND' }"
            >{{ record.stockStatus === "OUTBOUND" ? "已出库" : "在库" }}</view
          ></view
        ><view class="panel"
          ><view class="detail-row"
            ><text class="detail-key">业务日期</text
            ><text>{{ chineseDate(record.recordDate) }}</text></view
          ><view class="detail-row"
            ><text class="detail-key">入库来源</text
            ><text>{{ sourceLabels[record.quantitySource] }}</text></view
          ><view
            v-for="(value, key) in record.detail"
            :key="key"
            class="detail-row"
            v-show="
              [
                'supplierName',
                'vehiclePlateNo',
                'customerName',
                'machineNumber',
                'woodSpecification',
                'lengthMm',
                'widthMm',
                'thicknessMm',
                'grade',
                'team',
              ].includes(String(key))
            "
            ><text class="detail-key">{{ detailLabels[String(key)] }}</text
            ><text>{{ value }}</text></view
          ></view
        ><view v-if="operationError" class="error-box">{{
          operationError
        }}</view
        ><view v-if="record.voidFlag" class="notice amber"
          >本批已作废，不能执行出库。</view
        ><template v-if="!done"
          ><view class="notice amber"
            >请核对数量与实物。本次为整批出库，确认后服务器校验最新状态。</view
          ><button
            class="primary"
            :disabled="
              busy || record.stockStatus !== 'IN_STOCK' || !!record.voidFlag
            "
            :loading="busy"
            @click="outbound"
          >
            {{
              record.stockStatus === "OUTBOUND" ? "该批已出库" : "确认整批出库"
            }}
          </button></template
        ><view v-else class="button-row"
          ><button
            class="primary"
            @click="go('scan', 'warehouse=' + record.warehouseType)"
          >
            继续扫码</button
          ><button class="secondary" @click="go('detail', 'id=' + record.id)">
            查看详情
          </button></view
        ></template
      ></AsyncState
    ></AppShell
  >
</template>
