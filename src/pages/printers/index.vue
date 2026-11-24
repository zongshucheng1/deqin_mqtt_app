<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import { usePrinterStatus } from "../../composables/printer-setup";
import { go } from "../../composables/page";
import { warehouses, isWarehouse, warehouse } from "../../domain/warehouse";

const {
  kind,
  config,
  selectedPrinter,
  pcConfigured,
  serverManaged,
  statusText,
  loading,
  error,
  refresh,
  changeWarehouse,
} = usePrinterStatus();
onLoad((query) => {
  if (isWarehouse(query?.warehouse)) kind.value = query!.warehouse;
});
</script>
<template>
  <AppShell title="工厂打印状态" back>
    <picker
      :range="warehouses"
      range-key="name"
      :value="warehouses.findIndex((item) => item.code === kind)"
      :disabled="loading"
      @change="changeWarehouse"
    >
      <view class="input-box picker-value"
        ><text class="picker-label">{{ warehouse(kind).name }}</text
        ><AppArrow /></view
      >
    </picker>
    <view class="subtext intro"
      >所有仓库均由后台分配打印任务，各打印机对应的工厂电脑负责执行。</view
    >
    <AsyncState :loading="loading" :error="error" @retry="refresh">
      <view class="panel">
        <view class="row"
          ><text class="form-heading">后台电脑打印</text
          ><text :class="['tag', serverManaged ? 'blue' : 'gray']">{{
            statusText
          }}</text></view
        >
        <view v-if="pcConfigured" class="target-name">{{
          selectedPrinter?.printerName ||
          "后台已分配打印机 " + config?.printerId
        }}</view>
        <view v-else class="target-name">等待管理员配置</view>
        <view v-if="pcConfigured && config" class="subtext"
          >{{ config.paperWidthMm }} × {{ config.paperHeightMm }} mm ·
          {{ config.copies }} 份</view
        >
        <view v-if="serverManaged" class="notice success"
          >本仓新入库由服务器安排打印。实际执行和出纸结果请在打印中心核对。</view
        >
        <view v-else class="notice amber"
          >请联系管理员在后台“电脑打印”中绑定本仓、完成现场测试并启用。未就绪时不会改用手机打印。</view
        >
        <view class="subtext intro"
          >打印机、纸张和执行电脑均在后台维护。此页只显示后台状态，不代表电脑在线或标签已经出纸。</view
        >
        <view class="button-row"
          ><button class="secondary" :disabled="loading" @click="refresh">
            刷新后台状态</button
          ><button class="primary" @click="go('print')">
            查看打印中心
          </button></view
        >
      </view>
    </AsyncState>
  </AppShell>
</template>
<style scoped>
.intro {
  margin: 14px 2px 20px;
}
.target-name {
  margin: 18px 0 12px;
  font-size: 20px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.row {
  gap: 10px;
  flex-wrap: wrap;
}
.form-heading {
  margin: 0;
}
.notice {
  margin-top: 18px;
}
</style>
