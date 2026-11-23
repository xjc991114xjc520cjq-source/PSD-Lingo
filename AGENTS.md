# 灵搭 Sparkit 软件开发

- 跨设备报错优先查询已部署的诊断库，入口及字段边界见 `docs/跨设备错误排查.md`。使用 `server/tools/query-diagnostics.cjs` 按错误编号、版本、设备或任务检索；管理员登录证明仅从仓库外私密目录读取，不打印或提交。旧客户端未上报的错误不能声称已获取，禁止仅凭截图推断原稿损坏。

- 2026-11-17：用户明确授权发布0.3.88，包含全流程深查修复和多语言导航分组/内置助手入口映射。937项回归与相关Electron/原生独立小样已通过，正式包启动、窗口显示和重复实例退出通过。本机归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.88；正式公开状态以work/releases/0.3.88/public-verified.json及公开latest签名为准，不把准备发布当作已发布。

- 2026-11-17：按用户指定，侧栏“首页”保留原内容；“多语言制作”下常驻“模板制作”（editor）和“批量修改”（batch）。稳定路由、按钮ID及业务工具不变；界面与助手共享随软件打包的workspace-navigation契约，提示词与workspace返回新入口映射，不依赖本机设置。937项回归、助手20项Electron界面检查和工作记录恢复通过；未发布。见practice-records/2026-11-17-multilingual-navigation/实施与验收.md。

## 范围及路径

- 本仓库用于软件功能和缺陷修复。客户海报的改稿、文案排版及人工设计审阅另开任务，不在这里混做。
- 主源码位于 D:/PSD-Lingo/outputs/PSD-Lingo；若运行在 Git 工作树，所有代码编辑、构建和验证必须在该工作树中完成，不回写主目录。
- 上级 D:/PSD-Lingo/AGENTS.md、PROJECT-MEMORY.md 和 practice-records/记录规范.md 仍适用；其“实际源码目录”仅描述主检出，不要求工作树回到主检出编辑。
- 当前聊天负责功能开发；“灵搭 Sparkit · 小问题修复”聊天用于小问题复现、修复和验证。两个分支通过具体提交合并，不能直接复制整目录覆盖。

## 环境与操作

- exec_command 显式使用 C:/Program Files/PowerShell/7/pwsh.exe，login=false，不改用 CMD 或 PowerShell 5.1。
- TEMP/TMP 仅对测试进程设为 D:/PSD-Lingo/work/temp，不修改系统全局配置。
- 工作树可通过目录联接复用主目录 node_modules；它不是代码同步。原生 helper 的已编译 EXE 不纳入 Git，可从主检出 services/bin 复制到工作树的同名忽略目录。
- 未获得当前空闲许可，不控制 Illustrator/Photoshop，不操作用户正在使用的应用或原稿。
- 不提交客户文件、运行日志、安装包、凭据或私钥。公开验签公钥不属于私钥。
- 发布需要用户明确授权，并遵循先本机归档、再验签发布的流程。2026-11-17用户已持续授权本软件后续修改完成并通过必要验证后直接发布，不再逐次请求发布许可；用户后续暂停或限制发布时优先遵循。创建工作树本身不代表发布授权。

## 当前基线

- 正式发布为 0.3.61；设计审验指导、多技能图像回交及隐藏/清除/新增文字属于后续本地功能，尚未发布。
- 本地已完成独立 AI/PSD/PSB 原生对象测试、真实本机 Codex 经 renderer 联合修复与 AI 保存重开、撤销及项目恢复。证据和边界见 practice-records/2026-11-11-design-review-and-text-objects/验收记录.md；不代表客户 RS6V2 成稿获得用户视觉批准。
- 当前功能归本聊天维护，小问题分支不要重写这些功能，除非用户在该聊天明确提出。后续发布仍需明确授权与完整归档、验签。
- 2026-11-11 用户已授权修复后直接发布 0.3.62。最终 JPG 审验与 RS6V2 断点验收见 practice-records/2026-11-11-final-jpeg-review/验收与复测.md；发布准备不等于已公开，实际发布凭公开 latest 与签名清单确认。
- 2026-11-11 后续正式版本已到 0.3.63。工作记录（手动／助手持久保存、查看、恢复、关联重跑）已在本分支实现并验证，尚未公开发布；见 practice-records/2026-11-11-work-records/实施与验收.md。用户要求先完成工作记录，再处理助手速度；参数保护提交 5f53bd2 已等价合入 14e8eaa，混合样式寿命原对象改字仍待补齐，不误称客户成稿已验收。
- 2026-11-11：独立任务已补工作区重置、附件隔离与主进程导出来源防线；AI 单行混合字符原对象改字已补齐，独立 Illustrator 预览/保存重开/JPG、共存清除另一对象及 renderer 撤销重做/项目恢复通过。728 项 Node 回归及助手/工作记录 Electron 通过。均未公开发布，不代表客户稿视觉验收；详见 practice-records/2026-11-11-task-isolation-and-mixed-text/实施与验收.md。
- 2026-11-11：用户已明确要求发布上述工作记录、流程优化、独立任务隔离及混合改字能力，准备版本 0.3.64。本机归档路径 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.64；是否正式发布以公开 latest 和签名清单为准，证据 D:/PSD-Lingo/work/v64-local-verified.json、v64-public-verified.json。
- 2026-11-11：已仅 cherry-pick 小问题提交 86b7375（本分支 d0171c4），引导标注生成保留连接侧/阅读轴/原始对齐；学习 rev11，不增模型调用或专项审验。729 项回归通过。用户明确授权发布 0.3.65，归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.65，实际公开状态以 latest/签名及 D:/PSD-Lingo/work/v65-public-verified.json 为准。不代表客户稿已修复或视觉通过。
- 2026-11-11：用户明确授权发布桌面项目首次注册与助手对话收尾同步，准备版本0.3.66。737项回归、两个本机Codex空白对话的真实侧栏归属及正式包启动通过。收尾会打开一次对应Codex页面，同一会话追问不重复打开，不增加模型调用；不宣称完全静默。归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.66，实际公开状态以 D:/PSD-Lingo/work/v66-public-verified.json 为准。
- 2026-11-11：用户明确授权发布长分析资料完整交付、字段级纠错与失效门禁清理，准备版本0.3.67。744项回归与真实本机Codex、后台Illustrator副本保存重开/JPG、真实JPG审验链路通过；视觉审验仍有修改意见，不代表客户成稿通过。禁用computer use，未操作桌面。归档 D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.67，实际公开状态以 D:/PSD-Lingo/work/v67-public-verified.json 为准。
- 2026-11-11：PSB句柄/路径stat设备号差异导致的源文件变化误报已修复；新增后台PS原生画板复制/新建/命名/行列排布、混合价格样式与auto PSD/PSB输出。761项回归及真实本机Codex、后台PS保存重开和全部画板JPG审验通过；详见practice-records/2026-11-11-photoshop-artboards/实施与验收.md。本地未发布，不代表客户视觉批准，未使用computer use。
- 2026-11-11：用户明确授权发布PSB误报修复及多画板功能，准备版本0.3.68。761项回归、后台PS原生矩阵及真实本机Codex最终JPG审验通过。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.68；实际公开状态以D:/PSD-Lingo/work/v68-public-verified.json及正式latest签名为准。
- 2026-11-12：用户明确授权发布产品表对应画板及原位文案块修改，并交接“灵搭 Sparkit · 实机测试与设计审验”（01a1c671-e732-7bb1-84a3-316bd6d509df）开展客户副本测试。准备0.3.69，775项回归、隐藏Electron及后台PS独立智能对象小样通过；客户原稿未改，真实客户任务和设计验收另行记录。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.69，实际发布以D:/PSD-Lingo/work/v69-public-verified.json及正式latest签名为准。

- 2026-11-12：用户明确授权发布 SKU 外部底部模板替换并启动独立实机测试。功能提交4571d21，786项自动回归通过，准备0.3.70。当前发布前客户整稿及Adobe实机未验收；发布核对完成后交接“灵搭 Sparkit · 实机测试与设计审验”从本轮I盘键盘稿断点后台续测，禁止computer-use及旧RS6V2串任务。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.70，实际公开以签名latest及work/releases/0.3.70/public-verified.json为准。

- 2026-11-12：用户明确授权发布赠品模板及后续模板导入／价格结构修复，准备0.3.71。赠品功能8dd410f，813项回归与实际Electron、后台PS单／双／无赠品及组合居中保存重开/JPG通过。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.71；正式状态以work/releases/0.3.71/public-verified.json及公开签名latest为准。不代表客户整稿或用户视觉批准。

- 2026-11-12：用户明确授权发布0.3.72。修复XLSX价格浮点尾数，接入原始数值/格式/公式来源及批准失效校验；818项回归、客户活动表5处只读核对及正式包启动通过。未调用Adobe，客户整稿与视觉验收另行记录。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.72，实际公开以work/releases/0.3.72/public-verified.json与正式latest签名为准。

- 2026-11-12：同原稿多模板逐板路由及空赠品模板能力已接入助手/正式后台计划，整数隐式终止样式误报已局部修复。828项回归、独立后台PS两模板同稿保存重开/JPG通过；未改客户原稿，Adobe已归还独立实机聊天。见practice-records/2026-11-12-multi-template/实施与验收.md。本地补丁尚未发布，客户完整稿与视觉验收待实机聊天续做。

- 2026-11-12：根据用户纠正，单赠品已改为原生默认紧凑图文组合，分行名称优先于价值，附属小字显式保留归组；不再仅提供可选槽位。设计技能rev3、学习rev13，835项回归、独立后台PS单/双/无赠品保存重开及JPG查看、正式包启动通过。沿用用户直接发布授权，准备0.3.74；归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.74，正式状态以work/releases/0.3.74/public-verified.json及公开签名latest为准。未重跑客户整稿，既有整批退出未证明解决。

- 2026-11-16：用户授权修复助手PSB混合与嵌套文字阻塞后直接发布，再续查全流程。新增原生深读与统一改字计划、PS/AI嵌套扫描、多行等价样式校验及任务状态防线；852项回归、后台独立PSB/PS智能对象/AI智能对象多行混合保存重开与JPG通过。准备0.3.76，详见practice-records/2026-11-16-native-assistant-text/实施与验收.md；客户完整德文稿未重跑，不代表视觉验收。

- 2026-11-16：0.3.76已公开验签。按用户要求继续流程深查，补同路径新版附件刷新/旧身份替换及本机问答误唤醒；855项回归、助手18项Electron界面/本机协议/工作记录通过。准备0.3.77，不覆盖已发布资产；无需新增Adobe或模型测试。

- 2026-11-16：在0.3.87源码基线上完成全流程深查，补不明执行状态跨IPC保护、逐文件导出/重试/收尾、审验批次等待结算、普通PSD/PSB最终JPG审验、阶段文档续做、进度增量与工作记录节流、中途补充重评估及120操作暂停检查点。936项Node回归、5套Electron流程与后台PS/PSB/AI小样通过；软件实际侧栏到AI保存重开/最终JPG审验链路通过，执行及审验回包为确定性测试，未新增外部模型调用。一次Illustrator COM故障在重启后通过只读核对已有副本并补导恢复，不能称Adobe自身根因已修复。用户授权后续同类故障可自行重启Adobe，仍保护原稿与已有副本。见practice-records/2026-11-16-workflow-release-audit/实施与验收.md；本轮修复尚未发布，不代表客户整稿视觉验收。

- 2026-11-16：用户授权发布逐画板模板复用、批量最终JPG审验及简洁完成页，准备0.3.85。914项自动测试、真实Electron及独立后台PS复用/像素/保存重开通过；客户整稿未重跑。归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.85；公开状态以work/releases/0.3.85/public-verified.json和正式latest签名为准。

- 2026-11-17：依据用户“所有页面都有类似低级错误”的反馈，统一共用标题留白、步骤数字与换行、侧栏标签、工作区窗口边界及不透明底色、工作记录响应式对齐。937项Node回归及三档尺寸七类页面几何/截图、助手21项、多图改字和工作记录Electron、正式包启动通过；无Adobe或外部模型调用。依用户持续发布授权准备0.3.90，归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.90；实际发布以work/releases/0.3.90/public-verified.json为准。详见practice-records/2026-11-17-shared-ui-layout/实施与验收.md。

- 2026-11-17：按用户要求首页新增通栏AI助手大卡片，整个卡片直接调用现有助手入口。三档窗口渲染/实际点击、21项助手Electron整合、5项工作流UI及正式包启动验证通过；无Adobe或外部模型调用。依持续授权发布0.3.91，归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.91，公开状态以work/releases/0.3.91/public-verified.json为准。详见practice-records/2026-11-17-home-assistant/实施与验收.md。

- 2026-11-17：助手卡片仅LOGO文字改白，保留橙色图形；新增静态星芒与弧线、指针光斑和悬停/焦点反馈。新增作用域动画来源，助手由首页卡片展开并收回，兼容减少动态设置。937项回归、三档真实页面/指针/卡片动画来源/关闭焦点及助手21项整合、正式包启动通过。依持续授权发布0.3.92，公开状态以work/releases/0.3.92/public-verified.json为准；记录practice-records/2026-11-17-assistant-card-effects/实施与验收.md。

- 2026-11-17：用户要求完整UI交互检查并沿用改完即发布授权，准备0.3.93。首页示例区、共享卡片反馈、文件/文档面板、表单/弹窗/标签页、窄窗口检查面板滚动及键盘文件图层选择已修复。937项Node与助手/工作记录/下拉/SKU两套Electron测试、正式包启动通过。无Adobe或外部模型调用；详见practice-records/2026-11-17-interface-polish/实施与验收.md。公开状态以work/releases/0.3.93/public-verified.json为准。

- 2026-11-17：另一台电脑AI导入UKFG line96定位为文字读取，新增逐对象隔离/错误阶段、稳定原生文字快照及清理失败保护。942项Node和客户副本99文字/完整预览、原生UKFG故障注入后其他98文字一致通过，原稿哈希未变。未自然复现对端错误，不声称Adobe根因或客户成稿通过。依持续发布授权准备0.3.94；详见practice-records/2026-11-17-ai-text-import-isolation/实施与验收.md及work/releases/0.3.94/public-verified.json。

- 2026-11-18：SKU助手需求日期缺少文档入口已补prepare_text_replacements，主进程校验本次用户来源，单行/多行沿原文换行与混合样式生成批准文案，不清空旧文档和绑定。951项回归、本机协议Electron及真实本机Codex两种版式原生计划配置通过；本机模型测试预算到达后停止，未调用Adobe/未导出客户稿。依持续授权准备0.3.97，详见practice-records/2026-11-18-request-copy-replacements/实施与验收.md，公开以work/releases/0.3.97/public-verified.json为准。

- 2026-11-18：按用户顺序先正式发布0.3.97，再查询跨设备87a82f1b-3e3e-4d10-aa4e-4bc2ff7c99f2（0.3.96原生PS导入错误54）。新增逐层/逐字段文字读取隔离、完整原生描述回退与受限对象可见保留、明确只读失败收据及去重诊断；955项Node回归与生成JSX故障注入通过。未调用Adobe/客户原稿，不能声称对端自然复现或客户成稿验收。准备0.3.98，正式状态以work/releases/0.3.98/public-verified.json和公开latest签名为准；记录practice-records/2026-11-18-photoshop-text-read-isolation/实施与验收.md。

- 2026-11-18：用户指定默认“成品检查”、任务前可选“完整设计审验”、左侧独立“高级审验”。已接入本机Codex同会话只读审图、模式持久化/恢复、6页流式窗口、紧凑联合问题清单、成品图独立审验与缓存；不读源工程、不自动裁图复审，JPG原字节传输。966项首轮回归、助手22项Electron及54图9批单会话协议/报告、大图传输通过；追加大型图单续做门禁回归。无Adobe/外部模型调用，未证明对端实际加速分钟数或客户视觉通过。沿用持续发布授权准备0.3.99；公开以work/releases/0.3.99/public-verified.json为准。见practice-records/2026-11-18-review-modes/实施与验收.md。

- 0.3.99最终门禁：967项Node、22项助手Electron、54图独立高级审验及正式包启动全部通过。实际公开发布须查看该版本public-verified.json；不以本条记录代替公开签名证明。
- 2026-11-18：接续与暂停通道修复准备0.3.100。安全边界暂停保留同一本机Codex会话、待答问题和在途结果；nativeSession支持thread/resume及保留完整记录的明确降级。工作记录暂停/待答断点、结构/预览引用、原生文字和SKU定位、制作副本及审验缓存恢复，继承任务谱系且保持新任务隔离。976项Node、助手22项Electron、暂停/回答/继续及暂停断点、历史记录恢复、54图9批1会话中途暂停和正式包启动通过；实际本机gpt-6.1-sol双回合跨进程工具接续通过。未调用Adobe或客户原稿，旧记录无缓存仍需必要重读，不承诺立即冻结在途原生操作。详见practice-records/2026-11-18-continuation/实施与验收.md；公开状态以work/releases/0.3.100/public-verified.json及latest签名为准，归档D:/PSD-Lingo/outputs/PSD-Lingo-GitHub/0.3.100。
- 2026-11-18：0.3.100上传收尾期间发现普通小PSD恢复快照缺少8位RGB标记，保留已上传资产、标为预发布并撤离稳定latest；补齐字段及真实renderer parseImported回归后，全量977项通过。最终准备0.3.101，其他暂停/接续UI、本机跨进程及54图9批中途暂停证据沿用；正式包、归档及公开验签分别查看work/releases/0.3.101，未验签前不以准备状态声称最终正式发布。

- 2026-11-23：准备0.3.102，修复嵌套AI部分失败扫描缓存、失败画板定向重读、BridgeTalk运行版本发现/启动就绪/真实故障分类及PS/AI通用/版本化COM发现。985项回归与后台独立3画板12文字含3AI对象PSB保存重开/JPG通过；对端2023未自然复现。记录practice-records/2026-11-23-adobe-connection/实施与验收.md；正式发布以work/releases/0.3.102/public-verified.json为准。

- 2026-11-23：准备0.3.103，BridgeTalk无法发现Illustrator时新增每任务独立COM回退，沿用原生读/改/回嵌/验收工具；新增Windows应用路径及标准安装路径启动回退，已运行进程不重复启动。990项回归和故意屏蔽BridgeTalk发现的后台PS/AI三画板12文字保存重开/3JPG通过，原稿不变。对端2023尚未实测。记录practice-records/2026-11-23-adobe-independent-connection/实施与验收.md；正式状态以work/releases/0.3.103/public-verified.json为准。

- 2026-11-23：原生文字补扫保留已有计划/文案/布局，新增与失败画板增量读取；内嵌AI默认参数打开及旧文字显式转换，Windows回执锁仅重试交回。993项Node及后台独立PSB三画板12文字/3内嵌AI保存重开/3JPG通过，准备0.3.104。对端2023自然故障与RPC根因未证明复现或解决；公开以work/releases/0.3.104/public-verified.json为准。

- 2026-11-23：全文字体修改已接入侧栏/助手、真实字体款式和逐对象授权参数、原生混合/嵌套计划、预览成果复用及撤销/记录恢复。代码与自动测试阶段完成（1005项Node、字体界面三档Electron及助手22项整合）；用户本轮要求先完成代码和自动测试，未调用Adobe、未发布。原生字体保存重开与JPG视觉验收待当前空闲许可；见practice-records/2026-11-23-typography/实施与验收.md。
