# Mac 移植踩坑与分支交接

更新：2026-11-26。适用项目：灵搭 Sparkit / PSD-Lingo；实施分支：`codex/MAC移植`；业务版本基线：0.3.107。本文整理实际失败、已修复缺口及仍未通过的门禁，供其他分支移植时直接参考。历史测试数字和提交只对应当时版本，不自动证明其他分支已通过。

## 接手先看这五条

1. **目前没有“用户下载后即可正常安装”的验收结论。** 用户的 M 系列 Mac、macOS 15.6 仍被安全检查拦截，且未找到“仍要打开”。第三版 PKG 未通过 Gatekeeper 自动评估。这是当前最优先的交付阻塞。
2. **先解决真实分发，再让用户测功能。** `.app`/ZIP 换成 PKG 不会自动取得 Apple 信任；ad-hoc 签名不等于 Developer ID，更不等于公证。不要再让用户反复解压、输终端或查系统设置来替代安装验收。
3. **源码、云端、分发、业务四类证据必须分别记录。** Windows 回归、Mac 原生 helper、云端 CLI/界面启动、用户下载放行、用户账号模型调用及 Adobe 读写不是同一个门禁。
4. **SDK 和助手界面不等于完整内置 Codex。** 需要官方目标架构执行程序、配套程序/资源、实际定位、登录、独立任务目录与继续机制一起可用。
5. **保护既有 Windows 分发。** 本轮 Mac 均为独立预发布 tag；发布时 Windows latest 保持 v0.3.107。其他分支必须重新核对自己的发布前后状态。

## 1. 用户安装与安全校验：已发生，尚未解决

| 现场 | 实际能得出的结论 | 其他分支必须避免 |
|---|---|---|
| 首次 Finder 提示“应用程序 Sparkit 无法打开” | 通用启动失败，无法凭此确定权限、路径、架构或签名根因 | 未取得日志就认定原包损坏或归因于用户操作 |
| 指导运行 `/Applications/Sparkit.app/Contents/MacOS/Sparkit` 后返回 `no such file or directory` | 指定路径未找到程序；这一次没有运行到应用 | 假定用户已安装到 Applications；把路径失败当运行崩溃 |
| 随后出现“Sparkit 已损坏”，系统提示文件经 Feishu 创建 | 有安全拦截现场；飞书传输是已知因素，但没有用户文件哈希/签名检查结果 | 凭飞书文字认定传输破坏签名；声称用户在 Windows 解压（用户明确否认） |
| 改交 PKG 后提示 Apple 无法验证是否包含恶意软件 | 安装器在开始安装前被系统拦截 | 把换包格式当成解决签名/公证问题 |
| 用户未找到隐私与安全性里的“仍要打开” | 该机图形放行路径尚未确认，用户安装仍未通过 | 保证必有按钮、重复让用户找；把“给出步骤”写成“用户安装成功” |
| 云端 `spctl --assess --type install` 返回 rejected / no usable signature | 当前 PKG 缺少可用分发签名；明确未通过默认分发评估 | 云端 `sudo installer` 成功就宣称 Gatekeeper 通过 |

### 必须纠正的交付承诺

曾把“无需终端的 PKG”描述成方便测试的交付，但它只固定了安装路径和安装动作，没有解除用户机的安全阻塞。后续不得宣称“只需点一次仍要打开即可”“用户只剩功能测试”，直到真实下载来源与目标系统验证通过。

当前没有确认可用的 Apple Developer 账号，也没有配置本轮可用的 Developer ID 签名/公证凭据；不能写成“用户明确没有开发者账号”。应用 Developer ID Application 和安装器 Developer ID Installer 是不同用途。若走正式外部分发，应具备合法证书、可信时间戳、公证及票据装订验证，并验证最终下载件。当前 ad-hoc 应用、unsigned PKG 和 hardened runtime 不满足该结论。

曾给出对指定 app 先验签再移除 quarantine 的人工排查命令，但用户没有提供执行结果。它不是已验证修复，也不是可交给用户长期使用的安装流程。第三版安装器不附加脚本，不关闭系统安全检查，不清隔离属性，不重新签名用户文件。

参考：[Apple Developer ID](https://developer.apple.com/developer-id/)、[Apple 公证分发](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)、[Apple 安全打开应用](https://support.apple.com/zh-cn/102445)。这些是设计依据，不代替本机验证。

## 2. 构建、打包与安装布局

| 坑/缺口 | 本轮处理 | 复用入口与验收要求 |
|---|---|---|
| Windows 工作树复用的 node_modules 含宿主平台依赖，不能用来生成 Mac 原生包 | Mac runner 独立 npm 安装；强制检查 `process.arch === arm64` | `.github/workflows/mac-test-build.yml`；x64/Universal 不在本轮交付范围 |
| Windows 无 Swift/Apple SDK，源码和模拟测试容易被误报为原生完成 | 云端 Apple Silicon 编译 Swift，运行实际包内 helper | `services/build-macos-helper.cjs`；不得把 Windows skip 算通过 |
| esbuild 合并 main 后，模块 `__dirname` 变成应用 payload 根目录 | helper 打包到实际 `app/bin/sparkit-device`，Codex 到 `app/bin/codex/bin/codex` | `package-macos.cjs`、`services/device-service.cjs`、`services/bundled-codex.cjs`；在最终安装目录验证 |
| 普通文件复制/跨系统解压可能丢执行权限或 framework 符号链接 | 用 macOS ditto 复制/压缩 `.app`；本机检查 ZIP 执行位及 14 个 framework 链接 | 这是分发风险防线；用户本轮明确没有在 Windows 解压，不能认定其已触发 |
| 只验主可执行文件可能漏掉内部组件/资源签名问题 | 完整包签名后 deep/strict 验证；Codex 主程序显式纳入签名 | entitlements 在 `tools/mac-entitlements.plist`；签名身份/权限变更须复验 Keychain、JIT、Apple Events |
| 最低系统版本解析曾被转义破坏，出现 `minoss+` | 改为 `/minos[ ]+([0-9.]+)/`，避免多层字符串传递吞掉反斜杠 | 检查最终文件字面量与真实 otool 输出，不只检查代码语法；本轮 app 最低 13.0，CLI 报告最低 11.0 |
| ZIP 手动摆放导致用户实际路径与指导不一致 | 第三版 PKG 固定安装到 `/Applications/Sparkit.app`；组件 `BundleIsRelocatable=false` | `tools/mac-installer.cjs`；不能只用 `--component` 默认行为假定总会落到新路径 |
| 包已生成不等于可用安装器 | 云端真实运行 installer，再验已安装程序签名并启动 | `SPARKIT_MAC_SMOKE_APP=/Applications/Sparkit.app`；仍不等于下载隔离/Gatekeeper 已通过 |

## 3. Codex 与 AI 助手内置

### 实际遗漏和修复

首版含 SDK、助手界面和业务工具，但没有 Codex 执行程序。第二版才补齐官方 arm64 CLI 0.172.0、默认发现及登录。不能继续向用户说首版“全部内置”。

官方 npm 原生包采用 `vendor/aarch64-apple-darwin/bin/codex` 布局，配套还有 `bin/codex-code-mode-host`、`codex-path/rg`、`codex-resources` 及许可。不能按旧版本布局猜路径，也不能只复制一个 codex 二进制。本轮完整复制平台目录，目标为 `Contents/Resources/app/bin/codex/`；保留 LICENSE/NOTICE 和上游资源。更新版本须重查目录、最低 OS、体积和签名。

Finder 启动的 PATH 不等于交互式终端 PATH。不能只依赖 `which codex` 或用户的 shell 初始化。Mac 新安装默认使用内置路径；有效的用户手动路径仍优先，已有 API 设置保留。相关源码：`codex-discovery.cjs`、`codex-settings.cjs`、`bundled-codex.cjs`。

### 无 Codex 桌面版的独立模式

原助手依赖桌面项目注册与 `codex://` 同步。仅塞入 CLI 后仍可能被桌面绑定门禁卡住。本轮仅对确认为内置程序的任务采用 `embedded` 绑定，使用用户选择的任务目录和 Sparkit 工作记录，不伪造桌面 projectId、不强制打开桌面对话；外部 Codex 仍保留桌面注册校验。不要为修复内置模式而全局撤掉原外部模式校验。

复用：`services/agent-project.cjs`、`agent-integration.cjs`、`agent-native-provider.cjs`；测试：`agent-project.test.cjs`、`agent-native.test.cjs`。

### 登录不是一个打开网址的按钮

通过官方 app-server 的 account/read、account/login/start、account/login/cancel 协议。登录期间保持进程供浏览器回调；完成、取消、断线、超时、退出软件时清理。只允许明确的官方 HTTPS 主机，拒绝 URL 内凭据；只回传登录状态/账号类型，不回传 token。不能在启动时自动弹浏览器，也不能内置开发者自己的账号。

复用：`services/codex-login.cjs`、`renderer/codex-login.js`、main/preload IPC；测试：`tests/codex-login.test.cjs`。

**已验证是未登录账号下的协议与界面，零模型调用。** thread/start 和动态工具注册成功不等于用户账号可用、额度可用、真实模型任务/暂停继续通过。

## 4. UI 与云端 smoke 的两次实际失败

1. renderer 还没建立 documentElement 时读取 classList，测试先于页面准备完成而失败。修复为空节点等待和有界就绪检查。不能把测试自身时序错误解释为已确认产品崩溃，也不能直接删掉检查。
2. smoke 点击旧 `railSettings` 得到 null。`installSparkit()` 已移除旧 rail，实际侧栏入口是 `.spark-sidebar [data-route="settings"]`。源码里有旧 ID 不代表最终 DOM 仍有。应点击真实可见入口，确认对话框打开和登录控件可见，再检查实际 IPC，而非只查按钮存在。

原生 helper 成功、renderer 成功、设置可见、登录 IPC 成功分别记录。截图应查看，不能因为存了 PNG 就声称界面验收通过。Mac 标题栏还需为系统交通灯按钮留空间；不同窗口尺寸和可访问性并未因单张云端截图全部验收。

## 5. Windows 平台假设不能直接带到 Mac

| 领域 | 风险与已做处理 | 仍待验证 |
|---|---|---|
| Adobe COM/PowerShell helper | Mac 经 Apple Events/osascript 执行已有 JSX，平台服务明确分流；Info.plist 写明自动化用途 | 用户 Mac 上实际 PS/AI 版本、首次允许/拒绝、保存重开、输出与撤销 |
| PS 内嵌 AI | 全局单队列会让 PS 等待 AI 邮箱，而 AI 又排在 PS 后，形成死锁；本轮按 PS/AI 分队列 | 代码/调度测试不能代替真实 Mac 嵌套对象读改回嵌 |
| 写入结果不明 | 超时/进程中断不等于 Adobe 没执行；诊断保存失败不能盖掉原异常/成功状态 | 不得为恢复方便盲目重发写入；需核对现有副本和回执 |
| 路径身份 | 无条件 toLowerCase 会合并 POSIX 大小写不同文件；本轮 Windows 忽略大小写、POSIX 保留大小写 | 覆盖缓存、附件、计划、模板、导出来源及生成 JSX；区分大小写 APFS/外置盘实机还需检查 |
| 字体 | Windows 安装流程不可复用；Mac 使用 CoreText 用户级注册、格式/大小/头部检查及哈希命名 | Adobe 字体刷新、实际 PostScript 名称、用户对象字形与视觉验收 |
| 更新 | Windows EXE 下载/安装不能用于 Mac | Mac 自动更新尚未接入；继续独立测试分发 |

复用源码：`services/macos-adobe.cjs`、`file-identity.cjs`、`macos-device.swift`、`device-service.cjs` 及现有平台测试。原生能力不是简单替换扩展名。

## 6. 设备身份、Keychain 与后端兼容

- Windows DPAPI/设备服务不能原样搬来；Mac 使用原生 helper、Secure Enclave P-256、Keychain AES-GCM。密文文件不是 Keychain 数据库；不要把用户可复制的密文文件当成设备私钥。
- 客户端生成 `mac-` 身份后，后端还必须支持其前缀/SPKI 哈希/签名/租约，否则本机加密成功也无法授权。已部署兼容 Worker，发布版本见下方证据；不是关掉授权来绕过。
- 原生 SPKI 与 ES256 P1363 格式必须与服务端一致，需验签及跨进程公钥稳定性测试，不能只测“返回了字符串”。
- 并发初建保留已有 Keychain 条目；缺失/不可读/损坏不得悄悄生成新身份或降级明文/软件私钥。签名身份变化、升级重装可能改变访问表现，应单列门禁。
- 云端 Secure Enclave/Keychain 测试已通过，但拒绝访问、锁定、用户迁移、升级和签名身份生命周期仍未完整验收。线上协议测试的临时软件身份不冒充硬件证明；测试设备已撤销。

## 7. GitHub 云端、发布与下载

| 实际坑 | 规避方式 |
|---|---|
| 原 GitHub CLI 登录缺少 workflow 权限，创建工作流返回 404 | 核查权限；用户已完成设备授权后继续。不能把所有 404 都当仓库不存在，不输出设备码/令牌到交接文档 |
| 草稿 release 可被 `gh release view` 找到，但本轮按 tag 调 REST release API 曾返回 404 | 对草稿用已验证可用的 CLI 查询，发布后再核对正式 tag；不因一次 404 重建重复公开资产 |
| 公开仓库构建可能泄漏源码/客户文件/凭据 | source-only 白名单 ZIP 放未发布草稿，公开远端只保存 workflow/触发元数据；本轮草稿未公开不等于加密或独立私有仓库，仍须严格限定内容 |
| 已发布资产不能覆盖 | 新版使用新 tag，workflow 明确拒绝写已发布 release；失败运行留下的旧草稿报告可能过期，必须核对 run/builtAt/hash |
| GitHub 未认证 API 共享出口速率限制 | 元数据用已认证 API；成品下载和报告另用无凭据请求验证；不能拿 API 限流当成资产不可下载 |
| 下载很慢 | 明确代理路由、单连接/多连接与分段重试；分段校验 HTTP 206/长度/完整 SHA256，失败后只补缺段，凭据与临时签名 URL 不打印 |
| 误以为代理带宽就是 GitHub 吞吐 | 本轮实际连接证实 GitHub 资产走代理；旧 Edge 下载仍走新加坡，当前组已换香港。200 Mbps 不是 200 MB/s，短样本和一次超时不足以确定服务端/节点根因 |
| 建议全局模式但未看 GLOBAL 选择 | 本轮 GLOBAL 为 DIRECT，盲切全局反而直连；先读实际连接链与规则。没有修改用户 Clash 配置，也没有证明 Clash 故障已修复 |
| 脚本多层转义/PowerShell 环境差异 | 本机终端固定 PowerShell 7，login=false；JSON 序列化不是 shell 转义。优先文件传参；检查生成内容。系统 python 是商店占位，调用失败后改用可用运行时，不假设已装 |
| 本地 Git 没 remote、提交身份未设置 | 先核查实际环境；本轮用 GitHub Contents API 操作隔离 workflow 分支，提交用逐命令身份，不改全局 Git 配置 |

下载问题是工具/交付效率问题，不能拿它解释用户 Mac 的 Gatekeeper 拦截。

## 8. 复用提交与证据索引

| 本轮提交 | 可参考内容 | 合并提醒 |
|---|---|---|
| `0f3b419` | Apple Silicon 平台拆分、设备服务原型和接口 | 早期原型，不单独当最终可分发实现 |
| `83e2e7d` | arm64 打包、云端原生验证、平台余项 | 主实现范围以实际 diff 为准 |
| `44c87c0` | 内置 Codex、登录、独立助手模式 | 需配套整个原生 runtime 和打包布局 |
| `5bd6b4c` | 图形 PKG、固定安装目录、安装后 smoke | 没有 Developer ID/公证，不代表解决首次安装 |
| `2431872` | 第三版交付与 Gatekeeper 边界记录 | 下方新增用户失败证据优先于“等待用户验证”旧状态 |

其他分支只合并需要的具体提交并处理依赖，不能复制整目录覆盖，也不能只摘登录按钮漏掉服务/打包。

### 已生成的三个历史测试包

| 版本/tag | 云端成功 run | 交付与证据目录 |
|---|---|---|
| 首版 `mac-arm64-test-0.3.107` | `45530434765` | `work/mac-handoff`；本机归档 `D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-test-0.3.107-arm64`；CLI 当时未内置 |
| 第二版 `mac-arm64-test-0.3.107-2` | `45535826167` | `work/mac-embedded-handoff`；归档同前缀 `mac-test-0.3.107-arm64-2`；完整回归 1046 总数 / 1044 pass / 0 fail / 2 skip，Mac 专项 34 pass |
| 第三版 `mac-arm64-test-0.3.107-3` | `45542048193` | `work/mac-installer-handoff`；归档同前缀 `mac-test-0.3.107-arm64-3`；真实安装后启动通过，Gatekeeper rejected |

第三版 PKG SHA256：`3e34d1b3dbc691a94497977cafd8360b36d5953fcd38680d410a013712b30cbe`，262100230 字节；第二版 ZIP SHA256：`d36cf7a2010a51d2c571c0b976bad2b1a3305e8f04603a5df8407d9887cc9d2f`。测试包内部版本相同，不能只看 0.3.107 判定包版次；必须记录 tag/哈希。

线上兼容 Worker 发布版本：`491efe0c-b2c3-4f8c-9680-13035c1fb509`。这些是历史证据，不证明服务今天未变化。日志和安装包位于忽略目录/本机归档，不提交 Git；其他机器应取得公开构建报告或在自己分支重跑。公开发布收据证明当时下载/哈希和 Windows latest，不能证明用户机可安装。

## 9. 下一分支的最小门禁（按顺序）

- [ ] 先解决合法分发签名/公证及目标 macOS 15.6 的实际下载打开；若无法完成，明确交付阻塞，不再发“换格式即可”的新包。
- [ ] 原生 arm64 构建、依赖版本/完整 runtime、最低 OS、bundle 布局及深度签名一致。
- [ ] 在未预先信任该开发包的测试环境，从真实下载渠道取得最终安装器；记录 quarantine、Gatekeeper、GUI 安装、首次启动及必要权限结果。云端已运行的构建目录不足以代替。
- [ ] 安装到固定路径、重复安装/升级/重开、数据和 Keychain 身份保留；失败可回滚。不要把 ad-hoc 跨版本表现当成正式身份策略已验证。
- [ ] 用户账号完成浏览器登录；真实模型小任务、工具调用、暂停/继续与工作记录恢复，无桌面版依赖。
- [ ] 独立 Adobe 小样：PS、AI、PSB 嵌套对象、字体、保存重开、输出及原稿不变；无 Adobe 不能打勾。
- [ ] 区分大小写路径、非 ASCII/空格路径、权限拒绝/超时和未知写入状态有明确结果。
- [ ] 独立 Mac 预发布，源输入不公开，资产哈希/公开下载/Windows stable 通道分别核实；用户功能/视觉验收单独记录。

## 10. 给其他分支的可直接复制交接语

请先读《MAC移植踩坑与分支交接.md》。当前代码已实现 arm64 平台服务、内置 Codex 和图形 PKG，云端安装及启动通过；但用户 macOS 15.6 仍被 Gatekeeper 拦截且没有找到“仍要打开”，用户安装未通过。优先完成真正的签名/公证与下载后首次安装验收，不再用云端命令行启动代替。不要改 Windows stable latest，不要操作客户原稿或未经许可的 Adobe；仅按依赖合并具体提交。真实用户模型任务、Mac Adobe 业务和升级后的 Keychain 生命周期仍未验收。
