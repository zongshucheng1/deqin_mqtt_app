import test from "node:test";
import assert from "node:assert/strict";
import { startCaptureHost } from "../src/composables/capture-host-start";
import type { HostStatus } from "../src/services/native";

function snapshot(printerIds: string[] = []): HostStatus {
  return {
    supported: true,
    state: "STOPPED",
    running: false,
    binding: {
      configured: true,
      hostId: "host-a",
      factoryId: "factory-a",
      deviceStreams: [],
      printerIds,
    },
    evidence: {
      countsAvailable: true,
      pendingEventCount: 2,
      unsettledPrintCount: 1,
      scope: "LOCAL_EVIDENCE_CURRENT_BINDING",
    },
  };
}

function harness(initial = snapshot()) {
  let value = initial;
  const calls: string[] = [];
  const port = {
    status() {
      calls.push("status");
      return value;
    },
    stop() {
      calls.push("stop");
      value = { ...value, running: false, state: "STOPPED" };
      return { supported: true };
    },
    async configure(hostId: string, factoryId: string) {
      calls.push("configure:" + hostId + ":" + factoryId);
      value = snapshot();
      return { supported: true };
    },
    async start() {
      calls.push("start");
      return { supported: true, started: true };
    },
  };
  return { calls, port, set(valueNext: HostStatus) { value = valueNext; } };
}

const noWait = async () => {};

test("capture start stops a running legacy host, refreshes native binding and preserves evidence", async () => {
  const before = snapshot(["old-printer"]);
  before.running = true;
  before.state = "RUNNING";
  const evidence = JSON.stringify(before.evidence);
  const { port, calls } = harness(before);
  const result = await startCaptureHost(port, "host-a", "factory-a", () => true, noWait);
  assert.equal(result.started, true);
  assert.deepEqual(calls, ["status", "stop", "status", "configure:host-a:factory-a", "status", "start"]);
  assert.equal(JSON.stringify(before.evidence), evidence);
});

test("capture start reconfigures even a previously stopped capture-only host", async () => {
  const { port, calls } = harness();
  await startCaptureHost(port, "host-a", "factory-a", () => true, noWait);
  assert.deepEqual(calls, ["status", "configure:host-a:factory-a", "status", "start"]);
});

test("actual native printer binding rejects startup even when configure acknowledges success", async () => {
  const { port, calls, set } = harness();
  port.configure = async () => {
    set(snapshot(["legacy-phone-printer"]));
    return { supported: true };
  };
  await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => true, noWait), /仍带旧手机打印授权/);
  assert.equal(calls.includes("start"), false);
});

test("missing printerIds or wrong factory is not treated as an empty capture binding", async () => {
  for (const invalid of [
    { ...snapshot(), binding: { ...snapshot().binding!, printerIds: undefined } } as unknown as HostStatus,
    { ...snapshot(), binding: { ...snapshot().binding!, factoryId: "factory-b" } },
    { supported: true, running: false, state: "STOPPED" },
  ]) {
    const { port, calls, set } = harness();
    port.configure = async () => { set(invalid); return { supported: true }; };
    await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => true, noWait), /完整授权/);
    assert.equal(calls.includes("start"), false);
  }
});

test("configure response containing a legacy printer binding also rejects startup", async () => {
  const { port, calls } = harness();
  port.configure = async () => snapshot(["old-printer"]);
  await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => true, noWait), /仍带旧手机打印授权/);
  assert.equal(calls.includes("start"), false);
});

test("stop acknowledgement without actual stopped state cannot update configuration or start", async () => {
  const initial = { ...snapshot(), running: true, state: "RUNNING" };
  const { port, calls } = harness(initial);
  port.stop = () => ({ supported: true });
  await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => true, noWait), /尚未确认停止/);
  assert.equal(calls.some((item) => item.startsWith("configure")), false);
  assert.equal(calls.includes("start"), false);
});

test("account change while configuring prevents start", async () => {
  const { port, calls } = harness();
  let authorized = true;
  port.configure = async () => { authorized = false; return { supported: true }; };
  await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => authorized, noWait), /已切换/);
  assert.equal(calls.includes("start"), false);
});

test("account change during native start permission await stops the new start", async () => {
  const { port, calls } = harness();
  let authorized = true;
  port.start = async () => { authorized = false; return { supported: true, started: true }; };
  await assert.rejects(startCaptureHost(port, "host-a", "factory-a", () => authorized, noWait), /已切换/);
  assert.equal(calls.at(-1), "stop");
});
