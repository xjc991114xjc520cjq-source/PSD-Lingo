# PSD Lingo

Windows 桌面端 PSD 多语言文案替换与批量处理测试版。此公开仓库专用于版本留档、安装包下载与后续更新发布。

## 下载与安装

[下载最新单 EXE 安装／更新程序](https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest)

当前版本：**0.3.1 本地测试版**。普通用户只需下载 Release 中的 `PSD-Lingo-0.3.1-Setup.exe` 并运行，无需手动解压 ZIP。更新前保存正在编辑的项目；安装器可检测本机正在运行的旧版，按原路径替换，启动失败时回滚。

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

此仓库已建立；0.3.1 仍为本地测试配置，**不会自动检查这个新仓库**。目前可通过 Releases 下载单 EXE 完成手动更新。

后续联网版清单地址固定为：

```text
https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest/download/update.json
```

自动更新必须同时发布签名清单与对应应用载荷，并在新版客户端内固定本仓库与独立更新公钥；不能以未签名 JSON 启用更新。可选／强制更新参数在签名清单中设置。Cloudflare 授权服务尚未部署，用户禁用／启用暂未上线。详见 [更新发布说明](UPDATE-CHANNEL.md)。

## 从源码构建

下载源码归档并解压；Windows 上安装 Node.js 22.13+ 与 pnpm：

```text
pnpm install
node services/build-helper.cjs
node build.cjs
node --test tests/*.test.cjs
node package-portable.cjs ../PSD-Lingo-0.3.1
node installer/build.cjs
```

安装器参数及构建路径参见源码内 `installer/说明.md`。部署授权服务需另行建立独立 Cloudflare Worker 与 D1；私钥和管理员密码始终放在仓库外。

## 许可

本仓库公开用于产品留档和分发；当前未授予额外开源许可证。第三方依赖许可保留在源码归档的“第三方许可”目录。
