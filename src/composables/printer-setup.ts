import { computed, ref } from "vue";
import { api } from "../services/api";
import {
  loadPrintAgentCapabilities,
  serverManagesWarehouse,
} from "../services/inbound-print";
import { useSession } from "../stores/session";
import { usePage } from "./page";
import { warehouses } from "../domain/warehouse";
import type { PrintConfig, Printer, Warehouse } from "../domain/types";

/** APP only reads cloud routing. It never discovers or configures a local printer. */
export function usePrinterStatus() {
  const session = useSession();
  const kind = ref<Warehouse>("RAW_WOOD");
  const config = ref<PrintConfig | null>(null);
  const printers = ref<Printer[]>([]);
  const serverManaged = ref(false);
  const selectedPrinter = computed(() =>
    printers.value.find((printer) => printer.id === config.value?.printerId),
  );
  const pcConfigured = computed(
    () => config.value?.templateCode === "PC_80" && !!config.value.printerId,
  );
  const statusText = computed(() =>
    serverManaged.value
      ? "后台已启用"
      : pcConfigured.value
        ? "后台尚未启用"
        : "后台尚未配置",
  );
  const { loading, error, refresh } = usePage(async () => {
    const scope = session.currentScope(),
      selected = kind.value;
    serverManaged.value = false;
    config.value = null;
    printers.value = [];
    const [capabilities, currentConfig, registeredPrinters] = await Promise.all(
      [loadPrintAgentCapabilities(), api.configs(selected), api.printers()],
    );
    if (!scope || scope !== session.currentScope() || selected !== kind.value)
      return;
    if (!Array.isArray(registeredPrinters))
      throw new Error("后台打印机列表格式异常，请刷新核对");
    config.value = currentConfig;
    printers.value = registeredPrinters;
    // A saved printer/configuration does not establish readiness: only the server capability does.
    serverManaged.value = serverManagesWarehouse(capabilities, selected);
  });
  async function changeWarehouse(event: {
    detail: { value: string | number };
  }) {
    const selected = warehouses[Number(event.detail.value)];
    if (!selected) return;
    kind.value = selected.code;
    await refresh();
  }
  return {
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
  };
}
