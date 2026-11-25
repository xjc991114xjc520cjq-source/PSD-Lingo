# Mac 移植接续检查点

更新时间：2026-11-25。目标：持续制作，直到用户能在 M 系列 Mac 开始实机测试。

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
