// Product dialogs share the application's typography, colors and action styles.
// Native file pickers remain native; application confirmations never use window.confirm.
let confirmationQueue=Promise.resolve();
function node(doc,tag,className,text){const n=doc.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function surface(doc,title,id){
 const previous=doc.activeElement,dialog=node(doc,'dialog','app-dialog');if(id)dialog.id=id;
 const heading=node(doc,'h2','',title),top=node(doc,'div','dialog-top');heading.id=(id||'task')+'Title';top.append(heading);dialog.setAttribute('aria-labelledby',heading.id);dialog.append(top);doc.body.append(dialog);
 return {dialog,close(){Promise.resolve(dialog.close()).then(()=>{dialog.remove();if(previous?.isConnected)previous.focus();});}};
}
export function confirmAction(message,{title='请确认操作',acceptLabel='继续',cancelLabel='取消',danger=false,document:doc=globalThis.document}={}){
 const run=()=>new Promise(resolve=>{
  const s=surface(doc,title,'appConfirmDialog'),body=node(doc,'p','app-dialog-message',message),actions=node(doc,'div','dialog-actions');
  const cancel=node(doc,'button','ghost',cancelLabel),accept=node(doc,'button',danger?'primary danger':'primary',acceptLabel);cancel.id='confirmActionCancel';accept.id='confirmActionAccept';cancel.type=accept.type='button';cancel.autofocus=true;
  let settled=false;function finish(value){if(settled)return;settled=true;s.close();resolve(value);}
  cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);s.dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
  let down=false;s.dialog.addEventListener('pointerdown',e=>{const r=s.dialog.getBoundingClientRect();down=e.target===s.dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);});s.dialog.addEventListener('pointerup',e=>{if(down&&e.target===s.dialog)finish(false);down=false;});
  actions.append(cancel,accept);s.dialog.append(body,actions);s.dialog.showModal();cancel.focus();
 });
 const result=confirmationQueue.then(run,run);confirmationQueue=result.catch(()=>{});return result;
}
export function showTaskProgress({title='正在处理',onCancel,document:doc=globalThis.document}={}){
 const s=surface(doc,title,'appTaskDialog'),message=node(doc,'p','app-dialog-message','正在准备…'),row=node(doc,'div','task-progress-label'),stage=node(doc,'span','', '准备'),count=node(doc,'b','', ''),bar=node(doc,'progress','app-progress'),actions=node(doc,'div','dialog-actions'),cancel=node(doc,'button','ghost','取消任务');
 const steps=node(doc,'ol','task-stage-list'),timing=node(doc,'div','task-progress-timing'),stepCount=node(doc,'span','task-step-count'),elapsed=node(doc,'span','task-elapsed');steps.hidden=true;timing.append(stepCount,elapsed);
 const started=Date.now();let stageStarted=started,activeStage='',definitions=[],lastPhase='',waiting=false;
 const duration=ms=>{const n=Math.max(0,Math.floor(ms/1000)),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return h?`${h} 小时 ${m} 分 ${s} 秒`:m?`${m} 分 ${s} 秒`:`${s} 秒`;};
 const tick=()=>{if(closed)return;elapsed.textContent=(waiting?'等待 AI 已用 '+duration(Date.now()-stageStarted)+' · ':'')+'总用时 '+duration(Date.now()-started);};
 const renderSteps=()=>{
  steps.replaceChildren();steps.hidden=!definitions.length;
  const index=definitions.findIndex(item=>item.id===activeStage),complete=lastPhase==='complete';stepCount.textContent=definitions.length?(complete?`已完成 ${definitions.length} 个步骤`:index>=0?`第 ${index+1} / ${definitions.length} 步`:'正在准备步骤'):'';
  definitions.forEach((item,i)=>{const status=complete||i<index?'done':i===index?'current':'pending',li=node(doc,'li','task-stage '+status),marker=node(doc,'span','task-stage-marker',status==='done'?'✓':String(i+1)),label=node(doc,'span','task-stage-name',item.label),state=node(doc,'small','task-stage-state',status==='done'?'已完成':status==='current'?(lastPhase==='cancelled'?'已取消':lastPhase==='error'?'已停止':'进行中'):'待处理');li.dataset.stage=item.id;li.setAttribute('data-status',status);if(status==='current')li.setAttribute('aria-current','step');li.append(marker,label,state);steps.append(li);});
 };
 bar.max=1;bar.setAttribute('aria-label',title+'进度');message.setAttribute('role','status');message.setAttribute('aria-live','polite');cancel.type='button';cancel.hidden=!onCancel;let cancelling=false,closed=false;
 const requestCancel=async()=>{if(!onCancel||cancel.disabled||cancelling)return;cancelling=true;cancel.disabled=true;cancel.textContent='正在取消…';message.textContent='已请求取消，正在等待当前请求结束…';try{await onCancel();}catch(e){message.textContent='取消未成功：'+e.message;cancelling=false;cancel.disabled=false;cancel.textContent='重试取消';}};
 cancel.onclick=requestCancel;s.dialog.addEventListener('cancel',e=>{e.preventDefault();if(!cancel.hidden)requestCancel();});row.append(stage,count);actions.append(cancel);s.dialog.append(steps,message,row,bar,timing,actions);s.dialog.showModal();
 const timer=setInterval(tick,1000);timer.unref?.();tick();
 s.dialog.addEventListener('close',()=>{closed=true;clearInterval(timer);},{once:true});
 return {update({phase='处理中',stage:stageId,stageLabel,stages,current,total,unit='',indeterminate=false,message:text,cancellable=true}={}){if(closed)return;if(text&&!cancelling)message.textContent=text;if(Array.isArray(stages)&&stages.length)definitions=stages.filter(item=>item&&typeof item.id==='string'&&typeof item.label==='string');if(stageId&&stageId!==activeStage){activeStage=stageId;stageStarted=Date.now();}lastPhase=phase;waiting=stageId==='request'&&indeterminate;stage.textContent=stageLabel||phase;if(!indeterminate&&Number.isFinite(current)&&Number.isFinite(total)&&total>0){bar.value=Math.max(0,Math.min(1,current/total));count.textContent=current+' / '+total+(unit?' '+unit:'');}else{bar.removeAttribute('value');count.textContent=waiting?'等待服务响应':indeterminate?'进行中':'';}renderSteps();tick();cancel.disabled=cancelling||!cancellable;},close(){if(closed)return;closed=true;clearInterval(timer);s.close();},element:s.dialog};
}
