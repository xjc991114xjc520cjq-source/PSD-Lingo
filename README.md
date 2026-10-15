# PSD Lingo

Windows 桌面端 PSD 多语言文案替换与批量处理测试版。此公开仓库专用于版本留档、安装包下载与后续更新发布。

## 下载与安装

[下载最新单 EXE 安装／更新程序](https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest)

当前版本：**0.3.2 自动更新测试版**。普通用户只需下载 Release 中的 `PSD-Lingo-0.3.2-Setup.exe` 并运行，无需手动解压 ZIP。更新前保存正在编辑的项目；安装器可检测本机正在运行的旧版，按原路径替换，启动失败时回滚。

## 主要功能

- 可编辑 PSD 文字层与目标语言文档逐条绑定、跳过或手动修改。
- 原稿／替换效果双预览，修改字体、字号、字距、行距、位置和缩放，支持撤销与常用 Photoshop 操作习惯。
- 以用户确认的修改后预览布局导出 PSD，保留原始文件。
- 保存绑定和排版模板，按文档条目顺序批量应用到不同语言，每种语言输出独立 PSD。
- Codex 连接设置与 API Key 在本机通过 Windows DPAPI 加密持久保存。

PSD 导出和精确预览需要本机 Photoshop；字体需在本机安装。当前安装包未做 Windows Authenticode 代码签名。

## 版本留档

每个 Release 包含单 EXE、SHA-256 校验表与独立源码归档 `PSD-Lingo-source-版本.zip`。源码归档保留目录结构，排除依赖、运行时、凭据、用户 PSD／文档、项目记录与本机测试输出。GitHub 自动生成的 Source code ZIP 仅包含仓库页面文件；完整应用源码请下载带 `PSD-Lingo-source-` 前缀的资产。

## 更新渠道状态

0.3.2 已接入本仓库的签名自动更新。客户端启动、回到窗口及每 5 分钟检查；离线设备联网后收到。0.3.1 及更早版本须先手动安装一次 0.3.2。

- 可选更新：立即更新、30 分钟后提醒或跳过此版本。
- 强制更新：不可跳过；允许先保存项目，安装后恢复导出与 AI 任务。断网、重启后保留已收到的强制策略。
- 管理发布：独立可视化工具生成签名清单，支持将同一版本从可选改为强制；可通过网页上传，或使用仅本次发布内存保存的 GitHub Token 一键发布。
- 安装保护：P-256 签名、仓库白名单、SHA-256、断点续传、原路径替换、启动握手与失败回滚。

授权服务与更新通道独立；Cloudflare 授权服务尚未部署。详见 [更新发布说明](UPDATE-CHANNEL.md)。

## 从源码构建

下载源码归档并解压；Windows 上安装 Node.js 22.13+ 与 pnpm：

```text
pnpm install
node services/build-helper.cjs
node build.cjs
node --test tests/*.test.cjs
node package-portable.cjs ../PSD-Lingo-0.3.2
node installer/build.cjs
```

安装器参数及构建路径参见源码内 `installer/说明.md`。部署授权服务需另行建立独立 Cloudflare Worker 与 D1；私钥和管理员密码始终放在仓库外。

## 许可

本仓库公开用于产品留档和分发；当前未授予额外开源许可证。第三方依赖许可保留在源码归档的“第三方许可”目录。
