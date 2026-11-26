# Mac 移植接续检查点

> 2026-11-26 实机续测：见 [Mac 全方位验收](MAC实机全方位验收-2026-11-26.md)。已修复 Mac 更新客户端、POSIX 字体路径、标准菜单/Cmd+H、图标及审验窄窗；实机回归/8套界面/Keychain/包重开通过。Adobe 未安装、Apple 签名公证与公网 Mac 更新 feed 仍待验收，不能标记全部功能或默认安装通过。


> **2026-11-26 用户实测更新：安装仍未通过。** 用户 macOS 15.6 的 PKG 被 Apple 安全检查拦截，且未找到“仍要打开”。云端实际安装/启动通过不等于用户下载后通过 Gatekeeper。其他分支请先读 [Mac 移植踩坑与分支交接](MAC移植踩坑与分支交接.md)，不要沿用下方旧说明承诺可直接安装。

更新时间：2026-11-25。目标：持续制作，直到用户能在 M 系列 Mac 开始实机测试。

## 内置 Codex 第二版更新（优先读取）

- 首版已有助手与 SDK，本次补齐官方 arm64 CLI 0.172.0、完整资源与许可、自动发现/默认本机连接和浏览器登录/检查/取消按钮。
- 内置助手使用 Sparkit 自有任务目录与工作记录继续，不依赖安装 Codex 桌面版；外部 Codex 原有桌面归属校验保留。
- Windows 1046 总数 / 1044 pass / 0 fail / 2 skip；Mac 34 专项及最终云端 `45535826167` 成功，真实 CLI 登录 start/cancel、动态工具注册、设置可见性、Keychain/Secure Enclave 与签名通过，零模型调用。
- 第二版 tag `mac-arm64-test-0.3.107-2`；SHA256 `d36cf7a2010a51d2c571c0b976bad2b1a3305e8f04603a5df8407d9887cc9d2f`。公开状态以 `work/mac-embedded-handoff/public-verified.json` 为准；不覆盖首版和 Windows stable latest。
- 实现/边界见 `docs/MAC内置Codex与助手.md`，用户步骤见 `docs/MAC实机测试指南.md`。真实账号模型调用及 Adobe 读写仍待用户 Mac 验收。

## 第三阶段交付更新（优先于下方历史快照）

- 已生成真正 arm64 Mac 测试 `.app` / ZIP：`work/mac-handoff/Sparkit-0.3.107-Mac-arm64-test.zip`，107073305 字节。
- SHA256：`450dec34ff3d7cd56fc029a4f8e20e0c53e47ffefb57af70458db82c8b92ed64`。
- 最终云端运行 `45530434765` 成功；Swift、12 项 Mac 平台专项、深度签名校验、包内 Secure Enclave 稳定公钥与签名、Keychain 跨进程加解密、renderer 真实启动及截图通过。本机已复核 ZIP 哈希、helper 权限和 14 个 framework 符号链接。
- Windows 最终回归 1040 总数 / 1038 pass / 0 fail / 2 平台 skip。日志 `work/mac-stage3-handoff-regression.log`。
- Worker 兼容版已部署：`491efe0c-b2c3-4f8c-9680-13035c1fb509`。线上软件身份协议检查通过，测试设备撤销；不冒充用户 Mac 硬件测试。
- 详细实现和边界见 `docs/MAC第三阶段云端构建与交付.md`，用户步骤见 `docs/MAC实机测试指南.md`。
- 独立 Mac 测试 tag：`mac-arm64-test-0.3.107`；公开状态以最终 GitHub API 验证和 `work/mac-handoff/public-verified.json` 为准。源码输入草稿保持私有，Windows stable latest 不变。
- 已于 2026-11-25 公开为独立预发布：[Mac 测试版](https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/tag/mac-arm64-test-0.3.107)。匿名成品下载 HTTP 200、公开 build-report 与 GitHub 资产 digest、本机 SHA256 一致；Windows latest 仍为 v0.3.107。生产测试包首轮交付已完成，后续优先处理用户 Mac 的实测反馈。
- 仍待用户 Mac 的 Gatekeeper/Keychain 生命周期、Codex 和实际 Adobe 读写验收；云端没有 Adobe。Mac 自动更新和 Apple 公证仍未接入。
- 接续先检查以上证据及 git status，不重做已经完成的移植。不要再按下方历史快照误称“尚未编译/没有安装包”。

## 当前权威状态

- 工作树：C:/Users/JC/.codex/worktrees/sparkit-mac-port/PSD-Lingo
- 分支：codex/MAC移植；已提交基线 0f3b419；package 版本 0.3.107。
- 原目标是可实机测试的开发包，不能用源码原型、模拟测试或计划代替安装包。
- 先读取 git status、本文件、MAC第二阶段任务与验收.md，再从实际源码继续。
- 最新一次完整测试：1034 项，1033 pass / 0 fail / 1 skip；skip 为真实 Mac Keychain 原生测试。此结果对应 0f3b419；新改动须重新核实。

## 已有实现

- macos-adobe.cjs 的 Apple Events/osascript 通道接入顶层 PS/AI JSX；非 Windows 更新隔离。
- device-service.cjs 的平台 helper 接口；macos-device.swift 的 Secure Enclave P-256 + Keychain AES-GCM 原型（尚未编译）。
- mac- 设备身份客户端与本地 Worker 支持；未部署生产 Worker。
- Codex POSIX/Homebrew/npm arm64 路径发现、独立 Mac 加密设置文件。
- 构建入口 build:helper:mac、原生门禁 test:mac:native；还没有 .app 或 DMG/ZIP。

## 下一步必须解决

1. 建立可执行的 Mac 构建/打包路线；当前仅有 Windows，不能声称已完成 macOS 原生验证。
2. 编译验证 Swift helper。处理签名/Keychain 权限、稳定设备身份、缺失密钥和加密持久化。
3. 字体服务当前 Mac 拒绝 install-font，需补齐。
4. 审计打包后 helper 定位：device-service 的 __dirname 在 esbuild bundle 后将是 app 根目录，打包路径必须匹配 bin/sparkit-device。
5. sku-workflow 已通过 withIllustratorMailbox 调用 illustrator.executeScript；该函数已按平台分流。因此邮箱回退可能可复用，不能未经检查就认定必须重写。Mac Photoshop osascript 正在等待期间，Node 另起 Illustrator osascript，需实测不会队列死锁（macos-adobe 当前全局单队列存在此风险）。
6. 路径大小写：continuation-runtime、main 和大量 JSX 仍有无条件 toLowerCase，需适配 APFS。
7. Mac 服务端协议尚未部署，生产服务器会拒绝 mac- 身份；必须完成专项验证及必要兼容部署，或使用明确独立的可用测试服务，不能关闭授权冒充完成。
8. 交付真实开发包、安装启动和测试说明、测试证据，保持 Windows latest 不变。

## 本轮新发现（尚未采取外部动作）

- git remote -v 没有输出：当前本地仓库未配置远端。
- gh 不在 PATH；D:/PSD-Lingo/work/publish-github-direct.cjs 存在，可检查现有 CLI 发布路线，但不得输出凭据。
- server/wrangler.toml 有生产 Worker 和 D1 配置；没有部署或读取私钥。
- services/macos-device.swift 为源文件原型；当前 Windows 没有 swiftc/Apple SDK。

## 操作约束

- 所有终端命令必须显式 shell=C:/Program Files/PowerShell/7/pwsh.exe、login=false。
- TEMP/TMP 测试进程设 D:/PSD-Lingo/work/temp。
- 只在本工作树修改、构建和验证；不覆盖其他分支，不动客户原稿。
- 未取得当前空闲许可，不控制本机 Photoshop/Illustrator。
- 用户持续授权改完必要验证后发布，但原型不满足发布条件，不能推到 Windows stable latest。
- 不输出/提交凭据、私钥、客户文件、运行日志或安装包。
- 当前用户明确要求自动创建聊天分支避免上下文丢失；聊天分支只是上下文检查点，不代表新增 Git 工作树；避免两个聊天同时写同一个目录。

目标尚未完成。下一接续不得把缺少 Mac 编译和安装包当作已完成，也不应在仍可推进代码/打包路线时停止。

## 第二版公开交付收据

第二版已于 2026-11-25 公开：[内置 Codex 的 Mac 测试包](https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/tag/mac-arm64-test-0.3.107-2)。匿名下载 HTTP 200，公开报告/资产 digest/本机 SHA256 一致，262214213 字节，616 个 ZIP 条目、14 个 framework 符号链接与 Codex/配套程序执行权限已核对。Windows latest 仍为 v0.3.107。收据 work/mac-embedded-handoff/public-verified.json；本机归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-test-0.3.107-arm64-2。

## 第三版图形安装包

用户要求免终端的简便测试；已公开 mac-arm64-test-0.3.107-3，新增 .pkg 自动安装到 /Applications/Sparkit.app。云端 45542048193 的实际安装、安装后签名与应用/Codex/Keychain 验证通过，34 项 Mac 专项通过。详见 MAC图形安装包.md。Gatekeeper 评估拒绝无签名安装器，首次可能需隐私与安全性单独放行；无 Developer ID/公证，不宣称零拦截或用户 Mac 已通过。收据 work/mac-installer-handoff/public-verified.json，Windows latest 不变。

## 0.3.108 公开更新通道测试（2026-11-26 接续）

0.3.108 已公开为独立预发布 mac-v0.3.108-arm64，签名清单发布到 mac-updates。本轮仅升 package 版本并完成前一聊天中断的发布，不重做移植。版本页：https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/tag/mac-v0.3.108-arm64 。Windows latest 经 API 核对仍为 v0.3.107。

归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.108-arm64；公开收据 public-verified.json。详细证据及签名边界见 MAC更新通道测试-0.3.108.md。清单为可选测试更新；安装器缺少 Apple Developer ID Installer 签名/公证，自动安装仍会被客户端拒绝，未放宽正式验证器。

Mac 深度签名、13 个 renderer 文件逐字节核对、4 项更新回归、真实完整包回环 HTTP 下载/重试/签名拒绝通过；Mac 直连 GitHub 的本轮公开检查超时，不能声称实机公开端到端通过。公开清单验签和 GitHub 5 项资产 digest 均已核对；公开下载另在 Windows 上运行同一更新服务验证，见 public-update108-client.json。

## 0.3.109 DMG 自动更新（2026-11-26）

用户要求改用 DMG，并解决 PKG 安装签名拦截。已实现签名清单协议 3、DMG 校验、完整应用暂存、定向隔离属性处理、独立助手退出后原子替换、窗口启动确认及失败恢复旧版。新通道 mac-dmg-updates，旧客户端需首次手动安装一次 0.3.109 DMG；旧 PKG 客户端无法仅靠服务器资产切换学习新执行协议。

Mac 桌面交付：/Users/jingchun/Desktop/灵搭Sparkit-Mac-DMG-0.3.109。生产安装未覆盖，用户需保存项目、退出旧版后拖动替换。DMG SHA-256 fd9bc66490e4c95c676eef7da1a6f8fec97dc5e5a9392264a78f46204e83619c，288654486 字节。归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.109-arm64。

1053 项 Node 回归（1051 pass / 0 fail / 2 skip）；修复后 6 项 Mac 更新专项通过。Mac 实机实际 DMG 更新 0.3.108 至 0.3.109、新窗口完整加载、备份与数据保留通过；故意缺少启动回执时实际恢复 0.3.108 通过。记录 MAC-DMG自动更新-0.3.109.md，证据 dmg-update109-qa.json、dmg-update109-rollback.json。无 Apple 公证，不关闭全局 Gatekeeper；此为用户授权的发布者签名测试分发方式。公开状态见归档 public-verified.json。

## 0.3.110 DMG 更新测试版（2026-11-26）

用户明确要求发布新版测试更新和自动安装。版本升至 0.3.110，没有新增功能修改；确认用户 Mac /Applications/Sparkit.app 当前为 0.3.109。6 项更新专项通过，Mac 0.3.109 隔离副本至 0.3.110 的真实 DMG 自动替换、窗口重新加载、备份及数据保留通过，不替用户执行生产安装。

DMG 288654112 字节，SHA-256 1ae7a82c7d729697526c7b73da7c04984c6df0af5aa9c3e5a8171ed05d95d5a3。版本 tag mac-v0.3.110-arm64；通道 mac-dmg-updates。归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.110-arm64，原生证据 dmg-update110-qa.json，公开状态以 public-verified.json 为准。记录 MAC更新测试-0.3.110.md。Windows latest 保持 v0.3.107。
