# Mac 第三版：图形安装包

日期：2026-11-25；分支 codex/MAC移植。用户要求安装步骤简便，只负责业务测试。

## 交付设计

- 新增原生 .pkg，自动安装到 /Applications/Sparkit.app，用户无需解压 .app、拖拽或输入终端命令。
- 不附加安装脚本，不修改系统安全设置，不删除隔离属性，不重新签名用户文件。
- 构建门禁真实执行 macOS installer，再校验安装后的深度签名，并从 /Applications 启动验证界面、Codex/登录协议、Keychain 和 Secure Enclave。
- 安装器当前没有 Developer ID Installer 签名，应用采用 ad-hoc 签名，未公证。首次安装仍可能需要“系统设置 → 隐私与安全性 → 仍要打开”。不能宣称换成 PKG 就绕过 Gatekeeper 或已经实现零拦截。
- 完全正常的首次分发需要 Apple Developer 账号与合法的 Developer ID Application / Installer 证书及公证凭据，当前仓库未配置相关 GitHub Secrets。等待用户确认账号可用性，不索取聊天中的密码/私钥。

## 使用

下载 Sparkit-0.3.107-Mac-arm64-Setup.pkg，双击，按系统安装器提示完成安装（可能要求 Mac 管理员授权），然后在“应用程序”打开 Sparkit。无需运行旧版终端命令。若安装器被拦截，仅对这个安装器在隐私与安全性中选择“仍要打开”；如果没有该入口或安装后的 app 仍被拦截，反馈界面即可，不要求测试者修复系统。

## 验证

最终云端运行、安装报告和公开收据完成后补充。不能把命令行安装成功冒充用户 Mac Gatekeeper 图形放行通过。旧版“已损坏”提示尚未远程确诊，PKG 旨在固定安装路径并保持原生权限与链接，不声称已证明根因。
`n最终云端运行 45542048193 成功：34 项 Mac 专项、实际 PKG 安装、安装后深度签名、正式 renderer 与登录设置、真实 CLI 登录发起/取消及 Keychain/Secure Enclave 均通过；零模型调用。安装包 262100230 字节，SHA256 3e34d1b3dbc691a94497977cafd8360b36d5953fcd38680d410a013712b30cbe。本机下载哈希已核对。Gatekeeper 自动评估 rejected（no usable signature），首次图形放行仍待用户 Mac；尚未实现公证后的零拦截分发。
