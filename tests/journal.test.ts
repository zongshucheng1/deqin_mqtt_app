import { test } from "node:test";
import assert from "node:assert/strict";
import {
  write,
  pendingWrites,
  replay,
  resolvePending,
  canonical,
} from "../src/services/journal";
import { requestScope } from "../src/domain/scope";
import { installTestDeployment } from "./helpers/deployment";
installTestDeployment();
const storage = new Map<string, unknown>();
let requests: any[] = [];
let requestDetails: any[] = [];
let intercept: ((options: any) => boolean) | undefined;
let unknown = true;
let responseData: any = {
  id: "9223372036854775806",
  factoryId: "9223372036854775805",
  quantity: "2.450",
};
(globalThis as any).uni = {
  getStorageSync: (k: string) => storage.get(k),
  setStorageSync: (k: string, v: unknown) => storage.set(k, v),
  removeStorageSync: (k: string) => storage.delete(k),
  request: (options: any) => {
    requests.push(options.data);
    requestDetails.push(options);
    if (intercept?.(options)) return;
    if (unknown) options.fail({ errMsg: "timeout" });
    else
      options.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: responseData }),
      });
  },
};
test("写入前持久化请求，超时保留同key，原内容重放不会换key", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://test.invalid" });
  requests = [];
  unknown = true;
  await assert.rejects(
    write("user:factory", "create:WHITE_BARK", "/inout/records", "POST", {
      quantity: "2.450",
      factoryId: "9223372036854775805",
      printingMode: "SERVER",
    }),
  );
  const first = pendingWrites()[0];
  assert.equal(first.uncertain, true);
  assert.equal(requests[0].requestKey, first.key);
  await assert.rejects(
    write("user:factory", "create:WHITE_BARK", "/inout/records", "POST", {
      quantity: "3.000",
      factoryId: "9223372036854775805",
      printingMode: "SERVER",
    }),
    /上次提交结果尚未确认/,
  );
  assert.equal(requests.length, 1);
  unknown = false;
  const result: any = await replay(first, () => first.scope);
  assert.equal(result.id, "9223372036854775806");
  assert.equal(requests[1].requestKey, first.key);
  assert.equal(pendingWrites().length, 0);
});
test("规范化内容不受对象属性顺序影响", () => {
  assert.equal(
    canonical({ a: "2.450", b: { id: "999999999999999999" } }),
    canonical({ b: { id: "999999999999999999" }, a: "2.450" }),
  );
});

test("数值ID写响应不能丢弃原请求身份", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://test.invalid" });
  requests = [];
  unknown = false;
  responseData = { id: 9007199254740992, quantity: "2.450" };
  await assert.rejects(
    write("u:f", "create:WHITE_BARK", "/inout/records", "POST", {
      quantity: "2.450",
    }),
    /服务器ID或精确数量格式异常/,
  );
  assert.equal(pendingWrites().length, 1);
  assert.equal(pendingWrites()[0].uncertain, true);
  storage.clear();
  responseData = {
    id: "9223372036854775806",
    factoryId: "9223372036854775805",
    quantity: "2.450",
  };
});
test("密码操作不会落入持久重放存储", async () => {
  storage.clear();
  requests = [];
  await assert.rejects(
    write("u:f", "password", "/inout/members/1/password", "PUT", {
      password: "test-secret",
    }),
    /密码操作不能保存/,
  );
  assert.equal(pendingWrites().length, 0);
  assert.equal(requests.length, 0);
});
test("请求命名空间规范化地址并无歧义分隔租户、用户和工厂", () => {
  assert.equal(
    requestScope(" HTTPS://API.EXAMPLE.COM:443/api/// ", "tenant", "42", "7"),
    requestScope("https://api.example.com/api", "tenant", "42", "7"),
  );
  assert.notEqual(
    requestScope("https://api.example.com", "a:b", "c", "7"),
    requestScope("https://api.example.com", "a", "b:c", "7"),
  );
});
test("相同ID切换服务器、租户、账号或工厂后，查询与重放均不发送任何请求", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
  const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
  unknown = true;
  await assert.rejects(
    write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
      factoryId: "7",
      quantity: "1",
    }),
  );
  const original = pendingWrites()[0];
  requests = [];
  for (const changed of [
    requestScope("https://api-b.invalid", "t1", "42", "7"),
    requestScope("https://api-a.invalid", "t2", "42", "7"),
    requestScope("https://api-a.invalid", "t1", "43", "7"),
    requestScope("https://api-a.invalid", "t1", "42", "8"),
  ]) {
    await assert.rejects(
      replay(original, () => changed),
      /服务器、租户、账号或工厂已切换/,
    );
    await assert.rejects(
      resolvePending(original, () => changed),
      /服务器、租户、账号或工厂已切换/,
    );
  }
  assert.equal(requests.length, 0);
  assert.equal(pendingWrites()[0].key, original.key);
});
test("核对入库record及标签、打印、命令result时只读取原结果，不再次写入", async () => {
  for (const operation of [
    "create:RAW_WOOD",
    "label:41",
    "enqueue:41",
    "verify:41",
    "command-review:41",
  ]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    unknown = true;
    await assert.rejects(
      write(scope, operation, "/inout/records", "POST", {
        factoryId: "7",
        quantity: "1",
      }),
    );
    const original = pendingWrites()[0];
    requestDetails = [];
    intercept = (options) => {
      const value = {
        id: "41",
        commandId: "41",
        factoryId: "7",
        quantity: "1",
        status: operation.startsWith("label:") ? "RENDERING" : "QUEUED",
      };
      options.success({
        statusCode: 200,
        data: JSON.stringify({
          code: 200,
          data: operation.startsWith("create:")
            ? { requestKey: original.key, record: value }
            : { completed: true, result: value },
        }),
      });
      return true;
    };
    try {
      const result = await resolvePending<{ id: string }>(
        original,
        () => scope,
      );
      assert.equal(result.id, "41");
      assert.equal(requestDetails.length, 1);
      assert.equal(requestDetails[0].method, "GET");
      assert.match(
        requestDetails[0].url,
        new RegExp("/requests/" + original.key + "$"),
      );
      assert.deepEqual(requestDetails[0].data, { factoryId: "7" });
      assert.equal(pendingWrites().length, 0);
    } finally {
      intercept = undefined;
    }
  }
});
test("SERVER请求仅404加REQUEST_NOT_COMMITTED证明允许原键原载荷重放，确认后不再创建新键", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
  const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
  unknown = true;
  await assert.rejects(
    write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
      factoryId: "7",
      quantity: "1",
      printingMode: "SERVER",
    }),
  );
  const original = pendingWrites()[0];
  requestDetails = [];
  unknown = false;
  intercept = (options) => {
    if (options.method !== "GET") return false;
    options.success({
      statusCode: 404,
      data: JSON.stringify({
        code: 404,
        msg: "原请求尚未提交",
        errorCode: "REQUEST_NOT_COMMITTED",
      }),
    });
    return true;
  };
  try {
    await resolvePending(original, () => scope);
    assert.deepEqual(
      requestDetails.map((r) => r.method),
      ["GET", "POST"],
    );
    assert.equal(requestDetails[1].data.requestKey, original.key);
    assert.deepEqual(requestDetails[1].data, {
      ...original.payload,
      requestKey: original.key,
    });
    assert.equal(pendingWrites().length, 0);
    await assert.rejects(
      replay(original, () => scope),
      /此待确认请求已处理/,
    );
    assert.equal(requestDetails.length, 2);
  } finally {
    intercept = undefined;
  }
});
test("普通404或代理HTML不构成未提交证明，核对后不重发且保留原台账", async () => {
  for (const data of [
    JSON.stringify({ code: 404, msg: "普通路由不存在" }),
    JSON.stringify({ code: 404, msg: "REQUEST_NOT_COMMITTED" }),
    "<html>proxy not found</html>",
  ]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    unknown = true;
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    await assert.rejects(
      write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
        factoryId: "7",
        quantity: "1",
      }),
    );
    const original = pendingWrites()[0];
    requestDetails = [];
    intercept = (options) => {
      options.success({ statusCode: 404, data });
      return true;
    };
    try {
      await assert.rejects(resolvePending(original, () => scope));
      assert.deepEqual(
        requestDetails.map((r) => r.method),
        ["GET"],
      );
      assert.equal(pendingWrites()[0].key, original.key);
      assert.deepEqual(pendingWrites()[0].payload, original.payload);
    } finally {
      intercept = undefined;
    }
  }
});
test("旧DEVICE及未指定打印方式的入库可核对已提交结果，只读确认后结算原请求", async () => {
  for (const mode of [{ printingMode: "DEVICE" }, {}]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    unknown = true;
    await assert.rejects(
      write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
        factoryId: "7", quantity: "1", ...mode,
      }),
    );
    const original = pendingWrites()[0];
    requestDetails = [];
    intercept = (options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: {
          record: { id: "41", factoryId: "7", quantity: "1" },
        } }),
      });
      return true;
    };
    try {
      const result = await resolvePending<{ id: string }>(original, () => scope);
      assert.equal(result.id, "41");
      assert.deepEqual(requestDetails.map((r) => r.method), ["GET"]);
      assert.match(requestDetails[0].url, new RegExp("/requests/" + original.key + "$"));
      assert.equal(pendingWrites().length, 0);
    } finally {
      intercept = undefined;
    }
  }
});
test("旧DEVICE及未指定方式入库明确未提交时不自动重放，完整保留原键载荷和证据", async () => {
  for (const mode of [{ printingMode: "DEVICE" }, {}]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    unknown = true;
    await assert.rejects(
      write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
        factoryId: "7", quantity: "1", ...mode,
      }),
    );
    const original = pendingWrites()[0];
    const evidence = JSON.stringify(pendingWrites());
    requestDetails = [];
    intercept = (options) => {
      options.success({
        statusCode: 404,
        data: JSON.stringify({
          code: 404, errorCode: "REQUEST_NOT_COMMITTED", msg: "原请求尚未提交",
        }),
      });
      return true;
    };
    try {
      await assert.rejects(resolvePending(original, () => scope), {
        code: "PENDING_LEGACY_PRINTING_MODE",
        message: /原请求编号和内容已保留.*核对旧请求/,
      });
      assert.deepEqual(requestDetails.map((r) => r.method), ["GET"]);
      assert.equal(JSON.stringify(pendingWrites()), evidence);
      // Calling replay directly cannot bypass the mode guard or create a new key.
      await assert.rejects(replay(original, () => scope), {
        code: "PENDING_LEGACY_PRINTING_MODE",
      });
      assert.equal(requestDetails.length, 1);
      assert.equal(JSON.stringify(pendingWrites()), evidence);
    } finally {
      intercept = undefined;
    }
  }
});
test("非入库的原请求在明确未提交后仍按原键重放，不要求printingMode", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
  const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
  unknown = true;
  await assert.rejects(write(scope, "label:41", "/inout/records/41/labels", "POST", {
    factoryId: "7", reason: "重新生成标签",
  }));
  const original = pendingWrites()[0];
  requestDetails = [];
  intercept = (options) => {
    options.success(options.method === "GET" ? {
      statusCode: 404,
      data: JSON.stringify({ code: 404, errorCode: "REQUEST_NOT_COMMITTED" }),
    } : {
      statusCode: 200,
      data: JSON.stringify({ code: 200, data: { id: "51", status: "RENDERING" } }),
    });
    return true;
  };
  try {
    const result = await resolvePending<{ id: string }>(original, () => scope);
    assert.equal(result.id, "51");
    assert.deepEqual(requestDetails.map((r) => r.method), ["GET", "POST"]);
    assert.deepEqual(requestDetails[1].data, { ...original.payload, requestKey: original.key });
    assert.equal(pendingWrites().length, 0);
  } finally {
    intercept = undefined;
  }
});
test("写响应null、HTML、缺data或空业务实体不会删除已持久化原请求", async () => {
  for (const data of [
    "null",
    "<html>gateway</html>",
    "{}",
    JSON.stringify({ code: 200 }),
    JSON.stringify({ code: 200, data: null }),
    JSON.stringify({ code: 200, data: {} }),
    JSON.stringify({ code: 200, data: { id: "invalid" } }),
    JSON.stringify({ code: 200, data: { id: "41" } }),
  ]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    requestDetails = [];
    intercept = (options) => {
      options.success({ statusCode: 200, data });
      return true;
    };
    try {
      await assert.rejects(
        write("u:f", "create:WHITE_BARK", "/inout/records", "POST", {
          factoryId: "7",
          quantity: "2.450",
        }),
      );
      assert.equal(pendingWrites().length, 1);
      assert.equal(pendingWrites()[0].uncertain, true);
      assert.equal(requestDetails[0].data.requestKey, pendingWrites()[0].key);
      assert.equal(pendingWrites()[0].payload.quantity, "2.450");
    } finally {
      intercept = undefined;
    }
  }
});
test("已有不明请求重试遇到401或普通404仍保留原证据，不能当作旧提交失败", async () => {
  for (const code of [401, 404, 400]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    unknown = true;
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    await assert.rejects(
      write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
        factoryId: "7",
        quantity: "1",
        printingMode: "SERVER",
      }),
    );
    const original = pendingWrites()[0];
    requestDetails = [];
    intercept = (options) => {
      options.success({
        statusCode: code,
        data: JSON.stringify({ code, msg: "本次请求拒绝" }),
      });
      return true;
    };
    (globalThis as any).uni.reLaunch = (options: any) => options.complete?.();
    (globalThis as any).uni.showToast = () => {};
    try {
      await assert.rejects(replay(original, () => scope));
      assert.equal(pendingWrites().length, 1);
      assert.equal(pendingWrites()[0].key, original.key);
      assert.equal(pendingWrites()[0].uncertain, true);
      assert.deepEqual(requestDetails[0].data, {
        ...original.payload,
        requestKey: original.key,
      });
    } finally {
      intercept = undefined;
    }
  }
});
test("核对接口返回空实体或缺少记录精确字段时仍保留原台账且不重发", async () => {
  for (const result of [
    null,
    {},
    { id: "41" },
    { id: "invalid", factoryId: "7", quantity: "1" },
  ]) {
    storage.clear();
    installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
    unknown = true;
    const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
    await assert.rejects(
      write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
        factoryId: "7",
        quantity: "1",
      }),
    );
    const original = pendingWrites()[0];
    requestDetails = [];
    intercept = (options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: { completed: true, result } }),
      });
      return true;
    };
    try {
      await assert.rejects(resolvePending(original, () => scope));
      assert.deepEqual(
        requestDetails.map((r) => r.method),
        ["GET"],
      );
      assert.equal(pendingWrites()[0].key, original.key);
    } finally {
      intercept = undefined;
    }
  }
});
test("核对查询期间切换环境，404也不能向新环境重放", async () => {
  storage.clear();
  installTestDeployment({ apiBaseUrl: "https://api-a.invalid" });
  const scope = requestScope("https://api-a.invalid", "t1", "42", "7");
  let currentScope = scope;
  unknown = true;
  await assert.rejects(
    write(scope, "create:RAW_WOOD", "/inout/records", "POST", {
      factoryId: "7",
      quantity: "1",
    }),
  );
  const original = pendingWrites()[0];
  requestDetails = [];
  intercept = (options) => {
    installTestDeployment({ apiBaseUrl: "https://api-b.invalid" });
    currentScope = requestScope("https://api-b.invalid", "t1", "42", "7");
    options.success({ statusCode: 404, data: JSON.stringify({ code: 404 }) });
    return true;
  };
  try {
    await assert.rejects(
      resolvePending(original, () => currentScope),
      /服务器、租户、账号或工厂已切换/,
    );
    assert.equal(requestDetails.length, 1);
    assert.equal(requestDetails[0].method, "GET");
    assert.equal(pendingWrites()[0].key, original.key);
  } finally {
    intercept = undefined;
  }
});
