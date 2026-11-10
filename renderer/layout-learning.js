import {regionsFor} from '../learning-case-regions.cjs';
// Local learning corpus: settled human edits + matching visual evidence.
// This does not run a model, train weights, or alter the user's layout.
import {activeContainerEdits} from '../container-fit.cjs';
import {layoutChanges} from '../layout-learning-signals.cjs';
import {manualStyleFor} from '../layout.cjs';
export const layoutSignature=value=>JSON.stringify(value);
export function learningSnapshot({file,records,fitText}){
 if(!file||file.demo||file.format==='AI'||!/^[a-f0-9]{64}$/i.test(file.fingerprint||''))return null;
 return {layers:file.layers.filter(l=>l.recordId&&!l.skipExport&&!l.issues?.length).map(l=>{
  const r=records.find(r=>r.id===l.recordId);if(!r)return null;const fit=fitText(l,r);
  return {id:l.id,original:l.original,target:typeof l.customText==='string'?l.customText:r.target,recordDigest:r.digest,box:[...(l.sourceBox||l.box)],layoutBox:[...l.box],position:l.position?{...l.position}:undefined,manual:l.manual?manualStyleFor(l):undefined,font:l.font,size:l.size,alignment:l.alignment,containerId:l.containerId,fit:{width:fit.width,height:fit.height,size:fit.size,lines:Array.isArray(fit.lines)?[...fit.lines]:[],leading:fit.leading,tracking:fit.tracking,ascent:fit.ascent},minSize:l.minSize,smart:l.smart?{...l.smart}:undefined};
 }).filter(Boolean),containers:(file.containers||[]).map(c=>({id:c.id,name:c.name,shapeType:c.shapeType,box:[...c.box],radii:c.radii?[...c.radii]:undefined,parentId:c.parentId,stackIndex:c.stackIndex})),containerEdits:activeContainerEdits(file)};
}
export function learningBaselines({file,records,fitText}){
 if(!file?.learningSource?.layers)return null;
 const original=file.learningSource,bindings=file.layers.filter(l=>l.recordId&&!l.skipExport&&!l.issues?.length);
 const stageFile={...file,containers:original.containers||[],containerEdits:[],layers:bindings.map(bound=>{
  const source=original.layers.find(l=>l.id===bound.id&&l.original===bound.original);if(!source)return null;
  // Lock every source typography value so smartFit cannot shrink, wrap or
  // tighten the substitution-only stage. Only the document words change.
  const l=JSON.parse(JSON.stringify(source));for(const key of ['sourceBox','position','customText','manual','containerId','transformSelected'])delete l[key];
  l.recordId=bound.recordId;l.customText=typeof bound.customText==='string'?bound.customText:records.find(r=>r.id===bound.recordId)?.target;l.skipExport=false;l.minSize=l.size;l.smart={allowWrap:false,allowLeading:false,trackingLimit:0};
  const weight=source.fontWeight==='bold'||source.weight==='bold'||source.fauxBold===true||/(?:^|[-_ ])(?:bold|black|heavy)(?:italic|oblique)?(?:mt|psmt)?$/i.test(source.font||'')?'bold':'original';
  l.manual={enabled:true,size:l.size,font:l.font,weight,tracking:l.tracking??0,leading:l.leading||l.size*1.2,stretchX:100,stretchY:100};return l;
 }).filter(Boolean)};
 if(stageFile.layers.length!==bindings.length)return null;
 const sourceRecords=records.map(r=>{const l=stageFile.layers.find(l=>l.recordId===r.id);return {...r,target:l?.original??r.target};});
 // A record can be bound to several source layers whose original texts differ.
 // Use a per-layer record provider rather than choosing one shared original.
 const sourceFile={...stageFile,layers:stageFile.layers.map(l=>({...l,customText:l.original}))};
 return {source:learningSnapshot({file:sourceFile,records:sourceRecords,fitText}),substituted:learningSnapshot({file:stageFile,records,fitText}),file:stageFile};
}
export function installLayoutLearning({state,file,fitText,getVisual,call,document:doc=document,window:win=window,now=()=>Date.now(),delay=1000,maxWait=5000}){
 const pill=doc.createElement('button');pill.type='button';pill.className='learning-pill';pill.id='layoutLearningStatus';pill.setAttribute('aria-expanded','false');pill.title='调整过程仅暂存本机；成功生成 PSD / PSB 后才提交学习成果';
 const popover=doc.createElement('section');popover.className='learning-popover';popover.id='layoutLearningDetails';popover.hidden=true;popover.setAttribute('aria-label','本机排版学习记录');
 const title=doc.createElement('b');title.textContent='排版学习资料 · 本地待提交';const detail=doc.createElement('p');detail.textContent='仅学习位置、换行、字号及容器等排版调整，不学习文案改写。原稿、使用当前文案的替换基线和最终排版仅作视觉参考；生成 PSD / PSB 达到成功条件后才提交。完整排版资料保存在本机；配置云服务后，仅在有效授权下同步排版参数摘要，PSD 和图片不上传。';
 const status=doc.createElement('p');status.setAttribute('role','status');const pause=doc.createElement('button');pause.type='button';const folder=doc.createElement('button');folder.type='button';folder.textContent='打开记录文件夹';const actions=doc.createElement('div');actions.append(pause,folder);popover.append(title,detail,status,actions);
 (doc.querySelector('footer')||doc.body).append(pill);doc.body.append(popover);pill.setAttribute('aria-controls',popover.id);
 let paused=false;try{paused=win.localStorage.getItem('PSD-Lingo-layout-learning-paused')==='true';}catch{}
 let before=null,pending=null,timer=null,busy=false,total=0,phase='等待手动调整',lastError='',cloudMessage='',draftTotal=0,disposed=false,saveQueue=Promise.resolve(),queued=0;
 const baselines=new Map();
 const context=()=>{const f=file();return f?{fileFingerprint:f.fingerprint,width:f.width,height:f.height,documentDigest:state.docFingerprint||'',batchLanguage:String(state.docName||'').split(/[\\/]/).pop()}:null;};
 function paint(){if(cloudMessage)detail.textContent='完整排版资料保存在本机。'+cloudMessage+'。云端摘要保留原稿、替换基线、最终排版三个阶段的尺寸和排版参数。';pill.textContent='排版学习 · '+(paused?'已暂停':phase)+(total?' · '+total+' 条':'');pause.textContent=paused?'继续记录':'暂停记录';pill.dataset.state=paused?'paused':busy?'saving':pending?'pending':'ready';status.textContent=paused?'已暂停，不再采集新操作。':lastError?'记录未保存：'+lastError:'已提交 '+total+' 条成果，'+draftTotal+' 个项目草稿仅暂存本机。'+(pending?'等待排版与背景稳定。':'成功生成 PSD / PSB 后才会成为学习成果。');}
 function snapshot({captureStages=false}={}){const f=file(),data=learningSnapshot({file:f,records:state.records,fitText});if(!data)return null;const c=context(),id=layoutSignature([f.fingerprint,c.documentDigest,c.batchLanguage,data.layers.map(l=>[l.id,l.recordDigest,l.target])]);
  if(!baselines.has(id)){const baseline=learningBaselines({file:f,records:state.records,fitText});if(baseline){baselines.set(id,baseline);if(baselines.size>24)baselines.delete(baselines.keys().next().value);}}
  const baseline=baselines.get(id);const regions=captureStages&&baseline?regionsFor(baseline.source,baseline.substituted,data,f.width,f.height).slice(0,24).map(r=>({...r,source:getVisual?.({stage:'source',baseline:baseline.file,crop:r.crop}),substituted:getVisual?.({stage:'substituted',baseline:baseline.file,crop:r.crop}),final:getVisual?.({stage:'final',crop:r.crop})})):[];return {projectId:f.fingerprint,context:c,data,regions,visual:getVisual?.()||null,baseline,sourceVisual:captureStages&&baseline?getVisual?.({stage:'source',baseline:baseline.file})||null:null,substitutedVisual:captureStages&&baseline?getVisual?.({stage:'substituted',baseline:baseline.file})||null:null};}
 function begin(){if(paused||disposed)return;before=snapshot();if(before){const f=file();before.layoutFile=JSON.parse(JSON.stringify({fingerprint:f.fingerprint,demo:f.demo,layers:f.layers,containers:f.containers,containerEdits:f.containerEdits}));}}
 function learningFailure(error){before=null;pending=null;clearTimeout(timer);phase='记录失败，可继续编辑';lastError=error.message;paint();}
 const observe=fn=>(...args)=>{try{return fn(...args);}catch(error){learningFailure(error);}};
 function schedule(){clearTimeout(timer);timer=win.setTimeout(()=>flush().catch(learningFailure),delay);}
 function commit({reason='manual'}={}){
  if(paused||disposed)return;const start=before;before=null;const after=snapshot({captureStages:true});
  if(!start||!after||start.projectId!==after.projectId||layoutSignature(start.context)!==layoutSignature(after.context)||layoutSignature(start.data)===layoutSignature(after.data))return;
  if(!['manual','undo','redo'].includes(reason))return;
  // A rejected draft is not a positive style example; cancel queued learning
  // on undo. A deliberate redo is a new settled confirmation.
  if(reason==='undo'){pending=null;clearTimeout(timer);phase='已撤回，未采集';paint();return;}
  const comparable=pending&&pending.after.projectId===after.projectId&&layoutSignature(pending.after.context)===layoutSignature(after.context)?pending.before:start;
  if(!layoutChanges(comparable.data,after.data).changed){
   // A copy edit invalidates older pending visuals; it is not a layout lesson.
   if(pending){pending=null;clearTimeout(timer);phase='文案变更不计入排版学习';paint();}return;
  }
  if(pending&&(pending.after.projectId!==after.projectId||layoutSignature(pending.after.context)!==layoutSignature(after.context))){const old=pending;pending=null;void enqueueSave(old);}
  const initial=pending?.before||start;
  if(initial.layoutFile){
   const wording=new Map(after.data.layers.map(l=>[String(l.id),l.target]));
   const changed=initial.data.layers.some(l=>wording.has(String(l.id))&&wording.get(String(l.id)).replace(/[\r\n]/g,'')!==l.target.replace(/[\r\n]/g,''));
   if(changed){
    const rebased=JSON.parse(JSON.stringify(initial.layoutFile));for(const l of rebased.layers)if(wording.has(String(l.id)))l.customText=wording.get(String(l.id));
    initial.data=learningSnapshot({file:rebased,records:state.records,fitText});initial.visual=null;
   }
  }
  pending={before:initial,after,reason,created:now()};phase='整理调整记录';paint();schedule();
 }
 function enqueueSave(item){queued++;busy=true;const result=saveQueue.then(()=>save(item));saveQueue=result.catch(()=>{}).finally(()=>{queued--;busy=queued>0;paint();});return saveQueue;}
 async function save(item){
  if(disposed||paused)return;phase='暂存调整草稿';lastError='';paint();
  try{const a=item.after.visual,b=item.before.visual,quality=a?.quality==='native-background'?'native-background':'estimated';
   const baseline=item.after.baseline,source=item.after.sourceVisual,substituted=item.after.substitutedVisual;
   const result=await call('recordLayoutSample',{version:1,projectId:item.after.projectId,context:item.after.context,before:item.before.data,after:item.after.data,reason:item.reason,...(baseline?{stages:{source:baseline.source,substituted:baseline.substituted,final:item.after.data}}:{}),visual:{regions:item.after.regions||[],...(b?.dataURL?{before:b.dataURL,beforeCrop:b.crop}:{}),...(a?.dataURL?{after:a.dataURL,afterCrop:a.crop}:{}),...(source?.dataURL?{source:source.dataURL,sourceCrop:source.crop}:{}),...(substituted?.dataURL?{substituted:substituted.dataURL,substitutedCrop:substituted.crop}:{}),stageQuality:{source:source?.quality||'unavailable',substituted:substituted?.quality||'unavailable'},...(substituted?.provenance?{stageProvenance:{substituted:substituted.provenance}}:{}),quality,...(a?.provenance?{provenance:a.provenance}:{})}});
   total=result.total;draftTotal=result.draftTotal||0;phase=result.staged?'草稿已暂存，等待 PSD 导出':result.saved?(result.visualQuality==='native-background'?'已记录排版与预览':'已记录参数，预览未确认'):'记录已存在';
  }catch(e){phase='记录失败，可继续编辑';lastError=e.message;}finally{paint();}
 }
 async function flush(force=false){
  clearTimeout(timer);if(!pending||paused||disposed)return;if(busy){schedule();return;}
  const item=pending,current=snapshot({captureStages:true});
  if(current&&item.after.projectId===current.projectId&&layoutSignature(item.after.context)===layoutSignature(current.context)&&layoutSignature(item.after.data)===layoutSignature(current.data)){item.after.regions=current.regions;item.after.visual=current.visual;item.after.sourceVisual=current.sourceVisual;item.after.substitutedVisual=current.substitutedVisual;}
  if(!force&&item.after.visual?.quality!=='native-background'&&now()-item.created<maxWait){phase='等待预览更新';paint();schedule();return;}
  pending=null;await enqueueSave(item);if(pending)schedule();
 }
 function rendered(){if(pending&&!busy&&now()-pending.created>=delay&&getVisual?.({thumbnail:false})?.quality==='native-background')void flush().catch(learningFailure);}
 pill.onclick=()=>{popover.hidden=!popover.hidden;pill.setAttribute('aria-expanded',String(!popover.hidden));};
 pause.onclick=()=>{paused=!paused;try{win.localStorage.setItem('PSD-Lingo-layout-learning-paused',String(paused));}catch{}if(paused){before=null;pending=null;clearTimeout(timer);}phase='等待手动调整';paint();};
 folder.onclick=async()=>{try{await call('openLayoutMemory');}catch(e){status.textContent=e.message;}};
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popover.hidden){popover.hidden=true;pill.setAttribute('aria-expanded','false');pill.focus();}});
 void call('layoutMemoryStatus').then(result=>{total=result.total||0;draftTotal=result.draftTotal||0;cloudMessage=result.cloud?.message||'';paint();}).catch(()=>{phase='暂不可记录';paint();});paint();
 async function refreshStatus(outcome){if(disposed)return;if(outcome?.pending||outcome?.skipped){phase=outcome.pending?'PSD 已生成，后台整理学习记录':'PSD 已生成，本次跳过学习';paint();return;}try{const result=await call('layoutMemoryStatus');if(disposed)return;total=result.total||0;draftTotal=result.draftTotal||0;cloudMessage=result.cloud?.message||'';phase=outcome?.error?'本次学习提交失败':outcome?.operationComplete?'本次完整操作已记录':outcome?.cancelled||outcome?.incomplete?'本次未完成，草稿已保留':outcome?.widespreadError?'本次未提交，草稿已保留':outcome?'本次无匹配成果，草稿已保留':'等待 PSD 导出';if(outcome?.error)lastError=outcome.error;else lastError='';}catch(e){lastError=e.message;phase='学习状态读取失败，可继续编辑';}paint();}
 const unsubscribe=win.desktop?.onLearningProgress?.(value=>{void refreshStatus(value.outcome).catch(learningFailure);});
 return {begin:observe(begin),commit:observe(commit),rendered:observe(rendered),flush:async(...args)=>{try{return await flush(...args);}catch(error){learningFailure(error);}},discardPending(){before=null;pending=null;clearTimeout(timer);phase='等待手动调整';paint();},async prepareExport(){try{await saveQueue;await flush(true);await saveQueue;}catch(error){learningFailure(error);}},refreshStatus,dispose(){disposed=true;clearTimeout(timer);unsubscribe?.();pill.remove();popover.remove();},getStatus:()=>({paused,total,pending:!!pending,busy,phase})};
}
