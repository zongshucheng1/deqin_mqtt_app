<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import AppArrow from "./AppArrow.vue";
import { localServiceInfo } from "../services/deployment";
const localService = localServiceInfo();
const props = withDefaults(
  defineProps<{
    title: string;
    titleIcon?: string;
    active?: string;
    back?: boolean;
    nav?: boolean;
    backHandler?: () => void;
    wide?: boolean;
  }>(),
  { nav: true, back: false },
);
const links = [
  ["home", "home", "工作台"],
  ["warehouse", "warehouse", "仓库"],
  ["scan", "scan", "扫码"],
  ["records", "records", "记录"],
  ["mine", "mine", "我的"],
];
function go(page: string) {
  uni.redirectTo({ url: `/pages/${page}/index` });
}
function backPage() {
  if (props.backHandler) return props.backHandler();
  if (getCurrentPages().length > 1) uni.navigateBack();
  else go("home");
}
</script>
<template>
  <view class="screen" :class="{ 'wide-screen': wide }"
    ><view class="topbar"
      ><button v-if="back" class="back" aria-label="返回" @click="backPage">
        <AppArrow direction="left" variant="plain" :size="22" /></button
      ><image
        v-if="titleIcon"
        class="topbar-icon"
        :src="titleIcon"
        mode="aspectFit"
        aria-hidden="true"
      /><view class="topbar-heading"
        ><text class="topbar-title">{{ title }}</text
        ><text v-if="localService" class="local-service-badge">本地服务</text
      ></view
      ><slot name="right" /></view
    ><view class="content"><slot /></view
    ><view v-if="nav !== false" class="bottom-nav"
      ><button
        v-for="[page, symbol, label] in links"
        :key="page"
        class="nav-item"
        :class="{ active: active === page, scan: page === 'scan' }"
        @click="go(page)"
      >
        <view class="nav-symbol"
          ><AppIcon
            :name="symbol"
            :size="22"
            :color="
              page === 'scan'
                ? '#023149'
                : active === page
                  ? '#33dfff'
                  : '#81a4be'
            " /></view
        ><text>{{ label }}</text>
      </button></view
    ></view
  >
</template>
<style scoped>
.topbar-icon {
  display: block;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.topbar-heading {
  flex: 1;
  min-width: 0;
}
.topbar-heading .topbar-title {
  display: block;
}
.local-service-badge {
  display: inline-block;
  margin-top: 3px;
  padding: 1px 6px;
  border: 1px solid #bd9542;
  border-radius: 4px;
  background: #493b20;
  color: #ffe0a0;
  font-size: 10px;
  line-height: 1.5;
  font-weight: 600;
}
</style>
