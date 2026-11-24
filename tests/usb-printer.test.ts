import test from "node:test";
import assert from "node:assert/strict";
import { printerEndpointKey, usbPrinterOwner, validateDiscoveryIdentity } from "../src/domain/printer-setup";
import type { DiscoveredPrinter, DiscoveredPrinterProbe } from "../src/domain/printer-setup";
import { automaticInboundPrint, deviceDefaults, deviceDefaultKey, devicePrintText, validateDeviceDefault } from "../src/domain/device-print";
import type { DevicePrinterDefault } from "../src/domain/device-print";
import { printSubmissionText } from "../src/domain/print-display";
import type { PrintJob } from "../src/domain/types";

const owner = "app_synthetic_print_device_012", other = "app_different_print_device_012";
const endpoint = `usb://2867-152d/${owner}/${"a".repeat(64)}`;
const candidate: DiscoveredPrinter = { candidateId: "usb-ge540", serviceName: "得力 GE540", printerName: "得力 GE540", protocol: "USB_TSPL", state: "READY", advertisedFormats: [] };
const probe = (): DiscoveredPrinterProbe => ({ supported: true, success: true, scanId: "usb:scan-1", candidateId: candidate.candidateId, protocol: "USB_TSPL", endpointUri: endpoint, verificationScope: "DISCOVERY_ONLY" });
const printer: DevicePrinterDefault = { printerId: "9007199254740993", printerName: "得力 GE540", protocol: "USB_TSPL", endpointUri: endpoint, paperWidthMm: "80", paperHeightMm: "80", copies: 1 };

test("USB端点只接受GE540、有效所属设备和规范化序列号摘要", () => {
  assert.equal(printerEndpointKey(endpoint), endpoint);
  assert.equal(usbPrinterOwner(endpoint), owner);
  for (const invalid of [endpoint.replace("2867", "1234"), endpoint.replace("152d", "0000"), endpoint.replace(owner, "short"), endpoint.replace(owner, "x".repeat(65)), endpoint.replace(owner, "owner%2Fdevice-012"), endpoint.replace("a".repeat(64), "A".repeat(64)), endpoint + "/", endpoint + "?x=1", endpoint + "#x", " " + endpoint, endpoint.replace("usb://", "USB://"), endpoint.replace("2867-152d", "2867-152d:1")]) {
    assert.equal(usbPrinterOwner(invalid), undefined, invalid);
    assert.throws(() => printerEndpointKey(invalid), undefined, invalid);
  }
});

test("USB授权后新获得端点可以用于原候选，但必须属于当前设备", () => {
  assert.equal(candidate.endpointUri, undefined);
  assert.equal(validateDiscoveryIdentity("usb:scan-1", candidate, probe(), owner), endpoint);
  assert.throws(() => validateDiscoveryIdentity("usb:scan-1", candidate, probe(), other));
});

test("USB所属设备必须带原生app_前缀，IPP不额外限制原设备ID", () => {
  const ordinaryId = "synthetic-print-device-012";
  for (const invalidOwner of [ordinaryId, "app_" + "a".repeat(15), "app_" + "a".repeat(61)]) {
    const invalid = endpoint.replace(owner, invalidOwner);
    assert.equal(usbPrinterOwner(invalid), undefined);
    assert.throws(() => printerEndpointKey(invalid));
    assert.notEqual(validateDeviceDefault({ ...printer, endpointUri: invalid }, invalidOwner), "");
  }
  assert.equal(usbPrinterOwner(endpoint.replace(owner, "app_" + "a".repeat(16))), "app_" + "a".repeat(16));
  assert.equal(usbPrinterOwner(endpoint.replace(owner, "app_" + "a".repeat(60))), "app_" + "a".repeat(60));
  assert.equal(validateDeviceDefault({ ...printer, protocol: "IPP", endpointUri: "ipp://192.168.8.50/ipp/print" }, ordinaryId), "");
});

test("USB检测拒绝错误scan候选协议范围和未授权结果", () => {
  for (const patch of [{ scanId: "usb:another" }, { candidateId: "another" }, { protocol: "IPP" as const }, { verificationScope: undefined }, { success: false }, { endpointUri: endpoint.replace(owner, other) }, { endpointUri: "ipp://192.168.8.50/ipp/print" }]) {
    assert.throws(() => validateDiscoveryIdentity("usb:scan-1", candidate, { ...probe(), ...patch }, owner));
  }
  assert.throws(() => validateDiscoveryIdentity("mock-network-scan", candidate, { ...probe(), scanId: "mock-network-scan" }, owner));
});

test("网络候选仍须保持发现时的精确目标，不能借USB放宽", () => {
  const network: DiscoveredPrinter = { ...candidate, protocol: "IPP", endpointUri: "ipp://192.168.8.50:631/ipp/print" };
  const result: DiscoveredPrinterProbe = { ...probe(), scanId: "lan:1", protocol: "IPP", endpointUri: network.endpointUri };
  assert.equal(validateDiscoveryIdentity("lan:1", network, result, owner), network.endpointUri);
  assert.throws(() => validateDiscoveryIdentity("lan:1", network, { ...result, endpointUri: "ipp://192.168.8.51/ipp/print" }, owner));
  assert.throws(() => validateDiscoveryIdentity("usb:scan-1", network, { ...result, scanId: "usb:scan-1" }, owner));
});

test("本地USB默认配置只可在端点所属设备的存储范围内读写", () => {
  const values = new Map<string, unknown>();
  const defaults = deviceDefaults({ get: key => values.get(key), set: (key, value) => values.set(key, value), remove: key => values.delete(key) });
  const scope = { api: "https://api.test", tenantId: "tenant-a", factoryId: "1", deviceId: owner };
  assert.equal(validateDeviceDefault(printer, owner), "");
  assert.notEqual(validateDeviceDefault(printer), "");
  defaults.set(scope, "RAW_WOOD", printer);
  assert.equal(defaults.get(scope, "RAW_WOOD")?.endpointUri, endpoint);
  assert.throws(() => defaults.set({ ...scope, deviceId: other }, "RAW_WOOD", printer));
  values.set(deviceDefaultKey({ ...scope, deviceId: other }, "RAW_WOOD"), printer);
  assert.equal(defaults.get({ ...scope, deviceId: other }, "RAW_WOOD"), undefined);
});

test("GE540首期只允许80x80毫米和有效份数，其他尺寸不保存", () => {
  for (const patch of [{ paperWidthMm: "81" }, { paperHeightMm: "79.9" }, { paperWidthMm: "210", paperHeightMm: "297" }])
    assert.equal(validateDeviceDefault({ ...printer, ...patch }, owner), "GE540当前使用80×80mm标签纸");
  assert.equal(validateDeviceDefault({ ...printer, paperWidthMm: "80.000", paperHeightMm: "80.0", copies: 10 }, owner), "");
  assert.notEqual(validateDeviceDefault({ ...printer, copies: 11 }, owner), "");
  assert.notEqual(validateDeviceDefault({ ...printer, copies: 1.5 }, owner), "");
});

test("等待标签期间更换默认不会把冻结的USB任务改成网络或其他纸型", async () => {
  const current = { ...printer };
  let calls = 0;
  const result = await automaticInboundPrint(current, {
    sameScope: () => true,
    label: async () => { current.protocol = "IPP"; current.endpointUri = "ipp://192.168.8.50/ipp/print"; current.paperWidthMm = "210"; return "label-1"; },
    print: async target => { calls++; assert.equal(target.protocol, "USB_TSPL"); assert.equal(target.endpointUri, endpoint); assert.equal(target.paperWidthMm, "80"); return { status: "SUBMITTED", deliveryKind: "USB_BYTES", message: "标签数据已发送，请核对出纸" }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "SUBMITTED");
  assert.equal(devicePrintText(result), "入库成功，标签数据已发送，请核对出纸");
});

test("USB发送未知不自动重发，也不会显示已接收或完成", async () => {
  let calls = 0;
  const result = await automaticInboundPrint(printer, { sameScope: () => true, label: async () => "label-1", print: async () => { calls++; return { status: "UNKNOWN", deliveryKind: "USB_BYTES" }; } });
  assert.equal(calls, 1);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(devicePrintText(result), "入库成功，打印结果待核对");
  assert.doesNotMatch(devicePrintText({ status: "SUBMITTED", deliveryKind: "USB_BYTES", message: "已完成" }), /已接收|已完成|已确认完成/);
  assert.equal(devicePrintText({ status: "SUBMITTED" }), "入库成功，打印机已接收标签");
  assert.equal(devicePrintText({ status: "COMPLETED", deliveryKind: "USB_BYTES" }), "入库成功，打印机已确认完成");
});

test("打印记录仅依据最新attempt的USB传输证据显示待出纸，网络原文案保持", () => {
  const job = { status: "SUBMITTED", attempts: [{ attemptNo: 2, remoteStatus: { deliveryKind: "USB_BYTES" } }, { attemptNo: 1, remoteStatus: { state: 5 } }] } as PrintJob;
  assert.equal(printSubmissionText(job), "标签数据已发送，请核对出纸；暂不能重复发送。");
  assert.equal(printSubmissionText({ ...job, attempts: [{ attemptNo: 1, remoteStatus: { deliveryKind: "USB_BYTES" } }, { attemptNo: 2, remoteStatus: { state: 5 } }] } as PrintJob), "打印机已接受，等待可靠完成依据；暂不能重复发送。");
  assert.equal(printSubmissionText({ ...job, attempts: undefined }), "打印机已接受，等待可靠完成依据；暂不能重复发送。");
});
