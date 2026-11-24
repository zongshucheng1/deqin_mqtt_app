import { test } from "node:test";
import assert from "node:assert/strict";
import { installTestDeployment } from "./helpers/deployment";
import { deployment, normalizeLocalServiceAddress, changeLocalServiceAddress, initializeDeploymentSession, currentDeploymentIdentity, localServiceInfo } from "../src/services/deployment";
import { request } from "../src/services/http";

function fixture() {
  installTestDeployment({ profile: "development", localService: true, apiBaseUrl: "http://192.168.0.241:8080" });
  const data = new Map<string, unknown>();
  const events: string[] = [];
  const ports = {
    get: (key: string) => data.get(key),
    set: (key: string, value: string) => { data.set(key, value); },
    remove: (key: string) => { data.delete(key); },
    stopHost: () => { events.push("stop"); },
    clearSession: () => { events.push("clear"); data.delete("dq.token"); },
  };
  (globalThis as any).uni = { getStorageSync: ports.get, setStorageSync: ports.set, removeStorageSync: ports.remove };
  return { data, events, ports };
}

test("local address accepts bare LAN addresses and rejects public hosts, credentials and paths", () => {
  assert.equal(normalizeLocalServiceAddress(" 192.168.0.241:8080/ "), "http://192.168.0.241:8080");
  assert.equal(normalizeLocalServiceAddress("http://10.0.1.2:9000"), "http://10.0.1.2:9000");
  for (const value of ["", "8.8.8.8:8080", "localhost:8080", "192.168.0.1:0", "192.168.0.1:65536", "192.168.000.1:8080", "192.168.0.1/api", "user@192.168.0.1:8080", "192.168.0.1?x=1", "https://192.168.0.1:8080"])
    assert.throws(() => normalizeLocalServiceAddress(value), /局域网/);
});

test("local display keeps the package default separate from a saved or changed address", () => {
  const { data, ports } = fixture();
  installTestDeployment({ profile: "development", localService: true, apiBaseUrl: "http://192.168.31.83:8080" });
  data.set("dq.localServiceAddress.v1", "http://192.168.124.16:8080");
  assert.deepEqual(localServiceInfo(), {
    apiBaseUrl: "http://192.168.124.16:8080",
    defaultApiBaseUrl: "http://192.168.31.83:8080",
  });
  changeLocalServiceAddress("10.0.0.2:9000", ports);
  assert.deepEqual(localServiceInfo(), {
    apiBaseUrl: "http://10.0.0.2:9000",
    defaultApiBaseUrl: "http://192.168.31.83:8080",
  });
  installTestDeployment();
  assert.equal(localServiceInfo(), null);
});

test("changing local address clears old authorization and preserves scoped pending records", () => {
  const { data, events, ports } = fixture();
  const journal = [{ scope: "old-backend", requestKey: "pending-original" }];
  data.set("dq.pending", journal);
  data.set("dq.token", "synthetic-old-token");
  data.set("dq.hostId", "old-host");
  changeLocalServiceAddress("192.168.0.30:8081", ports);
  assert.deepEqual(events, ["stop", "clear"]);
  assert.equal(deployment().apiBaseUrl, "http://192.168.0.30:8081");
  assert.equal(data.has("dq.token"), false);
  assert.equal(data.has("dq.hostId"), false);
  assert.equal(data.get("dq.pending"), journal);
  assert.equal(data.get("dq.deploymentIdentity"), currentDeploymentIdentity());
  initializeDeploymentSession(ports);
  assert.deepEqual(events, ["stop", "clear"]);
  changeLocalServiceAddress("http://192.168.0.30:8081", ports);
  assert.deepEqual(events, ["stop", "clear"]);
});

test("failed native cleanup cannot switch endpoint; production ignores a stored local override", () => {
  const { data, ports } = fixture();
  assert.throws(() => changeLocalServiceAddress("192.168.0.30:8080", { ...ports, clearSession() { throw new Error("secure-store-failed"); } }), /secure-store/);
  assert.equal(deployment().apiBaseUrl, "http://192.168.0.241:8080");
  data.set("dq.localServiceAddress.v1", "http://8.8.8.8:8080");
  assert.equal(deployment().apiBaseUrl, "http://192.168.0.241:8080");
  data.set("dq.localServiceAddress.v1", "http://192.168.0.30:8080");
  installTestDeployment();
  assert.equal(deployment().apiBaseUrl, "https://isolated.invalid");
  assert.throws(() => changeLocalServiceAddress("192.168.0.30:8080", ports), /仅本地/);
});

test("late response from previous backend cannot expire the new session or supply data", async () => {
  const { ports } = fixture();
  let callback: any;
  (globalThis as any).uni.request = (options: any) => { callback = options; };
  const response = request("/auth/tenant/list", { auth: false });
  changeLocalServiceAddress("10.0.0.2:8080", ports);
  callback.success({ statusCode: 401, data: { code: 401 } });
  await assert.rejects(response, /连接地址已更改/);
});

test("switching A to B to A still rejects an old A response", async () => {
  const { ports } = fixture();
  let callback: any;
  (globalThis as any).uni.request = (options: any) => { callback = options; };
  const response = request("/auth/tenant/list", { auth: false });
  changeLocalServiceAddress("10.0.0.2:8080", ports);
  changeLocalServiceAddress("192.168.0.241:8080", ports);
  callback.success({ statusCode: 200, data: { code: 200, data: { old: true } } });
  await assert.rejects(response, /连接地址已更改/);
});

test("failed address persistence keeps old endpoint and rechecks authorization on restart", () => {
  const { data, ports, events } = fixture();
  data.set("dq.token", "synthetic-old-token");
  assert.throws(() => changeLocalServiceAddress("10.0.0.2:8080", {
    ...ports, set(key, value) { if (key === "dq.localServiceAddress.v1") throw new Error("disk-full"); ports.set(key, value); },
  }), /disk-full/);
  assert.equal(deployment().apiBaseUrl, "http://192.168.0.241:8080");
  assert.equal(data.has("dq.token"), false);
  initializeDeploymentSession(ports);
  assert.deepEqual(events, ["stop", "clear", "stop", "clear"]);
  assert.equal(data.get("dq.deploymentIdentity"), currentDeploymentIdentity());
});

test("storage read failure leaves local display renderable but blocks real deployment access", () => {
  fixture();
  (globalThis as any).uni.getStorageSync = () => { throw new Error("storage-read-failed"); };
  assert.deepEqual(localServiceInfo(), {
    apiBaseUrl: "http://192.168.0.241:8080",
    defaultApiBaseUrl: "http://192.168.0.241:8080",
  });
  assert.throws(deployment, /storage-read-failed/);
});
