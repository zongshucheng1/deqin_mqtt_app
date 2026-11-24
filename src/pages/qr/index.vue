<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import AsyncState from "../../components/AsyncState.vue";
import { api } from "../../services/api";
import { usePage, go, errorText } from "../../composables/page";
import type { RecordItem, Label } from "../../domain/types";
import { warehouse } from "../../domain/warehouse";
const id = ref(""),
  record = ref<RecordItem>(),
  label = ref<Label>(),
  url = ref(""),
  imageError = ref("");
onLoad((q) => (id.value = String(q?.id || "")));
const { loading, error, refresh } = usePage(async () => {
  record.value = await api.record(id.value);
  label.value = await api.latestLabel(id.value);
  url.value = "";
  if (label.value.status === "READY") await refreshAddress();
});
async function refreshAddress() {
  if (!label.value) return;
  imageError.value = "";
  try {
    const file = await api.labelFile(label.value.id);
    url.value = file.url;
  } catch (e) {
    imageError.value = errorText(e);
  }
}
</script>
<template>
  <AppShell title="二维码凭证" back
    ><AsyncState :loading="loading" :error="error" @retry="refresh"
      ><template v-if="record && label"
        ><view class="panel center"
          ><view style="font-size: 18px; margin: 5px 0 8px">{{
            warehouse(record.warehouseType).name
          }}</view
          ><view class="subtext"
            >{{ record.recordNo }} · {{ record.quantity }}
            {{ warehouse(record.warehouseType).unit }}</view
          ><view class="gap" /><image
            v-if="url"
            :src="url"
            mode="widthFix"
            class="label-image"
            @error="imageError = '图片加载失败或地址已过期，请重新获取地址'"
          /><view v-else class="empty">{{
            label.status === "READY"
              ? "正在获取服务器图片"
              : "标签尚未就绪，请返回详情处理"
          }}</view
          ><view class="qr-content">{{ label.qrContent }}</view
          ><view class="subtext" style="margin-top: 10px"
            >{{ label.version ? "标签版本 " + label.version : "" }} ·
            服务器MinIO文件</view
          ></view
        ><view v-if="imageError" class="error-box"
          >{{ imageError
          }}<button class="link" @click="refreshAddress">
            重新获取图片地址
          </button></view
        ><button class="primary" @click="go('detail', 'id=' + record.id)">
          查看标签版本与后台打印</button
        ><view class="notice"
          >标签由后台分配到工厂电脑打印。首次打印在批次详情确认，已有任务的补打请到统一打印中心操作。二维码仅用于查找批次，出库仍需授权和二次核对。</view
        ></template
      ></AsyncState
    ></AppShell
  >
</template>
