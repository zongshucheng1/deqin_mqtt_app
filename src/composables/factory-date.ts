import { ref } from "vue";
import { businessToday, factoryTimeZone } from "../domain/format";

/** Wait for the authenticated factory; preserve a user's calendar selection on refresh. */
export function useFactoryDate() {
  const date = ref("");
  let identity = "";
  function sync(
    scope: string,
    timezone: string | undefined,
    now: number | string = Date.now(),
  ) {
    if (!scope) throw new Error("尚未取得工厂授权，请重新登录后重试");
    const zone = factoryTimeZone(timezone),
      next = JSON.stringify([scope, zone]);
    if (identity !== next || !date.value) date.value = businessToday(zone, now);
    identity = next;
  }
  function reset() {
    identity = "";
    date.value = "";
  }
  return { date, sync, reset };
}
