const {mappingRecords}=require('./sku-product-copy.cjs');
const pathPrefix=(a,b)=>a.length<=b.length&&a.every((v,i)=>v===b[i]);
function ancestor(a,b){return a.steps.length<=b.steps.length&&a.steps.every((s,i)=>i<a.steps.length-1?JSON.stringify(s.path)===JSON.stringify(b.steps[i].path):pathPrefix(s.path,b.steps[i].path));}
function rect(r){return Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[2]>0&&r[3]>0;}
function buildSingleTemplatePlan(scan,mapping,args,records,giftCatalog){
 if(!mapping?.approved||mapping.id!==scan.mappingId||mapping.approved.approvalDigest!==scan.approvalDigest)throw Error('模板扫描与当前产品批准不一致');
 if(!args||!Array.isArray(args.boards)||args.boards.length!==mapping.approved.boards.filter(b=>b.action==='use').length||new Set(args.boards.map(b=>b.boardId)).size!==args.boards.length)throw Error('模板替换必须恰好覆盖全部采用画板');
 const deleteBoardIds=args.deleteBoardIds||[],approvedDeletes=mapping.approved.boards.filter(b=>b.action==='delete');
 if(!Array.isArray(deleteBoardIds)||new Set(deleteBoardIds).size!==deleteBoardIds.length||deleteBoardIds.some(id=>!Number.isInteger(id))||deleteBoardIds.length!==approvedDeletes.length||approvedDeletes.some(b=>!b.deleteConfirmed||!deleteBoardIds.includes(b.boardId)))throw Error('deleteBoardIds必须恰好对应用户明确批准删除的画板，skip不能当作删除');
 const deletedBoards=approvedDeletes.map(b=>{const a=scan.sourceBoards.find(a=>a.id===b.boardId&&a.name===b.boardName);if(!a||a.nativePath?.length!==1||!b.reason?.trim())throw Error('删除画板的来源或批准失效');return {boardId:a.id,name:a.name,box:a.box,nativePath:a.nativePath,reason:b.reason};});
 const retained=scan.sourceBoards.filter(b=>!deleteBoardIds.includes(b.id));if(!retained.length)throw Error('至少保留一个画板');
 const root=scan.templateInventory.objects.find(o=>o.id===args.templateRootId);if(!root||root.steps.length!==1||!['group','smart'].includes(root.kind)||!root.visible)throw Error('请选择可见的模板顶层分组/智能对象');
 if(scan.templateInventory.issues?.some(i=>{const o=scan.templateInventory.objects.find(o=>o.id===i.objectId);return o&&ancestor(root,o);}))throw Error('选定模板内有无法安全处理的智能对象，请先整理为嵌入PSD/PSB');
 const fieldObjects=args.templateFields;if(!Array.isArray(fieldObjects)||!fieldObjects.length||new Set(fieldObjects.map(f=>f.field)).size!==fieldObjects.length)throw Error('请明确模板价格字段与对象角色');
 const templateObjects=scan.templateInventory.objects.filter(o=>ancestor(root,o));
 const get=id=>{const o=templateObjects.find(o=>o.id===id);if(!o||o.id===root.id)throw Error('模板对象不属于指定块或试图移除整块');return o;};
 const allFieldIds=new Set();for(const f of fieldObjects){if(typeof f.field!=='string'||!Array.isArray(f.objectIds)||!f.objectIds.length)throw Error('模板字段缺少文字对象');for(const id of f.objectIds){const o=get(id);if(o.kind!=='text'||allFieldIds.has(id))throw Error('价格字段需独立文字对象且不能跨角色复用');allFieldIds.add(id);}}
 const available=mappingRecords(mapping);if(available.some(r=>!records.some(v=>v.id===r.id&&v.target===r.target&&v.digest===r.digest)))throw Error('请先导入当前确认清单的全部文案字段');
 const keys=new Set(mapping.approved.boards.filter(b=>b.action==='use').flatMap(b=>b.fields.filter(f=>f.role!=='gift').map(f=>f.key)));if(fieldObjects.some(f=>!keys.has(f.field)))throw Error('模板字段角色没有对应表格字段');
 const used=new Set(),requests=[];
 for(const approved of mapping.approved.boards){if(approved.action!=='use')continue;const b=args.boards.find(b=>b.boardId===approved.boardId);if(!b)throw Error('缺少采用画板');const board=scan.sourceBoards.find(a=>a.id===b.boardId);if(!board)throw Error('画板来源失效');
  if(!rect(b.replaceRegion)||b.replaceRegion[0]<0||b.replaceRegion[1]<0||b.replaceRegion[0]+b.replaceRegion[2]>1||b.replaceRegion[1]+b.replaceRegion[3]>1)throw Error('旧块区域需相对画板明确指定');
  const region=[board.box[0]+b.replaceRegion[0]*board.box[2],board.box[1]+b.replaceRegion[1]*board.box[3],b.replaceRegion[2]*board.box[2],b.replaceRegion[3]*board.box[3]];
  if(!Array.isArray(b.oldObjectIds)||!b.oldObjectIds.length||new Set(b.oldObjectIds).size!==b.oldObjectIds.length||!b.reason?.trim())throw Error('请明确旧块对象与核实依据');
  const old=b.oldObjectIds.map(id=>{const o=scan.sourceInventory.objects.find(o=>o.id===id);const visible=o?[Math.max(o.box[0],board.box[0]),Math.max(o.box[1],board.box[1]),Math.min(o.box[0]+o.box[2],board.box[0]+board.box[2]),Math.min(o.box[1]+o.box[3],board.box[1]+board.box[3])]:null;if(!o||o.boardId!==b.boardId||o.artboard||o.steps.length!==1||visible[2]<=visible[0]||visible[3]<=visible[1]||visible[0]<region[0]-.5||visible[1]<region[1]-.5||visible[2]>region[0]+region[2]+.5||visible[3]>region[1]+region[3]+.5)throw Error('旧块必须完整位于指定区域，不得删除画板或主图');return o;});
  if(old.some((o,i)=>old.some((p,j)=>i!==j&&ancestor(o,p))))throw Error('旧块不能重复选择父子对象');
  const structure=require('./sku-price-structure.cjs').priceStructure({objects:templateObjects,root,fields:fieldObjects,approved:{...approved,fields:approved.fields.filter(f=>f.role!=='gift').map(f=>({...f,recordId:available.find(r=>r.context.boardId===b.boardId&&r.context.field===f.key)?.id}))},groups:args.priceGroups,removes:b.removeObjectIds||args.removeObjectIds||[],layout:b.layout||args.layout||[],exclusions:b.fieldExclusions||[]});
  const removes=structure.removeIds.map(get);if(new Set(removes.map(o=>o.id)).size!==removes.length||removes.some((o,i)=>removes.some((p,j)=>i!==j&&ancestor(o,p))))throw Error('模板移除对象重复或包含父子');
  const removed=o=>removes.some(r=>ancestor(r,o));const actions=removes.map(o=>({mode:'remove',steps:o.steps,objectId:o.id,name:o.name,original:o.original}));
  const changes=b.changes||[];if(!Array.isArray(changes)||new Set(changes.map(c=>c.objectId)).size!==changes.length)throw Error('模板改字对象重复');
  for(const c of changes){const o=get(c.objectId),r=available.find(r=>r.id===c.recordId&&r.context.boardId===b.boardId);if(o.kind!=='text'||removed(o)||!r||!fieldObjects.some(f=>f.field===r.context.field&&f.objectIds.includes(o.id))||o.original!==c.original)throw Error('模板字段跨产品/角色、原文失效或已删除');
   const slice=c.recordSlice||[0,r.target.length];if(!Array.isArray(slice)||slice.length!==2||!slice.every(Number.isInteger)||slice[0]<0||slice[1]<=slice[0]||slice[1]>r.target.length)throw Error('字段分段无效');const prefix=c.prefix||'',suffix=c.suffix||'';if(typeof prefix!=='string'||typeof suffix!=='string'||/[\p{L}\p{N}]/u.test(prefix+suffix)||!o.original.startsWith(prefix)||!o.original.endsWith(suffix))throw Error('只允许保留模板原有货币与标点');
   const target=prefix+r.target.slice(...slice)+suffix,spans=c.spans||[{text:target,sourceStart:0}];if(!['left','center','right'].includes(c.anchor)||!Array.isArray(spans)||!spans.length||spans.map(s=>s.text).join('')!==target||spans.some(s=>!s.text||!Number.isInteger(s.sourceStart)||s.sourceStart<0||s.sourceStart>=o.original.length))throw Error('改字需完整样式分段及可见字形锚点');
   const signatures=new Set((o.styles?.textStyleRange||[]).map(r=>JSON.stringify(r.textStyle)));if(signatures.size>1&&!c.spans)throw Error('混合样式模板需明确spans');
   if(used.has(r.id+':'+slice.join('-')))throw Error('字段重复');used.add(r.id+':'+slice.join('-'));actions.push({mode:'text',steps:o.steps,objectId:o.id,original:o.original,target,spans,anchor:require('./sku-template-geometry.cjs').priceAnchor(o,args.priceGroups,templateObjects,c.anchor),fonts:o.fonts||[],recordId:r.id,slice});
  }
  const exclusions=b.fieldExclusions||[];
  if(!Array.isArray(exclusions)||new Set(exclusions.map(e=>e.recordId)).size!==exclusions.length||exclusions.some(e=>!available.some(r=>r.id===e.recordId&&r.context.boardId===b.boardId)))throw Error('排除字段重复或不属于本产品');
  for(const f of approved.fields.filter(f=>f.role!=='gift')){const role=fieldObjects.find(o=>o.field===f.key);if(!role)throw Error('所有表格字段均需模板角色，不能漏字段');const objects=role.objectIds.map(get),record=available.find(r=>r.context.boardId===b.boardId&&r.context.field===f.key),edits=record?actions.filter(a=>a.recordId===record.id):[];
   if(f.state!=='value'){if(approved.placeholderPolicy==='leave-unchanged'){if(objects.some(removed))throw Error('用户选择保留空字段原文，不能清除对应模板对象');continue;}if(!objects.every(removed))throw Error('空白/斜杠字段的模板金额必须明确清除，不能保留示例价格');continue;}
   const exclusion=exclusions.find(e=>e.recordId===record.id);if(exclusion){if(edits.length||!exclusion.reason?.trim()||!objects.every(removed))throw Error('排除有效字段需说明授权依据，并移除其所有金额对象');continue;}
   let at=0;for(const e of edits.sort((a,b)=>a.slice[0]-b.slice[0])){if(e.slice[0]!==at)throw Error('金额字符重复或遗漏');at=e.slice[1];}if(at!==record.target.length||objects.some(o=>!removed(o)&&!edits.some(e=>e.objectId===o.id)))throw Error('表格字段或模板金额未完整落实');
  }
  const layout=b.layout||args.layout||[];if(!Array.isArray(layout)||new Set(layout.map(l=>l.objectId)).size!==layout.length)throw Error('布局对象重复');for(const l of layout){const o=get(l.objectId);if(o.steps.length>1&&l.coordinateSpace!=='object-document')throw Error('嵌套模板布局需明确object-document坐标，使用localBox而非全局框');if(removed(o)||!Number.isFinite(l.x)||!Number.isFinite(l.y)||![0,.5,1].includes(l.anchorX)||![0,.5,1].includes(l.anchorY))throw Error('布局坐标/锚点无效或对象已移除');if(layout.some(p=>p!==l&&ancestor(get(p.objectId),o)))throw Error('布局不能同时移动父子对象');actions.push({mode:'layout',steps:o.steps,objectId:o.id,x:l.x,y:l.y,anchorX:l.anchorX,anchorY:l.anchorY});}
  if(!rect(b.placement)||!rect(args.templateFrame)||Math.abs(b.placement[2]/args.templateFrame[2]-b.placement[3]/args.templateFrame[3])>.001)throw Error('模板需明确参照框及等比放置框，不能拉伸字形');
  const p=b.placement;if(p[0]<board.box[0]-.5||p[1]<board.box[1]-.5||p[0]+p[2]>board.box[0]+board.box[2]+.5||p[1]+p[3]>board.box[1]+board.box[3]+.5)throw Error('模板参照框放置超出产品画板');
  if(args.giftMode!==undefined&&!['none','replace'].includes(args.giftMode))throw Error('模板giftMode无效');if(args.giftMode==='none'&&(args.gifts||approved.fields.some(f=>f.role==='gift'&&require('./sku-gifts.cjs').parseGifts(f.value).length)))throw Error('无赠品模板不能用于有赠品产品，也不能配置赠品替换');const gift=args.giftMode==='none'?null:require('./sku-gifts.cjs').giftAction({config:args.gifts,approved,catalog:giftCatalog,objects:templateObjects,priceFields:fieldObjects});if(gift){const container=get(gift.objectId);if([...actions,...structure.reflows].some(a=>a.steps&&(ancestor(get(a.objectId),container)||ancestor(container,get(a.objectId)))))throw Error('赠品区域不能与价格、删除或布局重复操作');const cleanup=gift.emptyRemoves.filter(a=>!actions.some(p=>p.mode==='remove'&&ancestor(get(p.objectId),get(a.objectId))));actions.push(gift,...cleanup);}actions.push(...structure.reflows);requests.push({boardId:b.boardId,templateCanvas:[scan.templateInventory.width,scan.templateInventory.height],oldObjects:old,actions,priceStructure:structure.summary,...(gift?{giftReference:gift.reference}:{}),root,...require('./sku-template-geometry.cjs').footerPlacement(args.templateFrame,p,templateObjects)});
 }
 const plan={version:1,operation:'edit',outputFormat:args.outputFormat||'PSB',documentName:args.documentName||'SKU-template',columns:1,rows:retained.length,gap:0,boards:retained.map(b=>({name:b.name,templateId:b.id,mode:'duplicate',changes:[]})),productSourceRecords:available.map(({id,target,digest})=>({id,target,digest})),productMapping:{id:mapping.id,approvalDigest:mapping.approved.approvalDigest},productTemplate:{scanId:scan.id,template:scan.template,...(giftCatalog?{giftCatalog}:{}),decisions:structuredClone(args),requests,...(deletedBoards.length?{deletedBoards}:{})},...(deletedBoards.length?{deleteBoardIds:[...deleteBoardIds]}:{})};
 require('./photoshop-artboard-plan.cjs').validateArtboardPlan(plan,{...scan.sourceInventory,artboards:scan.sourceBoards,layers:[]});return plan;
}
function buildTemplatePlan(scan,mapping,args,records,giftCatalog){
 if(args?.templates===undefined)return buildSingleTemplatePlan(scan,mapping,args,records,giftCatalog);
 const scans=Array.isArray(scan)?scan:[scan],configs=args.templates;
 if(!Array.isArray(configs)||!configs.length||configs.length>12||configs.some(t=>!t||typeof t.templateFileId!=='string'||!t.templateFileId||!t.scanId)||new Set(configs.map(t=>t.templateFileId)).size!==configs.length||new Set(configs.map(t=>t.scanId)).size!==configs.length)throw Error('多模板配置需唯一templateFileId与scanId');
 if(['templateFileId','scanId','templateRootId','templateFrame','templateFields','priceGroups','gifts','giftMode','layout','removeObjectIds'].some(k=>args[k]!==undefined))throw Error('多模板角色与布局须放入templates，不允许混用单模板默认值');
 const adopted=mapping?.approved?.boards.filter(b=>b.action==='use')||[];
 if(!Array.isArray(args.boards)||args.boards.length!==adopted.length||new Set(args.boards.map(b=>b.boardId)).size!==args.boards.length||args.boards.some(b=>!adopted.some(a=>a.boardId===b.boardId)||!configs.some(t=>t.templateFileId===b.templateFileId&&t.scanId===b.scanId)))throw Error('多模板路由必须恰好覆盖全部use画板并明确templateFileId/scanId');
 const available=mappingRecords(mapping);if(available.some(r=>!records.some(v=>v.id===r.id&&v.target===r.target&&v.digest===r.digest)))throw Error('请导入全部当前批准字段');
 const first=scans[0],entries=[],requests=[];let shell;
 if(scans.length!==configs.length)throw Error('多模板扫描数量不一致');
 for(const config of configs){
  const current=scans.find(s=>s.id===config.scanId);if(!current||current.mappingId!==mapping.id||current.approvalDigest!==mapping.approved.approvalDigest||JSON.stringify(current.source)!==JSON.stringify(first.source)||JSON.stringify(current.sourceBoards)!==JSON.stringify(first.sourceBoards)||JSON.stringify(current.sourceInventory)!==JSON.stringify(first.sourceInventory))throw Error('多模板扫描不属于同一原稿、结构与批准');
  const boards=args.boards.filter(b=>b.templateFileId===config.templateFileId);if(!boards.length)throw Error('多模板配置含未使用的模板');
  const subset={...mapping,approved:{...mapping.approved,boards:mapping.approved.boards.filter(a=>a.action!=='use'||boards.some(b=>b.boardId===a.boardId))}};
  const catalog=giftCatalog?.[config.templateFileId];
  const part=buildSingleTemplatePlan(current,subset,{...config,boards,deleteBoardIds:args.deleteBoardIds,outputFormat:args.outputFormat,documentName:args.documentName},records,catalog);
  shell=shell||part;entries.push({templateFileId:config.templateFileId,scanId:current.id,template:current.template,...(catalog?{giftCatalog:catalog}:{})});requests.push(...part.productTemplate.requests.map(r=>({...r,templateFileId:config.templateFileId,scanId:current.id})));
 }
 const productTemplate={version:2,scanId:first.id,templates:entries,decisions:structuredClone(args),requests:adopted.map(b=>requests.find(r=>r.boardId===b.boardId)),...(shell.productTemplate.deletedBoards?{deletedBoards:shell.productTemplate.deletedBoards}:{})};
 const plan={...shell,productSourceRecords:available.map(({id,target,digest})=>({id,target,digest})),productTemplate};
 require('./photoshop-artboard-plan.cjs').validateArtboardPlan(plan,{...first.sourceInventory,artboards:first.sourceBoards,layers:[]});return plan;
}
module.exports={buildTemplatePlan,ancestor};
