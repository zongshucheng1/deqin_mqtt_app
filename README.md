# 德勤智造 uni-app 客户端

Vue 3 + TypeScript + Pinia。默认连接真实 `/auth` 和 `/inout` 后端，不内置示例库存、模拟登录或成功回执。

## Android 外接屏镜像

连接显示器后，在 APP「我的 → 外接屏镜像」点击「开始镜像」，确认 Android 的屏幕共享授权，再关闭设置回到业务页面。默认「竖装自动」会将横向输出旋转 90°，手机画面在外屏等比居中。画面倒置时切换到另一侧 90°，系统已将显示器设为竖屏时可使用「原始方向」。外屏实时显示手机主屏内容，只传到当前外接屏。

可在同一入口或 Android 的镜像通知中停止。拔线或系统结束共享后，再启动时需重新授权。手机须支持视频输出，并向 Android 提供可供应用使用的外接显示器。若系统仅提供内置的复制模式，请在手机支持时切换到可独立输出的模式。此功能包含原生服务，需要使用更新后的 Android 安装包或自定义调试基座。

2026年11月5日已生成服务器正式版 **0.1.23 / 123**：[APK安装包](dist/release/apk/deqin-inout-0.1.23.apk)，连接 `https://screen.deqin.info/prod-api`，包名 `com.deqin.inout`。扫码页和五库“扫码出库”按钮均使用二维码扫描图标；156项应用测试、类型检查、正式资源构建、91项APK静态检查和69项一致性检查通过。签名与0.1.22一致，可覆盖升级；本次未安装手机或部署后端。见[验证结果](../implementation/server-apk-20261105-0.1.23/result.json)。

2026年11月4日已生成服务器正式版 **0.1.22 / 122**：[APK安装包](dist/release/apk/deqin-inout-0.1.22.apk)，连接 `https://screen.deqin.info/prod-api`，包名 `com.deqin.inout`。包含当前源码中的原木长度、服务器方量预览、回显核对、实时根数差额及电脑打印功能。156项应用测试、类型检查、生产构建、91项实包静态检查和66项一致性检查通过；签名与0.1.21一致，可覆盖升级。未安装手机或部署后端；需配套支持这些功能的最新后端。见[验证结果](../implementation/server-apk-20261104-0.1.22/result.json)。

2026年11月2日当前源码已允许具有本工厂作业权限（`inout:work`）的操作员在记录详情执行“生成新版本并打印”，无需另授`inout:manage`或`inout:print:reprint`。处理中、结果不明和已作废批次仍按原规则拦截；打印中心的原版本“明确补打”和纸张核验权限不变。需要同步更新APP与后端，无需数据库迁移或Windows客户端更新；现有0.1.20 APK不包含本次源码修改。

2026年10月30日已生成 **0.1.20 / 120**：[安装包](dist/release/apk/deqin-inout-0.1.20.apk)。选择“确认已出纸”后，核验依据为选填，可留空提交；91项APK静态检查、52项一致性检查通过，签名与0.1.19相同。此次未安装手机或部署后端。需要同步更新后端服务，后台管理前端、Windows打印客户端及SQL无需因本次修改更新。见[打包结果](../implementation/android-package-result-0.1.20.json)。

2026年10月30日用户已自行云端生成 **0.1.19 / 119**，见[APK](dist/release/apk/deqin-inout-0.1.19.apk)。91项静态检查通过，签名与0.1.18一致，包内已确认包含记录详情自动同步：处理中3秒、稳定15秒、失败15/30秒退避；页面隐藏、应用后台、确认及编辑期间暂停，切换批次/工厂与写操作会使旧查询结果失效。本次未安装手机，无需后端变更。功能验证见[自动刷新记录](../implementation/pc-print-agent/detail-status-refresh-20261030.json)，安装包验证见[更新记录](../implementation/android-package-result-0.1.19.json)。

2026年10月30日 **0.1.18 / 118** 已通过USB同签名覆盖安装到华为 JEF-AN20，保留首次安装时间和应用数据目录。新版本包含生成电脑标签后自动排队打印及明确重打逻辑；128项单测、16项相关页面场景、91项APK静态检查和48项一致性检查通过。应用进程及前台Activity已启动，锁屏状态下未验收业务页面；真实打印仍需配套后端部署后核验。本次未部署后端。见[APK](dist/release/apk/deqin-inout-0.1.18.apk)与[更新记录](../implementation/android-package-result-0.1.18.json)。

2026年10月29日已生成完整签名安装包 **0.1.17 / 117**：[APK](dist/release/apk/deqin-inout-0.1.17.apk)。本包包含原木径级码单的“空值显示0提示、聚焦清空、空值按0提交”调整，以及全APP下拉、进入、返回、日期切换和展开收起箭头统一；同时包含当前工厂人员维护与后台统一电脑打印源码。128项单测、33项隔离页面场景、91项APK静态检查通过；已核对与0.1.16使用相同签名，31个运行资源与最终编译逐文件一致，可覆盖原正式版。本次未自动安装到手机，见[打包结果](../implementation/android-package-result-0.1.17.json)。

2026年10月28日已生成完整签名安装包 `0.1.16 / 116`：[APK](dist/release/apk/deqin-inout-0.1.16.apk)。本包包含当前后台统一电脑打印功能，以及“我的”页隐藏空待确认区域、日期筛选按年/月显示与选择的调整。126项前端单测和130项APK静态检查通过，已核对与0.1.15使用相同签名、包内资源与本次编译一致；可覆盖原正式版，由用户安装验收。见[打包结果](../implementation/android-package-result-0.1.16.json)。

后续源码新增工厂操作员账号维护，尚未包含在上述0.1.16安装包中。需同时更新统一后端和APP：在Web「系统管理 → 角色管理」给工厂管理员角色授予「APP管理 → 出入库管理」（`inout:manage`），并在工厂人员授权中将管理员与操作员绑定到对应工厂；操作员使用 `inout:work`。管理员重新登录后从「我的 → 人员管理」编辑姓名、手机号、邮箱或单独重设密码。无需授予系统级 `system:user:edit` 或 `system:user:resetPwd`。后端返回逐成员的 `canEditProfile`、`canResetPassword`，APP缺少这些字段时不开启入口；服务器同时校验租户、工厂、实时角色和版本，禁止修改本人、管理账号及关联其他工厂（包括停用授权）的共享账号。共享账号由平台管理员统一维护。手机号、邮箱可清空，密码仅保存在当前输入内存；响应不明时停止重复提交，资料可只读核对，人员列表不能证明密码变更成功。

当前开发源码（2026-10-27）采用后台统一电脑打印。新入库只发送`printingMode=SERVER`；未启用电脑打印或旧后端会明确拒绝，不回退手机。APP的“工厂打印状态”仅展示后台配置，记录详情可为既有批次生成`PC_80`标签并提交后台首次打印；仅PC任务可以重试或补打，旧手机/主机记录保留核验。旧DEVICE或未指定模式的待确认入库只核对已有结果，确认未提交时不自动重放，也不改写旧key/payload。手机采集主机只有在重新配置后实际打印授权为空时才可启动。

本机独立调试包为`com.deqin.inout.dev`，使用完整自定义基座；2026年10月27日起当前development资源直接连接`https://screen.deqin.info/prod-api`，不再依赖USB转发8080。基座APK需要由HBuilderX同步当前development业务资源，不能当完整正式包直接分发。原`com.deqin.inout`签名正式版保持不变。GE540已确认正确打印既有原木记录；新SERVER入库自动触发已通过单测和隔离页面测试，尚未另建新记录做真机验证。

下文关于0.1.15手机局域网打印的说明属于已签名正式包历史行为，尚未包含以上开发变更。

0.1.15 按用户确认采用局域网打印：进入设置后自动搜索同一网络的 IPP/IPPS 打印机，各仓库分别选择本设备默认，入库后自动打印。新配置默认使用 80×80 mm，已有网络打印机纸张设置保留；设备必须实际支持所选纸型。USB/OTG 产品入口和执行已停用，旧 USB 配置或任务保留核对依据，不能继续发送或自动改投其他打印机。正式 API 为 `https://screen.deqin.info/prod-api`，新包切换后需要重新登录。新网络打印机型号尚未选定，实际纸张和二维码仍需现场验收。 2026年10月26日已完成一次云打包、197项APK检查及华为nova7同签名覆盖安装，应用数据保留；见[0.1.15安装结果](../implementation/android-package-result-0.1.15.json)。

0.1.9 打印机设置进入后自动搜索当前局域网的IPP/IPPS设备，每个仓库分别选择默认打印机，复用服务器PrintConfig.printerId。员工不填写打印机名称、协议或URI；发现候选须检测当前纸张能力，保存默认后通过已授权终端完成检测、首次试打和实际纸张/二维码人工确认，才可开启自动打印。纸张、份数与偏移折叠显示，模板由系统管理。开启后仅新增入库自动打印，历史批次手动加入；自动开启期间先关闭并保存，才能重新验证。搜索失败、无设备和权限拒绝保留原默认，同一默认再次选择不会停用自动打印或改写配置。

新打印机按精确端点去重复用已有登记，不编辑已登记打印机。新增授权需明确“应用打印机到本终端”：核对当前工厂与原主机，确认后停止、等待实际停止、更新原主机授权并按原运行态恢复；未结执行证据或数量不明时拒绝更新，不清空SQLite或凭据。登记/配置响应不明按API、租户、账号、工厂、仓库保存只读核对记录，重进页面只读取并明确采用，不自动重发。试打文件准备与可能已发送分开记录，准备失败沿原key可重取文件；一旦进入原生发送，缺证据或UNKNOWN只查原结果，不创建新key。更换默认不改旧任务的目标或重发已接受任务。

0.1.8 起使用精确锁定的 Moment 2.31.0、moment-timezone 0.6.5 和完整 IANA 2026e 时区数据计算工厂日期与时间，不依赖终端 `Intl`、手机时区或固定 UTC+8。日期初始化等待服务器返回已授权工厂，普通刷新保留人工日期，切换工厂或时区后重置；无效工厂 IANA 配置明确报错，不静默切换到其他时区。统计仍向后端传业务日期，由统一后端按工厂时区计算实际日界，不在客户端假定每天固定24小时。

0.1.7 起，普通登录只填写账号、密码、验证码；多客户按平台公开的企业名称选择，单客户自动选择。登录页和“我的”不提供服务器、clientId、租户编码或RSA公钥输入。企业发现使用统一后端匿名 `/auth/tenant/list`，失败或空列表明确停留并提供重试，不默认 `000000`。仓库 `.env` 仅包含已核对的Android公开客户端ID、公钥及企业发现模式，不包含任何私钥、数据库、MinIO或MQTT密码。

```powershell
npm install
npm run dev:h5
npm run typecheck
npm test
npm run build:h5:dev
npm run build:app:dev
npm run verify:app:dev
```

当前 `.env.development` 与 `.env.production` 均预置 `https://screen.deqin.info/prod-api`。H5开发请求通过同源Vite代理；Android调试资源直接访问云服务器。原本机配置已保存为 `implementation/.runtime/cloud-phone-20261027/env.development.before`；恢复本机联调时再改回精确 `http://127.0.0.1:8080` 并设置USB转发，不能使用任意HTTP、LAN、其他端口或模拟器别名。登录始终保持现有RSA封装AES的协议和服务端授权。APP当前已注册DCloud AppID `__UNI__4275A0F`。

正式构建 `npm run build:h5` / `npm run build:app` 要求部署环境提供真实 `VITE_API_BASE_URL=https://...`，缺项、HTTP地址、无效公钥或关闭加密均在构建阶段失败，不能留给员工填写。当前使用用户确认的 `https://screen.deqin.info/prod-api`；2026年10月26日正常 TLS 校验及匿名企业发现接口验证通过（HTTP 200、业务 code 200）。完整登录、受保护的标签文件访问和手机现场流程仍待验收，详见 [域名检查](../implementation/usb-ge540-20261025/domain-backend-preflight.json)。构建只注入白名单公开参数，并关闭Vite自动暴露其他 `VITE_*`；旧版手填 `dq.server/clientId/tenantId/publicKey` 不再影响请求。

HBuilderX云打包会二次编译，不能仅依赖之前生成的dist。显式 `npm run prepare:internal-usb` 排他创建 `.env.production.local` 内部selector，逐字段与已审核development公开配置匹配后才能在production编译过程中生成内部USB包；`tools/pack-android-test.ps1 -Submit -InternalUsb` 再次校验该selector。默认正式 `-Submit` 与普通正式构建发现selector会立即拒绝。创建selector不提交云任务；需要对齐HBuilderX的production二次编译时，运行 `npm run build:h5:usb` / `npm run build:app:usb`，再以 `npm run verify:app:dev` 校验内部资源。真正上传必须已有当前版本的一次打包授权。selector需保留到该次任务终态和静态核验完成，再由发布流程归档、清理，不能在打包期间修改。`-Status` 和 `-CompileOnly` 不提交云包；`-InternalUsb` 必须与 `-Submit` 同时使用。

部署API/client/公钥模式变化时停止旧主机并清理旧会话、凭据与UI绑定，原生执行证据由新AAR按API/工厂/主机隔离；旧固定证据库只隔离并明确提示，不打开、导入或删除。JS结果不明journal保留原API/租户/账号/工厂scope，不会迁移或向新环境重放。H5虽使用同源代理，其工厂缓存与journal仍按真实后端API身份分区。

16个业务路由包含登录、工作台、五库、人工入库、原木14档两步码单、组合查询、详情、二维码、扫码整批出库、业务统计、统一打印中心、打印配置、人员管理、固定主机。机器批次由后台采集接口产生，在同一列表按 `quantitySource` 显示来源。

ID与精确数量使用字符串。入库、整批出库、删除、标签生成与首次/补打等幂等业务在发送前保存稳定请求标识及原内容，网络结果不明时保留待核对请求；“我的→待确认操作”先查询原键的批次、标签或打印任务结果，仅服务器明确未提交时沿用原键和原内容重放。请求按规范化API地址、租户、用户与工厂隔离，切换环境或账号后不查询、不重放原环境请求；旧版命名空间的本地请求不自动迁移。首期不提供离线成功入库。配置及人员操作不虚构持久请求流水，超时后读取原资源核对版本；密码仅保留当前输入内存，不存入本地重放日志。打印 `UNKNOWN` 不提供普通重试；核验与补打分别操作。二维码标签按版本通过业务接口访问服务器MinIO，不将短效地址当作持久身份。

`src/services/api.ts` 是HTTP契约适配边界；`src/services/native.ts` 是Android UTS能力边界。H5明确不运行持续采集和自动网络打印。

Android登录令牌通过同步安全存储端口进入AndroidKeyStore AES/GCM仓库，HTTP、登录、退出与主机配置共用该边界；缺模块或解密失败明确失败，不回退普通storage。旧未发布版本的`dq.token`只删除、不迁移。H5使用浏览器宿主存储，并不具备AndroidKeyStore保护；其他APP平台需新增安全存储适配。密码仍仅留当前输入内存。

记录查询在宽度700px及以上使用列表与共享详情分栏，窄屏保留详情路由。入库、打印配置、人员、采集规则及操作原因等编辑表单有未保存退出确认；服务端结构化字段错误回显到已知字段并保留输入。扫码不可用时可按授权工厂和仓库精确查询业务单号，再进入整批出库核对。统计来源占比使用服务端同库期内批次数，空来源或零批次隐藏整项。

管理员主机诊断区分工厂服务端队列与本机持久证据，时间来自实际心跳、消息和证据记录。复位命令核验只允许记录仍不明确或关闭后续追发，不提供重新发布或人工设备ACK；结果不明按原请求键核对。打印中心按需读取每次attempt和人工核验历史，重试保留旧失败证据，远端接受仍不表示已经出纸。

Android `minSdkVersion=26`、`targetSdkVersion=35`，计划覆盖常见Android 10至16，仍需逐版本实机验收。Brother DCP-T426W为现场待验型号；页面显示实际发现设备的名称与型号，协议、文档格式和纸型须真实探测及试打，不预置验证通过。`src/AndroidManifest.xml` 按[官方自定义应用清单规范](https://uniapp.dcloud.io/tutorial/app-nativeresource-android.html)允许局域网IPP明文传输；原生打印器仅允许私有LAN目标、不跟随重定向，正式APP业务与MinIO文件通道强制HTTPS；内部USB联调仅对精确回环API地址保留上述开发例外，MinIO文件通道仍需HTTPS。正式包需检查合并清单，避免父工程的networkSecurityConfig覆盖IPP权限。

`npm run build:app` 成功仅表示APP资源及UTS桥接编译，不等于签名APK或硬件通过。构建须确认最终`app-service.js`含真实`configureFromServer`/`probePrinter`桥接，不能把只编译出“不支持”分支当作完成。CLI普通APP目标使用`APP-PLUS`条件，运行时再核验Android。

隔离UI验收运行 `node tests/e2e.cjs`、`node tests/login-deployment.e2e.cjs`、`node tests/print-empty.e2e.cjs`、`node tests/timezone-ui.e2e.cjs` 和 `node tests/printer-discovery.e2e.cjs`。每个脚本在当前进程内生成合成RSA公钥并将测试H5独立编译到 `.test-artifacts/0.1.9/`，不覆盖真实dist或保存测试私钥。浏览器为全新会话，认证和业务请求均使用明确夹具，不访问真实数据库、会话或打印机。打印机专项仅在隔离Vite测试配置中替换原生桥接，覆盖自动搜索、每仓默认、同默认no-op、能力失败、未知保存、主机授权更新和试打防重复；生产源码没有可开启的mock入口。此专项不代表Android NSD发现或实体出纸验收，H5实际分支明确提示仅Android支持自动发现与执行。时区专项在应用导入前移除 `Intl`，覆盖授权等待、日期保留、跨时区工厂切换及非法配置。`e2e.cjs` 也支持 `DEQIN_TEST_INTL_MODE=no-intl` 或 `no-parts`，并以 `DEQIN_TEST_FACTORY_TIMEZONE`、`DEQIN_TEST_FIXED_NOW`（epoch毫秒）、`DEQIN_TEST_EXPECTED_DATE` 核对真实编译UI的日期请求。报告和截图位于同目录。

已在 `D:/Development/HBuilderX` 安装匹配的 5.26，并安装官方运行、UTS、Android 开发与安全打包组件。所有者在 IDE 内登录后，`tools/pack-android-test.ps1 -Submit` 使用本应用云端证书提交整包，默认包名 `com.deqin.inout`，不集成广告；新应用不再允许旧公共测试证书。`-Status` 查询现有任务，避免重复提交。APK 下载后执行 `python tools/verify-apk.py --apk <实际路径> --report <报告路径> --required-abi armeabi-v7a arm64-v8a x86`，离线核查签名、清单、DEX 实际定义、同步会话接口及三种架构库；该结果不代替设备安装运行。

后续开发调试可显式使用 `tools/pack-android-test.ps1 -Submit -CustomBase` 创建包含原生模块的自定义调试基座；`-CustomBase` 必须与 `-Submit` 同时使用。此模式采用 `--iscustom true --safemode false`，因为自定义基座不支持安心打包；默认 `-Submit` 的正式整包模式保持不变。调试基座不能当正式发布包，构建或安装成功也不表示完整 APP 已运行验收通过。

在已导入本项目、已准备匹配基座且属于开发者的专用模拟器上，使用 HBuilderX `launch app-android --project <项目根目录> --deviceId <模拟器序列号> --playground custom --customType local` 选择本地基座；若使用设备上已安装的基座，则改为 `--customType device --packageName <已安装基座包名>`。始终显式指定受控模拟器，不使用默认第一台设备；现有云任务用 `-Status` 查询，不应为查询再次提交任务。

0.1.2/102 三架构 APK 已生成并通过 91 项静态检查：`dist/release/apk/__UNI__4275A0F__20261023135248.apk`。独立 Android 11/API30 x86 模拟器的干净安装、登录页、设置弹窗、空值校验及系统重启后显式启动检查通过，见 `../implementation/android-release-runtime-0.1.2.json`。真实 UTS 会话写入、读回、finally 清除及空值确认另在匹配自定义基座通过，见 `../implementation/android-custom-base-runtime-result.json`。0.1.2 修复了登录按钮样式范围、旧 WebView 弹窗定位和按钮间距；0.1.1 首次启动异常仍保留历史，不声称已确定原因。完整业务与现场打印尚待验收。0.1.2的连接弹窗属于历史开发入口，已在0.1.7删除并改为构建预置；该历史验证不能代表当前017实机结果。Android Studio 可分析 APK、使用 SDK 模拟器及查看日志；uni-app 资源编译和打包使用 HBuilderX/uni-app 工具链，`native/` 是原生插件 Gradle 工程。

`-CompileOnly` 是独立 UTS 模块编译。未配置完整 Android 依赖环境时，即使退出码为 0，也可能仅生成桥接并提示三方依赖待处理。项目级 `.hbuilderx/launch.json` 已忽略提交；当前 HBuilderX 只读取不带 `name` 的对应 `type: "uni-app:app-android"` 配置。其 `env` 中，`JDK_PATH` 实际填写 Android SDK 根目录，`GRADLE_HOME` 填 Gradle 可执行脚本完整路径，`GRADLE_JAVA_HOME` 填 JDK 根目录。设备自定义基座还需在该配置中写明 `playground: "custom"`、`customPlaygroundType: "device"` 和实际 `packageName`。已补齐 Android platform 34，Java 21/Gradle 8.13 配置下本地完整界面及真实 UTS 运行已通过上述限定检查；云端 pack 不读取该项目覆盖。未更改用户全局 SDK/JDK/Gradle 偏好。
