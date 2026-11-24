export type Id = string;
export type Warehouse =
  | "RAW_WOOD"
  | "PEELING"
  | "DRYING"
  | "WOOD_CORE"
  | "WHITE_BARK";
export type QuantitySource =
  | "APP_INPUT"
  | "AUTO_STACK"
  | "MANUAL_CODE"
  | "DEVICE_COUNT";
export type StockStatus = "IN_STOCK" | "OUTBOUND";
export interface Factory {
  factoryId: Id;
  factoryName: string;
  timezone: string;
}
export interface Capabilities {
  work: boolean;
  manage: boolean;
}
export interface PlatformRoleOption {
  roleId: Id;
  roleName: string;
  roleKey: string;
}
export interface Context {
  tenantId: string;
  userId: Id;
  username: string;
  permissions: string[];
  roleNames: string[];
  capabilities: Capabilities;
  factories: Factory[];
}
export interface PageResult<T> {
  rows: T[];
  total: number;
}
export interface Label {
  id: Id;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  requestKey?: string;
  version?: number;
  templateCode?: string;
  qrContent: string;
  fileOssId?: Id;
  sha256?: string;
  url?: string;
  expiresAtMs?: number;
  errorMessage?: string;
}
export interface RecordItem {
  id: Id;
  factoryId: Id;
  warehouseType: Warehouse;
  recordNo: string;
  recordDate: string;
  quantity: string;
  stockStatus: StockStatus;
  quantitySource: QuantitySource;
  codingMode?: "NONE" | "AUTO" | "MANUAL";
  version: number;
  inboundAtMs: string | number;
  outboundAtMs?: string | number;
  voidFlag?: number | boolean;
  detail: Record<string, string | number | null>;
  label?: Label;
  latestLabel?: Label;
  qrContent?: string;
  sourceEventId?: Id;
  deviceOccurredAtMs?: string;
  sourceTrace?: {
    deviceId: Id;
    deviceName: string | null;
    sourceTopic: string;
    sourceEventKey: string;
    receivedAtMs: string;
    ruleId: Id;
    ruleRevision: number;
    eventType: "AUTO_INBOUND" | "MANUAL_CODE" | "VOID";
    triggerField: string | null;
    quantityField: string | null;
    quantityDivisor: string | null;
  } | null;
  operations?: {
    id: Id;
    operation: string;
    actorUserId?: Id;
    actorName?: string;
    occurredAtMs: string;
    reason?: string;
  }[];
}
export interface CreateRecord {
  printingMode?: "DEVICE" | "SERVER";
  warehouseType: Warehouse;
  recordDate: string;
  recordNo?: string;
  quantity: string;
  detail: Record<string, string | number>;
}
export interface HostDiagnostics {
  host: {
    id: Id;
    hostCode: string;
    hostName: string;
    bootId?: string;
    enabled: number;
    lastHeartbeatAtMs?: string;
    version: number;
  };
  factoryId: Id;
  observedAtMs: string;
  captureResources: {
    ruleId: Id;
    deviceId: Id;
    streamKey: string;
    warehouseType: Warehouse;
    enabled: number;
  }[];
  printers: {
    id: Id;
    printerCode: string;
    printerName: string;
    enabled: number;
  }[];
  leases: {
    resourceType: string;
    resourceKey: string;
    expiresAtMs: string;
    state: "ACTIVE" | "EXPIRED" | "FENCED";
  }[];
  lastIngestMessageAtMs?: string;
  pendingPrintTasks: number;
  activePrintTasks: number;
  unknownPrintTasks: number;
}
export interface DeviceCommand {
  commandId: Id;
  ruleId: Id;
  eventId: Id;
  eventKey: string;
  recordId?: Id;
  commandType: string;
  status: string;
  expectedSourceEpoch: string;
  expectedEdgeGeneration: string;
  expiresAtMs: string;
  publishedAtMs?: string;
  acknowledgedAtMs?: string;
  attemptCount: number;
  lastError?: string;
  version: number;
  operations: {
    id: Id;
    operation: string;
    actorUserId?: Id;
    occurredAtMs: string;
    reason?: string;
  }[];
}
export interface Metric {
  value: string | null;
  unit: string;
  available: boolean;
  reason?: string;
}
export interface WarehouseStatistics {
  warehouseType: Warehouse;
  currentStock: Metric;
  currentBatches: Metric;
  periodInbound: Metric;
  periodInboundBatches: Metric;
  periodOutbound: Metric;
  periodOutboundBatches: Metric;
  manualQuantity?: Metric;
  machineQuantity?: Metric;
  sources?: {
    quantitySource: QuantitySource;
    recordSource: "APP" | "MQTT";
    codingMode: "NONE" | "AUTO" | "MANUAL";
    unit: string;
    currentQuantity: string;
    currentBatches: number;
    inboundQuantity: string;
    inboundBatches: number;
    outboundQuantity: string;
    outboundBatches: number;
  }[];
  daily?: {
    date: string;
    inboundQuantity: string;
    outboundQuantity: string;
    inboundBatches: number;
    outboundBatches: number;
  }[];
}
export interface Statistics {
  warehouses: WarehouseStatistics[];
  updatedAtMs: number;
  factoryTimezone: string;
}
export interface RecordQuery {
  warehouseType?: Warehouse;
  stockStatus?: StockStatus;
  quantitySource?: QuantitySource;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  recordNo?: string;
  pageNum?: number;
  pageSize?: number;
}
export type PrintStatus =
  | "WAITING_LABEL"
  | "QUEUED"
  | "WAITING_PRINTER"
  | "PREPARING"
  | "SENDING"
  | "SUBMITTED"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN"
  | "CANCELLED";
export type PrinterProtocol = "IPP" | "IPPS" | "USB_TSPL";
/** Read-only Windows queue evidence; it never confirms physical paper output. */
export interface PrintObservation {
  sequence: number;
  state: string;
  observedAtMs: number;
  receivedAtMs?: number;
  spoolJobId?: string;
  printerName: string;
  statusFlags?: number;
  pagesPrinted?: number;
  totalPages?: number;
  physicalCompletionConfirmed: false;
}
export interface PrintJob {
  executionMode?: "DEVICE" | "HOST" | "PC_AGENT";
  deviceId?: string;
  id: Id;
  recordId: Id;
  labelId: Id | null;
  printerId: Id | null;
  warehouseType: Warehouse;
  recordNo: string;
  status: PrintStatus;
  copies: number;
  version: number;
  jobKind: "INITIAL" | "REPRINT" | "TEST";
  lastError?: string;
  createTime?: string;
  requestedAtMs?: number;
  completionBasis?: string;
  autoVerification?: PrintObservation | null;
  verificationResult?: string;
  labelRevision?: number;
  paperCode?: string | null;
  paperWidthMm?: string | null;
  paperHeightMm?: string | null;
  printerName?: string | null;
  attempts?: {
    id: Id;
    attemptNo: number;
    status: string;
    sendPhase: string;
    startedAtMs?: string;
    sendingAtMs?: string;
    submittedAtMs?: string;
    finishedAtMs?: string;
    remoteJobId?: string;
    remoteJobUri?: string;
    remoteStatus?: {
      state?: string;
      message?: string;
      remoteJobId?: string;
      remoteJobUri?: string;
      deliveryKind?: "USB_BYTES" | "WINDOWS_SPOOL" | "RAW_TCP";
      observation?: PrintObservation | null;
    };
    errorCode?: string;
    errorMessage?: string;
  }[];
  operations?: {
    id: Id;
    operation: string;
    actorUserId?: Id;
    occurredAtMs: string;
    reason?: string;
  }[];
}
export interface PrintAgentCapabilities {
  warehouses: {
    warehouseType: Warehouse;
    serverManagedPrinting: boolean;
    executionMode?: "PC_AGENT" | null;
  }[];
}
export interface Printer {
  id: Id;
  printerName: string;
  endpointUri: string;
  protocol: PrinterProtocol;
  enabled: number;
  version: number;
  capabilities?: Record<string, unknown>;
}
export interface PrintConfig {
  id?: Id;
  warehouseType: Warehouse;
  printerId: Id;
  paperCode?: string;
  paperWidthMm: string;
  paperHeightMm: string;
  templateCode: string;
  templateRevision: number;
  copies: number;
  horizontalOffsetMm: string;
  verticalOffsetMm: string;
  autoPrint: number;
  version: number;
  configFingerprint?: string;
  verifiedFingerprint?: string;
  verifiedAtMs?: number;
}
export interface Member {
  id: Id;
  userId: Id;
  username: string;
  nickName: string;
  sex: string;
  phoneNumber?: string;
  email?: string;
  canEditProfile?: boolean;
  canResetPassword?: boolean;
  accountEditReason?: string;
  canChangeStatus?: boolean;
  statusEditReason?: string;
  roleNames: string[];
  capabilities: Capabilities;
  protectedSuperAdmin: boolean;
  status: "0" | "1";
  version: number;
}
export interface Host {
  id: Id;
  hostCode: string;
  hostName: string;
  enabled: number;
  version: number;
  lastHeartbeatAtMs?: number;
}
