// Render candidates on a private workspace; commit only reviewed relationship groups.
const {repairDesignProposal}=require('./ai-layout-repair.cjs');
const {validateReview}=require('./services/design-visual-review.cjs');
const overlap=(a,b)=>a[0]<b[0]+b[2]-.1&&a[0]+a[2]>b[0]+.1&&a[1]<b[1]+b[3]-.1&&a[1]+a[3]>b[1]+.1;
function focusRequest(request){const selected=request.layers.find(l=>l.layerKey===request.selectedLayerKey),board=selected?.boardBox;if(!board)return request;return {...request,activeBoard:{names:selected.boardNames,box:board},layers:request.layers.filter(r=>r===selected||overlap(r.sourceBox,board)||overlap(r.box,board)),containers:request.containers.filter(c=>overlap(c.box,board))};}
function rowInk(row){const b=row.box,f=row.fit,factor=row.alignment==='center'?.5:row.alignment==='right'?1:0;return [b[0]+Math.max(0,b[2]-(f?.width||b[2]))*factor,b[1],f?.width||b[2],f?.height||b[3]];}
function applyItems(file,items){for(const item of items){Object.assign(file.layers.find(l=>l.id===item.id),item.candidate);if(item.containerEdit){file.containerEdits||=[];const index=file.containerEdits.findIndex(e=>String(e.layerId)===String(item.containerEdit.layerId));if(index<0)file.containerEdits.push(item.containerEdit);else file.containerEdits[index]=item.containerEdit;}}return file;}
function collisionGroups(base,groups,buildRequest,records,fitText){
 let remaining=[...groups],errors=[];
 // Rollback can restore an obstacle: recheck the resulting actual combination.
 for(let n=0;n<=groups.length;n++){
  const file=applyItems(structuredClone(base),remaining.flatMap(g=>g.items));if(!remaining.length)return {groups:remaining,file,errors};
  const request=buildRequest({file,layer:file.layers.find(l=>l.id===remaining[0].items[0].id),records,fitText}),bad=new Set();
  for(const g of remaining)for(const item of g.items){const row=request.layers.find(l=>l.layerKey===String(item.id)),a=rowInk(row);for(const other of request.layers){if(other.layerKey===row.layerKey)continue;if(overlap(a,rowInk(other))){bad.add(g.id);errors.push({layerKey:row.layerKey,reason:'关系组在完整候选画面中与相邻文字冲突：'+other.layerKey});}}}
  if(!bad.size)return {groups:remaining,file,errors};remaining=remaining.filter(g=>!bad.has(g.id));
 }
 return {groups:[],file:structuredClone(base),errors};
}
async function refineVisualLayout({working,targets,records,fitText,call,getVisual,buildRequest,visualCrop,focusIds,isCancelled,progress,maxRounds=3}){
 let current=working,learning,warning;const accepted=new Map(),failures=new Map(),reviews=[];let feedback=[];
 const cancelled=()=>({working,accepted:[],failures:[],cancelled:true});
 progress('context',{indeterminate:true,message:'读取完整文案、画板与视觉关系，候选先渲染后复审。'});
 for(let round=1;round<=maxRounds;round++){
  if(isCancelled())return cancelled();
  const live=targets.map(t=>current.layers.find(l=>l.id===t.id)),request=focusRequest(buildRequest({file:current,layer:live[0],records,fitText}));
  request.focusLayerKeys=live.filter(l=>focusIds?.includes(l.id)).map(l=>String(l.id));request.scope='full';request.visualPlanningVersion=2;request.designReviewVersion=1;request.phase='propose';request.selectedLayerKeys=live.map(l=>String(l.id));request.repairFeedback=feedback;request.reviewedLayerKeys=live.filter(l=>accepted.has(l.id)).map(l=>String(l.id));
  for(const row of request.layers)row.immutable=!request.selectedLayerKeys.includes(row.layerKey);
  progress('visuals',{round,indeterminate:true,message:`第 ${round}/${maxRounds} 轮：准备画板原稿与当前真实画面。`});
  const visuals=await getVisual({file:current,layer:live[0],scope:'full',crop:visualCrop});
  if(isCancelled())return cancelled();
  if(!visuals?.some(v=>v.stage==='current'))throw Error('视觉闭环缺少当前真实预览，未提交提案');
  request.visuals=visuals.filter(v=>['source','current'].includes(v.stage)).slice(0,2);
  progress('request',{round,indeterminate:true,message:`第 ${round}/${maxRounds} 轮：按画板、完整段落和视觉关系组规划。服务未提供中间进度。`});
  let result;try{result=await call('suggestLayout',request);}catch(e){if(isCancelled())return cancelled();throw e;}learning=result.learning;warning=result.warning;
  if(isCancelled())return cancelled();
  feedback=(result.rejected||[]).map(r=>({...r,stage:'parameter-validation'}));const groups=new Map(),defer=(result.proposals||[]).map(p=>String(p.layerKey));
  for(const p of result.proposals||[]){
   progress('measure',{round,current:groups.size,total:targets.length,unit:'项文字',indeterminate:false,message:'逐项测量候选字体与断行；随后检查所有对象同时调整后的组合。'});
   const layer=current.layers.find(l=>String(l.id)===p.layerKey);if(!layer||!request.selectedLayerKeys.includes(p.layerKey))throw Error('视觉规划包含未授权对象');
   const id=p.relationGroup||p.layerKey;if(!groups.has(id))groups.set(id,{id,items:[],keys:[],failed:false,errors:[]});const group=groups.get(id);group.keys.push(p.layerKey);
   const repaired=repairDesignProposal({layer,record:records.find(r=>r.id===layer.recordId),proposal:p,request,fitText,file:current,preserveVisualPlacement:true,deferLayerKeys:defer});
   if(!repaired.ok){group.failed=true;group.errors.push(p.layerKey+'：'+repaired.reason);feedback.push({layerKey:p.layerKey,stage:'font-measurement',reason:repaired.reason});}else group.items.push({id:layer.id,candidate:repaired.candidate,containerEdit:repaired.containerEdit});
  }
  for(const group of groups.values())if(group.failed)for(const key of group.keys)feedback.push({layerKey:key,stage:'relationship-group',reason:'同组提案需联动修正；具体失败对象与原因：'+group.errors.join('；')});
  const staged=collisionGroups(current,[...groups.values()].filter(g=>!g.failed),buildRequest,records,fitText);feedback.push(...staged.errors);
  if(staged.groups.length){
   progress('verify',{round,indeterminate:true,message:`第 ${round}/${maxRounds} 轮：渲染 ${staged.groups.length} 个候选关系组并进行视觉复审。`});
   const after=await getVisual({file:staged.file,layer:staged.file.layers.find(l=>l.id===live[0].id),scope:'full',crop:visualCrop});
   if(isCancelled())return cancelled();
   if(!after?.some(v=>v.stage==='current'))throw Error('候选排版缺少改后真实图像，未应用');
   const reviewRequest={...focusRequest(buildRequest({file:staged.file,layer:staged.file.layers.find(l=>l.id===live[0].id),records,fitText})),scope:'full',visualPlanningVersion:2,designReviewVersion:1,compositionPlan:result.compositionPlan,phase:'review',selectedLayerKeys:request.selectedLayerKeys,pendingGroups:staged.groups.map(g=>({id:g.id,layerKeys:g.keys})),repairFeedback:feedback,visuals:[...request.visuals.filter(v=>v.stage==='source'),...request.visuals.filter(v=>v.stage==='current').map(v=>({...v,stage:'substituted'})),...after.filter(v=>v.stage==='current')].slice(0,3)};
   let reviewed;try{reviewed=await call('suggestLayout',reviewRequest);}catch(e){if(isCancelled())return cancelled();throw e;}if(isCancelled())return cancelled();
   const review=validateReview(reviewed.review,reviewRequest);reviews.push({round,groups:review.groups});
   for(const g of staged.groups){const decision=review.groups.find(v=>v.id===g.id);if(decision.verdict!=='accept')for(const key of g.keys)feedback.push({layerKey:key,stage:'visual-review',reason:decision.reason});}
   const approved=collisionGroups(current,staged.groups.filter(g=>review.groups.find(v=>v.id===g.id).verdict==='accept'),buildRequest,records,fitText);feedback.push(...approved.errors);current=approved.file;
   for(const g of approved.groups)for(const item of g.items){accepted.set(item.id,item);failures.delete(String(item.id));}
  }
  for(const row of feedback)if(!accepted.has(current.layers.find(l=>String(l.id)===row.layerKey)?.id))failures.set(row.layerKey,row.reason);
  for(const layer of live)if(!accepted.has(layer.id)&&!failures.has(String(layer.id)))failures.set(String(layer.id),'AI 未提供经真实画面复审通过的建议');
  if(!result.proposals?.length&&!result.rejected?.length)break;
  const required=focusIds?.length?live.filter(l=>focusIds.includes(l.id)):live;
  if(required.length&&required.every(l=>accepted.has(l.id)))break;
  // Feed actual rendered/measurement failures to a fresh successful planning turn.
  feedback=[...failures].map(([layerKey,reason])=>({layerKey,reason}));
 }
 // Expanded artboard context is allowed to move when needed; it is not a
 // second user request to improve every already-correct object on that board.
 // Keep its rejected proposals visible as diagnostics without marking the
 // requested repair failed. A failed dependent group still marks its focus
 // members failed and cannot commit any member of that group.
 const label=([key,reason])=>(current.layers.find(l=>String(l.id)===key)?.name||key)+'：'+reason;
 const requiredKey=key=>!focusIds?.length||focusIds.some(id=>String(id)===key);
 return {working:current,accepted:[...accepted.values()],failures:[...failures].filter(([key])=>requiredKey(key)).map(label),retainedContext:[...failures].filter(([key])=>!requiredKey(key)).map(label),cancelled:false,learning,warning,visualReview:reviews.length>0,visualReviews:reviews};
}
module.exports={refineVisualLayout,collisionGroups,rowInk};
