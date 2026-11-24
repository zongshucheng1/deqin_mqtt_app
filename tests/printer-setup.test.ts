import test from "node:test";
import assert from "node:assert/strict";
import { printerEndpointKey, registeredPrinter, paperError, configValues, changeDefault } from "../src/domain/printer-setup";
import { applyPrinterToHost } from "../src/domain/printer-host-refresh";
import type { DiscoveredPrinter } from "../src/domain/printer-setup";
import type { PrintConfig, Printer } from "../src/domain/types";
import type { HostStatus } from "../src/services/native";
const config = (): PrintConfig => ({ warehouseType: "RAW_WOOD", printerId: "9007199254740994", paperCode: "A4", paperWidthMm: "210", paperHeightMm: "297", copies: 1, templateCode: "STANDARD", templateRevision: 1, horizontalOffsetMm: "0", verticalOffsetMm: "0", autoPrint: 1, version: 4, configFingerprint: "verified", verifiedFingerprint: "verified" });
const printer: Printer = { id: "9007199254740994", printerName: "原默认", protocol: "IPP", endpointUri: "ipp://PRINTER.local/ipp/print", enabled: 1, version: 4 };
const candidate: DiscoveredPrinter = { candidateId: "s1-p1", serviceName: "printer", printerName: "真实设备", state: "READY", endpointUri: "ipp://printer.local:631/ipp/print", protocol: "IPP", advertisedFormats: ["image/pwg-raster"] };
test("endpoint identity normalizes default port/path/host without browser URL", () => {
  assert.equal(printerEndpointKey("IPP://Printer.local/"), "ipp://printer.local:631/");
  assert.notEqual(printerEndpointKey("ipp://printer.local/"), printerEndpointKey("ipp://printer.local/ipp/print"));
  assert.equal(printerEndpointKey("ipps://[fd00::1]/ipp/print"), "ipps://[fd00::1]:631/ipp/print");
  assert.equal(printerEndpointKey("ipp://[FE80::1%25wlanA]/queue"), "ipp://[fe80::1%25wlanA]:631/queue");
  assert.notEqual(printerEndpointKey("ipp://printer.local/ipp/A"), printerEndpointKey("ipp://printer.local/ipp/a"));
  for (const invalid of ["http://printer.local", "ipp://user:pass@printer.local/p", "ipp://printer.local/p?q=1", "ipp://printer.local/#x", "ipp://printer.local:0/p", "ipp://printer.local:65536/p", "ipp://printer.local", "ipp://[fe80::1%wlan0]/p"]) assert.throws(() => printerEndpointKey(invalid));
});
test("existing endpoint is reused even when discovery name differs; no guessed UUID merging", () => {
  assert.equal(registeredPrinter([printer], candidate)?.id, printer.id);
  assert.equal(registeredPrinter([printer], { ...candidate, state: "LOST" }), undefined);
  assert.equal(registeredPrinter([printer], { ...candidate, endpointUri: "ipp://other.local/ipp/print" }), undefined);
});
test("same default is a no-op preserving enabled automation and verification", () => {
  const value = config(), before = JSON.stringify(value);
  assert.equal(changeDefault(value, value.printerId), false);
  assert.equal(JSON.stringify(value), before);
  assert.equal(changeDefault(value, "9007199254740995"), true);
  assert.equal(value.autoPrint, 0); assert.equal(value.verifiedFingerprint, undefined);
});
test("server version and verification metadata are not editable config values", () => {
  const first = config(), next = { ...first, version: 999, verifiedAtMs: 42, verifiedFingerprint: undefined };
  assert.equal(configValues(first), configValues(next));
  assert.notEqual(configValues(first), configValues({ ...next, autoPrint: 0 }));
});
test("paper checks fail clearly for missing/unsupported dimensions, copies and offsets", () => {
  assert.equal(paperError(config()), "");
  for (const patch of [{ paperWidthMm: "" }, { paperWidthMm: "9.9" }, { paperHeightMm: "1201" }, { paperHeightMm: "10.0001" }, { copies: 0 }, { copies: 1.5 }, { horizontalOffsetMm: "105" }, { verticalOffsetMm: "abc" }]) assert.notEqual(paperError({ ...config(), ...patch }), "");
  assert.equal(paperError({ ...config(), horizontalOffsetMm: "-1.250" }), "");
});
function fixture(patch: Partial<HostStatus> = {}) {
  let state: HostStatus = { supported: true, running: true, state: "RUNNING", binding: { configured: true, hostId: "original-host", factoryId: "original-factory", printerIds: ["old"], deviceStreams: [] }, evidence: { countsAvailable: true, pendingEventCount: 0, unsettledPrintCount: 0, scope: "LOCAL_EVIDENCE_CURRENT_BINDING" }, ...patch };
  const calls: string[] = [];
  const port = { status: () => structuredClone(state), stop: () => { calls.push("stop"); state = { ...state, state: "STOPPED", running: false }; return state; }, configure: async (host: string, factory: string) => { calls.push("configure:" + host + ":" + factory); state.binding!.printerIds.push("new"); return { supported: true }; }, start: async () => { calls.push("start"); state.running = true; state.state = "RUNNING"; return { supported: true, started: true }; } };
  return { port, calls, set: (next: HostStatus) => { state = next; } };
}
test("refresh stops and confirms terminal before configuring same host/factory, resumes only previously running", async () => {
  const f = fixture(); const result = await applyPrinterToHost(f.port, "original-factory", "new", () => true, async () => {});
  assert.deepEqual(f.calls, ["stop", "configure:original-host:original-factory", "start"]); assert.equal(result.running, true);
  const stopped = fixture({ state: "STOPPED", running: false });
  await applyPrinterToHost(stopped.port, "original-factory", "new", () => true, async () => {});
  assert.deepEqual(stopped.calls, ["configure:original-host:original-factory"]);
});
test("refresh already-authorized printer performs no stop/configure/start", async () => {
  const f = fixture(); await applyPrinterToHost(f.port, "original-factory", "old", () => true);
  assert.deepEqual(f.calls, []);
});
test("unknown/unsettled capture or print evidence refuses refresh without touching state", async () => {
  for (const evidence of [{ countsAvailable: false }, { countsAvailable: true, pendingEventCount: 1, unsettledPrintCount: 0 }, { countsAvailable: true, pendingEventCount: 0, unsettledPrintCount: 1 }]) {
    const f = fixture({ evidence: { ...evidence, scope: "LOCAL_EVIDENCE_CURRENT_BINDING" } });
    await assert.rejects(applyPrinterToHost(f.port, "original-factory", "new", () => true), /未结执行证据/); assert.deepEqual(f.calls, []);
  }
});
test("wrong factory, absent binding and changed account cannot refresh", async () => {
  const f = fixture(); await assert.rejects(applyPrinterToHost(f.port, "other-factory", "new", () => true), /当前工厂/); assert.deepEqual(f.calls, []);
  await assert.rejects(applyPrinterToHost(f.port, "original-factory", "new", () => false), /已切换/); assert.deepEqual(f.calls, []);
});
test("unconfirmed stop never overwrites running configuration", async () => {
  const f = fixture(); f.port.stop = () => { f.calls.push("stop"); return f.port.status(); };
  await assert.rejects(applyPrinterToHost(f.port, "original-factory", "new", () => true, async () => {}), /尚未确认停止/);
  assert.deepEqual(f.calls, ["stop"]);
});
test("evidence or binding changing while stop completes refuses configure/restart and retains stop", async () => {
  for (const change of ["pending", "unknown", "binding"]) {
    const f = fixture(), stop = f.port.stop;
    f.port.stop = () => {
      const status = stop();
      if (change === "binding") status.binding!.hostId = "another-host";
      else if (change === "pending") status.evidence!.pendingEventCount = 1;
      else status.evidence!.unsettledPrintCount = 1;
      f.set(status); return status;
    };
    await assert.rejects(applyPrinterToHost(f.port, "original-factory", "new", () => true, async () => {}), /停止期间/);
    assert.deepEqual(f.calls, ["stop"]); assert.equal(f.port.status().state, "STOPPED");
  }
});
test("scope changing while configure awaits prevents restart", async () => {
  const f = fixture(); let authorized = true; const configure = f.port.configure;
  f.port.configure = async (host, factory) => { const result = await configure(host, factory); authorized = false; return result; };
  await assert.rejects(applyPrinterToHost(f.port, "original-factory", "new", () => authorized, async () => {}), /已切换/);
  assert.deepEqual(f.calls, ["stop", "configure:original-host:original-factory"]);
});
