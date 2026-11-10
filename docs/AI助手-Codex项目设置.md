# AI 助手的 Codex 项目归属

打开“AI 工作助手”，展开“Codex 项目”，填写项目名称，选择所在盘位及父文件夹，点击“保存项目设置”。提示中的最终路径为“父文件夹 / 项目名称”。输出位置仍用于保存作品副本，与 Codex 项目目录分别设置。

首次开始任务时，软件创建对应文件夹，调用本机 Codex 的 project/create 取得正式项目 ID，将 ID 与设置保存到本机 agent-project.json；之后创建独立任务时，先读取该项目，再使用同一 projectId 和 cwd 创建对话。保存相同设置不会重复建项目；退出软件再打开也沿用已保存配置。首次创建使用稳定幂等键，响应中断后重试不会换键重复建项目。

当前任务的补充、问答、暂停续做及后续需求保留原对话和项目。修改设置仅影响之后的新建独立任务；运行期间不允许改项目。未保存的设置会在开始前提示保存。未配置时默认项目为 Sparkit，父目录为软件用户数据目录下的 codex-projects，可在首次任务前修改。

项目创建失败、本机 Codex 不支持项目协议、已绑定项目不存在或其目录与设置不同，均会报告失败，停止模型工作，不回退到项目外对话。外部人工改动的项目不会被软件自动改名或改位置。已有项目外历史对话不在本次改造中搬迁。

验证：666 项 Node 自动测试通过；真实 Electron 主界面、preload、IPC 联调 18 项通过（模型夹具，不操作 Adobe）。本机实际 Codex 在隔离 CODEX_HOME 中创建一个项目和两个对话，两次返回相同 projectId 和正确 cwd，没有进行模型推理；证据位于 D:/PSD-Lingo/work/agent-project-live.json。界面证据位于 D:/PSD-Lingo/work/agent-project-ui/verified.json。未发布、未安装或重启用户软件。

协议依据：本机 Codex app-server generate-json-schema --experimental 的 ProjectCreateParams、ProjectReadParams、ThreadStartParams；方法与通用会话机制参考 https://learn.chatgpt.com/docs/app-server 。项目协议为实验能力，旧 CLI 应先更新；失败不得静默降级。
