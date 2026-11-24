<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useSession } from "./stores/session";
import { initializeSessionStorage, nativeHost,devicePrinting } from "./services/native";
import { sessionToken } from "./services/session-token";
import {
  initializeDeploymentSession,
  recordDeploymentStartupError,
} from "./services/deployment";
onLaunch(() => {
  try {
    initializeSessionStorage();
    // A previous app build may have left the phone's print worker running.
    // Stop it without deleting its durable submission evidence.
    devicePrinting.stop();
    const previousHost = nativeHost.status();
    if (previousHost.binding?.printerIds?.length) nativeHost.stop();
    initializeDeploymentSession({
      get: (key) => uni.getStorageSync(key),
      set: (key, value) => uni.setStorageSync(key, value),
      remove: (key) => uni.removeStorageSync(key),
      clearSession: () => sessionToken.clear(),
      // Native evidence is partitioned by API/factory/host; clearing credentials
      // stops the previous deployment without deleting or importing its evidence.
      stopHost: () => {
        devicePrinting.stop();
        nativeHost.stop();
        nativeHost.clear();
      },
    });
    useSession().restore();
  } catch (error) {
    recordDeploymentStartupError(
      error instanceof Error ? error.message : "应用初始化失败，请联系管理员",
    );
  }
});
</script>
<style lang="scss">
@import "./styles/theme.scss";
</style>
