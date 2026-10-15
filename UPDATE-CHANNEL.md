# PSD Lingo 0.3.2 自动更新

## 给用户

已有 0.3.1 或更早版本需要先运行一次 0.3.2 单 EXE 安装更新程序，之后启动、回到窗口及每 5 分钟会检查专属 GitHub 通道。

可选更新可以立即安装、30 分钟后提醒或跳过此版本，手动检查可以再次显示已跳过版本。强制更新不可跳过，也不能用 Esc 关闭；可以先保存项目和退出软件，安装完成后恢复导出与 AI 任务。更新不会强杀正在执行的 Photoshop 或 AI 工作任务。收到的强制策略会在断网、重启后保留。

下载采用分块续传，校验独立 P-256 签名、仓库白名单、版本、SHA-256 和载荷内容，完成后替换原路径 resources/app，再重启并验证启动握手。启动失败恢复上一版。更新只替换应用程序，不替换 PSD、文档、绑定项目、API 设置或授权数据。

此通道为客户端拉取，在线检查间隔约 5 分钟，GitHub CDN 可能有额外缓存延迟；离线设备联网后收到。无法保证实时送达。尚未部署 Cloudflare 授权服务，本版不会要求激活码。

## 给管理员：发布下一版本

1. 双击独立管理工具的“启动管理控制台.cmd”，无需登录授权服务即可使用“软件更新发布”。
2. 选择构建生成的 PSD-Lingo-app-版本.zip，再选择仓库外的 update-private.pem，以及一个发布保存目录。可附带完整安装 EXE。
3. 选择“可选更新”或“强制更新”，填写更新说明。普通可选更新的最低可继续使用版本保留 0.3.2；提高最低版本会强制较旧版本更新。
4. 点击生成签名发布文件，再打开专属 GitHub Releases，将生成的应用载荷 ZIP、update.json、SHA256SUMS.txt 和可选 EXE 上传到对应 v版本 Release。新版本先用草稿核对，发布时设为 Latest，不勾选 Pre-release。
5. 可选：展开“一键发布到 GitHub”，输入仅限本仓库 Contents 读写的 Token，点击上传并公开发布。Token 不落盘，新版本先创建草稿，核对上传文件的长度和 GitHub SHA-256 后才公开并设为 Latest；同版本只替换更高序号清单，拒绝覆盖不同载荷。没有 Token 时仍可网页上传。
6. 客户端读取 releases/latest/download/update.json。签名后不能手改清单。发布时不用上传签名私钥。

## 将已发布的可选更新改成强制

选择同一份应用载荷和相同版本，在工具中选择强制更新，重新生成。工具自动生成更高策略序号，替换该 Release 的 update.json 与 SHA256SUMS.txt；应用载荷和版本标签保持不变。已跳过或稍后的客户端仍会检查并接收强制策略。

解除强制也可生成更高策略序号的可选清单；如果最低版本仍高于旧客户端，则仍然强制。旧清单不能覆盖客户端已验证的新策略。版本回退修复须以更高版本号发布，不能降级。

## 构建与命令行

node services/build-helper.cjs
node build.cjs
node --test tests/*.test.cjs
node package-portable.cjs ../PSD-Lingo-版本
node installer/build.cjs ../PSD-Lingo-版本 ../PSD-Lingo-版本-安装更新.exe
node package-admin.cjs ../PSD-Lingo-Admin-版本

也可复制 server/tools/release-options.example.json，填写本机路径后执行 node server/tools/prepare-release.cjs 发布配置.json。此配置可能包含本机私钥路径，不应公开。

私钥只在管理员本机仓库外保存，并已限制目录权限。请另行离线备份；丢失私钥将无法为现有客户端签发新更新。不同产品、授权和更新不得共用私钥。
