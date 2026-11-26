# Mac 顶部品牌栏 0.3.111

按用户截图反馈，顶部 LOGO 改用已有的纯图标 `sparkit-icon.png`，与名称共用 flex 居中；移除原先从含底部文字图稿裁切导致的视觉偏移。删除“文案与排版工作台”和分隔线，并同步移除窗口初始标题中的相同副标题。

Mac 最终 DMG 内应用经 LaunchServices 在隔离 profile 实际启动，renderer 加载完成。顶部仅显示“灵搭 Sparkit”，LOGO 加载成功，LOGO 和文字布局中心差为 0px；截图 `titlebar111.png` 已人工查看，视觉中心吻合。启动及工作区布局 10 项检查通过，Impeccable 检测无新增发现。

0.3.110 仍保留原预发布及测试证据；0.3.111 为后续界面修正版，继续使用 `mac-dmg-updates` 自动更新通道。本机归档 `D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/mac-0.3.111-arm64`，DMG SHA-256 `9c23cbea3b94101d0222b4fd897a000cdb9ef22bdd64cd82543582fd019fd19f`，288604541 字节。

实际公开状态以归档 `public-verified.json` 为准。未操作生产应用或用户项目，未新增 Adobe 操作或模型调用；应用仍为测试签名，不冒充 Apple 公证。
