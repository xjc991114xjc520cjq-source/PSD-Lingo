# 灵搭 Sparkit：MAC 移植分析与实施计划

日期：2026-11-24。源码基线：`f367dd9`，package 版本 `0.3.107`。
分支：`codex/MAC移植`。首个目标：用户已有的 Apple 芯片 Mac，原生 arm64。

本文保留首轮审计快照。第二轮接口拆分、Keychain 源码原型、本地设备协议测试及下一批任务的最新状态见 [MAC第二阶段任务与验收](MAC第二阶段任务与验收.md)；两轮均不代表 Mac 原生验收通过。

## 当前结论

可以保留 Electron + Node + JSX 架构，分离操作系统服务，无需重写整套业务与界面。移植的关键路径是设备授权与凭据保护、Adobe 调用和签名后的安装更新。当前属于移植第一阶段，尚无可交付 Mac 安装包，也没有真实 macOS/Adobe 验收结果。

本轮已创建独立工作树，接入 Photoshop/Illustrator 的 Apple Events 脚本入口和 Windows 更新隔离；保留原稿指纹、独立副本、回执与交付校验。未运行用户的 Photoshop/Illustrator、未修改客户原稿、未发布版本。包版本保持基线，避免把早期开发分支误认为正式新版本。

## 源码依赖审计

| 子系统 | 当前实现与证据入口 | Mac 方案与验收要求 | 优先级 |
|---|---|---|---|
| 窗口与渲染 | `main.cjs`、`preload.cjs`、`renderer/`、`build.cjs`；Electron 35 | 沿用；验证红黄绿窗口控件、标题栏按钮避让、Cmd 快捷键、菜单、缩放、Retina、Dock 与窗口关闭/重新激活。当前关闭所有窗口会退出，暂保留明确行为，后续决定是否采用 Mac 常驻语义 | P1 |
| PSD/PSB 文件解析、表格和计划 | `photoshop-file.cjs`、`photoshop-file-io.cjs`、`core.cjs`、`translation-workbook.cjs`、`sku-workflow.cjs` | 大部分纯 JS 可复用；在 Mac 验证大文件、Unicode 文件名、符号链接、外接卷、只读目录、原子保存和中断恢复 | P0 |
| Photoshop 脚本传输 | `photoshop-preview.cjs` 原为 `photoshop-bridge.exe`/C# COM；`main.cjs` 导出另有 `cscript.exe` VBS 通道 | 本轮新增 Apple Events/osascript 分流，复用 JSX；Mac 上验证命令字典、首次启动、未安装/多版本、超时、弹窗、回执和原稿哈希 | P0 |
| Illustrator 脚本传输 | `illustrator.cjs` → `illustrator-bridge.exe` | 本轮接入 Apple Events；沿用队列和未知结果时停止后续文件的规则；不同 Adobe 版本及应用标识须实机核查 | P0 |
| PS 内嵌 AI/PDF | `sku-illustrator.cjs`、`services/adobe-connection.cs` 的 BridgeTalk + 独立 COM 邮箱回退 | BridgeTalk 可先实测；COM 回退无法移植。后续实现 Mac 独立 Illustrator 邮箱服务，并区分未提交与已提交失败。当前新增顶层桥接不代表深层智能对象通道已完成 | P0 |
| Adobe 通知处理 | `services/windows-adobe-notices.cs`、`adobe-connection.cs` | Windows 窗口/进程处理不可复用；Mac 遇到模态窗口应明确停止并保留现场，不用关闭用户窗口作为默认恢复方式 | P1 |
| 设备身份与许可证 | `services/windows-device.cs` 的 CNG P-256 不可导出私钥、DPAPI；`services/authorization.cjs` | 使用 Keychain/Security.framework 的持久 P-256 密钥；验证 SPKI、公钥稳定性、签名格式及服务端 proof 兼容。不能以明文私钥文件或关闭授权替代 | P0 阻塞 |
| 服务端身份协议 | `services/protocol.cjs`、`server/src/worker.mjs` 固定 `win-`；管理端案例路由也校验 `win-` | 定义带平台的设备协议并保持已有 Windows 身份/租约兼容；同步 bootstrap、challenge、设备限额、案例/知识/诊断及管理员查询。先本地 Worker 回归，再独立上线兼容协议；不能只改客户端前缀 | P0 阻塞 |
| AI 连接凭据 | `services/codex-settings.cjs`、`assistant-connection.cjs` 等通过 helper protect/unprotect | 抽出 credential store，Mac 使用 Keychain 或经过验证的 Electron safeStorage；加密不可用应失败，不回退明文。旧 Windows DPAPI 文件不能承诺直接搬到 Mac 解密 | P0 阻塞 |
| Codex CLI 发现与运行 | `services/codex-discovery.cjs`、`codex-app-session.cjs`、`ai-match.cjs`、`agent-provider.cjs` | 已有部分 POSIX PATH 查找，但原生 npm 包发现只覆盖 Windows，错误文案仍为 exe；补 arm64 官方 CLI 的已安装位置、可执行权限、GUI 启动 PATH 与代理；真实 app-server/附件/恢复须实测 | P1 |
| 字体安装与核验 | `services/font-repair.cjs` 调用 Windows helper `install-font` | Mac 用户字体目录或 CoreText 注册；仍按真实 PostScript 名称匹配，验证 TTC/OTF/TTF、同名字体冲突、Adobe 字体刷新及同名字体不同字形的旧缓存风险 | P0 |
| 路径身份与恢复 | `services/continuation-runtime.cjs` 对路径一律小写；多处 JSX 比较 `fsName.toLowerCase()` | 审计区分大小写 APFS；不能把两个不同文件合并为同一个任务。审计 Unicode 组合、符号链接、卷路径；Windows 工程跨机迁移需显式重新绑定路径并重验哈希 | P0 |
| 更新协议与安装 | `services/updates.cjs`、`protocol.cjs`、`package-portable.cjs`；单一 update.json、runtimeMajor=35、Windows EXE 重启、resources/app 替换 | 本轮已阻止非 Windows 检查/安装 Windows 更新。正式 Mac 更新须签名的完整应用包与平台/架构隔离清单，保留哈希、签名、降级防线与回滚；不能写坏已签名 .app | P0 阻塞 |
| 打包、品牌与授权控制台 | `package-portable.cjs`、`installer/`、`package-tools.cjs`、`services/build-helper.cjs`、`windows-brand.cjs` | 新增独立 Mac 打包入口：arm64 Electron .app、图标 icns、Info.plist、Apple Events 用途说明/必要 entitlement、Developer ID 签名、公证与装订。Windows 品牌代码已有平台检查；管理工具若要 Mac 版需另行验证 | P1 |
| 依赖及运行时 | `package.json`、`pnpm-lock.yaml`，开发 node_modules 当前来自 Windows | Mac 独立安装目标架构依赖，不能复制 Windows node_modules、Electron 或 EXE。Electron 35 的升级与 macOS 支持范围需单独兼容评估，不在本轮偷偷升级运行时 | P0 |
| 云端业务与设计资产 | server、知识同步、设计技能、学习、最终 JPG 审验 | 尽量复用契约；不能将 Windows 的设备命名/路径假设带入 Mac。确保打包白名单不含客户文件、缓存和凭据，设计技能签名/文件名大小写一致 | P1 |

## 本轮已实现

1. `services/macos-adobe.cjs`：按明确 Adobe host 构造 AppleScript，JSX 文件路径独立通过 argv 传递，使用 `/usr/bin/osascript` 直接启动，无 shell 插值。路径必须为绝对文件路径，拒绝 NUL/换行。
2. Apple Events 串行执行，设置长任务超时；提交后的超时或失联标记 `uncertain`，不自动重发。权限错误 -1743 给出自动化设置入口。二进制缺失/无执行权限按提交前失败处理。
3. `photoshop-preview.cjs` 的统一执行入口及 `illustrator.cjs` 的执行入口分流至 Mac transport；Photoshop 记录 `apple-events` bridge-status。`main.cjs` 的传统导出通道也使用新 transport，并保留结果数量和原稿指纹核验。
4. `services/updates.cjs` 加平台隔离，非 Windows 不读取 Windows 缓存策略、不下载清单、不安装 EXE，也不被 Windows 强制更新锁住。Mac 独立通道仍待实现，不显示已具备 Mac 自动更新能力。
5. 新增 `tests/macos-adobe.test.cjs`，验证参数隔离、host 命令差异、错误平台/路径、超时防重复、权限提示、缺失工具及更新隔离。

这些改动只打通执行适配入口。Mac 授权仍调用 Windows helper，字体安装和内嵌 AI COM 回退仍待替换；当前不能声称整套导入、修改、导出链路在 Mac 已能使用。

## 实施顺序与完成门槛

### 第一阶段：本轮平台入口和分析

- 已完成新工作树、分支、Apple Events 入口、更新隔离与 Windows 自动回归。
- 待 Mac 实机确认 AppleScript 字典/应用 ID 与系统权限行为。本轮的模拟测试不替代 Adobe 实机。

### 第二阶段：可启动的 arm64 开发版

- 抽出设备 identity/sign、secret protect/unprotect、字体 install/refresh 服务接口，Windows 适配先保持兼容。
- Keychain helper 原型及服务端平台协议先在本地测试：固定 SPKI 编码、ES256 64 字节 P1363/DER 转换、身份持久、重装/撤销/设备限额。
- 补 POSIX Codex 发现和连接存储；完成 Mac 独立依赖安装、开发启动和中文窗口检查。
- 门槛：授权/续租与加密持久保存真实可用，不能通过把 authorizationEnabled 置 false 伪装完成。

### 第三阶段：原生业务闭环

- Photoshop/Illustrator 各用独立小样完成导入、读取、预览、修改副本、保存、重开、JPG、撤销/恢复及原稿哈希。
- 深层智能对象和 PS→AI 通道单独验收；BridgeTalk 失效后只在确定未提交时切换备用通道。
- 覆盖混合文字、字体缺失、画板、裁切、多 SKU、视觉定位、多语言与助手调用。字体和数值参数一致不代表画面通过。
- 门槛：每条链路记录计划、版本、实际输出、失败现场与视觉结果；结果不明时停机且副本可找回。

### 第四阶段：可分发的签名开发包

- 在 Mac 构建 arm64 .app；暂不承诺 Intel 或 Universal 双架构。最低 macOS/Adobe 版本以实际目标设备版本和依赖支持情况确认。
- 设置固定 bundle ID、隐私用途说明、最小 entitlement、签名、公证/装订，验证下载后的 Gatekeeper 和首次 Apple Events 请求。签名身份改变可能影响系统授权，必须使用实际包测试。
- 安装包完整更新，不覆盖签名内部资源；平台/架构与签名策略纳入服务端发布流程。
- 门槛：全新用户安装、覆盖升级、正常重启、故障回滚、数据保留、拒绝错误平台资产、卸载行为均通过。

### 第五阶段：用户工作流验收

- 先独立小样，再由用户指定客户副本；真实源文件始终不覆盖。
- 对比 Windows/Mac 的可编辑对象、字体字形、输出尺寸、图片/裁切、全部 JPG 和用户语义范围。
- 用户批准前不宣称客户稿视觉验收通过；Mac 开发包不得设为 Windows latest。

## Mac 实机信息与首轮验收清单

已知设备是 M 系列。后续接入时采集 macOS 版本、芯片型号、Photoshop/Illustrator 版本与安装位置、字体与可用磁盘空间；当前未取得，不预填兼容结论。

首轮只使用独立小样：中文/空格/引号路径、无 Adobe、拒绝自动化权限、允许权限、Adobe 已开未保存文档、长任务超时、脚本报错、回执缺失、重复触发与多个任务排队。成功后检查副本可重开、结果数量与原稿 SHA-256；失败后检查没有重复写入。还需测试区分大小写卷及移动硬盘。

本机继续遵守 PowerShell 7 要求。后续 Mac 的构建指令需结合实际可用运行环境执行；本文没有要求当前 Windows 会话改用其他 shell。

## 本轮验证记录

- `node --check main.cjs`、`node --check services/macos-adobe.cjs` 通过。
- `node build.cjs` 通过。
- 初次全量回归因新工作树未包含忽略的 Windows helper，以及两处测试隔离适配问题出现失败；已本地编译 helper，并修正模块获取平台信息及保留原 Windows helper 调用契约。
- 修正后 `node --test tests/*.test.cjs`：1023 tests，1023 pass，0 fail。日志位于工作树忽略目录 `work/mac-port-regression.log`。
- helper 来自当前工作树源码编译，EXE 未纳入 Git；node_modules 为主检出的目录联接，仅供本机 Windows 验证。
- 未做：macOS 执行、Apple Events 权限测试、Mac Adobe 小样、Keychain、Mac 构建/签名/公证、Mac 更新、客户稿视觉验收。

## 官方依据

- [Adobe Photoshop scripting](https://helpx.adobe.com/sg/photoshop/using/scripting.html)：JavaScript 可跨 Windows/macOS，COM/VBScript 和 AppleScript 传输平台不同。
- [Adobe Illustrator 开发入口](https://developer.adobe.com/illustrator/)：提供 JavaScript/AppleScript 脚本扩展。
- [Electron Forge macOS signing](https://github.com/electron/forge/blob/main/docs/guides/code-signing/code-signing-macos.md)：应用签名与公证是分发工作的独立要求。
- [Electron Packager usage](https://github.com/electron/packager/blob/main/usage.txt)：arm64/x64 与 Universal 合并及 macOS 公证宿主条件。工具选型和版本待构建阶段固定，本轮未引入新打包依赖。
