# Mac 内置 Codex 与 AI 工作助手

日期：2026-11-25；Mac 测试第二版，独立 tag `mac-arm64-test-0.3.107-2`。第一版包含助手界面、业务工具和 SDK，但需另装 Codex 执行程序；本轮补齐执行程序与登录。

## 使用

安装第二版后，打开“设置与连接”，默认使用包内本机 Codex。点击“登录 Codex”并在浏览器完成本人账号登录，再点“检查登录”。已有官方 Codex 本机登录可直接检查。之后使用首页 AI 助手卡片，选择文件、输出目录并开始任务。

Mac 包已带官方 arm64 Codex CLI 0.172.0 及其配套原生程序、资源和许可，无需另外安装 Node.js、npm、CLI 或 Codex 桌面版。账号权限、联网和可用模型仍由用户实际账号决定；软件没有内置账号、API Key 或模型权重。

## 实现与边界

- `bundled-codex.cjs` 固定包内原生程序定位；没有保存路径时，Mac 发现优先使用内置程序，有效的手动路径仍优先。初始 Mac 连接默认本机模式。
- `codex-login.cjs` 使用官方 app-server 登录协议；浏览器登录由用户点击触发，仅允许明确的官方 HTTPS 登录地址，保持回调会话直至完成/取消。关闭软件或连接断开时清理进程，登录状态只返回账号类型与是否登录，不回传凭据。
- 内置执行模式使用用户选择的任务目录，会话/后续对话与工作记录由 Sparkit 保留。它不伪造 Codex 桌面项目归属，也不自动打开桌面对话。外部 Codex 连接仍使用原有桌面注册校验；不会把内置连接失败自动切成 API。
- 普通 API 文案/设计设置保留原入口；AI 工作助手仍只走本机 Codex 原生会话与已开放的软件工具。
- 完整复制官方平台运行目录，包含 code-mode host、rg 和随包资源/许可。原生可执行文件纳入 ad-hoc 签名校验。安装包仍未 Apple 公证，实际模型调用和 Adobe 读写待用户登录后实机验收。

## 验证

- Windows 完整回归：1046 总数 / 1044 通过 / 0 失败 / 2 平台跳过，`work/mac-embedded-final-regression.log`。
- Mac 云端 34 项平台专项已通过，覆盖内置程序发现、登录域名限制/取消/状态脱敏、任务目录与桌面归属隔离及原有 Mac 调度测试。
- 已用包内真实 CLI 在独立、未登录的 CODEX_HOME 中完成初始化、账号状态、配置读取、thread/start、动态工具 schema 注册；没有外部模型调用。完整包的初始连接默认值、登录按钮和 AI 助手界面已验证。
- 最终云端运行 `45535826167` 成功；真实登录协议 start/cancel、设置页面登录控件可见性及账号状态 IPC 均通过。最低 macOS 13，包内 Codex 二进制声明最低 macOS 11。登录页截图已人工查看。

后续反馈优先检查第二版的实际账号登录、模型列表、一次小任务和任务继续；不把未登录的协议测试描述成真实用户模型对话通过。

第二版 SHA256：`d36cf7a2010a51d2c571c0b976bad2b1a3305e8f04603a5df8407d9887cc9d2f`。发布状态以 `work/mac-embedded-handoff/public-verified.json` 为准。
第二版已于 2026-11-25 公开：[内置 Codex 的 Mac 测试包](https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/tag/mac-arm64-test-0.3.107-2)。匿名下载 HTTP 200，公开报告/资产 digest/本机 SHA256 一致，262214213 字节，616 个 ZIP 条目、14 个 framework 符号链接与 Codex/配套程序执行权限已核对。Windows latest 仍为 v0.3.107。收据 work/mac-embedded-handoff/public-verified.json；本机归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-test-0.3.107-arm64-2。
