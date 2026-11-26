# Mac 0.3.110 更新测试发布

用户要求发布新版，以测试更新检查及自动安装。确认 Mac `/Applications/Sparkit.app` 已安装 0.3.109。本次版本升至 0.3.110，沿用已验证的 DMG 更新功能，未新增功能修改。

- 版本预发布：`mac-v0.3.110-arm64`。
- 更新通道：`mac-dmg-updates`，协议 3、DMG、可选更新，生产 ES256 公钥验签。
- 本机归档：`D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.110-arm64`。
- DMG：288654112 字节，SHA-256 `1ae7a82c7d729697526c7b73da7c04984c6df0af5aa9c3e5a8171ed05d95d5a3`。
- Mac DMG 验证及完整深度应用签名通过；更新专项 6 项通过。
- 实机使用 0.3.109 的隔离副本测试至 0.3.110；不替用户执行生产应用的退出或安装。

用户操作：在 0.3.109 中检查更新，保存项目，点击安装更新，等待软件自动退出并重新打开，确认版本为 0.3.110。

公开发布、匿名清单及完整安装包下载校验以本机归档 `public-verified.json` 为准；Mac 实际应用替换收据为 `dmg-update110-qa.json`。保持 Windows latest，不把测试应用签名视为 Apple 公证。

实机验收通过：0.3.109 至 0.3.110 的实际 DMG 安装、Electron 更新助手握手、完整应用替换、旧版备份、用户数据保留和新窗口加载均通过。新窗口 renderer 为 complete，preload bridge 可用，启动动画结束；生产应用未被操作。
