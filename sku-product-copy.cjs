// Product identity is confirmed separately from locating editable copy fields.
const {makeArtboardPlan}=require('./photoshop-artboard-plan.cjs');
function mappingRecords(mapping){
 if(!mapping?.approved)throw Error('产品对应尚未确认');
 return mapping.approved.boards.filter(b=>b.action==='use').flatMap(b=>b.fields.filter(f=>f.state==='value'&&f.role!=='gift').map(f=>({id:`product:${mapping.id}:${b.boardId}:${f.cell}`,key:`${b.boardName} · ${f.key}`,original:f.key,target:f.value,digest:f.digest,context:{...(f.numeric?{numeric:f.numeric}:{}),productMappingId:mapping.id,approvalDigest:mapping.approved.approvalDigest,boardId:b.boardId,boardName:b.boardName,productName:b.productName,productCode:b.code,rowId:b.rowId,field:f.key,cell:f.cell}})));
}
function productCopyPlan(file,mapping,args,records){
 if(!mapping?.approved||!file.artboards?.length)throw Error('请先确认产品对应并读取原生画板');
 if(mapping.approved.boards.some(b=>b.action==='use'&&b.fields.some(f=>f.role==='gift')))throw Error('赠品必须使用模板流程，不能只改价格并遗漏图片');
 if(mapping.approved.boards.some(b=>b.action==='delete'))throw Error('产品确认含删除画板，请使用configure_product_template的deleteBoardIds；原位文字流程不支持删板');
 if(mapping.approved.boards.some(b=>b.action==='use'&&b.placeholderPolicy==='remove-and-reflow'&&b.fields.some(f=>f.role!=='gift'&&f.state!=='value')))throw Error('已选择删除空项并重排，请使用inspect_product_template和configure_product_template配置完整价格阅读组，不能只改文字并忽略删除');
 const expected=mapping.source.boards;
 if(file.artboards.length!==expected.length||expected.some(b=>!file.artboards.some(a=>a.id===b.id&&a.name===b.name&&JSON.stringify(a.box)===JSON.stringify(b.box))))throw Error('当前原生画板与产品对应记录不一致');
 if(!Array.isArray(args.boards)||args.boards.length!==mapping.approved.boards.filter(b=>b.action==='use').length||new Set(args.boards.map(b=>b.boardId)).size!==args.boards.length)throw Error('请一次覆盖全部采用的画板；跳过画板不能夹带修改');
 const available=mappingRecords(mapping),supplied=new Map(),boards=mapping.approved.boards.map(b=>{
  if(b.action==='skip')return {name:b.boardName,templateId:b.boardId,changes:[]};
  const input=args.boards.find(a=>a.boardId===b.boardId);if(!input)throw Error('缺少采用画板的文案对象定位');
  const r=input.copyRegion;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>1||r[1]+r[3]>1)throw Error('请明确每个画板的文案块相对范围[x,y,w,h]（0至1），不是设计美感评分');
  const board=file.artboards.find(a=>a.id===b.boardId),region=[board.box[0]+r[0]*board.box[2],board.box[1]+r[1]*board.box[3],r[2]*board.box[2],r[3]*board.box[3]];
  if(!Array.isArray(input.changes)||!Array.isArray(input.omissions||[]))throw Error('缺少字段修改及主动保留清单');
  const changes=input.changes.map(c=>{const l=file.layers.find(l=>l.id===c.layerId);if(!l||l.boardId!==b.boardId||l.original!==c.original)throw Error('文案对象不属于该产品画板或原文已变化');
   if(!Array.isArray(l.box)||l.box.length!==4||!l.box.every(Number.isFinite)||l.box[0]+l.box[2]/2<region[0]||l.box[1]+l.box[3]/2<region[1]||l.box[0]+l.box[2]/2>region[0]+region[2]||l.box[1]+l.box[3]/2>region[1]+region[3])throw Error('文字对象不在已指定文案块范围内，不能改产品图区域');
   if(!Array.isArray(c.recordIds)||!c.recordIds.length||c.recordIds.some(id=>!available.some(v=>v.id===id&&v.context.boardId===b.boardId)))throw Error('字段跨产品、重复或不是已确认表格文案');
   for(const id of c.recordIds){const a=available.find(v=>v.id===id),actual=records.find(v=>v.id===id);if(!actual||actual.target!==a.target||actual.digest!==a.digest)throw Error('请先import_product_mapping导入同一批准字段');const slice=c.recordSlice||[0,a.target.length];if(c.recordSlice&&c.recordIds.length!==1||!Array.isArray(slice)||slice.length!==2||!slice.every(Number.isInteger)||slice[0]<0||slice[1]<=slice[0]||slice[1]>a.target.length)throw Error('分离整数和小数的字段字符段无效');const used=supplied.get(id)||[];if(used.some(s=>slice[0]<s[1]&&slice[1]>s[0]))throw Error('同一字段的字符段重复覆盖');used.push(slice);supplied.set(id,used);}
   return c;
  });
  for(const o of input.omissions||[]){if(!available.some(v=>v.id===o.recordId&&v.context.boardId===b.boardId)||supplied.has(o.recordId)||typeof o.reason!=='string'||!o.reason.trim())throw Error('主动保留字段需要本产品字段ID及明确原因');const field=available.find(v=>v.id===o.recordId);if(!Array.isArray(o.layerIds)||!o.layerIds.length||new Set(o.layerIds).size!==o.layerIds.length)throw Error('保留字段需提供已含相同完整文案的原生对象');const originals=o.layerIds.map(id=>file.layers.find(l=>l.id===id&&l.boardId===b.boardId));const prefix=o.prefix||'',suffix=o.suffix||'';if(originals.some(l=>!l||!l.box||l.box[0]+l.box[2]/2<region[0]||l.box[1]+l.box[3]/2<region[1]||l.box[0]+l.box[2]/2>region[0]+region[2]||l.box[1]+l.box[3]/2>region[1]+region[3])||/[\p{L}\p{N}]/u.test(prefix+suffix)||originals.map(l=>l.original).join('')!==prefix+field.target+suffix)throw Error('有效表格字段不可凭理由遗漏；保留对象必须已含相同完整文案');supplied.set(o.recordId,[[0,field.target.length]]);}
  return {name:b.boardName,templateId:b.boardId,changes};
 });
 if(available.some(r=>{const spans=(supplied.get(r.id)||[]).sort((a,b)=>a[0]-b[0]);let end=0;for(const s of spans){if(s[0]!==end)return true;end=s[1];}return end!==r.target.length;}))throw Error('有表格文案字段遗漏，需明确绑定或说明保留原因');
 const plan=makeArtboardPlan(file,{boards,operation:'edit',outputFormat:args.outputFormat||'auto',documentName:args.documentName,columns:1,rows:boards.length,gap:0},records);if(file.productCopyScanId)plan.productCopyScanId=file.productCopyScanId;plan.productMapping={id:mapping.id,approvalDigest:mapping.approved.approvalDigest};plan.productSourceRecords=available.map(r=>({id:r.id,target:r.target,digest:r.digest}));plan.productFieldDecisions=structuredClone(args.boards);return plan;
}
module.exports={mappingRecords,productCopyPlan};
