# 第三阶段交付状态更新

2026-11-25 已完成 arm64 云端 Swift 编译、原生 helper/Keychain/Secure Enclave、`.app` 打包/签名/启动验证，并生成可供用户安装的 Mac ZIP。第二阶段下方的“尚无安装包/尚未编译”是历史快照。最新状态、未完成的实机业务边界及交付证据见 [MAC第三阶段云端构建与交付](MAC第三阶段云端构建与交付.md) 和 [MAC实机测试指南](MAC实机测试指南.md)。

# MAC 第二阶段任务与验收

2026-11-24，`codex/MAC移植`。承接《MAC移植分析与实施计划》，目标为 Apple 芯片 Mac。以下“已实现”描述源码和本机测试状态，不等于 Mac 原生验收。

## 本轮交付

| 任务 | 状态 | 实现与证据 |
|---|---|---|
| M2-01 平台设备服务接口 | 已实现，Windows 回归通过 | `services/device-service.cjs` 统一 helper 的 stdin/stdout JSON 协议，Mac 只路由原生 `bin/sparkit-device`，没有 EXE/明文回退；输入/输出限长、超时处理、错误隔离。保留 Windows Adobe 脚本错误分类 |
| M2-02 Keychain/Secure Enclave helper | Swift 源码原型完成，未编译/未实机验收 | `services/macos-device.swift`：Secure Enclave P-256 持久私钥，公钥转 SPKI DER，签名转 ES256 的 64 字节 P1363；Keychain 保存 256 位 AES 密钥，AES-GCM 随机 nonce + AAD 密文。不导出设备私钥、不创建软件私钥回退、不自动替换失效/不可读的密钥 |
| M2-03 授权与凭据接线 | 已实现，模拟设备 + 实际本地 Worker SQL 通过 | `Authorization` 可注入设备服务，Mac 使用 `license.keychain`；`CodexSettings` 使用 `codex-settings.keychain`，Windows 保持旧 DPAPI 路径。两类文件存放密文，不是 Keychain 数据库；原生密钥实际存于系统 Keychain |
| M2-04 平台设备协议 | 本地源码与测试通过，未部署 | `deviceId`/Worker identity 新增 `mac-`；默认 `win-` 算法不变。Worker challenge 校验前缀及 SPKI 哈希，管理端案例读取支持两种身份；没有修改生产数据库或线上 Worker |
| M2-05 Mac Codex 发现 | 已实现，文件系统夹具测试通过 | POSIX 可执行权限检查、HOME、Finder 最小 PATH 的 Homebrew 路径、arm64 npm 原生包候选与大小写区分。手动文件选择在 Mac 不再限制 exe。尚未验证真实 Mac CLI/助手 |
| M2-06 本机构建入口与原生门禁 | 已提供，待 Mac 执行 | `build:helper:mac`、`test:mac:native`；Windows 禁止构建 Mac helper，原生测试在 Windows 明确 skip |
| M2-07 Adobe 结果不明保护补充 | 已修复，回归通过 | Mac Adobe 执行失败时诊断写盘失败不再覆盖原始错误；执行成功后诊断无法保存标记缺失回执，防止误判为尚未执行 |

## 验证证据与边界

- 全量 `node --test tests/*.test.cjs`：1034 项，其中 1033 pass、0 fail、1 skip。跳过的是 `tests/macos-device-native.test.cjs` 的真实 Secure Enclave/Keychain 测试；不能计为通过。
- 日志：工作树的 `work/mac-stage2-regression.log`，保留在忽略目录。
- 新增测试覆盖 helper 参数/保密边界、未知操作拒绝、错误响应/响应超限/超时、Windows 错误保留、Mac 身份哈希与 Worker 一致、激活/密文持久化/重启/续租/设备限额/撤销、损坏凭据拒绝覆盖、Mac CLI 权限/路径与原生 npm 包发现。
- 授权测试使用 Node 模拟原生设备的加密与签名，再访问实际本地 Worker 和 SQLite。它证明客户端/服务端协议可协作，**不能证明 Swift 原型已正确运行**。
- 当前无 macOS 编译器及 Apple Security/CryptoKit SDK；未尝试用 Windows 的替代库冒充 Apple 平台验证。没有调用 Adobe、外部模型、生产授权服务或发布服务。

## 下一批任务（按依赖顺序）

| 编号 | 工作 | 完成门槛 | 依赖 |
|---|---|---|---|
| M2-08 | Mac helper 编译与签名验证 | 编译修复后，固定 bundle/helper 签名身份，检查 arm64；真实 native 测试通过；跨进程与升级后公钥保持；不泄漏密文解密能力或设备密钥 | M 系列 Mac、Xcode Command Line Tools、Node 与可用 PowerShell 7 |
| M2-09 | Keychain 异常与生命周期 | 首次授权、拒绝访问、锁定/解锁、后台运行、并发初建、重装升级、不同用户、Keychain 条目缺失/损坏/设备迁移均有明确结果；无软件密钥或明文回退 | M2-08；正式签名身份策略 |
| M2-10 | 本地 Worker Mac 专项扩展 | 补 free bootstrap、重放 proof、Mac 案例/诊断/知识全链路及管理查询；确保旧 Windows license、设备 ID、租约、额度和撤销行为兼容 | M2-04 |
| M2-11 | 服务端兼容变更发布 | 独立归档/验证/发布，仅上平台兼容协议；公开状态验证通过；Mac 客户端不抢占 Windows latest | M2-10、必要发布检查；当前未执行 |
| M2-12 | Mac 字体服务 | 合法字体格式与大小验证、用户级安装、重复与冲突、Adobe 刷新、精确 PostScript 名称和代表对象复查 | Mac；独立 Adobe 空闲许可 |
| M2-13 | 原生业务接线余项 | 区分大小写 APFS 路径身份、PS 内嵌 AI 独立通道与 COM 邮箱替代；未知写入状态不重复派发 | Mac；独立 Adobe 空闲许可 |
| M2-14 | 首个 arm64 开发 .app | Mac 独立安装目标架构依赖、打包 helper 到约定位置、图标与 Info.plist、自动化用途声明、签名/entitlement、窗口启动、授权/设置/本机 Codex 连接 | M2-08/09/11；Mac 打包入口 |

M2-08 的原生门禁是下阶段首要任务。M2-12/13/14 尚未完成，第二阶段整体仍处于开发中。没有可供用户安装的 Mac 完整包。

## Mac 验证入口

需在目标 Mac 的独立检出中安装 Mac arm64 依赖，不能复用本工作树连接的 Windows node_modules。所有终端命令继续按用户约定通过 PowerShell 7 执行。

```powershell
node services/build-macos-helper.cjs
# 为 helper 配置并验证实际开发/分发签名后，再运行原生门禁。
node --test tests/macos-device-native.test.cjs
```

Swift 原型构建目标暂设 `arm64-apple-macosx13.0`，用于最初验证，不表示产品最低系统版本已最终确定。原生门禁会创建/访问专用 Sparkit Keychain/Secure Enclave 条目，仅用固定测试内容验证签名、密文随机性、跨进程解密和篡改拒绝；不访问客户原稿或生产授权服务器。它不会删除系统密钥，避免破坏现有设备身份。

首次上 Mac 须记录：芯片、macOS、Xcode/Swift、Node、PowerShell 版本；helper 签名身份与二进制 SHA-256、原生门禁输出；不得记录私钥、API Key、许可证或解密内容。编译失败、Keychain 拒绝、签名变更异常都应保留真实结果并修正，不调整为跳过后称通过。

## 实现依据

- [Apple：Secure Enclave 私钥保护](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)：设备私钥使用 Security.framework，依赖实际设备和访问控制。
- [Apple：AES.GCM.SealedBox](https://developer.apple.com/documentation/cryptokit/aes/gcm/sealedbox)：采用包含 nonce/密文/认证标签的组合密文，解密必须验证完整性。

原型尚待官方 SDK 编译和签名包实测；上述文档不能替代实机证据。
