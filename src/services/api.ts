import { useSession } from "../stores/session";
import { request } from "./http";
import { write, requestKey } from "./journal";
import type {
  CreateRecord,
  Id,
  Label,
  Member,
  PageResult,
  Printer,
  PrintConfig,
  PrintJob,
  RecordItem,
  RecordQuery,
  Statistics,
  Warehouse,
  Host,
  HostDiagnostics,
  DeviceCommand,
  PlatformRoleOption,
  PrintAgentCapabilities,
} from "../domain/types";
import { assertRoleOptions } from "../domain/authorization";
import { factoryTimeZone } from "../domain/format";
import { validateRawVolumeResult, type RawVolumeInput } from "../domain/raw-wood-volume";
const scoped = (payload: Record<string, unknown> = {}) => ({
  ...payload,
  factoryId: useSession().factoryId,
});
const mutation = <T>(
  op: string,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  data: Record<string, unknown>,
) =>
  write<T>(
    useSession().currentScope(),
    op,
    "/inout" + path,
    method,
    scoped(data),
  );
// Versioned settings and account operations have no durable request ledger in the 19-table model.
// Read the resource after an ambiguous response; never persist passwords for later replay.
const settingWrite = <T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  data: Record<string, unknown>,
) =>
  request<T>("/inout" + path, {
    method,
    data: scoped({ ...data, requestKey: data.requestKey || requestKey() }),
    write: true,
  });
function recordValid(record: RecordItem) {
  if (
    typeof record.id !== "string" ||
    typeof record.factoryId !== "string" ||
    typeof record.quantity !== "string"
  )
    throw new Error("服务器批次ID/数量必须按字符串传输");
  return record;
}
function labelView(label: any): Label {
  return {
    ...label,
    version: label.versionNo ?? label.version,
    status: label.status === "RENDERING" ? "GENERATING" : label.status,
    sha256: label.contentSha256 ?? label.sha256,
    errorMessage: label.lastError ?? label.errorMessage,
  };
}
export const api = {
  async previewRawVolume(input: RawVolumeInput) {
    return validateRawVolumeResult(await request("/inout/raw-wood/volume-preview", {
      method: "POST", data: input,
    }));
  },
  async records(query: RecordQuery & { quantitySource?: string } = {}) {
    const page = await request<PageResult<RecordItem>>("/inout/records", {
      data: scoped({ ...query }),
    });
    page.rows.forEach(recordValid);
    return page;
  },
  async record(id: Id) {
    return recordValid(
      await request<RecordItem>("/inout/records/" + encodeURIComponent(id), {
        data: scoped(),
      }),
    );
  },
  create(data: CreateRecord) {
    return mutation<RecordItem>(
      "create:" + data.warehouseType,
      "/records",
      "POST",
      data as unknown as Record<string, unknown>,
    );
  },
  outbound(record: RecordItem) {
    return mutation<RecordItem>(
      "outbound:" + record.id,
      "/records/" + record.id + "/outbound",
      "POST",
      { version: record.version },
    );
  },
  delete(record: RecordItem, reason: string) {
    return mutation<void>(
      "delete:" + record.id,
      "/records/" + record.id,
      "DELETE",
      { version: record.version, reason },
    );
  },
  async resolve(content: string, warehouseType?: Warehouse) {
    return recordValid(
      await request<RecordItem>("/inout/qr/resolve", {
        method: "POST",
        data: scoped({ content, warehouseType }),
      }),
    );
  },
  async statistics(range: Record<string, unknown> = {}) {
    const data = await request<any>("/inout/statistics", {
      data: scoped(range),
    });
    const metric = (
      value: string | number | undefined | null,
      unit: string,
    ) => {
      const valid =
        value != null &&
        (typeof value === "string" ||
          (unit === "批" && Number.isSafeInteger(value))) &&
        /^\d+(\.\d+)?$/.test(String(value));
      return {
        value: valid ? String(value) : null,
        unit,
        available: valid,
        reason: valid ? undefined : "统计值缺失或格式异常",
      };
    };
    return {
      updatedAtMs: data.updatedAtMs || Date.now(),
      factoryTimezone: factoryTimeZone(
        data.factoryTimezone ?? useSession().factory?.timezone,
      ),
      warehouses: data.warehouses.map((w: any) => ({
        ...w,
        currentStock: w.currentStock || metric(w.currentQuantity, w.unit),
        currentBatches:
          typeof w.currentBatches === "object"
            ? w.currentBatches
            : metric(w.currentBatches, "批"),
        periodInbound: w.periodInbound || metric(w.inboundQuantity, w.unit),
        periodInboundBatches:
          w.periodInboundBatches || metric(w.inboundBatches, "批"),
        periodOutbound: w.periodOutbound || metric(w.outboundQuantity, w.unit),
        periodOutboundBatches:
          w.periodOutboundBatches || metric(w.outboundBatches, "批"),
      })),
    } as Statistics;
  },
  async latestLabel(id: Id) {
    return labelView(
      await request<Label>("/inout/records/" + id + "/labels/latest", {
        data: scoped(),
      }),
    );
  },
  async generateLabel(id: Id) {
    return labelView(
      await mutation<Label>(
        "label:" + id,
        "/records/" + id + "/labels",
        "POST",
        {},
      ),
    );
  },
  generateLabelAndPrint(id: Id, sourceLabelId: Id | null) {
    return mutation<PrintJob>(
      "label-print:" + id,
      "/records/" + id + "/labels/print",
      "POST",
      { sourceLabelId },
    );
  },
  async retryLabel(id: Id, label: Label) {
    if (!label.requestKey)
      throw new Error("当前标签缺少原始生成请求标识，请重新读取详情");
    return labelView(
      await request<Label>("/inout/records/" + id + "/labels", {
        method: "POST",
        data: scoped({ requestKey: label.requestKey }),
        write: true,
      }),
    );
  },
  labelFile(id: Id) {
    return request<{
      url: string;
      sha256: string;
      fileOssId: Id;
      expiresAtMs?: number;
    }>("/inout/labels/" + id + "/file", { data: scoped() });
  },
  jobs(filters: Record<string, unknown> = {}) {
    return request<PageResult<PrintJob>>("/inout/print-jobs", {
      data: scoped({ pageNum: 1, pageSize: 30, ...filters }),
    });
  },
  printAgentCapabilities() {
    return request<PrintAgentCapabilities>("/inout/print-agent/capabilities", {
      data: scoped(),
    });
  },
  job(id: Id) {
    return request<PrintJob>("/inout/print-jobs/" + encodeURIComponent(id), {
      data: scoped(),
    });
  },
  queue(recordId: Id, labelId: Id) {
    return mutation<PrintJob>("queue:" + recordId, "/print-jobs", "POST", {
      recordId,
      labelId,
    });
  },
  jobAction(
    job: PrintJob,
    action: "retry" | "cancel" | "verify" | "reprint",
    extra: Record<string, unknown> = {},
  ) {
    return mutation<PrintJob>(
      action + ":" + job.id,
      "/print-jobs/" + job.id + "/" + action,
      "POST",
      { version: job.version, ...extra },
    );
  },
  printers() {
    return request<Printer[]>("/inout/printers", { data: scoped() });
  },
  savePrinter(data: Partial<Printer>) {
    return settingWrite<Printer>(
      "/printers" + (data.id ? "/" + data.id : ""),
      data.id ? "PUT" : "POST",
      data as Record<string, unknown>,
    );
  },
  devicePrinter(data: Partial<Printer> & { deviceId?: string }) {
    return settingWrite<Printer>("/device-print/printers","POST",data as Record<string,unknown>);
  },
  devicePrintPending(deviceId:string) {
    return request<{machinePrintingEnabled:boolean;jobs:{id:string;status:string}[]}>("/inout/device-print/pending",{data:scoped({deviceId})});
  },
  machinePrintConfig(warehouse:Warehouse) {
    return request<{executionDeviceId?:string;autoPrint:number;version:number}>("/inout/device-print/machine/"+warehouse,{data:scoped()});
  },
  designateMachinePrinter(warehouse:Warehouse,data:Record<string,unknown>) {
    return settingWrite<{executionDeviceId?:string;autoPrint:number;version:number}>("/device-print/machine/"+warehouse,"PUT",data);
  },
  configs(warehouse: Warehouse) {
    return request<PrintConfig | null>("/inout/print-configs/" + warehouse, {
      data: scoped(),
    });
  },
  saveConfig(config: PrintConfig) {
    return settingWrite<PrintConfig>(
      "/print-configs/" + config.warehouseType,
      "PUT",
      config as unknown as Record<string, unknown>,
    );
  },
  configAction(
    warehouse: Warehouse,
    action: "detect" | "test" | "confirm",
    data: Record<string, unknown>,
  ) {
    return settingWrite<Record<string, unknown>>(
      "/print-configs/" + warehouse + "/" + action,
      "POST",
      data,
    );
  },
  testFile(warehouse: Warehouse, data: Record<string, unknown>) {
    return settingWrite<Record<string, unknown>>(
      "/print-configs/" + warehouse + "/test-file",
      "POST",
      data,
    );
  },
  members() {
    return request<PageResult<Member>>("/inout/members", {
      data: scoped({ pageNum: 1, pageSize: 100 }),
    });
  },
  memberCandidates(keyword: string) {
    return request<Pick<Member, "userId" | "username" | "nickName" | "roleNames" | "capabilities" | "protectedSuperAdmin">[]>(
      "/inout/members/candidates",
      { data: scoped({ keyword }) },
    );
  },
  async roleOptions() {
    const options = await request<{ rows: PlatformRoleOption[] }>("/inout/roles/options", { data: scoped() });
    assertRoleOptions(options);
    return options.rows;
  },
  addMember(data: Record<string, unknown>) {
    return settingWrite<Member>("/members", "POST", data);
  },
  memberAction(
    member: Member,
    action: "status" | "password" | "profile",
    data: Record<string, unknown>,
  ) {
    return settingWrite<void>("/members/" + member.id + "/" + action, "PUT", {
      version: member.version,
      ...data,
    });
  },
  hosts() {
    return request<Host[]>("/inout/hosts", { data: scoped() });
  },
  hostDiagnostics(id: Id) {
    return request<HostDiagnostics>(
      "/inout/hosts/" + encodeURIComponent(id) + "/diagnostics",
      { data: scoped() },
    );
  },
  registerHost(data: Record<string, unknown>) {
    return request<Host>("/inout/hosts", {
      method: "POST",
      data: scoped(data),
      write: true,
    });
  },
  captureDevices() {
    return request<Record<string, any>[]>("/inout/capture-devices", {
      data: scoped(),
    });
  },
  deviceCommands(filters: Record<string, unknown> = {}) {
    return request<PageResult<DeviceCommand>>("/inout/device-commands", {
      data: scoped({ pageNum: 1, pageSize: 20, ...filters }),
    });
  },
  deviceCommand(id: Id) {
    return request<DeviceCommand>(
      "/inout/device-commands/" + encodeURIComponent(id),
      { data: scoped() },
    );
  },
  reviewCommand(
    command: DeviceCommand,
    action: "CANCEL" | "REVIEW",
    reason: string,
  ) {
    return mutation<DeviceCommand>(
      "command-review:" + command.commandId,
      "/device-commands/" + encodeURIComponent(command.commandId) + "/review",
      "POST",
      { version: command.version, action, reason },
    );
  },
  captureRules() {
    return request<Record<string, any>[]>("/inout/ingest-rules", {
      data: scoped(),
    });
  },
  captureRule(id: Id) {
    return request<Record<string, any>>("/inout/ingest-rules/" + id, {
      data: scoped(),
    });
  },
  saveCaptureRule(data: Record<string, unknown>) {
    const { id, ...body } = data;
    return request<Record<string, any>>(
      "/inout/ingest-rules" + (id ? "/" + id : ""),
      { method: id ? "PUT" : "POST", data: scoped(body), write: true },
    );
  },
  disableCaptureRule(id: Id, version: number) {
    return request(
      "/inout/ingest-rules/" +
        id +
        "?factoryId=" +
        encodeURIComponent(useSession().factoryId) +
        "&version=" +
        version,
      { method: "DELETE", write: true },
    );
  },
  captureEvents(filters: Record<string, unknown> = {}) {
    return request<PageResult<Record<string, any>>>("/inout/ingest-events", {
      data: scoped({ pageNum: 1, pageSize: 20, ...filters }),
    });
  },
  captureEvent(id: Id) {
    return request<Record<string, any>>("/inout/ingest-events/" + id, {
      data: scoped(),
    });
  },
};
