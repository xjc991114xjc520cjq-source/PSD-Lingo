# SKU 底部模板替换（本地开发功能）

状态：软件执行链已接入；本次客户稿和 Adobe 实机验收暂停。没有发布更新。不能将自动回归或成功构建当作客户成稿通过。

## 使用入口

AI 助手使用当前绑定的本机 Codex。附加原稿 PSD/PSB、产品 XLSX、独立模板 PSD/PSB，选择输出目录并说明替换范围、清理对象、跳过产品及排版要求。

1. `match_product_boards` 建立当前原稿与表格的对应。用户在产品对应面板批准；换文件、画板或表格后旧批准失效，不能套用别的路径上的旧决定。
2. `import_source`、`import_product_mapping` 导入同一原稿和批准字段。
3. `inspect_product_template` 读取对象结构，返回 `scanId`，不改原稿，首页同时提供已校验的小尺寸模板参考图。支持按 `boardId`、`offset`、`limit`（最多 100）分页。源稿跳过画板不深入；模板只读深入嵌入 PSD/PSB。
4. `configure_product_template` 一次说明旧块对象、对应模板、清理对象、每产品价格和位置；完整覆盖采用画板，跳过画板不传。配置进入撤销历史和项目持久记录。
5. `preview` 生成独立可编辑副本；`export_files` 复用副本、另存、重开及导出所有画板 JPG，通过现有多技能设计审验链评估实际最终画面。发现问题修改计划后再生成，不反复运行未变化的失败计划。

整块替换与原位改字是两个入口：只修改已有文字用 `configure_product_copy`；导入新模板并清理优惠子区用 `configure_product_template`。不能叠加未撤回的普通文字／对象修改。

## 替换计划

顶层参数：`scanId`、`templateRootId`（扫描返回的分组或嵌入 PSD/PSB 对象）、`templateFrame:[x,y,w,h]`（模板参照框）、`outputFormat:auto/PSD/PSB`、`documentName`。

- `templateFields:[{field,objectIds}]`：表格每个字段对应模板金额文字对象；不同字段不得共用同一对象。
- `removeObjectIds:[id]`：明确移除的模板标签、金额、减号等对象。缺失／斜杠字段的金额不能保留模板示例值，标签和分隔符也要按需求清理。
- `layout:[{objectId,x,y,anchorX,anchorY}]`：以模板原生坐标设置可见字形锚点，锚点取 0、0.5、1。父子对象不能同时位移。嵌套智能对象须加 `coordinateSpace:object-document`，使用返回的 `localBox` 和 `nativeCanvas` 所在文档的局部坐标，不能把全局位置直接传入子文档。此数据用于执行，不能代替图面的视觉审验。
- `boards:[{boardId,replaceRegion,oldObjectIds,reason,placement,changes,fieldExclusions}]`：全部采用画板一次配置。`replaceRegion` 为画板内相对范围；`placement` 为原稿绝对坐标的模板参照框，只允许等比缩放。旧块必须属于本画板，不能删除画板或超出授权区域；原已越出画板边缘的装饰按画板内可见部分核对，不把旧溢出误判成本次错误。
- `changes:[{objectId,original,recordId,recordSlice?,prefix?,suffix?,spans?,anchor}]`：价格只能来自本产品本字段的批准记录；分离整数／小数时，所有切片恰好覆盖一次。前后缀只允许模板原有货币及标点。混合字形必须明确 `spans:[{text,sourceStart}]`，继承货币与数值各自的原生字符样式。
- `fieldExclusions:[{recordId,reason}]`：仅用户明确排除的有效字段，必须说明依据并移除对应模板金额对象；不能用它默默漏掉价格。

每个画板可覆盖通用 `removeObjectIds` 和 `layout`。不含客户具体名称、价格或模板对象硬编码，替换别的项目仍从其真实对象和批准表格重新建立计划。

## 正式后台调用入口

`services/sku-product-template-engine.cjs` 是助手和后台共用执行服务；`services/sku-template-background.cjs` 是 Electron 无窗口入口。后台调用只做软件的结构检查与原生生成，**不自动获得设计通过**。

PowerShell 示例（路径按本机环境替换，命令本身不启动客户任务）：

```powershell
& '<Electron可执行文件>' '<源码目录>/services/sku-template-background.cjs' '<绝对路径>/job.json' '<绝对路径>/新的result.json'
```

job 公共字段：`action:inspect/configure/run`、`sourcePath`、`templatePath`、`mappingDirectory`（软件已批准产品对应的本机目录）、`mappingId`、`cacheDirectory`；以上目录及文件路径均为绝对路径，可选 `helperPath`。

- inspect：可带 `page:{boardId,offset,limit}`，结果为分页对象和扫描 ID。
- configure：带 `args`（上节替换参数和 inspect 得到的真实 scanId），结果为 `plan` 与 `artboards`。
- run：带 configure 返回的 `plan` 和全新的 `outputDirectory`。拒绝覆盖已有输出目录／结果 JSON，计划和文件失效则停止。错误后可能留下空输出目录或未验收的工作副本，不自动当作可交付结果。输出返回副本、JPG、文件摘要与原生重开验证；之后还须进行最终画面审验。

缓存仅保存结构 JSON，不把巨型源文件复制进学习库。源稿、模板、批准摘要、价格字段或计划内容变化均重新校验。缓存损坏直接报错，不改成静默重扫并盲目重试。

## 当前边界

支持原稿的顶层原生画板、普通分组／文字／像素对象，以及模板内嵌入的 PSD/PSB 智能对象（最多六级）。链接对象、AI/PDF/EPS 等模板智能对象明确拒绝，不能悄悄栅格化。旧块删除作用于原稿原生对象，嵌在智能对象中的旧底部块目前需选择其整个外层对象，不能假装已支持任意内部块删除。

模板中的原生画板导入为普通可编辑分组，导入的是画板内对象，不将外部画板本身嵌入原稿；画板背景设置不是独立素材。每产品独立复制模板，编辑智能对象时隔离实例。保留产品图、原画板名称与位置及跳过画板；是否达到最终设计要求仍由真实 JPG 证据判断。
