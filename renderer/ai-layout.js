import {planAiFile} from '../design-layout-planner.cjs';
export function installAiLayout({$,state,file,layer,record,fitText,buildRequest,getVisual=()=>null,call,history,render,toast,openSettings,onProgress=()=>{},onSelecting=()=>{},onApplied=()=>{}}){
 const scope=document.createElement('select');scope.id='aiLayoutScope';scope.className='compact';scope.setAttribute('aria-label','AI 设计排版范围');
 for(const [value,text]of [['current','当前文字'],['full','全文（当前原稿）']]){const o=document.createElement('option');o.value=value;o.textContent=text;scope.append(o);}
 const button=document.createElement('button');button.type='button';button.id='codexLayout';button.className='primary compact';button.textContent='AI 设计排版';
 button.title='每次读取最新本机学习库并检索历史案例，对比原稿与当前预览；保留文案与字体，按实际字形和画面处理层级及留白。可 Ctrl+Z 撤回。';
 $('adaptCurrent').after(scope,button);
 let busy=false,cancelled=false;
 const signature=f=>JSON.stringify({layers:f.layers,containers:f.containers,edits:f.containerEdits,records:state.records});
 // Compare editable layout, excluding source provenance added during analysis.
 const layoutSignature=l=>JSON.stringify({box:l.box,position:l.position||{x:l.box[0],y:l.box[1]},alignment:l.alignment||'left',manual:l.manual||{},smart:l.smart||{},textLayout:l.textLayout||null});
 const cancel=()=>{cancelled=true;onProgress({phase:'cancelling',message:'正在取消，本轮建议不会应用。',cancellable:false});if(busy)Promise.resolve().then(()=>call('cancelCodex')).catch(()=>{});};
 button.onclick=async()=>{
  if(busy)return;const f=file(),l=layer(),r=record(l?.recordId),full=scope.value==='full';
  if(!f||(!full&&(!l||!r||l.skipExport))){toast('先选择已绑定文案的文字层。',true);return;}
  const targets=f.layers.filter(row=>(full||row===l)&&row.visible!==false&&!row.skipExport&&!row.issues?.length&&record(row.recordId));
  if(!targets.length){toast('当前原稿没有可排版的已绑定文字。',true);return;}
  const local=state.settings.mode==='local';if(local?!state.settings.executable:(!state.settings.hasApiKey||!(state.settings.apiModel||state.settings.model))){await openSettings();return;}
  const snapshot=signature(f),files=state.files,working=JSON.parse(JSON.stringify(f)),accepted=[],failures=[];
  busy=true;cancelled=false;button.disabled=true;scope.disabled=true;button.setAttribute('aria-busy','true');
  try{
   const outcome=await planAiFile({file:f,records:state.records,fitText,call,getVisual,buildRequest,scope:full?'full':'current',layerId:l?.id,isCancelled:()=>cancelled,onProgress:p=>onProgress({...p,cancellable:true,cancel})});
   if(outcome.cancelled)cancelled=true;
   for(const item of outcome.accepted)accepted.push({original:f.layers.find(row=>row.id===item.id),candidate:item.candidate,containerEdit:item.containerEdit});
   failures.push(...outcome.failures);working.containerEdits=outcome.working.containerEdits;
   if(cancelled){onProgress({phase:'cancelled',message:'已取消，本轮建议均未应用。',cancellable:false});toast('已取消 AI 设计，本轮建议均未应用。');return;}
   if(state.files!==files||!state.files.includes(f)||signature(f)!==snapshot)throw Error('项目已改变，本次建议未应用。');
   const changed=accepted.filter(item=>layoutSignature(item.original)!==layoutSignature(item.candidate));
   const changedContainerIds=[...new Set(accepted.filter(item=>item.containerEdit&&JSON.stringify((f.containerEdits||[]).find(e=>String(e.layerId)===String(item.containerEdit.layerId)))!==JSON.stringify(item.containerEdit)).map(item=>item.containerEdit.layerId))];
   const applied={file:f,changedLayerIds:changed.map(item=>item.original.id),changedContainerIds,acceptedLayerIds:accepted.map(item=>item.original.id),failures};
   if(changed.length||changedContainerIds.length){
    onProgress({phase:'applying',stage:'apply',stageLabel:'应用修改并选中结果',current:changed.length,total:changed.length,unit:'项文字',message:`正在应用 ${changed.length} 项文字与 ${changedContainerIds.length} 个容器的修改，并选中变更内容。`,cancellable:false});
    history.transaction(()=>{for(const item of changed)Object.assign(item.original,item.candidate);if(changedContainerIds.length)f.containerEdits=working.containerEdits;state.checked=false;onSelecting(applied);},'ai-design-layout');render();onApplied(applied);
   }
   const message=changed.length||changedContainerIds.length?`AI 设计完成：已调整 ${changed.length} 项文字、${changedContainerIds.length} 个容器；修改内容已高亮，可 Ctrl+Z 撤回。`:'AI 设计检查完成：没有产生实际排版修改，当前排版已保留。';
   const learning=outcome.learning;const referenceDetail=learning?(learning.scope==='all-archived-history'?`\nGitHub 全历史参考库 ${learning.total} 组；本次向 AI 提供 ${learning.references.length} 组完整案例。${learning.references.map(r=>r.id.slice(0,12)).join(' / ')}${learning.references.length?'':learning.warning}`:`\n${learning.warning||outcome.warning||''}`):'';
   const libraryDetail=learning?.library?.length?`\n已读取本机学习库 ${learning.library.filter(f=>f.status==='active').length} 份；技术检查不代表视觉通过，请查看改后预览。${learning.sync?.message||''}${(learning.libraryWarnings||[]).join('；')}`:'';
   const detail=message+libraryDetail+referenceDetail+(failures.length?'\n'+failures.join('\n'):'');
   onProgress({phase:'complete',stage:'apply',stageLabel:'设计排版完成',current:targets.length,total:targets.length,unit:'项文字',message:detail,failures,cancellable:false});toast(detail,!!failures.length&&!changed.length&&!changedContainerIds.length);
  }catch(e){if(cancelled){onProgress({phase:'cancelled',message:'已取消，本轮建议均未应用。',cancellable:false});toast('已取消 AI 设计，本轮建议均未应用。');}else{onProgress({phase:'error',message:e.message,cancellable:false});toast(e.message,true);}}finally{busy=false;button.disabled=false;scope.disabled=false;button.textContent='AI 设计排版';button.removeAttribute('aria-busy');}
 };
 return {button,scope,cancel,isBusy:()=>busy};
}
