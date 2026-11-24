<script setup lang="ts">
import AppArrow from "../../components/AppArrow.vue";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onBackPress } from "@dcloudio/uni-app";
import { request } from "../../services/http";
import {
  deployment,
  currentDeploymentIdentity,
  deploymentStartupError,
  localServiceInfo,
  changeLocalServiceAddress,
} from "../../services/deployment";
import { discoveredTenants, type LoginTenant } from "../../domain/tenants";
import { useSession } from "../../stores/session";
import { errorText } from "../../composables/page";
import { useUnsavedExit } from "../../composables/unsaved";
import { sessionToken } from "../../services/session-token";
import { loginBackHandler } from "../../domain/login-back";
const localService = ref(localServiceInfo());
const defaultServerAddress = computed(() =>
  localService.value?.defaultApiBaseUrl.replace(/^http:\/\//, "") || "",
);
const serverDialog = ref(false),
  serverAddress = ref(""),
  serverError = ref("");
let logoClicks = 0,
  logoClickStartedAt = 0,
  tenantsGeneration = 0,
  captchaGeneration = 0;
const username = ref(""),
  password = ref(""),
  code = ref(""),
  uuid = ref(""),
  captchaImage = ref(""),
  captchaEnabled = ref(false),
  captchaReady = ref(false),
  captchaLoading = ref(false),
  captchaError = ref(""),
  busy = ref(false),
  error = ref(""),
  secureError = ref(""),
  tenants = ref<LoginTenant[]>([]),
  tenantId = ref(""),
  tenantsLoading = ref(false),
  tenantsError = ref("");
const dirty = computed(
  () => !!username.value || !!password.value || !!code.value,
);
const exit = useUnsavedExit(dirty, busy);
const tenantOptions = computed(() => [
  { tenantId: "", companyName: "请选择企业" },
  ...tenants.value,
]);
const selectedCompany = computed(
  () =>
    tenants.value.find((tenant) => tenant.tenantId === tenantId.value)
      ?.companyName,
);
const enterpriseSelectionKey = () =>
  "dq.companySelection:" + currentDeploymentIdentity();
const handleLoginBack = loginBackHandler({
    busy: () => busy.value,
    hasInput: () => dirty.value && !exit.accepted,
    allowExit: () => exit.allowLeave(),
    exit: () => {
      if (getCurrentPages().length > 1) uni.navigateBack();
      // #ifdef APP-PLUS
      else (globalThis as any).plus?.runtime?.quit();
      // #endif
    },
  });
onBackPress(() => {
  if (serverDialog.value) {
    serverDialog.value = false;
    return true;
  }
  return handleLoginBack();
});
function tapBrand() {
  if (!localService.value || busy.value || serverDialog.value) {
    logoClicks = 0;
    return;
  }
  const now = Date.now();
  if (!logoClicks || now - logoClickStartedAt > 2000) {
    logoClicks = 0;
    logoClickStartedAt = now;
  }
  if (++logoClicks < 3) return;
  logoClicks = 0;
  serverAddress.value = localService.value.apiBaseUrl;
  serverError.value = "";
  serverDialog.value = true;
}
async function saveServerAddress() {
  if (busy.value || !serverDialog.value) return;
  serverError.value = "";
  try {
    changeLocalServiceAddress(serverAddress.value);
  } catch (e) {
    serverError.value = errorText(e);
    return;
  }
  // Invalidate both requests before clearing loading flags or starting new ones.
  tenantsGeneration++;
  captchaGeneration++;
  tenantsLoading.value = false;
  captchaLoading.value = false;
  tenants.value = [];
  tenantId.value = "";
  tenantsError.value = "";
  code.value = "";
  uuid.value = "";
  captchaImage.value = "";
  captchaEnabled.value = false;
  captchaReady.value = false;
  captchaError.value = "";
  password.value = "";
  error.value = "";
  secureError.value = "";
  useSession().$reset();
  localService.value = localServiceInfo();
  serverDialog.value = false;
  await reloadLogin();
}
onUnmounted(() => {
  tenantsGeneration++;
  captchaGeneration++;
});
async function loadTenants() {
  const generation = ++tenantsGeneration;
  const identity = currentDeploymentIdentity();
  const current = () => generation === tenantsGeneration && identity === currentDeploymentIdentity();
  tenantsLoading.value = true;
  tenantsError.value = "";
  tenantId.value = "";
  tenants.value = [];
  try {
    const config = deployment();
    if (config.tenantMode === "fixed") {
      tenantId.value = config.tenantId;
      return;
    }
    const options = discoveredTenants(
      await request("/auth/tenant/list", { auth: false }),
    );
    if (!current()) return;
    tenants.value = options;
    const previous = uni.getStorageSync(enterpriseSelectionKey());
    tenantId.value =
      options.length === 1
        ? options[0].tenantId
        : options.some((tenant) => tenant.tenantId === previous)
          ? String(previous)
          : "";
  } catch (e) {
    if (current()) tenantsError.value = errorText(e);
  } finally {
    if (current()) tenantsLoading.value = false;
  }
}
async function captcha() {
  if (captchaLoading.value) return;
  const generation = ++captchaGeneration;
  const identity = currentDeploymentIdentity();
  const current = () => generation === captchaGeneration && identity === currentDeploymentIdentity();
  captchaLoading.value = true;
  captchaReady.value = false;
  captchaError.value = "";
  code.value = "";
  uuid.value = "";
  captchaImage.value = "";
  try {
    const value = await request<{
      captchaEnabled: boolean;
      uuid?: string;
      img?: string;
    }>("/auth/code", { auth: false });
    if (!current()) return;
    if (
      !value ||
      typeof value.captchaEnabled !== "boolean" ||
      (value.captchaEnabled &&
        (typeof value.uuid !== "string" || !value.uuid.trim() ||
          typeof value.img !== "string" || !value.img.trim()))
    ) {
      throw new Error("验证码响应异常，请重新加载");
    }
    captchaEnabled.value = value.captchaEnabled;
    if (value.captchaEnabled) {
      uuid.value = value.uuid || "";
      captchaImage.value = "data:image/png;base64," + value.img;
      code.value = "";
    }
    captchaReady.value = true;
  } catch (e) {
    if (current()) captchaError.value = errorText(e);
  } finally {
    if (current()) captchaLoading.value = false;
  }
}
async function reloadLogin() {
  if (busy.value) return;
  error.value = "";
  await Promise.all([loadTenants(), captcha()]);
}
async function login() {
  if (busy.value || serverDialog.value || tenantsLoading.value || captchaLoading.value) return;
  error.value = "";
  if (!captchaReady.value) {
    await captcha();
    return;
  }
  if (deploymentStartupError()) {
    secureError.value = deploymentStartupError();
    return;
  }
  if (!username.value.trim() || !password.value) {
    error.value = "请输入登录账号和密码";
    return;
  }
  if (tenantsError.value || !tenantId.value) {
    error.value = tenantsError.value || "请选择所属企业";
    return;
  }
  if (captchaEnabled.value && !code.value.trim()) {
    error.value = "请输入验证码";
    return;
  }
  const selectedTenantId = tenantId.value;
  busy.value = true;
  try {
    const result = await request<{ access_token: string; expire_in?: number }>(
      "/auth/login",
      {
        method: "POST",
        auth: false,
        data: {
          clientId: deployment().clientId,
          tenantId: selectedTenantId,
          grantType: "password",
          username: username.value.trim(),
          password: password.value,
          code: code.value,
          uuid: uuid.value,
        },
      },
    );
    if (!result.access_token) throw new Error("服务器未返回有效会话");
    sessionToken.set(result.access_token);
    secureError.value = "";
    uni.setStorageSync(
      "dq.tokenExpiresAt",
      result.expire_in ? Date.now() + Number(result.expire_in) * 1000 : 0,
    );
    await useSession().load();
    uni.setStorageSync(enterpriseSelectionKey(), selectedTenantId);
    password.value = "";
    exit.saved();
    uni.reLaunch({ url: "/pages/home/index" });
  } catch (e) {
    error.value = errorText(e);
    await captcha();
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  if (deploymentStartupError()) {
    secureError.value = deploymentStartupError();
    return;
  }
  try {
    if (sessionToken.get()) {
      busy.value = true;
      try {
        await useSession().load();
        uni.reLaunch({ url: "/pages/home/index" });
        return;
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    await reloadLogin();
  } catch (e) {
    secureError.value = errorText(e);
  }
});
</script>
<template>
  <view class="login">
    <view class="brand">
      <view class="brand-mark" @click="tapBrand">
        <text class="login-logo-text">LOGO</text>
      </view>
      <view>
        <view class="brand-title">**木业集团</view>
        <view class="brand-en">PRODUCTION OS</view>
      </view>
    </view>
    <view class="login-title">MOM生成运行管理系统</view>
    <view v-if="localService" class="local-service-info">
      <view class="local-service-label">本地服务版</view>
      <text class="local-service-address" selectable>连接地址：{{ localService.apiBaseUrl }}</text>
    </view>
    <view v-if="tenantsLoading" class="subtext enterprise-loading" role="status"
      >正在加载企业信息…</view
    >
    <view v-if="tenantsError" class="error-box" role="alert"
      >{{ tenantsError
      }}<button class="link" :disabled="tenantsLoading || captchaLoading" @click="reloadLogin">重新加载企业</button></view
    >
    <view v-else-if="tenants.length > 1" class="field enterprise-field">
      <text class="field-label">所属企业 <text class="required">*</text></text>
      <picker
        :disabled="busy || tenantsLoading"
        :range="tenantOptions"
        range-key="companyName"
        :value="
          Math.max(
            0,
            tenantOptions.findIndex((tenant) => tenant.tenantId === tenantId),
          )
        "
        @change="tenantId = tenantOptions[Number($event.detail.value)].tenantId"
      >
        <view class="input-box picker-value"
          ><text class="picker-label">{{ selectedCompany || "请选择企业" }}</text
          ><AppArrow /></view
        >
      </picker>
    </view>
    <view v-else-if="tenants.length === 1" class="subtext enterprise-name">{{
      selectedCompany
    }}</view>
    <view class="field"
      ><text class="field-label">登录账号 <text class="required">*</text></text
      ><view class="input-box"
        ><input
          v-model="username"
          aria-label="登录账号"
          maxlength="30"
          placeholder="请输入账号"
          placeholder-style="color:#739bb0" /></view
    ></view>
    <view class="field"
      ><text class="field-label">登录密码 <text class="required">*</text></text
      ><view class="input-box"
        ><input
          v-model="password"
          :password="true"
          aria-label="登录密码"
          maxlength="128"
          placeholder="请输入密码"
          placeholder-style="color:#739bb0"
          @confirm="login" /></view
    ></view>
    <view v-if="captchaLoading" class="subtext" role="status">正在加载验证码…</view>
    <view v-if="captchaError" class="error-box" role="alert"
      >验证码加载失败：{{ captchaError }}<button class="link" :disabled="busy || captchaLoading" @click="captcha">重新加载验证码</button></view
    >
    <view v-if="captchaEnabled && captchaReady" class="field"
      ><text class="field-label">验证码</text
      ><view class="row"
        ><view class="input-box" style="flex: 1"
          ><input v-model="code" maxlength="16" aria-label="验证码" /></view
        ><image
          :src="captchaImage"
          class="captcha-image"
          @click="!busy && captcha()" /></view
    ></view>
    <view class="subtext">工厂与权限由登录账号确定</view>
    <view v-if="secureError" class="error-box">{{ secureError }}</view>
    <view v-if="error" class="error-box">{{ error }}</view>
    <button
      class="primary action-with-arrow"
      :disabled="busy || tenantsLoading || captchaLoading || !captchaReady || !!tenantsError || !!secureError"
      :loading="busy"
      @click="login"
    >
      <text>{{ busy ? "正在登录" : "进入工作台" }}</text>
      <AppArrow v-if="!busy" direction="right" variant="plain" color="#023145" />
    </button>
    <view class="subtext login-account-help">使用企业平台授权账号登录</view>
    <view class="login-foot"
      >山东德勤智能设备有限公司<br />DEQIN INTELLIGENT EQUIPMENT</view
    >
    <view v-if="serverDialog" class="modal-mask server-config-mask">
      <view class="modal server-config" role="dialog" aria-modal="true" aria-label="本地服务连接设置">
        <view class="modal-title">本地服务连接设置</view>
        <view class="field">
          <text class="field-label">后端服务地址</text>
          <view class="input-box">
            <input
              v-model="serverAddress"
              aria-label="后端服务地址"
              maxlength="128"
              :focus="true"
              :placeholder="defaultServerAddress"
              placeholder-style="color:#739bb0"
              confirm-type="done"
              @confirm="saveServerAddress"
            />
          </view>
        </view>
        <view class="subtext server-config-help">默认地址：{{ defaultServerAddress }}，可省略 http://。手机与电脑需在同一局域网。</view>
        <view class="subtext server-config-help">保存后将重新加载企业和验证码，请重新输入密码登录。</view>
        <view v-if="serverError" class="error-box" role="alert">{{ serverError }}</view>
        <view class="row server-config-actions">
          <button class="secondary" @click="serverDialog = false">取消</button>
          <button class="primary" @click="saveServerAddress">保存地址</button>
        </view>
      </view>
    </view>
  </view>
</template>
<style scoped>
.login-logo-text {
  font-size: 13px;
  font-style: normal;
  letter-spacing: 0.25px;
  transform: skewX(5deg);
}
.local-service-info {
  margin: -8px 0 22px;
  padding: 10px 12px;
  border: 1px solid #bd9542;
  border-radius: 8px;
  background: #493b20;
  color: #ffe0a0;
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
.enterprise-loading,
.enterprise-name {
  margin-bottom: 22px;
}
.login-account-help {
  margin-top: 18px;
}
.captcha-image {
  width: 110px;
  height: 44px;
  background: white;
  border-radius: 8px;
}
.server-config-mask {
  z-index: 1000;
}
.server-config {
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  max-height: 85vh;
  overflow-y: auto;
}
.server-config-help {
  margin-top: 10px;
  overflow-wrap: anywhere;
}
.server-config-actions {
  margin-top: 22px;
}
.server-config-actions button {
  flex: 1;
  margin: 0;
}
</style>
