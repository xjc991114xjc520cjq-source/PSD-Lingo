# Mac 0.3.108 更新通道测试

接续聊天「创建 MAC 移植工作树 (4)」中已授权的发布任务。工作树为 `codex/MAC移植`，应用版本由 0.3.107 升至 0.3.108。

## 发布范围

- 独立版本预发布：`mac-v0.3.108-arm64`。
- 独立清单预发布：`mac-updates`，资产 `update-macos-arm64.json`。
- 可选更新，最低支持版本 0.3.107；不会设置为 GitHub latest。
- 本机归档：`D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.108-arm64`，含源码、安装器、手动应用 ZIP、启动修复 ZIP、构建和验证报告及签名清单。

## 实际验证

- 复用已验证候选包的 Electron、Codex 与原生 helper；重新构建应用主进程并复制最新 renderer、preload，更新应用版本后重新进行临时签名。
- Mac `codesign --verify --deep --strict` 通过；全部 13 个打包界面文件与本次源码逐字节一致，包内版本 0.3.108。
- 安装器 SHA-256：`13e7a49d42db415b60e1d50f783e268591f1a17e94b18538eb138de07aa471d2`，262022251 字节。
- 上轮 LaunchServices 隔离副本启动报告通过：页面加载完成、preload bridge 可用、启动动画退出。
- 本轮 4 项 Mac 更新自动测试通过。Mac 实机真实 HTTP 完整包传输、断点重试及不可信安装包拒绝通过（65 次请求），安装器未打开。

## 签名边界

此包没有 Apple Developer ID Installer 签名和公证。ES256 签名清单证明更新来源与内容哈希，不代表 Apple 安装器信任通过。此次仅发布可选测试更新，预期客户端完成发现、下载及哈希核对后，在安装签名校验阶段拒绝。

测试清单通过发布模块已有的注入验证接口生成；注入实现只校验本机归档安装器的长度、哈希与测试包身份，不冒充 Apple 验签成功。正式客户端的 `verifyPackage` 未改动。具体准备结果见归档 `test-channel-preparation.json`。

手动安装可下载应用 ZIP，解压后拖到 Applications；首次启动受阻时使用本版本绑定的启动修复工具。未更改系统安全策略，未进行用户 Adobe 全流程验收。

## 公开收据

发布完成与公开链路验证结果以归档 `public-verified.json` 为准；不能将本机准备结果视为公开发布成功。

已公开版本预发布与 mac-updates 清单。匿名清单下载、生产公钥验签、GitHub 全部 5 个资产 digest 对本机归档核对通过，Windows latest 仍为 v0.3.107。公开修复包名为 Sparkit-Mac-Startup-Repair.zip。

Mac 实机直连公开 GitHub 的 Node fetch 出现 UND_ERR_CONNECT_TIMEOUT，不能称实机公开检查已通过。此前 Mac 下载测试使用真实完整安装包和回环 HTTP；公开下载另由 Windows 上同一 Mac 更新服务核验，结果见归档 public-update108-client.json。用户实测仍需确认本机网络能够访问 GitHub。
