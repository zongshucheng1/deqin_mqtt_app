<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import AppIcon from "../../components/AppIcon.vue";
import { ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import RecordCard from "../../components/RecordCard.vue";
import { warehouses, isWarehouse } from "../../domain/warehouse";
import type { Warehouse, RecordItem } from "../../domain/types";
import { api } from "../../services/api";
import { requireSession } from "../../stores/session";
import { errorText, go } from "../../composables/page";
const kind = ref<Warehouse>("RAW_WOOD"),
  content = ref(""),
  busy = ref(false),
  error = ref(""),
  manualNo = ref(""),
  manualQueried = ref(false),
  manualResults = ref<RecordItem[]>([]);
onLoad((q) => {
  if (isWarehouse(q?.warehouse)) kind.value = q!.warehouse;
});
onShow(() => {
  requireSession().catch((e) => (error.value = errorText(e)));
  busy.value = false;
});
async function resolve() {
  if (busy.value) return;
  error.value = "";
  if (!content.value.trim()) {
    error.value = "请扫码或输入完整二维码内容";
    return;
  }
  busy.value = true;
  try {
    const r = await api.resolve(content.value.trim(), kind.value);
    if (r.stockStatus !== "IN_STOCK" || r.voidFlag)
      throw new Error(
        r.voidFlag ? "该批已作废，不能出库" : "该批已出库，不能重复出库",
      );
    go("checkout", "id=" + r.id);
    content.value = "";
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function findByNumber() {
  if (busy.value) return;
  error.value = "";
  manualResults.value = [];
  manualQueried.value = false;
  const value = manualNo.value.trim();
  if (!value || value.length > 64) {
    error.value = "请输入不超过64字的完整业务单号";
    return;
  }
  busy.value = true;
  try {
    const page = await api.records({
      warehouseType: kind.value,
      recordNo: value,
      pageNum: 1,
      pageSize: 20,
    });
    manualResults.value = page.rows.filter(
      (record) =>
        record.recordNo === value && record.warehouseType === kind.value,
    );
    manualQueried.value = true;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function selectManual(id: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const record = await api.record(id);
    if (record.warehouseType !== kind.value)
      throw new Error("该批次不属于当前选择的仓库");
    if (record.stockStatus !== "IN_STOCK" || record.voidFlag)
      throw new Error(
        record.voidFlag ? "该批已作废，不能出库" : "该批已出库，不能重复出库",
      );
    go("checkout", "id=" + record.id);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
function scan() {
  // #ifdef H5
  error.value =
    "浏览器不支持原生扫码，请使用Android APP或输入标签上的完整二维码内容。";
  return;
  // #endif
  // #ifndef H5
  if (busy.value) return;
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ["qrCode"],
    success: (r) => {
      content.value = r.result;
      resolve();
    },
    fail: (e) => {
      error.value = e.errMsg?.includes("cancel")
        ? "已取消扫码"
        : "无法使用摄像头，请在系统设置中授权后重试";
    },
  });
  // #endif
}
</script>
<template>
  <AppShell title="扫码出库" active="scan"
    ><view class="panel"
      ><view class="form-heading">选择目标仓库</view
      ><picker
        :range="warehouses"
        range-key="name"
        :value="warehouses.findIndex((w) => w.code === kind)"
        @change="
          kind = warehouses[Number($event.detail.value)].code;
          error = '';
          manualResults = [];
          manualQueried = false;
        "
        ><view class="input-box picker-value"
          ><text class="picker-label">{{ warehouses.find((w) => w.code === kind)?.name }}</text
          ><AppArrow /></view
        ></picker
      ></view
    ><view class="panel center" style="padding: 35px 20px"
      ><view class="scan-illustration" aria-hidden="true"
        ><AppIcon name="qr-scan" :size="86" color="#33dfff" /></view
      ><view style="font-size: 17px; margin: 14px 0 8px"
        >扫描入库标签二维码</view
      ><view class="subtext">识别后核对库别、批次、数量，确认后整批出库。</view
      ><button
        class="primary"
        style="margin-top: 25px"
        :disabled="busy"
        @click="scan"
      >
        打开摄像头扫码
      </button></view
    ><view class="panel"
      ><view class="field"
        ><text class="field-label">二维码内容</text
        ><view class="input-box">
          <textarea
            v-model="content"
            auto-height
            maxlength="512"
            placeholder="也可输入完整二维码内容"
            placeholder-style="color:#739bb0"
          /></view></view
      ><button
        class="secondary"
        :loading="busy"
        :disabled="busy"
        @click="resolve"
      >
        识别并核对批次
      </button></view
    ><view v-if="error" class="error-box">{{ error }}</view
    ><view class="panel manual-number-lookup"
      ><view class="form-heading">按业务单号查询</view
      ><view class="subtext"
        >摄像头无法使用时，输入标签上的完整业务单号。查询仅限当前授权工厂和所选仓库，选择批次后仍需核对并确认出库。</view
      ><view class="field"
        ><text class="field-label">完整业务单号</text
        ><view class="input-box"
          ><input
            v-model="manualNo"
            aria-label="完整业务单号"
            maxlength="64"
            confirm-type="search"
            placeholder="请输入完整业务单号"
            @confirm="findByNumber" /></view></view
      ><button
        class="secondary"
        :disabled="busy"
        :loading="busy"
        @click="findByNumber"
      >
        查询业务单号</button
      ><view v-if="manualQueried && !manualResults.length" class="notice amber"
        >当前工厂及仓库未找到该单号，请检查完整单号和仓库选择。</view
      ><view v-if="manualResults.length" class="notice"
        >请选择下方批次核对，本步不会扣减库存。</view
      ><RecordCard
        v-for="record in manualResults"
        :key="record.id"
        :record="record"
        select-mode
        @select="selectManual" /></view
    ><view class="notice"
      >只接受新系统二维码。服务器会再次核验租户、工厂、库别和有效状态。</view
    ></AppShell
  >
</template>
<style scoped>
.scan-illustration {
  height: 112px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
