import {mappingRecords,productCopyPlan} from '../sku-product-copy.cjs';
import {configureArtboards,previewArtboards,exportArtboards} from './agent-artboards.js';
import {captureBindingRequest,applyBindingResult,parameterParts,isParameterValue} from './ai-binding.js';
import {planAiFile} from '../design-layout-planner.cjs';
import {auditDesignFile,deliveryBoardsFor} from '../design-document-audit.cjs';
import {validateArtworkHides} from '../artwork-visibility.cjs';
import {createTextLayer,textActionsFor} from '../native-text-objects.cjs';
import {makeMixedEdit} from '../mixed-text.cjs';
export function createAgentWorkspace({state,call,importOriginal,render,history,fitText,buildRequest,getVisual,makePlan,selectFile,selectedLayer,resetWorkspace}){
 const pageReferences=new Map();
 const inspectedArtwork=new Map();
 const auditsCache=new Map(),layoutsCache=new Map();
 const diagnoses=new Map();
 const snapshot=()=>JSON.stringify({files:state.files,records:state.records,docFingerprint:state.docFingerprint},(key,value)=>['preview','learningSource'].includes(key)?undefined:value);
 const cacheContext=async()=>{const value=await call('agentCacheContext');return value?.taskId&&!value.warnings?.length?JSON.stringify(value):null;};
 const pathKey=p=>String(p).replace(/\\/g,'/').toLowerCase();
 const summary=(args={})=>{const offset=Math.max(0,Math.floor(Number(args.offset)||0)),limit=Math.min(200,Math.max(1,Math.floor(Number(args.limit)||100)));return {files:state.files.map((f,i)=>({fileIndex:i,name:f.name,path:f.path,format:f.format,width:f.width,height:f.height,boards:f.boards||f.artboards||null,artboardPlan:f.artboardPlan||null,totalLayers:f.layers.length,bound:f.layers.filter(l=>l.recordId).length,layers:f.layers.slice(offset,offset+limit).map((l,j)=>({layerKey:i+':'+(offset+j),id:l.id,name:l.name,original:l.original,target:typeof l.customText==='string'?l.customText:state.records.find(r=>r.id===l.recordId)?.target,recordId:l.recordId,box:l.box,boardBox:l.boardBox,boardNames:l.boardNames,group:l.group,capitalization:l.capitalization,font:l.font,size:l.size,visible:l.visible,issues:l.issues,mixedStyleRuns:l.mixedStyleRuns,mixedTextEdit:f.mixedTextEdits?.find(e=>e.layerId===l.id),skipExport:l.skipExport}))})),document:state.docName,totalRecords:state.records.length,records:state.records.slice(offset,offset+limit),offset,limit};};
 function current(index){if(!Number.isInteger(index)||!state.files[index])throw Error('fileIndex 不存在，请先查看 workspace');selectFile(index);return state.files[index];}
 return async function execute(tool,args,model,isCurrent=()=>true){
  if(!isCurrent())throw Error('当前操作已过期，未开始软件修改');
  const agentCall=(name,value)=>call(name,['suggest','suggestLayout'].includes(name)?{...value,assistantModel:model}:value);
  if(tool==='prepare_independent_task'){if(!resetWorkspace)throw Error('工作区隔离接口未就绪');resetWorkspace();pageReferences.clear();inspectedArtwork.clear();auditsCache.clear();layoutsCache.clear();diagnoses.clear();return {prepared:true,files:0,records:0};}
  if(tool==='workspace')return summary(args);
  if(tool==='import_product_mapping'){
   const m=args.mapping,key=m.id+':'+m.approved.approvalDigest;
   if(state.sourceDocument?.productMappingKey===key)return {records:state.records,reused:true};
   if(state.files.some(f=>f.artboardPlan||f.layers.some(l=>l.recordId||l.nativeCreation||l.nativeDisposition)||f.mixedTextEdits?.length))throw Error('已有修改，不能用产品表覆盖；先恢复或新建独立任务');
   const records=mappingRecords(m);history.transaction(()=>{state.records=records;state.docName='已确认产品表';state.docFingerprint=m.workbook.sha256;state.sourceDocument={name:state.docName,records,productMappingKey:key,productMappingId:m.id};state.checked=false;},'product-mapping-import');render();return {records,mappingId:m.id,skippedBoards:m.approved.boards.filter(b=>b.action==='skip'),deletedBoards:m.approved.boards.filter(b=>b.action==='delete')};
  }
  if(['inspect_product_template','configure_product_template'].includes(tool)){
   const f=current(args.fileIndex),m=args.mapping;if(pathKey(f.path)!==pathKey(m.source.path)||state.sourceDocument?.productMappingKey!==m.id+':'+m.approved.approvalDigest)throw Error('请先导入同一原稿与已确认产品表');
   if(f.layers.some(l=>l.recordId||l.nativeCreation||l.nativeDisposition||l.manual||l.position||l.copyAdjustment)||f.containerEdits?.length||f.mixedTextEdits?.length||f.artworkHides?.length)throw Error('已有普通修改，不能叠加产品模板替换');
   if(mappingRecords(m).some(r=>!state.records.some(x=>x.id===r.id&&x.target===r.target&&x.digest===r.digest)))throw Error('批准产品文案已变化，请重新导入');
   const {mapping,templateInput,...templateArgs}=args;
   const result=await agentCall('agentArtboards',{action:'metadata',source:{path:f.path,fingerprint:f.fingerprint},productMapping:m.id,templateFileId:args.templateFileId,templateArgs});if(!isCurrent())throw Error('任务已变化');
   if(tool==='inspect_product_template')return {...result,fileIndex:args.fileIndex};
   history.transaction(()=>{f.artboardPlan=result.plan;f.artboards=result.artboards;state.checked=false;},'product-template-plan');render();return {changed:true,fileIndex:args.fileIndex,scanId:result.plan.productTemplate.scanId,adoptedBoards:result.plan.productTemplate.requests.length,message:'模板替换与逐产品价格计划已保存，可Ctrl+Z；preview及export_files生成副本与最终图片审验'};
  }
  if(tool==='inspect_product_copy'){const f=current(args.fileIndex),m=args.mapping;if(pathKey(f.path)!==pathKey(m.source.path))throw Error('请先导入同一产品原稿');const meta=await agentCall('agentArtboards',{action:'metadata',source:{path:f.path,fingerprint:f.fingerprint},productMapping:m.id,regions:args.regions});if(!isCurrent())throw Error('任务已变化');return {fileIndex:args.fileIndex,scanId:meta.productCopyScanId,boards:meta.artboards,layers:meta.layers,issues:meta.productCopyScanIssues,skipped:meta.productCopyScanSkipped,note:'只深入已采用产品底部文案块的智能对象；整数、小数、货币符号可能是不同对象，不能把整个金额重复写入每段。'};}
  if(tool==='configure_product_copy'){
   const f=current(args.fileIndex),m=args.mapping;if(pathKey(f.path)!==pathKey(m.source.path)||state.sourceDocument?.productMappingKey!==m.id+':'+m.approved.approvalDigest)throw Error('请先导入同一原稿与已确认产品表');
   if(f.layers.some(l=>l.recordId||l.nativeCreation||l.nativeDisposition||l.manual||l.position||l.copyAdjustment)||f.containerEdits?.length||f.mixedTextEdits?.length||f.artworkHides?.length)throw Error('当前有普通修改，不能叠加原位产品改字');
   const next=structuredClone(f),meta=await agentCall('agentArtboards',{action:'metadata',source:{path:f.path,fingerprint:f.fingerprint},productMapping:m.id,regions:args.regions});Object.assign(next,{layers:meta.layers,artboards:meta.artboards,productCopyScanId:meta.productCopyScanId});const plan=productCopyPlan(next,m,args,state.records);if(!isCurrent())throw Error('任务已变化');history.transaction(()=>{f.layers=next.layers;f.artboards=next.artboards;f.productCopyScanId=next.productCopyScanId;f.artboardPlan=plan;state.checked=false;},'product-copy-plan');render();return {changed:true,fileIndex:args.fileIndex,artboardPlan:plan,message:'原位文案计划已保存；原稿未改，全部画板位置与其他对象保留，需真实预览及另存审验'};
  }
  if(state.sourceDocument?.productMappingId&&['configure_artboards','rename_artboards','arrange_artboards','bind_copy','auto_bind','edit_text','edit_mixed_text','create_text','set_text_presence','set_artwork_visibility','design_layout','import_document'].includes(tool))throw Error('当前为产品表原位改字，请用configure_product_copy或configure_product_template修改已确认字段，避免串产品或改动主图');
  if(tool==='inspect_artboards'){const f=current(args.fileIndex);if(!['PSD','PSB'].includes(f.format))throw Error('原生PS画板检查仅支持PSD/PSB');const meta=await agentCall('agentArtboards',{action:'metadata',source:{path:f.path,fingerprint:f.fingerprint}});if(!isCurrent())throw Error('任务已变化');return {fileIndex:args.fileIndex,width:meta.width,height:meta.height,boards:meta.artboards,layers:meta.layers.map(l=>({id:l.id,name:l.name,original:l.original,boardId:l.boardId,boardNames:l.boardNames,box:l.box,issues:l.issues,mixedStyleRuns:l.mixedStyleRuns?.map(({signature,...s})=>s)}))};}
  if(tool==='configure_artboards'||tool==='rename_artboards'||tool==='arrange_artboards'){const f=current(args.fileIndex);const next=structuredClone(f);if(args.restore!==true&&(!next.artboards||next.layers.some(l=>!l.nativePath))){const meta=await agentCall('agentArtboards',{action:'metadata',source:{path:f.path,fingerprint:f.fingerprint}});if(f.layers.some(l=>l.recordId||l.nativeCreation||l.nativeDisposition))throw Error('已有普通文字修改，请先撤回后配置画板');if(next.layers.length!==meta.layers.length||next.layers.some(l=>!meta.layers.some(n=>n.id===l.id&&n.original===l.original)))throw Error('当前导入与PS原生文字结构不一致，请重新导入后配置画板');Object.assign(next,{layers:next.layers.map(l=>meta.layers.find(n=>n.id===l.id)),artboards:meta.artboards});}configureArtboards(next,{...args,renameOnly:tool==='rename_artboards',arrangeOnly:tool==='arrange_artboards'},state.records);if(!isCurrent())throw Error('任务已变化');history.transaction(()=>{if(next.artboardPlan){f.artboardPlan=next.artboardPlan;f.layers=next.layers;f.artboards=next.artboards;}else delete f.artboardPlan;state.checked=false;},'ai-artboard-plan');render();return {changed:true,fileIndex:args.fileIndex,artboardPlan:f.artboardPlan||null,message:'画板计划已保存，可Ctrl+Z；preview生成真实原生副本，export_files另存并审验最终文件'};}
  if(['bind_copy','auto_bind','edit_text','edit_mixed_text','design_layout','create_text','set_text_presence'].includes(tool)&&state.files.some(f=>f.artboardPlan))throw Error('当前是画板合成计划；请用configure_artboards更新boards.changes，或restore:true撤回计划后使用普通编辑');
  if(tool==='edit_mixed_text'){
   if(typeof args.layerKey!=='string'||!/^\d+:\d+$/.test(args.layerKey))throw Error('混合文字位置无效');
   const [fi,li]=args.layerKey.split(':').map(Number),f=current(fi),l=f.layers[li];if(f.format!=='AI'||!l)throw Error('混合改字需要AI原生文字');
   if(args.restore===true){if(!f.mixedTextEdits?.some(e=>e.layerId===l.id))return {changed:false};history.transaction(()=>{f.mixedTextEdits=f.mixedTextEdits.filter(e=>e.layerId!==l.id);state.checked=false;},'ai-mixed-text-restore');render();return {changed:true,fileIndex:fi,layerKey:args.layerKey,restored:true};}
   if(l.recordId||f.artworkHides?.some(e=>e.objectId==='t:'+l.id))throw Error('请先解除该对象普通绑定或隐藏，不能叠加两种修改');
   const edit=makeMixedEdit(l,args,state.records),next=[...(f.mixedTextEdits||[]).filter(e=>e.layerId!==l.id),edit];
   if(JSON.stringify(f.mixedTextEdits)===JSON.stringify(next))return {changed:false,target:edit.target};
   if(!isCurrent())throw Error('任务已变化，未应用混合改字');
   history.transaction(()=>{f.mixedTextEdits=next;state.checked=false;},'ai-mixed-text');render();
   return {changed:true,fileIndex:fi,layerKey:args.layerKey,target:edit.target,boardBox:l.boardBox,visualAcceptance:'分段样式映射已保存，可Ctrl+Z。由Illustrator原生预览和导出修改同一文字对象；必须preview所在整页并export_files通过最终图像审验，当前尚未生成文件'};
  }
  if(tool==='create_text'){
   const f=current(args.fileIndex),l=createTextLayer(f,args,state.records);if(!isCurrent())throw Error('任务已变化');
   history.transaction(()=>{f.layers.push(l);state.checked=false;},'ai-text-create');render();
   return {changed:true,fileIndex:args.fileIndex,layerKey:args.fileIndex+':'+(f.layers.length-1),boardBox:l.boardBox,boardNames:l.boardNames,visualAcceptance:'新增可编辑文字已进入预览及撤回流程；必须排版、preview审阅并export_files另存原生副本'};
  }
  if(tool==='set_text_presence'){
   if(typeof args.layerKey!=='string'||!/^\d+:\d+$/.test(args.layerKey)||!['hidden','clear','restore'].includes(args.mode)||typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000)throw Error('文字对象处理参数无效');
   const [fi,li]=args.layerKey.split(':').map(Number),f=current(fi),l=f.layers[li];if(l&&args.mode!=='restore'&&isParameterValue(l.original))throw Error('原有参数数值须保留为独立大字，不能隐藏或清除后合入小标签；仅翻译标签，值需翻译但不支持时报告能力缺口');if(!l||l.issues?.length||l.artworkHidden)throw Error('文字不可处理，请检查对象或先恢复artwork隐藏');
   if(!l.presencePrior&&args.mode==='restore')return {changed:false};
   if(!l.nativeCreation&&args.mode!=='restore'&&f.artworkHides?.some(e=>e.objectId==='t:'+l.id))throw Error('文字已由对象隐藏处理');
   history.transaction(()=>{if(args.mode==='restore'){Object.assign(l,l.presencePrior);delete l.presencePrior;delete l.nativeDisposition;delete l.presenceReason;}else{l.presencePrior||={visible:l.visible!==false,skipExport:!!l.skipExport};l.nativeDisposition=args.mode;l.presenceReason=args.reason;l.visible=false;l.skipExport=true;}state.checked=false;},'ai-text-presence');render();
   return {changed:true,fileIndex:fi,layerKey:args.layerKey,boardBox:l.boardBox||[0,0,f.width,f.height],mode:args.mode,visualAcceptance:'仅修改工作区，可Ctrl+Z；clear在导出副本中移除原生文字，原稿不变，需preview和整页审阅'};
  }
  if(['artwork_objects','inspect_artwork','set_artwork_visibility'].includes(tool)){
   const f=current(args.fileIndex);if(f.format!=='AI')throw Error('对象隐藏目前仅支持 AI 文件');
   if(tool==='artwork_objects'){
    const all=f.artworkObjects||[],list=all.filter(o=>args.boardName===undefined||o.boardNames.includes(args.boardName)),offset=Math.max(0,Math.floor(Number(args.offset)||0)),limit=Math.max(1,Math.min(100,Math.floor(Number(args.limit)||40)));
    return {total:list.length,offset,objects:list.slice(offset,offset+limit).map(o=>({...o,hidden:!!f.artworkHides?.some(e=>e.objectId===o.objectId)})),note:all.length?'纯矢量候选不证明是文字或重复；隐藏前必须查看局部对照':'无候选或旧项目未读取此能力，请重新导入该AI副本'};
   }
   const object=f.artworkObjects?.find(o=>o.objectId===args.objectId);if(!object)throw Error('对象不存在或不受支持，请先查看 artwork_objects');
   const textLayer=f.layers.find(l=>l.id===object.layerId);
   if(tool==='set_artwork_visibility'&&args.hidden&&isParameterValue(textLayer?.original))throw Error('原有参数数值须保留字体、字重和主次位置，不能以消重为由隐藏或删除');
   const textPresence=textLayer?{layerKey:args.fileIndex+':'+f.layers.indexOf(textLayer),mode:args.hidden?(args.mode||'hidden'):'restore'}:null;
   const key=f.fingerprint+'|'+object.objectId;
   if(tool==='inspect_artwork'){
    const result=await call('inspectArtwork',{path:f.path,fingerprint:f.fingerprint,objectId:object.objectId});if(!isCurrent())throw Error('任务已变化，本次对象检查已丢弃');
    if(result.object?.sourceIdentity!==object.sourceIdentity)throw Error('对象已变化，请重新导入');inspectedArtwork.set(key,object.sourceIdentity);return {...result,note:'两张图依次为原稿局部和仅隐藏此候选后的局部；不是当前译文成果。检查消失的所有内容是否确实可隐藏。'};
   }
   if(typeof args.hidden!=='boolean'||typeof args.reason!=='string'||!args.reason.trim())throw Error('请明确隐藏或恢复及其依据');
   if(args.hidden&&f.mixedTextEdits?.some(e=>object.objectId==='t:'+e.layerId))throw Error('此对象已有混合改字，不能再隐藏；请先restore原生混合修改');
   if(args.hidden&&inspectedArtwork.get(key)!==object.sourceIdentity)throw Error('隐藏前必须 inspect_artwork 查看真实局部对照');
   const existing=(f.artworkHides||[]).find(e=>e.objectId===object.objectId);if(!!existing===args.hidden&&(!existing||(existing.mode||'hidden')===(args.mode||'hidden')))return {changed:false,hidden:args.hidden,objectId:object.objectId,textPresence};
   if(args.mode!==undefined&&!['hidden','clear'].includes(args.mode))throw Error('对象处理模式无效');
   const edit={objectId:object.objectId,sourceIdentity:object.sourceIdentity,reason:args.reason,...(args.mode==='clear'?{mode:'clear'}:{})};
   const next=(f.artworkHides||[]).filter(e=>e.objectId!==object.objectId);if(args.hidden)next.push(edit);validateArtworkHides(next,{objects:f.artworkObjects,format:f.format,textActions:textActionsFor(f)});
   if(!isCurrent())throw Error('任务已变化，未修改对象可见性');
   history.transaction(()=>{f.artworkHides=next;const l=f.layers.find(l=>l.id===object.layerId);if(l){if(args.hidden){l.artworkHiddenPrior||={skipExport:!!l.skipExport,visible:l.visible!==false};l.skipExport=true;l.visible=false;l.artworkHidden=true;}else{l.skipExport=l.artworkHiddenPrior?.skipExport??false;l.visible=l.artworkHiddenPrior?.visible??true;delete l.artworkHidden;delete l.artworkHiddenPrior;}}state.checked=false;},'ai-artwork-visibility');render();
   return {fileIndex:args.fileIndex,changed:true,hidden:args.hidden,objectId:object.objectId,textPresence,boardNames:object.boardNames,boardBox:object.boardBox,box:object.box,visualAcceptance:'可见性已更新，可Ctrl+Z撤回；必须重新preview所在画板并审阅，export_files后才生成原生副本'};
  }
  if(tool==='edit_text'){
   if(!Array.isArray(args.changes)||!args.changes.length||args.changes.length>500)throw Error('文字编辑列表无效');
   const seen=new Set(),edits=args.changes.map(c=>{
    if(typeof c?.layerKey!=='string'||!/^\d+:\d+$/.test(c.layerKey)||seen.has(c.layerKey))throw Error('文字位置无效或重复');seen.add(c.layerKey);
    const [fi,li]=c.layerKey.split(':').map(Number),l=state.files[fi]?.layers[li];if(!l||l.skipExport||l.issues?.length)throw Error('文字不存在、已跳过或当前不支持编辑：'+c.layerKey);
    if(typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>2000)throw Error('请说明合并或改字依据');
    if(c.text!==undefined&&c.recordIds!==undefined)throw Error('不能同时指定直接改字和文案合并');
    let text,ids;
    if(c.recordIds!==undefined){ids=c.recordIds;if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!state.records.some(r=>r.id===id)))throw Error('合并文案引用无效');const separator=c.separator??'\n';if(!['\n',' ',''].includes(separator))throw Error('合并分隔符无效');text=ids.map(id=>state.records.find(r=>r.id===id).target).join(separator);}
    else{ids=[l.recordId];if(!state.records.some(r=>r.id===l.recordId))throw Error('直接改字需要先绑定参考文案');text=c.text;}
    if(typeof text!=='string'||!text.trim()||text.length>100000)throw Error('目标文案不能为空或超过10万字符');
    if(ids.length===1){const record=state.records.find(r=>r.id===ids[0]),part=parameterParts(state.files[fi],l,record);if(part&&text===record.target)text=part.label;}
    return {l,text,ids,reason:c.reason.trim()};
   });
   if(!isCurrent())throw Error('任务已变化，本次改字未应用');
   history.transaction(()=>{for(const {l,text,ids,reason}of edits){l.recordId=l.recordId||ids[0];l.customText=text;l.copyAdjustment={text,reason,recordIds:[...ids]};}state.checked=false;},'ai-copy-edit');render();
   return {edited:edits.length,visualAcceptance:'文字已更新，仍须排版、查看当前预览并另存副本'};
  }
  if(tool==='import_source'){const matches=f=>pathKey(f.path)===pathKey(args.path);if(!state.files.some(matches))await importOriginal([args.path]);if(!state.files.some(matches))throw Error('原稿未能导入，请检查原生软件提示');const fileIndex=state.files.findIndex(matches),f=current(fileIndex),result=summary();if(typeof getVisual==='function')try{const requireCurrent=f.layers.some(l=>l.recordId&&!l.skipExport&&!l.issues?.length),visuals=await getVisual({file:f,scope:'full',requireCurrent});if(!isCurrent())throw Error('任务已变化');if(visuals?.length&&(!requireCurrent||visuals.some(v=>v.stage==='current')))return {...result,fileIndex,evidence:visuals.map(v=>({stage:v.stage,crop:v.crop,quality:v.quality})),images:visuals.map(v=>v.dataURL)};}catch(e){return {...result,previewNotice:'原稿已导入，自动预览未完成；请单独preview核对：'+e.message};}return result;}
  if(tool==='import_document'){
   const importKey=args.attachmentIdentity?JSON.stringify([pathKey(args.path),args.attachmentIdentity,args.selection]):null;
   if(importKey&&state.sourceDocument?.agentImportKey===importKey)return {name:state.docName,records:state.records,reused:true,message:'同一附件及文案范围已导入，保留现有绑定与调整'};
   if(state.files.some(f=>f.layers.some(l=>l.recordId)||f.mixedTextEdits?.length)&&!args.replaceExisting)throw Error('存在现有绑定或混合改字；需先询问用户是否重新导入并清除绑定，确认后传 replaceExisting:true');
   const d=await call('importDocument',{path:args.path,selection:args.selection});if(d.selectionRequired)return d;
   if(!isCurrent())throw Error('接管已暂停、终止或收到新补充，未替换当前文案');
   state.records=d.records;state.docName=d.name;state.docFingerprint=d.fingerprint;state.sourceDocument={...d,agentImportKey:importKey};state.chosen=null;
   for(const f of state.files)for(const l of f.layers){l.recordId=null;l.suggestedId=null;delete l.customText;delete l.copyAdjustment;}
   for(const f of state.files)f.mixedTextEdits=[];
   state.checked=false;render();return {name:d.name,records:d.records,notices:d.notices||[]};
  }
  if(tool==='auto_bind'||tool==='bind_copy'){
   const capture=captureBindingRequest(state);if(!capture.request.layers.length)return {bound:0,message:'无未绑定文字'};
   const matches=tool==='auto_bind'?(await agentCall('suggest',capture.request)).matches:args.matches;
   if(!isCurrent())throw Error('接管已暂停、终止或收到新补充，过期绑定建议未应用');
   if(!Array.isArray(matches)||matches.length>500)throw Error('绑定列表无效');
   let result;history.transaction(()=>{result=applyBindingResult(state,capture,matches);state.checked=false;},'ai-binding');render();return result;
  }
  if(tool==='preview'){
   const f=current(args.fileIndex);if(f.artboardPlan)return previewArtboards({file:f,args,records:state.records,call:agentCall,isCurrent});const requireCurrent=!!textActionsFor(f).length||!!f.artworkHides?.length||!!f.mixedTextEdits?.length||f.layers.some(l=>l.recordId&&!l.skipExport&&!l.issues?.length);let crop=args.crop;
   if(args.boardName!==undefined){if(crop!==undefined||typeof args.boardName!=='string')throw Error('请选择一个画板或一个局部预览范围');const boxes=f.layers.filter(l=>l.boardNames?.length===1&&l.boardNames[0]===args.boardName).map(l=>l.boardBox).filter(Boolean);if(!boxes.length||boxes.some(b=>JSON.stringify(b)!==JSON.stringify(boxes[0])))throw Error('画板范围不明确，请重新核对 workspace');crop=[...boxes[0]];}
   if(crop!==undefined&&(!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>f.width+.01||crop[1]+crop[3]>f.height+.01))throw Error('局部预览范围无效');
   const visuals=await getVisual({scope:'full',...(crop?{crop}:{}),requireCurrent,retryBackground:args.retry===true});if(!isCurrent())throw Error('预览期间任务已变化，本次预览已丢弃');if(requireCurrent&&!visuals?.some(v=>v.stage==='current'))throw Error('当前译文替换预览缺失，不能用原稿图代替');const list=Array.isArray(visuals)?visuals:[];if(!list.length)throw Error('当前尚无真实预览，请等待原生背景生成后重试');return {fileIndex:args.fileIndex,evidence:list.map(v=>({stage:v.stage,crop:v.crop,quality:v.quality})),images:list.map(v=>v.dataURL)};
  }
  if(tool==='design_layout'){
   const f=current(args.fileIndex),index=f.layers.findIndex(l=>l.recordId&&!l.skipExport);if(index<0)throw Error('当前原稿没有已绑定目标文案');selectedLayer(index);
   if(args.referenceFileIds!==undefined&&(!Array.isArray(args.referenceFileIds)||args.referenceFileIds.length>3||new Set(args.referenceFileIds).size!==args.referenceFileIds.length||args.referenceFileIds.some(id=>typeof id!=='string'||!id)))throw Error('人工参考图列表无效');
   let targetIds,focusIds;
   if(args.layerKeys!==undefined){
    if(!Array.isArray(args.layerKeys)||!args.layerKeys.length||args.layerKeys.length>500||new Set(args.layerKeys).size!==args.layerKeys.length)throw Error('局部复修文字列表无效');
    const requested=args.layerKeys.map(k=>{if(typeof k!=='string'||!/^\d+:\d+$/.test(k))throw Error('复修文字位置无效');const [fi,li]=k.split(':').map(Number),l=f.layers[li];if(fi!==args.fileIndex||!l?.recordId||l.skipExport||l.issues?.length)throw Error('复修文字不属于当前文件或不可编辑：'+k);return l;});
    focusIds=requested.map(l=>l.id);
    const boards=new Set(requested.filter(l=>l.boardNames?.length===1).map(l=>l.boardNames[0]));
    targetIds=f.layers.filter(l=>requested.includes(l)||l.boardNames?.length===1&&boards.has(l.boardNames[0])).map(l=>l.id);
   }
   const context=await cacheContext(),layoutKey=()=>context&&JSON.stringify([context,args.fileIndex,args.layerKeys,args.referenceFileIds,[...pageReferences],snapshot()]);
   if(!isCurrent())throw Error('任务已变化，未开始或复用排版');
   const cached=context&&layoutsCache.get(layoutKey());if(cached&&(!args.replan||!cached.accepted||cached.changed===false))return {...structuredClone(cached),reused:true,...(args.replan&&(!cached.accepted||cached.changed===false)?{stoppedNoProgress:true,message:'相同要求、画面和参考下已有未解决方案；请先根据修改清单作实际调整或补充依据，不重复尝试相同排版。'}:{})};
   const before=JSON.stringify({layers:f.layers,edits:f.containerEdits,records:state.records});
   const diagnosis=diagnoses.get(f.fingerprint),guidance=diagnosis?.identity===JSON.stringify([context,f,state.records])?diagnosis.boards:[];
   const currentVisual=async options=>{const visuals=await getVisual({...options,requireCurrent:true});if(!isCurrent())throw Error('任务已变化，未提交排版');if(!visuals?.some(v=>v.stage==='current'))throw Error('当前译文预览缺失，未向排版服务提交原稿图');return visuals;};
   const layoutCall=(name,value)=>{const board=value.activeBoard?.name||value.activeBoard?.names?.[0]||value.layers.find(l=>l.layerKey===value.selectedLayerKey)?.boardNames?.[0],key=f.fingerprint+'|'+board,ids=args.referenceFileIds??pageReferences.get(key)??[];if(args.referenceFileIds!==undefined)pageReferences.set(key,[...ids]);return agentCall(name,{...value,priorWholePageRepairPlan:guidance.filter(b=>b.board===board).flatMap(b=>b.repairPlan||[]),assistantReferenceIds:ids});};
   const result=await planAiFile({file:f,records:state.records,fitText,call:layoutCall,getVisual:currentVisual,buildRequest,scope:'full',targetIds,focusIds,layerId:f.layers[index].id,isCancelled:()=>!isCurrent(),onProgress:p=>{void call('agentToolProgress',{label:p.message||p.stageLabel||'AI 设计排版',current:p.current,total:p.total}).catch(()=>{});}});
   if(result.cancelled||!isCurrent())throw Error('接管已暂停、终止或收到新补充，过期排版建议未应用');
   if(before!==JSON.stringify({layers:f.layers,edits:f.containerEdits,records:state.records}))throw Error('排版期间项目已变化，本次提案未应用');
   history.transaction(()=>{for(const item of result.accepted)Object.assign(f.layers.find(l=>l.id===item.id),item.candidate);f.containerEdits=result.working.containerEdits;state.checked=false;},'ai-design-layout');render();const response={changed:before!==JSON.stringify({layers:f.layers,edits:f.containerEdits,records:state.records}),accepted:result.accepted.length,failures:result.failures,retainedContext:result.retainedContext||[],visualReviews:result.visualReviews,boards:result.boards,learning:result.learning,warning:result.warning,visualAcceptance:'待查看最终预览及原生导出'};if(context){layoutsCache.set(layoutKey(),structuredClone(response));if(layoutsCache.size>8)layoutsCache.delete(layoutsCache.keys().next().value);}return response;
  }
  if(tool==='export_files'){
   const indices=args.fileIndices===undefined?state.files.map((_,i)=>i):args.fileIndices;if(!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!state.files[i]))throw Error('导出fileIndices无效，请查看workspace');
   const selected=indices.map(i=>state.files[i]);
   if(selected.some(f=>f.artboardPlan)){if(selected.length!==1)throw Error('画板合成文件请单独用fileIndices导出，普通文件另外导出');const context=await cacheContext();return exportArtboards({file:selected[0],records:state.records,call:agentCall,fitText,buildRequest,getVisual,isCurrent,cache:context?auditsCache:null,cacheIdentity:context,forceReview:args.reviewAgain===true});}
   const blocked=selected.flatMap(f=>f.layers.filter(l=>l.recordId&&l.issues?.length&&!l.skipExport).map(l=>({file:f.name,layer:l.name,issues:l.issues})));
   if(blocked.length)return {blocked,exported:false,message:'受限文字未导出；请让用户确认处理方式，不能自行跳过'};
   const before=JSON.stringify({files:state.files,records:state.records}),audits=[],context=await cacheContext();
   const plan=await makePlan({fileIndices:indices});
   if(plan.files.some(p=>!selected.some(f=>pathKey(f.path)===pathKey(p.path))))throw Error('导出计划超出所选文件范围，未开始写入');
   for(const item of plan.files){if(!/\.ai$/i.test(item.path))continue;const f=state.files.find(f=>pathKey(f.path)===pathKey(item.path));item.deliveryBoards=deliveryBoardsFor(f,state.records);if(!item.deliveryBoards.length)throw Error('目标画板归属不明确，未开始最终导出');}
   if(!isCurrent()||before!==JSON.stringify({files:state.files,records:state.records}))throw Error('项目已变化，未开始导出');
   await call('agentToolProgress',{label:'保存原生副本、重开核验并导出目标画板JPG',indeterminate:true});
   const result=await call('agentExport',plan),deliveryStages=[];
   for(const index of indices){
    const f=current(index);if(!f.layers.some(l=>l.recordId&&!l.skipExport)&&!f.artworkHides?.length&&!f.mixedTextEdits?.length&&!textActionsFor(f).length)continue;
    const auditCall=(name,value)=>agentCall(name,{...value,assistantReferenceIds:pageReferences.get(f.fingerprint+'|'+value.activeBoard?.name)||[]});
    const item=plan.files.find(p=>pathKey(p.path)===pathKey(f.path)),native=item&&result.results?.[plan.files.indexOf(item)],requireDelivery=/\.ai$/i.test(f.path);
    deliveryStages.push({file:f.name,nativeSave:native?.output?'saved':'failed',nativeReopen:native?.delivery?.reopened?'passed':'not-verified',jpeg:native?.delivery?.verified?'passed':'not-verified',finalAudit:'pending'});
    const actualVisual=async options=>{const source=(await getVisual({...options,requireCurrent:false,sourceOnly:true})).filter(v=>v.stage==='source');const b=native.delivery.boards.find(b=>options.crop&&options.crop[0]>=b.crop[0]&&options.crop[1]>=b.crop[1]&&options.crop[0]+options.crop[2]<=b.crop[0]+b.crop[2]+.01&&options.crop[1]+options.crop[3]<=b.crop[1]+b.crop[3]+.01);if(!b)throw Error('未找到对应画板的最终JPG');return [...source,await call('agentDeliveryVisual',{output:native.output,boardName:b.name,crop:options.crop})];};
    try{if(requireDelivery&&(!native?.delivery?.verified||native.error))throw Error(native?.error||'没有经过保存重开与完整性核验的JPG，不使用工作区预览冒充最终审验');audits.push({file:f.name,...await auditDesignFile({file:f,records:state.records,fitText,buildRequest,getVisual:requireDelivery?actualVisual:getVisual,requireDelivery,call:auditCall,cache:context?auditsCache:null,cacheIdentity:context+'|'+JSON.stringify([...pageReferences]),forceReview:args.reviewAgain===true,isCancelled:()=>!isCurrent(),onProgress:p=>{void call('agentToolProgress',{...p,label:(requireDelivery?'最终JPG / ':'')+p.label}).catch(()=>{});}})});}
    catch(e){if(!isCurrent())throw e;audits.push({file:f.name,passed:false,failures:['审阅未完成：'+e.message]});}
    deliveryStages.at(-1).finalAudit=audits.at(-1).passed?'passed':'failed';
    diagnoses.set(f.fingerprint,{identity:JSON.stringify([context,f,state.records]),boards:audits.at(-1).boards||[]});if(diagnoses.size>16)diagnoses.delete(diagnoses.keys().next().value);
   }
   if(!isCurrent()||before!==JSON.stringify({files:state.files,records:state.records}))throw Error('最终审阅期间项目已变化；已保存副本保留，审阅结果作废');
   const failures=[...(result.results||[]).filter(r=>r.error).map(r=>r.file+'：'+r.error),...audits.flatMap(a=>a.failures.map(s=>a.file+'：'+s))];
   return {...result,qualityPassed:!result.failed&&!result.uncertain&&audits.length>0&&audits.every(a=>a.passed),audits,failures,deliveryStages,visualAcceptance:failures.length?'已保留现有副本；原生导出或最终整页审验未通过，不能称为制作完成':'已完成目标画板审验；AI使用保存重开后实际导出的JPG，设计通过仍待用户确认'};
  }
  throw Error('未接入的软件工作区操作：'+tool);
 };
}



