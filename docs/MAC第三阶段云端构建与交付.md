# MAC 第三阶段：云端构建与交付

日期：2026-11-25。工作树 `C:/Users/JC/.codex/worktrees/sparkit-mac-port/PSD-Lingo`，分支 `codex/MAC移植`。

## 实现

- GitHub Actions `macos-15` arm64，步骤通过 PowerShell 7 执行。先校验输入归档 SHA256，再独立安装 Mac 依赖、编译 Swift、运行平台专项、构建 renderer、打包/签名/启动。
- 构建输入采用文件白名单，私有草稿资产不公开。没有上传 Git 历史、客户文件、私密配置或本机 node_modules。公开远端分支只保存工作流与触发元数据。
- `package-macos.cjs` 保留 Electron framework 符号链接，生成 icns、Info.plist 和 Apple Events 用途说明；将原生 helper 放入实际 bundle 根目录的 `bin/sparkit-device`。SDK、设计资源及许可随包带入。
- Mac 开发包 ad-hoc 签名、hardened runtime，显式 JIT/动态库/Apple Events entitlement。没有宣称 Developer ID 或公证。
- Swift 使用 Secure Enclave P-256，login Keychain 保存设备绑定的不透明密钥表示及 AES 密钥；无软件身份密钥和明文文件回退。首次创建发生竞争时保留既有条目。
- CoreText 用户级字体安装加入格式/头部/描述/大小检查与哈希命名、重复安装保护。
- PS 与 AI 分队列，消除 PS 等待 AI 邮箱时的 Node 全局队列死锁。未知写入状态仍不重试。
- 路径身份 Windows 忽略大小写、POSIX 保留大小写；覆盖缓存、项目绑定、附件合并、模板路由、导出来源和生成 JSX。
- renderer 标题栏为 Mac 系统按钮留出左侧空间，preload 仅暴露平台标记。

## 证据

- Windows 最终回归：`work/mac-stage3-handoff-regression.log`，1040 总数 / 1038 通过 / 0 失败 / 2 平台跳过。
- 云端成功构建 `45529689449`：Swift 编译、12 项平台专项、`.app` 深度签名校验、包内 Keychain 与 Secure Enclave 公钥/签名、renderer 启动和截图通过。
- 归档复跑 `45530117312` 揭示 smoke 在 documentElement 建立前访问 classList 的时序错误；包编译及原生 helper 已通过，renderer 检查失败。随后修正为空根节点等待，必须以最终复跑的成功状态为交付门禁。
- 在线服务发布版本 `491efe0c-b2c3-4f8c-9680-13035c1fb509`，先归档/编译、再 `--keep-vars` 部署；D1/密钥保持原绑定，无迁移。配置与主检出等价（换行不同），本工作树保留已上线诊断功能。
- 生产协议测试：`work/mac-server-live-report.json`。临时软件 P-256 身份的 Mac bootstrap、签名租约、续租与错误身份拒绝通过，随后撤销测试设备。该证据不冒充硬件身份验收。
- 最终包、build-report、smoke-report、签名校验日志与截图保存于 work 的交付目录，并在交付后补充最终云端运行编号/公开地址。
- 最终复跑 `45530434765` 全部通过，独立 Mac 测试 tag 为 `mac-arm64-test-0.3.107`。下载包 107073305 字节、SHA256 `450dec34ff3d7cd56fc029a4f8e20e0c53e47ffefb57af70458db82c8b92ed64`。本机检查确认 563 个 ZIP 条目、14 个 framework 符号链接和原生 helper 执行权限。

## 边界与接续

交付让用户开始 Mac 实机测试，不等于全软件 Mac 业务验收。用户按 `MAC实机测试指南.md` 从小样顺序测试；未占用本机 Adobe，未处理客户原稿。Apple 公证、固定分发签名身份、升级后 Keychain 生命周期、Mac 自动更新及 Adobe 真机路径仍是后续任务。

不要把测试包放进 Windows stable latest。不要把草稿源码资产改成公开发布；仅独立 Mac 测试发布可包含经过校验的成品包与公开报告。
