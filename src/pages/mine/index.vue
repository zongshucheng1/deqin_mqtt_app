<script setup lang="ts">
import { ref, computed } from "vue";
import AppShell from "../../components/AppShell.vue";
import AppArrow from "../../components/AppArrow.vue";
import AsyncState from "../../components/AsyncState.vue";
import { useSession } from "../../stores/session";
import { usePage, go, confirm, errorText, toast } from "../../composables/page";
import {
  pendingWrites,
  resolvePending,
  type PendingWrite,
} from "../../services/journal";
import { timeText } from "../../domain/format";
import appManifest from "../../manifest.json";
import { localServiceInfo } from "../../services/deployment";
import { openExternalMirrorSettings, supportsExternalMirror } from "../../services/native";
const localService = localServiceInfo();
const showExternalMirror = supportsExternalMirror();
const session = useSession(),
  pending = ref<PendingWrite[]>([]),
  busy = ref(false),
  advanced = ref(false),
  actionError = ref("");
const { loading, error, refresh } = usePage(async () => {
  pending.value = pendingWrites().filter(
    (p) => p.scope === session.currentScope(),
  );
});
async function resolve(p: PendingWrite) {
  if (busy.value) return;
  if (
    !(await confirm(
      "核对原提交结果",
      "将使用原请求标识和原始内容向服务器核对。服务器幂等处理，不生成新请求标识。",
    ))
  )
    return;
  busy.value = true;
  actionError.value = "";
  try {
    await resolvePending(p, () => session.currentScope());
    toast("原请求已确认，请查看对应批次或任务状态");
    pending.value = pendingWrites().filter(
      (x) => x.scope === session.currentScope(),
    );
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function logout() {
  if (
    await confirm(
      "退出登录",
      pending.value.length
        ? "待确认请求会保留在本设备，重新登录相同账号与工厂后继续核对。确定退出？"
        : "确定退出当前账号？",
    )
  )
    session.logout();
}
async function openMirrorSettings() {
  try {
    await openExternalMirrorSettings();
  } catch (error) {
    toast(errorText(error));
  }
}
</script>
<template>
  <AppShell title="我的" active="mine"
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><view class="panel hero"
        ><view class="row-start"
          ><view class="brand-mark">{{
            session.context?.username?.slice(0, 1).toUpperCase()
          }}</view
          ><view
            ><view style="font-size: 20px">{{ session.context?.username }}</view
            ><view class="subtext">{{
              session.factory?.factoryName
            }}</view></view
          ></view
        ><view class="divider" /><text class="tag blue">{{
          session.roleLabel
        }}</text></view
      ><view class="panel"
        ><button class="record-card" @click="go('print')">
          <view class="row"
            ><text>统一打印中心</text><AppArrow direction="right" /></view
          ></button
        ><button class="record-card" @click="go('statistics')">
          <view class="row"><text>业务统计</text><AppArrow direction="right" /></view></button
        ><button v-if="showExternalMirror" class="record-card" @click="openMirrorSettings">
          <view class="row"><text>外接屏镜像</text><AppArrow direction="right" /></view></button
        ><button
          v-if="session.worker"
          class="record-card"
          @click="go('printers')"
        >
          <view class="row"
            ><text>工厂打印状态</text><AppArrow direction="right" /></view
          ></button
        ><button
          v-if="session.manager"
          class="record-card"
          @click="go('members')"
        >
          <view class="row"><text>人员管理</text><AppArrow direction="right" /></view></button
        ><button
          v-if="session.manager"
          class="record-card"
          :aria-expanded="advanced"
          @click="advanced = !advanced"
        >
          <view class="row"
            ><text>高级设置</text><AppArrow :direction="advanced ? 'up' : 'down'" /></view
          ></button
        ><button
          v-if="session.manager && advanced"
          class="record-card"
          @click="go('host')"
        >
          <view class="row"><text>后台采集设置</text><AppArrow direction="right" /></view>
        </button></view
      ><view v-if="pending.length" class="section-heading"
        ><text class="section-title">待确认操作</text
        ><text class="subtext">{{ pending.length }} 项</text></view
      ><view v-for="p in pending" :key="p.key" class="panel"
        ><view class="record-title">{{
          p.operation.startsWith("create:")
            ? "入库提交"
            : p.operation.startsWith("outbound:")
              ? "整批出库"
              : p.operation.startsWith("delete:")
                ? "删除批次"
                : p.operation.startsWith("config")
                  ? "打印配置"
                  : p.operation.startsWith("command-review:")
                    ? "复位命令核验"
                    : p.operation.startsWith("verify:")
                      ? "打印结果核验"
                      : p.operation.startsWith("cancel:")
                        ? "取消待发打印"
                        : p.operation.startsWith("retry:")
                          ? "重试打印"
                          : "业务操作"
        }}</view
        ><view class="record-meta">{{
          timeText(p.createdAt, session.factory?.timezone)
        }}</view
        ><view class="notice amber"
          >原提交可能已成功，核对前不要新建相同业务。</view
        ><button
          class="secondary"
          :disabled="busy"
          :loading="busy"
          @click="resolve(p)"
        >
          核对原提交结果
        </button></view
      ><view v-if="actionError" class="error-box">{{ actionError }}</view
      ><button class="secondary" style="margin-top: 24px" @click="logout">
        退出登录</button
      ><view v-if="localService" class="local-service-info">
        <view class="local-service-label">本地服务版</view>
        <text class="local-service-address" selectable>连接地址：{{ localService.apiBaseUrl }}</text>
      </view
      ><view class="app-version"
        >DEQIN PRODUCTION OS · {{ appManifest.versionName }}</view
      ></AsyncState
    ></AppShell
  >
</template>
<style scoped>
.local-service-info {
  margin-top: 22px;
  padding: 10px 12px;
  border: 1px solid #bd9542;
  border-radius: 8px;
  background: #493b20;
  color: #ffe0a0;
  text-align: center;
}
.local-service-label {
  font-size: 14px;
  font-weight: 600;
}
.local-service-address {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
