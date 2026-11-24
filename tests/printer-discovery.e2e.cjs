/* Compiled production page + build-time-only native fixture. No LAN, backend, cloud or physical print. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { chromium } = require("C:/Users/deqin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fixture = require("./helpers/build-isolated-h5.cjs")({ publicKey: crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey, fixtureName: "h5-printer-discovery-fixture", printerNativeFixture: true });
const out = path.resolve(__dirname, "../.test-artifacts", fixture.version), base = fixture.base;
const checks = [], writes = [], reads = [], unknownRequests = [], pageErrors = [], screenshots = [];
let assertions = 0, currentCase = "setup", browser, context, page, origin, serial = 0, manage = true, activeFactory = "9007199254740993", loseRegistration = false, loseSave = false, rejectTestFile = false;
const kinds = ["RAW_WOOD", "PEELING", "DRYING", "WOOD_CORE", "WHITE_BARK"];
const oldPrinter = { id: "9223372036854775500", printerName: "原木打印机", endpointUri: "ipp://192.168.8.50:631/ipp/print", protocol: "IPP", enabled: 1, version: 5 };
let printers, configs;
function resetData() {
  printers = [structuredClone(oldPrinter)]; configs = new Map(kinds.map((warehouseType, i) => [warehouseType, { id: "config-" + warehouseType, warehouseType, printerId: oldPrinter.id, paperCode: "A4", paperWidthMm: "210", paperHeightMm: "297", templateCode: "STANDARD", templateRevision: 1, copies: 1, horizontalOffsetMm: "0", verticalOffsetMm: "0", autoPrint: warehouseType === "RAW_WOOD" ? 1 : 0, version: 5, configFingerprint: "fp-" + warehouseType + "-5", verifiedFingerprint: "fp-" + warehouseType + "-5" }]));
  manage = true; activeFactory = "9007199254740993"; loseRegistration = false; loseSave = false; rejectTestFile = false;
}
resetData();
function eq(a, b, message) { assertions++; assert.deepEqual(a, b, message); }
function ok(value, message) { assertions++; assert.ok(value, message); }
async function test(name, fn) { currentCase = name; const count = assertions; await fn(); checks.push({ name, assertions: assertions - count, passed: true }); console.log("PASS " + checks.length + ": " + name); }
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
function staticFile(urlPath) { const resolved = path.resolve(base, "." + decodeURIComponent(urlPath)); if (resolved !== base && !resolved.startsWith(base + path.sep)) return; const file = resolved === base ? path.join(base, "index.html") : resolved; if (fs.existsSync(file) && fs.statSync(file).isFile()) return file; }
const server = http.createServer((req, res) => { const p = new URL(req.url, "http://127.0.0.1").pathname, file = staticFile(p); if (req.method !== "GET" || !file) { unknownRequests.push({ method: req.method, path: p }); res.writeHead(404).end(); return; } res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(fs.readFileSync(file)); });
async function fresh(mode = "complete", reset = true) {
  if (reset) resetData();
  if (reset && page) await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith("dq.printerSetup:") || key.startsWith("dq.test:")) localStorage.removeItem(key); });
  if (page) { await page.locator("uni-toast").waitFor({state:"hidden"}).catch(()=>{}); await page.close(); }
  page = await context.newPage(); page.on("pageerror", (e) => pageErrors.push({message:e.message,stack:e.stack,case:currentCase}));
  await page.goto(origin + "/?case=" + ++serial + "#/pages/printers/index");
  if (manage) {
    await page.locator(".default-name").waitFor();
    await page.waitForFunction(() => globalThis.__printerFixture);
    await page.evaluate((mode) => { globalThis.__printerFixture.mode = mode; }, mode);
    if (mode !== "complete") { await page.getByText("正在搜索…", {exact:true}).waitFor({state:"detached"}); await page.getByText("重新搜索", {exact:true}).click(); }
    await page.getByText("正在搜索…", {exact:true}).waitFor({state:"detached"});
  }
}
async function calls(method) { return page.evaluate((method) => globalThis.__printerFixture.calls.filter((x) => x.method === method), method); }
const button = (text) => page.getByText(text, { exact: true });
const disabled = async (locator) => locator.evaluate(el => el.hasAttribute("disabled") || el.closest("uni-button")?.hasAttribute("disabled") || el.classList.contains("uni-button-disabled"));
const action = (text) => page.locator("uni-button").filter({hasText: new RegExp("^"+text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$")});
const input = (label) => page.locator(`uni-input[aria-label="${label}"] input`);
async function modalAccept() { await page.locator("uni-modal").getByText("确定", {exact:true}).click(); await page.locator("uni-modal").waitFor({state:"hidden"}); }
async function modalCancel() { await page.locator("uni-modal").getByText("取消",{exact:true}).click(); await page.locator("uni-modal").waitFor({state:"hidden"}); }
async function selectNew() { await page.locator(".printer-card").filter({hasText:"车间打印机"}).getByText("选择为本仓默认",{exact:true}).click(); }
async function saveConfig() { await action("保存本仓配置").click(); await button("本仓打印配置已保存").waitFor(); }
async function paper() { if (!(await input("纸张宽度").count())) await page.locator(".settings-toggle").click(); }
async function warehouse(label) { await page.locator("uni-picker").first().click(); await page.locator(".uni-picker-content .uni-picker-item").filter({hasText:new RegExp("^"+label+"$")}).last().click(); await page.locator(".uni-picker-action-confirm").last().click(); await page.locator(".warehouse-choice").filter({hasText:label}).waitFor(); await page.getByText("正在搜索…",{exact:true}).waitFor({state:"detached"}); }
async function shot(name) { await page.screenshot({ path: path.join(out, name), fullPage: true }); screenshots.push(name); }
function report(passed, error) {
  const sourcePaths = ["src/pages/printers/index.vue", "src/composables/printer-setup.ts", "src/domain/printer-setup.ts", "src/domain/printer-host-refresh.ts", "src/services/native.ts", "tests/fixtures/printer-native.ts"];
  fs.writeFileSync(path.join(out,"printer-discovery-report.json"),JSON.stringify({ passed, versionName:fixture.version, generatedAt:new Date().toISOString(), namedCaseCount:checks.length, actualAssertionCount:assertions, checks, currentCase, error:error&&String(error.stack||error), sourceHashes:sourcePaths.map(p=>({path:p,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.resolve(__dirname,"..",p))).digest("hex")})), testSha256:crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"), writes, reads, unknownRequests, pageErrors, screenshots, isolation:{syntheticSessionOnly:true, nativeFixture:"build-time Vite resolve alias only; no production mock injection", realNetworkScans:0, physicalPrints:0, realBackendRequests:0, realCredentialsRead:false, scope:"Compiled UI and synthetic bridge/API behavior; does not prove Android NSD or physical printer compatibility"}},null,2)+"\n");
}
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve)); origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  context=await browser.newContext({viewport:{width:390,height:844},locale:"zh-CN",serviceWorkers:"block"});context.setDefaultTimeout(10000);
  await context.addInitScript(({identity})=>{localStorage.setItem("dq.deploymentIdentity",identity);localStorage.setItem("dq.token","synthetic-printer-fixture-token");},{identity:fixture.deploymentIdentity});
  await context.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),p=url.pathname;
    if(req.url()==="https://cdn.dcloud.net.cn/img/shadow-grey.png"&&method==="GET")return route.fulfill({status:204});
    if(url.origin!==origin){unknownRequests.push({method,url:req.url()});return route.abort("blockedbyclient");}
    if(p==="/favicon.ico")return route.fulfill({status:204});
    if(!p.startsWith("/inout/")&&!p.startsWith("/auth/")){if(method==="GET"&&staticFile(p))return route.continue();unknownRequests.push({method,path:p});return route.abort("blockedbyclient");}
    const body=req.postDataJSON()||{}; if(method==="GET")reads.push({path:p,query:Object.fromEntries(url.searchParams),case:currentCase});else writes.push({method,path:p,body,case:currentCase});
    let data;
    if(p==="/inout/context"&&method==="GET")data={tenantId:"synthetic-tenant",userId:"9007199254740995",username:"synthetic-printer-admin",roleNames:[manage?"测试管理员":"测试操作员"],capabilities:{work:true,manage},permissions:[manage?"inout:manage":"inout:work"],factories:[{factoryId:activeFactory,factoryName:"隔离验收工厂",timezone:"Asia/Shanghai"}]};
    else if(p==="/auth/code"&&method==="GET")data={captchaEnabled:false};
    else if(p==="/inout/printers"&&method==="GET")data=printers;
    else if(p==="/inout/printers"&&method==="POST"){
      eq(body.factoryId,activeFactory);eq(body.id,undefined);eq(body.version,undefined);ok(!printers.some(x=>x.endpointUri===body.endpointUri),"new registration must not duplicate endpoint");
      data={...body,id:"9223372036854775510",enabled:0,version:0};printers.push(data);
      if(loseRegistration){loseRegistration=false;return route.abort("failed");}
    }else if(/^\/inout\/print-configs\/[^/]+$/.test(p)&&["GET","PUT"].includes(method)){
      const k=p.split("/").at(-1),prior=configs.get(k);data=prior;
      if(method==="PUT"){
        eq(body.factoryId,activeFactory);eq(body.version,prior.version);
        data={...prior,...body,version:prior.version+1,configFingerprint:"fp-"+k+"-"+(prior.version+1)};
        const sameParams=body.printerId===prior.printerId&&body.paperWidthMm===prior.paperWidthMm&&body.paperHeightMm===prior.paperHeightMm&&body.copies===prior.copies;
        data.verifiedFingerprint=sameParams&&prior.verifiedFingerprint===prior.configFingerprint?data.configFingerprint:undefined; configs.set(k,data);
        if(loseSave){loseSave=false;return route.abort("failed");}
      }
    }else if(/^\/inout\/print-configs\/[^/]+\/(detect|test|confirm|test-file)$/.test(p)&&method==="POST"){
      const [k,action]=p.split("/").slice(-2),prior=configs.get(k);eq(prior.autoPrint,0,"verification never runs while auto-print enabled");eq(body.factoryId,activeFactory);
      if(action==="test-file") {
        if (rejectTestFile) { rejectTestFile=false; return route.fulfill({status:400,json:{code:400,msg:"测试文件尚未生成"}}); }
        const printer=printers.find(p=>p.id===prior.printerId);
        data={downloadUrl:"https://synthetic.invalid/test.png",contentSha256:"a".repeat(64),configFingerprint:prior.configFingerprint,requestKey:body.requestKey,printerResourceKey:prior.printerId,endpointUri:printer.endpointUri,protocol:printer.protocol,paperCode:prior.paperCode,paperWidthMm:prior.paperWidthMm,paperHeightMm:prior.paperHeightMm,horizontalOffsetMm:prior.horizontalOffsetMm,verticalOffsetMm:prior.verticalOffsetMm,version:prior.version};
      }
      else {
        eq(body.configFingerprint,prior.configFingerprint);eq(body.version,prior.version);
        if(action!=="confirm") {ok(body.evidence?.success===true);eq(body.evidence.hostId,"9223372036854775400");eq(body.evidence.bootId,"mock-boot");eq(body.evidence.endpointUri,printers.find(p=>p.id===prior.printerId).endpointUri);}
        if(action==="test") {eq(body.evidence.printerResourceKey,prior.printerId);eq(body.evidence.contentSha256,"a".repeat(64));ok(body.evidence.receipt?.remoteJobId);}
        if(action==="confirm")eq(body.confirmed,true);
        data={...prior,version:prior.version+1};if(action==="confirm")data.verifiedFingerprint=prior.configFingerprint;configs.set(k,data);
      }
    }else {unknownRequests.push({method,path:p});return route.fulfill({status:404,json:{code:404,msg:"Unknown isolated request"}});}
    return route.fulfill({json:{code:200,msg:"ok",data}});
  });
  await test("进入自动搜索，真实形态卡片无手填名称协议URI或模板版本",async()=>{
    await fresh();eq((await calls("discovery.start")).length,1);eq(await page.locator(".printer-card").count(),3);eq(writes.length,0);
    for(const label of ["打印机名称","完整打印机URI","标签模板代码","模板版本"])eq(await page.locator(`uni-input[aria-label="${label}"]`).count(),0);
    eq(await input("纸张宽度").count(),0);eq(await page.locator(".default-name").innerText(),"原木打印机");await shot("printer-discovery-mobile.png");await page.screenshot({path:path.join(out,"printer-discovery-viewport-fixture.png"),fullPage:false});screenshots.push("printer-discovery-viewport-fixture.png");
  });
  await test("同一默认再次选择是零写入零探测，保留自动打印和原验证",async()=>{
    const before=writes.length;await action("当前仓库默认").click();eq(writes.length,before);eq((await calls("discovery.probe")).length,0);eq(configs.get("RAW_WOOD").autoPrint,1);eq(await page.locator(".default-printer .badge").innerText(),"自动打印已开启");
    for(const label of ["1 检测能力","2 发送测试页","3 确认纸张与二维码"])ok(await disabled(button(label)));
  });
  await test("不支持设备不可选；纸张与份数默认折叠且可展开",async()=>{
    ok(await disabled(page.locator(".printer-card").filter({hasText:"无法识别设备"}).getByText("选择为本仓默认",{exact:true})));
    await paper();eq(await input("纸张宽度").inputValue(),"210");eq(await input("打印份数").inputValue(),"1");await page.locator(".settings-toggle").click();eq(await input("纸张宽度").count(),0);
  });
  await test("搜索为空保留已有默认和自动打印，不默认选择首台",async()=>{
    await fresh("empty");eq(await page.locator(".printer-card").count(),0);await page.getByText("未发现可用打印机",{exact:false}).waitFor();eq(configs.get("RAW_WOOD").autoPrint,1);eq(await page.locator(".default-name").innerText(),"原木打印机");await shot("printer-discovery-empty.png");
  });
  await test("局域网不可用明确报错并保留默认，不误报零设备成功",async()=>{
    await fresh("error");await page.getByText("未连接可用局域网，请连接打印机所在的Wi-Fi或有线网络后重试。",{exact:false}).waitFor();eq(await page.locator(".discovery-empty").count(),0);eq(await page.locator(".default-name").innerText(),"原木打印机");eq(configs.get("RAW_WOOD").autoPrint,1);await shot("printer-discovery-network-error.png");
  });
  await test("局域网权限拒绝明确提示系统授权，保留原默认不写入",async()=>{
    const before=writes.length;await fresh("permission");await page.getByText("局域网发现权限未获允许，请在系统设置中允许后重新搜索。",{exact:false}).waitFor();eq(writes.length,before);eq(await page.locator(".default-name").innerText(),"原木打印机");eq(await page.locator(".discovery-empty").count(),0);
  });
  await test("H5不伪造搜索结果，显示Android限定与现有配置",async()=>{
    await fresh("unsupported");await page.getByText("自动搜索和网络打印仅支持已安装原生模块的Android终端；网页版可查看各仓库现有配置。",{exact:true}).waitFor();eq(await page.locator(".printer-card").count(),0);eq(await page.locator(".default-name").innerText(),"原木打印机");
  });
  await test("设备信息读取异常显示识别失败，不误称打印机不支持A4",async()=>{
    await fresh("parse-error");const card=page.locator(".printer-card");eq(await card.count(),1);
    await card.getByText("识别失败",{exact:true}).waitFor();eq(await card.getByText("暂不支持",{exact:true}).count(),0);
    await card.getByText("读取打印机信息失败，请重新搜索；这不代表打印机不支持A4。",{exact:true}).waitFor();
    ok(await disabled(card.getByText("选择为本仓默认",{exact:true})));eq(writes.length,0);
    eq(await page.getByText("Attempt to get length of null array",{exact:false}).count(),0);
  });
  await test("发现后的纸张能力失败不登记不改变默认",async()=>{
    await fresh();await page.evaluate(()=>globalThis.__printerFixture.probeSuccess=false);const before=writes.length;await selectNew();await button("当前纸张未获打印机支持").waitFor();eq(writes.length,before);eq(await page.locator(".default-name").innerText(),"原木打印机");ok(await disabled(button("保存本仓配置")));
  });
  await test("选择新设备只登记一次且不自动发送试打；默认需明确保存",async()=>{
    await fresh();const before=writes.length;await selectNew();await page.locator(".default-name").filter({hasText:"车间打印机"}).waitFor();eq(writes.slice(before).map(x=>x.method+" "+x.path),["POST /inout/printers"]);eq((await calls("host.test")).length,0);eq(configs.get("RAW_WOOD").printerId,"9223372036854775500");eq(await page.locator(".default-printer .badge").innerText(),"待保存");
    await saveConfig();eq(configs.get("RAW_WOOD").printerId,"9223372036854775510");eq(configs.get("RAW_WOOD").autoPrint,0);for(const k of kinds.slice(1))eq(configs.get(k).printerId,"9223372036854775500");
  });
  await test("应用到本终端先确认；取消无停机，确认同主机更新后恢复",async()=>{
    await action("应用打印机到本终端").click();await modalCancel();eq((await calls("host.stop")).length,0);
    await action("应用打印机到本终端").click();await modalAccept();await button("本终端打印机授权已更新").waitFor();
    eq((await calls("host.stop")).length,1);eq((await calls("host.configure"))[0].args,["9223372036854775400","9007199254740993"]);eq((await calls("host.start")).length,1);
  });
  await test("首次真实验证顺序能力→明确试打→纸张人工确认→开启后保存",async()=>{
    await action("1 检测能力").click();await button("当前纸张能力检测已通过，可继续试打。").waitFor();
    await action("2 发送测试页").click();await modalCancel();eq((await calls("host.test")).length,0);
    await action("2 发送测试页").click();await modalAccept();await button("测试页已被打印机接受，仍需到现场检查纸张并扫码。").waitFor();eq((await calls("host.test")).length,1);
    await action("3 确认纸张与二维码").click();await modalAccept();await button("纸张与二维码已确认，可开启自动打印后保存。").waitFor();
    await page.locator("uni-switch").click();await saveConfig();eq(configs.get("RAW_WOOD").autoPrint,1);ok(await disabled(button("1 检测能力")));await shot("printer-discovery-verified.png");
  });
  await test("各仓独立选择：复用已登记端点无PUT打印机或重复POST",async()=>{
    await warehouse("旋切库");const before=writes.length;await selectNew();await saveConfig();eq(configs.get("PEELING").printerId,"9223372036854775510");eq(configs.get("RAW_WOOD").autoPrint,1);eq(writes.slice(before).filter(x=>x.path==="/inout/printers").length,0);eq(writes.filter(x=>/^\/inout\/printers\//.test(x.path)).length,0);
  });
  await test("登记响应丢失只读核对后明确采用，不重发登记",async()=>{
    await fresh();loseRegistration=true;await selectNew();await button("核对服务端结果").waitFor();const count=writes.length;ok(await disabled(button("保存本仓配置")));await action("核对服务端结果").click();await action("采用服务端结果").click();await modalAccept();await page.locator(".uncertain-setting").waitFor({state:"detached"});eq(writes.length,count);eq(await page.locator(".default-name").innerText(),"车间打印机");eq(await page.locator(".default-printer .badge").innerText(),"待保存");
  });
  await test("仓库配置响应丢失保留输入，读取并采用不重复PUT",async()=>{
    await fresh();await paper();await input("纸张宽度").fill("211");loseSave=true;await action("保存本仓配置").click();await button("核对服务端结果").waitFor();const count=writes.length;eq(await input("纸张宽度").inputValue(),"211");await action("核对服务端结果").click();await button("采用服务端结果").waitFor();await shot("printer-discovery-readback.png");await action("采用服务端结果").click();await modalAccept();await page.locator(".uncertain-setting").waitFor({state:"detached"});eq(writes.length,count);eq(await input("纸张宽度").inputValue(),"211");
  });
  await test("未知保存后服务端被他人更改默认，展示实际机名纸张份数并只读采用",async()=>{
    await fresh();await paper();await input("纸张宽度").fill("211");loseSave=true;await action("保存本仓配置").click();await button("核对服务端结果").waitFor();
    printers.push({...oldPrinter,id:"9223372036854775510",printerName:"并发修改后的默认机",endpointUri:"ipp://192.168.8.51:631/ipp/print"});
    configs.set("RAW_WOOD",{...configs.get("RAW_WOOD"),printerId:"9223372036854775510",paperWidthMm:"216",paperHeightMm:"279",copies:2,autoPrint:0});
    const count=writes.length;await action("核对服务端结果").click();await page.locator(".readback").getByText("并发修改后的默认机",{exact:true}).waitFor();
    ok((await page.locator(".readback").innerText()).includes("216 × 279 mm · 2份"));await page.locator(".readback").getByText("配置已不同于本次提交，请核对后再采用",{exact:true}).waitFor();eq(await input("纸张宽度").inputValue(),"211");
    await action("采用服务端结果").click();await modalAccept();await page.locator(".uncertain-setting").waitFor({state:"detached"});await page.waitForFunction(()=>document.querySelector('uni-input[aria-label="纸张宽度"] input')?.value==="216");eq(await page.locator(".default-name").innerText(),"并发修改后的默认机");eq(await input("纸张宽度").inputValue(),"216");eq(writes.length,count);
  });
  await test("未知配置重进页面保留只读核对记录；切工厂不能读取旧结果",async()=>{
    await fresh();await paper();await input("纸张宽度").fill("212");loseSave=true;await action("保存本仓配置").click();await button("核对服务端结果").waitFor();const count=writes.length;
    await fresh("complete",false);await button("核对服务端结果").waitFor();eq(writes.length,count);eq(await page.locator(".printer-card").count(),0);
    activeFactory="9007199254740994";await fresh("complete",false);eq(await page.locator(".uncertain-setting").count(),0);eq(writes.length,count);
    activeFactory="9007199254740993";await fresh("complete",false);await button("核对服务端结果").waitFor();await action("核对服务端结果").click();await action("采用服务端结果").click();await modalAccept();await page.locator(".uncertain-setting").waitFor({state:"detached"});
  });
  await test("UI未持有但当前scope已有持久核对意图时，保存入口恢复并拒绝新写",async()=>{
    await fresh();await paper();await input("纸张宽度").fill("214");
    const draft={...configs.get("RAW_WOOD"),paperWidthMm:"214",autoPrint:0};
    await page.evaluate((draft)=>{const scope=JSON.stringify(["http://127.0.0.1:8080","synthetic-tenant","9007199254740995","9007199254740993"]);localStorage.setItem("dq.printerSetup:"+scope+":RAW_WOOD",JSON.stringify({type:"object",data:{scope,warehouse:"RAW_WOOD",operation:"config",draft}}));},draft);
    const count=writes.length;await action("保存本仓配置").click();await button("核对服务端结果").waitFor();eq(writes.length,count);ok(await disabled(button("保存本仓配置")));eq(await input("纸张宽度").inputValue(),"214");
  });
  await test("纸张未保存切仓取消保留输入，明确放弃不写库",async()=>{
    await fresh();await paper();await input("纸张宽度").fill("213");const before=writes.length;await page.locator("uni-picker").first().click();await page.locator(".uni-picker-content .uni-picker-item").filter({hasText:/^旋切库$/}).last().click();await page.locator(".uni-picker-action-confirm").last().click();await modalCancel();eq(await input("纸张宽度").inputValue(),"213");eq(await page.locator(".warehouse-choice").innerText(),"原木库默认打印机");eq(writes.length,before);
  });
  await test("测试文件明确失败后沿原准备key可继续；失败前零原生发送",async()=>{
    await fresh();await page.locator("uni-switch").click();await saveConfig();await action("1 检测能力").click();await button("当前纸张能力检测已通过，可继续试打。").waitFor();
    rejectTestFile=true;await action("2 发送测试页").click();await modalAccept();await button("测试文件尚未生成").waitFor();eq((await calls("host.test")).length,0);
    const first=writes.filter(x=>x.path.endsWith("/test-file")).at(-1).body.requestKey;
    await action("2 发送测试页").click();await modalAccept();await button("测试页已被打印机接受，仍需到现场检查纸张并扫码。").waitFor();eq((await calls("host.test")).length,1);eq(writes.filter(x=>x.path.endsWith("/test-file")).at(-1).body.requestKey,first);
  });
  await test("原生调用结果未知且证据null时不创建新key或再次发送",async()=>{
    await fresh();await page.locator("uni-switch").click();await saveConfig();await action("1 检测能力").click();await button("当前纸张能力检测已通过，可继续试打。").waitFor();
    await page.evaluate(()=>{globalThis.__printerFixture.testThrows=true;globalThis.__printerFixture.nativeTestStatus="NULL";});
    await action("2 发送测试页").click();await modalAccept();await button("原生试打响应丢失").waitFor();eq((await calls("host.test")).length,1);const count=writes.length;
    await action("2 发送测试页").click();await modalAccept();await button("原试打证据暂不可读，请先核对原结果，不会创建新试打").waitFor();eq((await calls("host.test")).length,1);eq(writes.length,count);
  });
  await test("旧UNKNOWN试打换默认后仍只查原key，不创建新发送",async()=>{
    await fresh();await selectNew();await saveConfig();await action("应用打印机到本终端").click();await modalAccept();await button("本终端打印机授权已更新").waitFor();await action("1 检测能力").click();await button("当前纸张能力检测已通过，可继续试打。").waitFor();
    await page.evaluate(()=>{globalThis.__printerFixture.nativeTestStatus="UNKNOWN";const scope=JSON.stringify(["http://127.0.0.1:8080","synthetic-tenant","9007199254740995","9007199254740993"]);localStorage.setItem("dq.test:"+scope+":RAW_WOOD",JSON.stringify({type:"object",data:{key:"original-unknown-key",fingerprint:"old-config-fingerprint"}}));});
    const before=writes.length;await action("2 发送测试页").click();await modalAccept();await button("原配置试打仍待核对，不会改用新默认打印机或再次发送，请先核验原纸张和任务").waitFor();eq((await calls("host.test")).length,0);eq((await calls("host.testStatus"))[0].args,["original-unknown-key"]);eq(writes.length,before);
  });
  await test("主机存在未结证据时应用被拒绝，零停机零configure",async()=>{
    await fresh();await selectNew();await saveConfig();await page.evaluate(()=>globalThis.__printerFixture.host.evidence.unsettledPrintCount=1);await action("应用打印机到本终端").click();await modalAccept();await page.getByText("本终端仍有未结执行证据或证据数量不明，请先核对固定主机诊断；不会清空证据或强制重启",{exact:true}).waitFor();eq((await calls("host.stop")).length,0);eq((await calls("host.configure")).length,0);
  });
  for(const width of [320,390,768])await test(width+"px自动发现和纸张展开均无横溢出",async()=>{
    await fresh();await page.setViewportSize({width,height:844});const check=async()=>page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));let s=await check();ok(s.doc<=width+1&&s.body<=width+1,JSON.stringify(s));await paper();s=await check();ok(s.doc<=width+1&&s.body<=width+1,JSON.stringify(s));
  });
  await test("普通作业角色直达被拒绝，不启动发现或写配置",async()=>{
    resetData();manage=false;const before=writes.length;await fresh("complete",false);await button("当前角色无权维护打印配置").waitFor();eq((await calls("discovery.start")).length,0);eq(writes.length,before);
  });
  await test("所有请求明确隔离，无队列重发删除或修改旧任务，无未知网络及页面异常",async()=>{
    eq(unknownRequests,[]);eq(pageErrors,[]);eq(writes.filter(x=>!/^\/inout\/(printers$|print-configs\/)/.test(x.path)),[]);eq(reads.filter(x=>x.path.includes("print-jobs")),[]);ok(screenshots.length>=5);
  });
  report(true);console.log(JSON.stringify({passed:true,namedCases:checks.length,assertions,report:path.join(out,"printer-discovery-report.json")}));
})().catch(async e=>{if(page)await page.screenshot({path:path.join(out,"printer-discovery-failure.png"),fullPage:true}).catch(()=>{});report(false,e);console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));});
