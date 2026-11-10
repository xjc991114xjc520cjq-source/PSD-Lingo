// Dismiss passive surfaces without bypassing their existing cancel protections.
export function installOutsideDismiss(doc=document){
 let down=null;
 doc.addEventListener('pointerdown',e=>{down={target:e.target,x:e.clientX,y:e.clientY};});
 doc.addEventListener('pointerup',e=>{
  if(!down||down.target!==e.target||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
  const target=e.target;down=null;
  for(const dialog of doc.querySelectorAll('dialog[open]')){
   const r=dialog.getBoundingClientRect();
   if(target!==dialog||e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)continue;
   if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
  }
  for(const pop of doc.querySelectorAll('.learning-popover'))if(!pop.hidden&&!pop.contains(target)&&!target.closest('#layoutLearningStatus')){pop.hidden=true;doc.getElementById('layoutLearningStatus')?.setAttribute('aria-expanded','false');}
  for(const detail of doc.querySelectorAll('details.export-more[open]'))if(!detail.contains(target))detail.open=false;
 });
}
export function installBindingProgress({host,desktop=window.desktop,call}){
 const box=document.createElement('section');box.className='binding-progress';box.hidden=true;
 const label=document.createElement('span'),bar=document.createElement('progress'),cancel=document.createElement('button');
 label.setAttribute('role','status');bar.max=4;bar.setAttribute('aria-label','AI 文案绑定进度');cancel.type='button';cancel.textContent='取消';box.append(label,bar,cancel);host.append(box);
 let id=null,started=0,timer=null;
 const paint=(value,text,waiting=false)=>{label.textContent=text+' · '+Math.floor((Date.now()-started)/1000)+' 秒';bar.dataset.stage=String(value);if(waiting)bar.removeAttribute('value');else bar.value=value;};
 const stages={prepared:[1,'已整理文案，准备发送'],waiting:[1,'AI 正在查找对应文案'],validated:[2,'已收到并校验结果'],applying:[3,'正在自动绑定']};
 let stage='prepared';const update=s=>{stage=s;const p=stages[s]||stages.prepared;paint(p[0],p[1],s==='waiting');};
 desktop?.onBindingProgress?.(value=>{if(value?.requestId===id&&stages[value.stage])update(value.stage);});
 cancel.onclick=async()=>{cancel.disabled=true;cancel.textContent='正在取消…';try{await call('cancelCodex');}catch{};};
 return {start(){id=globalThis.crypto.randomUUID();started=Date.now();box.hidden=false;cancel.disabled=false;cancel.textContent='取消';update('prepared');clearInterval(timer);timer=setInterval(()=>update(stage),1000);return id;},applying(){update('applying');},finish(ok){clearInterval(timer);id=null;cancel.disabled=true;paint(ok?4:0,ok?'文案绑定完成':'本次绑定已结束');box.hidden=true;},element:box};
}
