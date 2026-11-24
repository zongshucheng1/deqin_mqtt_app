<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import { api } from "../../services/api";
import { useSession } from "../../stores/session";
import { usePage, confirm, errorText, toast } from "../../composables/page";
import type { Member, PlatformRoleOption } from "../../domain/types";
import { canBindMemberTarget, canChangeMemberStatus, platformRoleText } from "../../domain/authorization";
import { ApiError } from "../../services/http";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
const session = useSession(),
  members = ref<Member[]>([]),
  dialog = ref<"add" | "profile" | "password" | "">(""),
  selected = ref<Member>(),
  formScope = ref(""),
  formFactory = ref(""),
  readback = ref<Member>(),
  busy = ref(false),
  unknown = ref(false),
  actionError = ref(""),
  username = ref(""),
  password = ref(""),
  nickName = ref(""),
  phoneNumber = ref(""),
  email = ref(""),
  sex = ref("2");
let dialogRevision = 0;
const { loading, error, refresh } = usePage(async () => {
  if (exit.accepted) clearDialog();
  exit.reset();
  if (!session.manager) throw new Error("当前角色无权维护工厂成员");
  const scope = session.currentScope();
  const rows = (await api.members()).rows;
  if (scope !== session.currentScope()) return;
  members.value = rows;
});
const bindMode = ref(true),
  candidates = ref<Pick<Member, "userId" | "username" | "nickName" | "roleNames" | "capabilities" | "protectedSuperAdmin">[]>(
    [],
  ),
  candidateId = ref(""),
  roleOptions = ref<PlatformRoleOption[]>([]),
  roleIds = ref<string[]>([]),
  rolesLoading = ref(false);
watch(username, () => { candidateId.value = ""; candidates.value = []; });
watch(() => [session.currentScope(), session.factoryId], ([scope, factory]) => {
  if (dialog.value && (factory !== formFactory.value || (scope && scope !== formScope.value))) {
    clearDialog();
    actionError.value = "账号或工厂已切换，请重新选择要维护的成员";
  }
});
function canEdit(member: Member | undefined, action: "profile" | "password") {
  return !!member && session.manager &&
    (action === "profile" ? member.canEditProfile === true : member.canResetPassword === true);
}
function canChangeStatus(member: Member) {
  return session.manager && canChangeMemberStatus(session.context?.permissions, member);
}
function canBind(account: Pick<Member, "protectedSuperAdmin"> | undefined) {
  return session.manager && canBindMemberTarget(session.context?.permissions, account);
}
function selectCandidate(account: (typeof candidates.value)[number]) {
  if (busy.value || !canBind(account)) return;
  candidateId.value = account.userId;
}
function formIsCurrent(scope = formScope.value) {
  if (!scope || scope !== session.currentScope() || !session.manager) {
    actionError.value = "账号、工厂或权限已变化，请关闭后重新读取人员列表";
    return false;
  }
  return true;
}
function clearDialog() {
  dialogRevision++;
  dialog.value = "";
  selected.value = undefined;
  readback.value = undefined;
  password.value = "";
  username.value = "";
  nickName.value = "";
  phoneNumber.value = "";
  email.value = "";
  formScope.value = "";
  formFactory.value = "";
}
async function setBindMode(existing: boolean) {
  if (busy.value || rolesLoading.value || (!existing && !session.can("system:user:add"))) return;
  bindMode.value = existing;
  roleIds.value = [];
  actionError.value = "";
  if (existing) return;
  rolesLoading.value = true;
  try { roleOptions.value = await api.roleOptions(); }
  catch (e) { roleOptions.value = []; actionError.value = errorText(e); }
  finally { rolesLoading.value = false; }
}
function toggleRole(id: string) {
  if (busy.value || rolesLoading.value || !roleOptions.value.some(r => r.roleId === id)) return;
  roleIds.value = roleIds.value.includes(id) ? roleIds.value.filter(value => value !== id) : [...roleIds.value, id];
  if (roleIds.value.length && actionError.value === "请读取并选择可授予的平台角色") actionError.value = "";
}
const dirty = computed(
  () =>
    dialog.value === "profile"
      ? nickName.value !== (selected.value?.nickName || "") ||
        phoneNumber.value !== (selected.value?.phoneNumber || "") ||
        email.value !== (selected.value?.email || "")
      : !!dialog.value && (!!username.value ||
      !!password.value ||
      !!nickName.value ||
      sex.value !== "2" ||
      !!candidateId.value || !!roleIds.value.length),
);
const exit = useUnsavedExit(dirty, busy);
async function closeDialog() {
  if (!(await exit.allowLeave())) return;
  const needsReadback = unknown.value;
  clearDialog();
  exit.reset();
  if (needsReadback) await refresh();
}
const back = useGuardedBack(exit, dirty, busy, {
  isOpen: () => !!dialog.value,
  close: closeDialog,
});
function open(action: "add" | "profile" | "password", member?: Member) {
  if (busy.value || !session.manager || (action !== "add" && !canEdit(member, action))) return;
  dialogRevision++;
  formScope.value = session.currentScope();
  formFactory.value = session.factoryId;
  dialog.value = action;
  selected.value = member ? { ...member } : undefined;
  readback.value = undefined;
  username.value = "";
  password.value = "";
  nickName.value = action === "profile" ? member?.nickName || "" : "";
  phoneNumber.value = action === "profile" ? member?.phoneNumber || "" : "";
  email.value = action === "profile" ? member?.email || "" : "";
  sex.value = "2";
  actionError.value = "";
  unknown.value = false;
  bindMode.value = true;
  candidateId.value = "";
  candidates.value = [];
  roleOptions.value = [];
  roleIds.value = [];
  exit.reset();
}
async function searchAccount() {
  actionError.value = "";
  candidates.value = [];
  candidateId.value = "";
  if (!username.value.trim()) {
    actionError.value = "请输入完整平台账号后查询";
    return;
  }
  busy.value = true;
  try {
    candidates.value = await api.memberCandidates(username.value.trim());
    if (!candidates.value.length)
      actionError.value = "未找到可绑定的有效平台账号";
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function submit() {
  if (busy.value || rolesLoading.value || unknown.value) return;
  actionError.value = "";
  if (!dialog.value || !formIsCurrent()) return;
  const action = dialog.value, member = selected.value, scope = formScope.value, revision = dialogRevision;
  if (action !== "add" && !canEdit(member, action)) {
    actionError.value = "当前账号无权维护该成员账号，请刷新人员列表"; return;
  }
  if (action === "profile") {
    if (!nickName.value.trim() || nickName.value.trim().length > 30 || /[<>]/.test(nickName.value)) {
      actionError.value = "姓名必填、不超过30字且不能包含尖括号"; return;
    }
    if (phoneNumber.value.trim() && !/^1[3-9]\d{9}$/.test(phoneNumber.value.trim())) {
      actionError.value = "请填写有效的11位手机号，或留空"; return;
    }
    if (email.value.trim() && (email.value.trim().length > 50 || !/^[^\s@]+@[^\s@]+$/.test(email.value.trim()))) {
      actionError.value = "请填写有效邮箱（不超过50字），或留空"; return;
    }
  } else if (action === "add" && bindMode.value) {
    if (!candidateId.value) {
      actionError.value = "请查询并选择要绑定的已有平台账号";
      return;
    }
    if (!canBind(candidates.value.find(account => account.userId === candidateId.value))) {
      actionError.value = "只有超级管理员可以维护超级管理员的工厂授权";
      return;
    }
  } else {
    if (dialog.value === "add" && (!session.can("system:user:add") || !roleIds.value.length ||
        roleIds.value.some(id => !roleOptions.value.some(r => r.roleId === id)))) {
      actionError.value = "请读取并选择可授予的平台角色"; return;
    }
    if (!/^.{8,30}$/.test(password.value)) {
      actionError.value = "密码长度须为8至30位";
      return;
    }
    if (
      dialog.value === "add" &&
      (!username.value.trim() || !nickName.value.trim())
    ) {
      actionError.value = "请输入账号和姓名";
      return;
    }
  }
  busy.value = true;
  try {
    if (action === "add" && !bindMode.value && !(await confirm(
      "确认新增平台账号",
      "所选平台角色在该账号的所有已授权工厂一致。本次同时授权当前工厂，是否继续？",
    ))) return;
    if (action === "password" && !(await confirm(
      "确认重设密码",
      `将重设 ${member?.username} 的平台账号密码，所有登录入口均使用新密码。确认继续？`,
    ))) return;
    if (revision !== dialogRevision || !formIsCurrent(scope)) return;
    if (action === "add")
      await api.addMember(
        bindMode.value
          ? { userId: candidateId.value }
          : {
              username: username.value.trim(),
              password: password.value,
              nickName: nickName.value.trim(),
              sex: sex.value,
              roleIds: [...roleIds.value],
            },
      );
    else if (member)
      await api.memberAction(member, action, action === "profile"
        ? { nickName: nickName.value.trim(), phoneNumber: phoneNumber.value.trim(), email: email.value.trim() }
        : { password: password.value });
    if (revision !== dialogRevision || !formIsCurrent(scope)) return;
    clearDialog();
    toast("人员操作已确认");
    await refresh();
  } catch (e) {
    if (revision !== dialogRevision) return;
    unknown.value = e instanceof ApiError && e.unknownResult;
    actionError.value =
      errorText(e) +
      (unknown.value ? action === "password"
        ? "。结果待确认，已停止重复提交。人员列表不能证明密码是否已更改，请由操作员核对新密码；密码不会保存在设备上。"
        : action === "profile"
          ? "。结果待确认，已停止重复提交；请重新读取资料核对。"
          : "。结果待确认，已停止重复提交；请关闭后读取人员列表核对，密码不会保存在设备上。" : "");
  } finally {
    busy.value = false;
  }
}
async function readCurrentProfile() {
  if (busy.value || !unknown.value || !formIsCurrent()) return;
  const scope = formScope.value, revision = dialogRevision;
  busy.value = true;
  try {
    const rows = (await api.members()).rows;
    if (revision !== dialogRevision || !formIsCurrent(scope)) return;
    members.value = rows;
    readback.value = rows.find(member => member.id === selected.value?.id);
    if (!readback.value) actionError.value = "成员已不在当前列表中，请关闭后重新读取";
  } catch (e) {
    if (revision === dialogRevision) actionError.value = errorText(e);
  } finally { busy.value = false; }
}
async function toggle(member: Member) {
  if (busy.value || !canChangeStatus(member)) return;
  const scope = session.currentScope();
  if (
    !(await confirm(
      member.status === "0" ? "停用本工厂授权" : "恢复本工厂授权",
      member.status === "0"
        ? "停用后将不能继续访问本工厂作业。确认继续？"
        : "确认恢复该账号在本工厂的作业权限？",
    ))
  )
    return;
  if (!formIsCurrent(scope) || !canChangeStatus(member)) return;
  busy.value = true;
  actionError.value = "";
  try {
    await api.memberAction(member, "status", {
      status: member.status === "0" ? "1" : "0",
    });
    await refresh();
    toast("状态已更新");
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AppShell title="人员管理" back :back-handler="back"
    ><template #right
      ><button v-if="session.manager" class="link" @click="open('add')">
        授权成员
      </button></template
    ><AsyncState
      :loading="loading"
      :error="error"
      :empty="!members.length"
      empty-text="当前工厂暂无成员"
      @retry="refresh"
      ><view v-for="member in members" :key="member.id" class="panel"
        ><view class="row"
          ><text class="record-title">{{
            member.nickName || member.username
          }}</text
          ><text class="tag" :class="{ gray: member.status === '1' }">{{
            member.status === "1"
              ? "已停用"
              : platformRoleText(member.roleNames)
          }}</text></view
        ><view class="record-meta">账号 {{ member.username }}</view
        ><view v-if="member.phoneNumber" class="record-meta">手机号 {{ member.phoneNumber }}</view
        ><view v-if="member.email" class="record-meta">邮箱 {{ member.email }}</view
        ><view v-if="member.accountEditReason && !canEdit(member, 'profile') && !canEdit(member, 'password')" class="subtext">{{ member.accountEditReason }}</view
        ><view v-if="member.statusEditReason && !canChangeStatus(member)" class="subtext">{{ member.statusEditReason }}</view
        ><view
          class="button-row"
          style="margin-bottom: 0"
          ><button
            v-if="canEdit(member, 'profile')"
            class="secondary"
            :disabled="busy"
            @click="open('profile', member)"
          >
            编辑资料</button
          ><button
            v-if="canEdit(member, 'password')"
            class="secondary"
            :disabled="busy"
            @click="open('password', member)"
          >
            重设密码</button
          ><button v-if="canChangeStatus(member)" class="secondary" :disabled="busy" @click="toggle(member)">
            {{ member.status === "0" ? "停用" : "启用" }}
          </button></view
        ></view
      ></AsyncState
    ><view v-if="actionError && !dialog" class="error-box">{{
      actionError
    }}</view
    ><view v-if="dialog" class="modal-mask"
      ><view class="modal"
        ><view class="modal-title">{{
          dialog === "add" ? "授权工厂成员" : dialog === "profile" ? "编辑操作员资料" : "重设平台账号密码"
        }}</view
        ><view v-if="dialog !== 'add'" class="record-meta">账号 {{ selected?.username }}</view
        ><template v-if="dialog === 'profile'">
          <view class="field"><text class="field-label">姓名 *</text>
            <view class="input-box"><input v-model="nickName" aria-label="成员姓名" maxlength="30" :disabled="busy || unknown" /></view>
          </view>
          <view class="field"><text class="field-label">手机号</text>
            <view class="input-box"><input v-model="phoneNumber" aria-label="成员手机号" maxlength="11" :disabled="busy || unknown" placeholder="可留空" /></view>
          </view>
          <view class="field"><text class="field-label">邮箱</text>
            <view class="input-box"><input v-model="email" aria-label="成员邮箱" maxlength="50" :disabled="busy || unknown" placeholder="可留空" /></view>
          </view>
        </template
        ><view v-if="dialog === 'add'" class="chip-row"
          ><button
            class="chip"
            :class="{ active: bindMode }"
            :disabled="busy || rolesLoading"
            @click="setBindMode(true)"
          >
            绑定已有账号</button
          ><button
            v-if="session.can('system:user:add')"
            class="chip"
            :class="{ active: !bindMode }"
            :disabled="busy || rolesLoading"
            @click="setBindMode(false)"
          >
            新建平台账号
          </button></view
        ><template v-if="dialog === 'add'"
          ><view class="field"
            ><text class="field-label">登录账号 *</text
            ><view class="input-box"
              ><input v-model="username" maxlength="30" /></view></view
          ><template v-if="bindMode"
            ><button class="secondary" :disabled="busy" @click="searchAccount">
              按完整账号查询</button
            ><button
              v-for="account in candidates"
              :key="account.userId"
              class="record-card"
              style="margin-top: 12px"
              :disabled="busy || !canBind(account)"
              @click="selectCandidate(account)"
            >
              <view class="row"
                ><view><text>{{ account.nickName }} · {{ account.username }}</text>
                <view class="record-meta">{{ platformRoleText(account.roleNames) }}</view></view>
                ><text class="tag" v-if="candidateId === account.userId"
                  >已选择</text
                ></view
              >
            </button>
            <view v-if="candidates.some(account => !canBind(account))" class="subtext">只有超级管理员可以维护超级管理员的工厂授权</view></template
          ><view v-if="!bindMode" class="field"
            ><text class="field-label">姓名 *</text
            ><view class="input-box"
              ><input v-model="nickName" maxlength="30" /></view></view
          ><view v-if="!bindMode" class="chip-row"
            ><button
              v-for="[value, label] in [
                ['0', '男'],
                ['1', '女'],
                ['2', '未说明'],
              ]"
              :key="value"
              class="chip"
              :class="{ active: sex === value }"
              @click="sex = value"
            >
              {{ label }}
            </button></view
          ></template
        ><view v-if="dialog === 'add' && !bindMode" class="field">
          <text class="field-label">平台角色 *</text>
          <view v-if="rolesLoading" class="subtext">正在读取可授予角色…</view>
          <button v-for="role in roleOptions" :key="role.roleId" class="record-card"
            :disabled="busy || rolesLoading" @click="toggleRole(role.roleId)">
            <view class="row"><text>{{ role.roleName }}</text><text class="tag" v-if="roleIds.includes(role.roleId)">已选择</text></view>
          </button>
          <text v-if="!rolesLoading && !roleOptions.length" class="subtext">暂无可授予角色，请在Web角色管理中维护。</text>
        </view
        ><view v-if="dialog === 'password' || (dialog === 'add' && !bindMode)" class="field"
          ><text class="field-label"
            >{{ dialog === "password" ? "新密码" : "初始密码" }} *</text
          ><view class="input-box"
            ><input
              v-model="password"
              aria-label="成员密码"
              :password="true"
              :disabled="busy || unknown"
              maxlength="30"
              placeholder="8至30位"
              placeholder-style="color:#739bb0" /></view></view
        ><view v-if="dialog === 'add'" class="subtext"
          >绑定只增加当前工厂访问范围，不改变已有平台角色。角色在Web角色管理中统一维护，在所有已授权工厂一致。</view
        ><view v-else class="subtext">维护的是平台账号资料或密码，对该账号所有登录入口生效。多工厂共用账号及管理员账号请由平台管理员维护。</view
        ><view v-if="unknown && dialog === 'profile'" class="panel">
          <button class="secondary" :disabled="busy" @click="readCurrentProfile">重新读取资料</button>
          <view v-if="readback" class="profile-readback">
            <view class="subtext">服务器当前资料（请核对后关闭，不会自动重复提交）</view>
            <view>姓名：{{ readback.nickName }}</view>
            <view>手机号：{{ readback.phoneNumber || '未填写' }}</view>
            <view>邮箱：{{ readback.email || '未填写' }}</view>
          </view>
        </view
        ><view v-if="actionError" class="error-text">{{ actionError }}</view
        ><view class="button-row"
          ><button class="secondary" :disabled="busy" @click="closeDialog">
            取消</button
          ><button
            class="primary"
            :disabled="busy || rolesLoading || unknown"
            :loading="busy"
            @click="submit"
          >
            确认保存
          </button></view
        ></view
      ></view
    ></AppShell
  >
</template>
