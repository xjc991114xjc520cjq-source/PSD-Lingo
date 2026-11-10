const {buildDesignLayoutRequest}=require('./design-layout-context.cjs');
const {repairDesignProposal}=require('./ai-layout-repair.cjs');
const {reconcileTitleSpacing}=require('./design-layout-relations.cjs');
const {refineVisualLayout}=require('./design-visual-refinement.cjs');
const progressStages=[{id:'context',label:'读取原稿与绑定关系'},{id:'visuals',label:'准备原稿和替换后预览'},{id:'request',label:'等待 AI 设计建议'},{id:'measure',label:'实测字体并适配文字与容器'},{id:'verify',label:'检查画布边界与相邻冲突'},{id:'apply',label:'应用修改并选中结果'}];
// Separate known artboards so a contact sheet cannot hide the text being designed.
function boardGroups(file,targets){
 const groups=new Map();for(const l of targets){const names=l.boardNames;if(!Array.isArray(names)||names.length!==1)return [];const name=names[0];if(!groups.has(name))groups.set(name,[]);groups.get(name).push(l.id);}
 if(!groups.size)return [];
 return [...groups].map(([name,ids])=>{const native=targets.find(l=>ids.includes(l.id))?.boardBox;if(native?.length===4&&native.every(Number.isFinite))return {name,ids,crop:[...native]};const boxes=file.layers.filter(l=>l.boardNames?.length===1&&l.boardNames[0]===name).flatMap(l=>[l.sourceBox||l.box,l.position?[l.position.x,l.position.y,l.box[2],l.box[3]]:l.box]).filter(b=>b?.length===4&&b.every(Number.isFinite));const pad=Math.max(...targets.filter(l=>ids.includes(l.id)).map(l=>l.size*3),20);const x=Math.max(0,Math.min(...boxes.map(b=>b[0]))-pad),y=Math.max(0,Math.min(...boxes.map(b=>b[1]))-pad),right=Math.min(file.width,Math.max(...boxes.map(b=>b[0]+b[2]))+pad),bottom=Math.min(file.height,Math.max(...boxes.map(b=>b[1]+b[3]))+pad);return {name,ids,crop:[x,y,right-x,bottom-y]};});
}
async function planAiFile({file,records,fitText,call,getVisual=()=>[],onProgress=()=>{},isCancelled=()=>false,scope='full',layerId,buildRequest=buildDesignLayoutRequest,selectedIds,targetIds,focusIds,visualCrop}){
 const working=JSON.parse(JSON.stringify(file)),accepted=[],failures=[];
 const targets=working.layers.filter(l=>(selectedIds?selectedIds.includes(l.id):targetIds?targetIds.includes(l.id):scope==='full'||String(l.id)===String(layerId))&&l.visible!==false&&!l.skipExport&&!l.issues?.length&&records.some(r=>r.id===l.recordId));
 if(!targets.length)return {working,accepted,failures:['没有可自动排版的已绑定文字。'],cancelled:false};
 const groups=scope==='full'&&!selectedIds?boardGroups(working,targets):[];
 if(groups.length){let current=working,last;const reviews=[],visualReviews=[],retainedContext=[];for(let i=0;i<groups.length;i++){const g=groups[i];if(isCancelled())return {working,accepted:[],failures:[],cancelled:true};last=await planAiFile({file:current,records,fitText,call,getVisual,buildRequest,isCancelled,scope,selectedIds:g.ids,focusIds,visualCrop:g.crop,onProgress:p=>onProgress({...p,board:g.name,boardIndex:i+1,boardTotal:groups.length,message:`画板 ${i+1}/${groups.length}：${p.message||''}`})});if(last.cancelled)return {...last,accepted:[]};current=last.working;accepted.push(...last.accepted);failures.push(...last.failures);retainedContext.push(...(last.retainedContext||[]));visualReviews.push(...(last.visualReviews||[]).map(r=>({...r,board:g.name})));reviews.push({board:g.name,accepted:last.accepted.length,failures:last.failures.length,retainedContext:last.retainedContext?.length||0});}return {...last,working:current,accepted,failures,boards:reviews,visualReviews,retainedContext};}
 const progress=(stage,data={})=>onProgress({phase:stage==='request'||stage==='context'?'running':stage==='visuals'?'preparing':stage==='measure'?'measuring':'verifying',stage,stageLabel:progressStages.find(s=>s.id===stage)?.label,stages:progressStages,targetCount:targets.length,...data});
 if(scope==='full')return refineVisualLayout({working,targets,records,fitText,call,getVisual,buildRequest,visualCrop,focusIds,isCancelled,progress});
 progress('context',{indeterminate:true,message:`正在读取 ${targets.length} 项已绑定文字、原稿位置、容器与对齐关系。`});
 const request=buildRequest({file:working,layer:targets[0],records,fitText});request.scope=scope;request.selectedLayerKeys=targets.map(l=>String(l.id));
 for(const row of request.layers)row.immutable=!request.selectedLayerKeys.includes(row.layerKey);
 progress('visuals',{indeterminate:true,message:'正在准备原稿与替换后预览；保留同一画布坐标作为设计参照。'});
 const visual=await getVisual({file:working,layer:targets[0],scope,crop:visualCrop}),vs=Array.isArray(visual)?visual:visual?[{...visual,stage:visual.stage||'current'}]:[];
 request.visuals=vs.filter(v=>v.dataURL&&['native-background','original-source'].includes(v.quality)).slice(0,2);
 if(isCancelled())return {working,accepted:[],failures:[],cancelled:true};
 progress('request',{indeterminate:true,message:`已提交 ${targets.length} 项文字与 ${request.visuals.length} 张预览。正在等待 AI 返回整页设计建议；服务未提供中间进度。`});
 let result;try{result=await call('suggestLayout',request);}catch(error){if(isCancelled())return {working,accepted:[],failures:[],cancelled:true};throw error;}
 if(isCancelled())return {working,accepted:[],failures:[],cancelled:true};
 for(let i=0;i<targets.length;i++){
  if(isCancelled())return {working,accepted:[],failures:[],cancelled:true};
  const active=targets[i],p=result.proposals?.find(p=>String(p.layerKey)===String(active.id));
  progress('measure',{current:i,total:targets.length,unit:'项文字',indeterminate:false,message:`正在处理 ${i+1}/${targets.length}：${active.name||active.id}。实测本机字体，核对完整文案、换行和背景容器。`});
  if(!p){const rejected=result.rejected?.find(r=>String(r.layerKey)===String(active.id));failures.push((active.name||active.id)+'：'+(rejected?.reason||'AI 未提供安全建议'));continue;}
  const localRequest=buildRequest({file:working,layer:active,records,fitText});
  const repaired=repairDesignProposal({layer:active,record:records.find(r=>r.id===active.recordId),proposal:p,request:localRequest,fitText,file:working,preserveVisualPlacement:!!result.learning?.library?.some(f=>f.status==='active')});
  if(!repaired.ok){failures.push((active.name||active.id)+'：'+repaired.reason);continue;}
  Object.assign(active,repaired.candidate);if(repaired.containerEdit){working.containerEdits||=[];const index=working.containerEdits.findIndex(e=>e.layerId===repaired.containerEdit.layerId);if(index<0)working.containerEdits.push(repaired.containerEdit);else working.containerEdits[index]=repaired.containerEdit;}
  accepted.push({id:active.id,candidate:repaired.candidate,containerEdit:repaired.containerEdit});
  progress('measure',{current:i+1,total:targets.length,unit:'项文字',indeterminate:false,message:`已检查 ${i+1}/${targets.length}：${active.name||active.id}。本机容纳与边界检查通过；对齐、留白及美感仍需查看改后渲染。`});
 }
 if(!result.learning?.library?.some(f=>f.status==='active'))reconcileTitleSpacing({request,working,accepted,records,fitText});
 progress('verify',{current:targets.length,total:targets.length,unit:'项文字',indeterminate:false,message:`技术检查完成：${accepted.length} 项建议可预览，${failures.length} 项保留当前排版；最终视觉效果待检查。`});
 return {working,accepted,failures,cancelled:false,visualReview:result.visualReview,learning:result.learning,warning:result.warning};
}
module.exports={planAiFile,progressStages,boardGroups};



