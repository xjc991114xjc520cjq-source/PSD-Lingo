// Declarative, project-independent Photoshop artboard composition. The model
// supplies approved record references, never executable scripts or output paths.
function validateArtboardPlan(plan,file){
 if(!plan||plan.version!==1||!['auto','PSD','PSB'].includes(plan.outputFormat)||!Array.isArray(plan.boards)||!plan.boards.length||plan.boards.length>100)throw Error('画板计划无效：需要1至100个画板及auto/PSD/PSB格式');
 if(!Number.isInteger(plan.columns)||plan.columns<1||plan.columns>100||!Number.isInteger(plan.rows)||plan.rows<1||plan.rows>100||plan.rows*plan.columns<plan.boards.length||!Number.isFinite(plan.gap)||plan.gap<0||plan.gap>2000)throw Error('画板网格参数无效或行数×列数不足以容纳画板');
 if(plan.operation!==undefined&&!['compose','rename','arrange','edit'].includes(plan.operation))throw Error('画板操作无效');
 if(['rename','arrange'].includes(plan.operation)&&(plan.boards.length!==file.artboards?.length||new Set(plan.boards.map(b=>b.templateId)).size!==file.artboards.length||plan.boards.some(b=>b.mode!=='duplicate'||b.templateId===null||b.changes.length)))throw Error('重命名或重排必须保留全部原生画板且不夹带改字');
 const deleted=plan.deleteBoardIds??[];
 if(!Array.isArray(deleted)||new Set(deleted).size!==deleted.length)throw Error('删除画板列表无效或重复');
 if(deleted.length&&(plan.operation!=='edit'||!plan.productTemplate||!plan.productMapping||!Array.isArray(plan.productTemplate.deletedBoards)||plan.productTemplate.deletedBoards.length!==deleted.length||deleted.some(id=>{const a=file.artboards?.find(a=>a.id===id),d=plan.productTemplate.deletedBoards.find(d=>d.boardId===id);return !a||a.nativePath?.length!==1||!d||d.name!==a.name||JSON.stringify(d.box)!==JSON.stringify(a.box)||JSON.stringify(d.nativePath)!==JSON.stringify(a.nativePath)||!d.reason?.trim()||plan.boards.some(b=>b.templateId===id);})))throw Error('删除画板必须属于已批准模板计划，来源、名称、坐标与保留项不能冲突');
 if(!deleted.length&&plan.productTemplate?.deletedBoards?.length)throw Error('删除画板记录与清单不一致');
 const retained=file.artboards?.filter(a=>!deleted.includes(a.id));
 if(plan.operation==='edit'&&(plan.boards.length!==retained?.length||new Set(plan.boards.map(b=>b.templateId)).size!==retained.length||plan.boards.some(b=>b.mode!=='duplicate'||!retained.some(a=>a.id===b.templateId&&a.name===b.name))))throw Error('原位改字必须完整保留全部未批准删除的原生画板及名称');
 if(plan.documentName!==undefined&&(typeof plan.documentName!=='string'||!plan.documentName.trim()||plan.documentName.length>100||/[<>:"/\\|?*\x00-\x1f]/.test(plan.documentName)||/[. ]$/.test(plan.documentName)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(plan.documentName)))throw Error('文档名称含有无效文件名字符');
 const names=new Set();let w=0,h=0;
 for(const b of plan.boards){
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>200||/[\x00-\x1f]/.test(b.name)||names.has(b.name))throw Error('画板名称为空或重复');names.add(b.name);
  if(!['duplicate','blank'].includes(b.mode)||!Array.isArray(b.changes)||b.changes.length>500)throw Error('画板模式或修改列表无效');
  let box;if(b.mode==='blank'){if(b.templateId!==null||!Array.isArray(b.size)||b.size.length!==2||!b.size.every(n=>Number.isInteger(n)&&n>0))throw Error('空白画板尺寸无效');box=[0,0,...b.size];if(b.changes.length)throw Error('空白画板没有可替换的原文字');}
  else if(b.templateId===null){if(file.artboards?.length)throw Error('已有画板的文档必须指定templateId');box=[0,0,file.width,file.height];}
  else{const a=file.artboards?.find(a=>a.id===b.templateId);if(!a)throw Error('模板画板不存在，请查看workspace');if(a.nativePath?.length!==1)throw Error('嵌套画板暂不支持，请先在Photoshop中整理为顶层画板');box=a.box;}
  w=Math.max(w,box[2]);h=Math.max(h,box[3]);const ids=new Set();
  for(const c of b.changes){const l=file.layers.find(l=>l.id===c.layerId);if(!l||ids.has(c.layerId)||l.original!==c.original||!Array.isArray(l.nativePath))throw Error('画板文字来源失效或重复');ids.add(c.layerId);
   if(b.templateId!==null&&l.boardId!==b.templateId)throw Error('修改文字不属于模板画板');
   if(l.issues?.some(i=>!['文字层或分组已锁定','混合文字样式暂不支持'].includes(i)))throw Error('画板内文字暂不支持原生修改：'+l.name+'：'+l.issues.join('；'));
   if(typeof c.target!=='string'||!c.target.trim()||c.target.length>20000||(plan.nativeTextScanId?/[\uD800-\uDFFF]/:/[\r\n\uD800-\uDFFF]/).test(c.target+c.original)||!['left','center','right'].includes(c.anchor)||!Array.isArray(c.spans)||!c.spans.length||c.spans.length>256||c.spans.map(s=>s.text).join('')!==c.target||c.spans.some(s=>typeof s.text!=='string'||!s.text||!Number.isInteger(s.sourceStart)||s.sourceStart<0||s.sourceStart>=c.original.length))throw Error('画板改字必须完整覆盖目标并引用原字符样式');
   if(!Array.isArray(c.recordIds)||!c.recordIds.length||c.recordIds.some(id=>typeof id!=='string')||typeof c.reason!=='string'||!c.reason.trim())throw Error('画板改字缺少批准文案来源或依据');
  }
 }
 const width=['rename','edit'].includes(plan.operation)?file.width:Math.min(plan.columns,plan.boards.length)*w+(Math.min(plan.columns,plan.boards.length)-1)*plan.gap,rows=Math.ceil(plan.boards.length/plan.columns),height=['rename','edit'].includes(plan.operation)?file.height:rows*h+(rows-1)*plan.gap,max=plan.outputFormat==='PSD'?30000:300000;
 if(width>max||height>max)throw Error(plan.outputFormat+'尺寸超限（'+width+'×'+height+'），请调整列数或选择PSB');
 return plan.boards.map((b,i)=>{const a=b.mode==='blank'?[0,0,...b.size]:b.templateId===null?[0,0,file.width,file.height]:file.artboards.find(a=>a.id===b.templateId).box;return {...b,box:['rename','edit'].includes(plan.operation)?[...a]:[i%plan.columns*(w+plan.gap),Math.floor(i/plan.columns)*(h+plan.gap),a[2],a[3]],sourceBox:a};});
}
function makeArtboardPlan(file,args,records){
 if(!['PSD','PSB'].includes(file.format))throw Error('画板合成目前支持PSD/PSB，AI请使用对应原生流程');
 if(!Array.isArray(args.boards))throw Error('请提供boards列表');
 const columns=args.columns??Math.min(4,args.boards.length);
 const plan={version:1,...(args.nativeTextScanId?{nativeTextScanId:args.nativeTextScanId}:{}),operation:args.operation||'compose',outputFormat:args.outputFormat||'auto',documentName:args.documentName,columns,rows:args.rows??Math.ceil(args.boards.length/columns),gap:args.gap??100,boards:args.boards.map(b=>({...b,mode:b.mode||'duplicate',templateId:b.templateId??null,changes:(b.changes||[]).map(c=>{
  const l=file.layers.find(l=>l.id===c.layerId);if(!l)throw Error('图层ID不存在');const ids=c.recordIds;if(!Array.isArray(ids)||!ids.length||ids.some(id=>!records.some(r=>r.id===id)))throw Error('请先import_document导入批准文案，再引用recordIds');
  const separator=c.separator??'';let recordSlice=c.recordSlice;let nativeSelection=false;if(!['',' ','\n'].includes(separator))throw Error('文案分隔符无效');let target=ids.map(id=>records.find(r=>r.id===id).target).join(separator);
  if(args.nativeTextScanId&&c.spans){let selected;try{selected=require('./native-approved-copy.cjs').nativeApprovedCopy(target,c.spans,c.recordSlice);}catch(e){throw Error('原生文字 '+l.id+'（'+l.name+'）：'+e.message);}target=selected.target;recordSlice=selected.recordSlice;nativeSelection=true;}
  if(!nativeSelection&&c.recordSlice!==undefined){const sl=c.recordSlice;if(ids.length!==1||!Array.isArray(sl)||sl.length!==2||!sl.every(Number.isInteger)||sl[0]<0||sl[1]<=sl[0]||sl[1]>target.length)throw Error('字段字符段范围无效');target=target.slice(sl[0],sl[1]);}
  const prefix=c.prefix||'',suffix=c.suffix||'';if(typeof prefix!=='string'||typeof suffix!=='string'||/[\p{L}\p{N}]/u.test(prefix+suffix)||!l.original.startsWith(prefix)||!l.original.endsWith(suffix))throw Error('前后缀只能保留原文字中的货币或标点符号');target=prefix+target+suffix;
  const signatures=new Set(l.mixedStyleRuns?.map(s=>s.signature));if(signatures.size>1&&!c.spans)throw Error('混合样式文字必须指定spans，从原字符继承货币、数值等不同样式');
  return {layerId:l.id,original:l.original,target,recordIds:[...ids],separator,recordSlice,sourceRecords:ids.map(id=>{const r=records.find(r=>r.id===id);return {id,digest:r.digest,target:r.target};}),spans:c.spans||[{text:target,sourceStart:0}],anchor:c.anchor||l.alignment||'left',reason:c.reason};
 })}))};validateArtboardPlan(plan,file);return plan;
}
function renameArtboardPlan(file,args){if(!['PSD','PSB'].includes(file.format)||!file.artboards?.length)throw Error('当前文档没有可重命名的PS原生画板');if(!Array.isArray(args.names)||!args.names.length||new Set(args.names.map(n=>n.boardId)).size!==args.names.length||args.names.some(n=>!file.artboards.some(b=>b.id===n.boardId)))throw Error('重命名画板ID无效或重复');const plan={version:1,operation:'rename',outputFormat:args.outputFormat||'auto',documentName:args.documentName,columns:1,rows:file.artboards.length,gap:0,boards:[...file.artboards].sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]).map(b=>({name:args.names.find(n=>n.boardId===b.id)?.name??b.name,mode:'duplicate',templateId:b.id,changes:[]}))};validateArtboardPlan(plan,file);return plan;}
function arrangeArtboardPlan(file,args){const plan=file.artboardPlan?structuredClone(file.artboardPlan):renameArtboardPlan(file,{names:file.artboards?.map(b=>({boardId:b.id,name:b.name}))||[]});if(plan.operation==='rename')plan.operation='arrange';const order=args.boardIndices||args.boardIds;if(order!==undefined){const key=args.boardIndices?(b,i)=>i:b=>b.templateId;if(!Array.isArray(order)||order.length!==plan.boards.length||new Set(order).size!==order.length||order.some(id=>!plan.boards.some((b,i)=>key(b,i)===id)))throw Error('画板排序必须恰好覆盖所有画板');const before=plan.boards;plan.boards=order.map(id=>before.find((b,i)=>key(b,i)===id));}plan.columns=args.columns;plan.rows=args.rows;plan.gap=args.gap??plan.gap;plan.outputFormat=args.outputFormat||plan.outputFormat;plan.documentName=args.documentName??plan.documentName;validateArtboardPlan(plan,file);return plan;}
function renamePlannedArtboards(file,args){const plan=structuredClone(file.artboardPlan);if(!Array.isArray(args.names)||!args.names.length||new Set(args.names.map(n=>n.boardIndex)).size!==args.names.length||args.names.some(n=>!Number.isInteger(n.boardIndex)||!plan.boards[n.boardIndex]))throw Error('计划画板重命名需要有效且不重复的boardIndex');for(const n of args.names)plan.boards[n.boardIndex].name=n.name;plan.documentName=args.documentName??plan.documentName;plan.outputFormat=args.outputFormat||plan.outputFormat;validateArtboardPlan(plan,file);return plan;}
module.exports={validateArtboardPlan,makeArtboardPlan,renameArtboardPlan,arrangeArtboardPlan,renamePlannedArtboards};
