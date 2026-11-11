// Completed gestures form one entry; selecting an old entry never destroys redo.
const reasonLabels={'ai-text-create':'AI 新增可编辑文字','ai-text-presence':'AI 隐藏／清除／恢复文字','ai-artwork-visibility':'AI 隐藏／恢复重复对象','ai-copy-edit':'AI 文案合并与改字','ai-design-layout':'AI 设计排版','ai-binding':'AI 绑定文案','visual-layout':'自动适配排版','container-extraction':'拆分容器','container-resize':'调整容器大小','container-move':'移动容器','container-radius':'调整容器圆角'};
const controlLabels={editSize:'修改字号',editFont:'修改字体',editWeight:'修改字重',editTracking:'调整字间距',editLeading:'调整行间距',editX:'移动文字横坐标',editY:'移动文字纵坐标',allowWrap:'调整自动换行',replacementZoom:'缩放替换预览',zoomIn:'放大画布',zoomOut:'缩小画布',fit:'显示全图',centerOriginal:'原稿画布居中',centerReplacement:'替换画布居中',replacementSelection:'变换文字',resizeText:'缩放文字',replacementViewport:'移动文字／画布',viewport:'选择文字／移动画布',saveInlineText:'修改文案',inlineTextValue:'修改文案'};
export function installHistory({read,write,context,notify=()=>{},onBegin=()=>{},onCommit=()=>{}}){
 let entries=[],cursor=0,pending=null,pendingLabel='',dragging=false,timer,restoring=false,key=context(),nextId=0;
 const listeners=new Set(),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const ignored=e=>Boolean(e.target?.closest?.('[data-history-ui],#undoEdit,#redoEdit'));
 function ensure(){const next=context();if(next!==key){key=next;entries=[];cursor=0;pending=null;pendingLabel='';}if(!entries.length)entries=[{id:++nextId,label:'初始状态',snapshot:read(),time:Date.now()}];}
 function view(){return {entries:entries.map((e,index)=>({id:e.id,index,label:e.label,time:e.time,current:index===cursor,future:index>cursor})),cursor,canUndo:cursor>0,canRedo:cursor<entries.length-1,limit:50};}
 function emit(){for(const fn of listeners)try{fn(view());}catch{}}
 function labelFor(event){const el=event.target?.closest?.('[id]'),id=el?.id||'';if(controlLabels[id])return controlLabels[id];if(event.type==='wheel')return '缩放／移动画布';if(event.type==='keydown')return '微调文字位置';const text=event.target?.closest?.('button,label')?.textContent?.trim().replace(/\s+/g,' ');return text&&text.length<30?text:'编辑排版';}
 function begin(label='编辑排版'){if(restoring)return;ensure();if(!pending){pending=read();pendingLabel=label;try{onBegin();}catch{}}}
 function finish(reason='manual'){clearTimeout(timer);if(restoring)return;ensure();if(pending){const before=pending,after=read(),label=reasonLabels[reason]||pendingLabel||'编辑排版';pending=null;pendingLabel='';if(!equal(before,after)){entries=entries.slice(0,cursor+1);entries.push({id:++nextId,label,snapshot:after,time:Date.now()});if(entries.length>51)entries.shift();cursor=entries.length-1;try{onCommit({before,after,reason,label});}catch{}emit();}}}
 function restore(index,reason='history'){finish();ensure();index=Number(index);if(!Number.isInteger(index)||index<0||index>=entries.length||index===cursor)return false;const before=read(),after=entries[index].snapshot;restoring=true;try{onBegin();write(JSON.parse(JSON.stringify(after)));cursor=index;onCommit({before,after,reason,label:reason});}finally{restoring=false;}emit();return true;}
 function step(redo=false){finish();ensure();if(!restore(cursor+(redo?1:-1),redo?'redo':'undo')){notify(redo?'没有可重做的操作':'没有可撤回的操作');return;}notify(redo?'已重做':'已撤回');}
 const inline=e=>e.target?.closest?.('#inlineTextValue');
 document.addEventListener('pointerdown',e=>{if(e.button!==0||inline(e)||ignored(e))return;finish();begin(labelFor(e));dragging=true;},true);
 window.addEventListener('pointerup',()=>{dragging=false;setTimeout(finish,0);},true);
 window.addEventListener('pointercancel',()=>{dragging=false;setTimeout(finish,0);},true);
 for(const type of ['click','change'])document.addEventListener(type,e=>{if(inline(e)||ignored(e))return;begin(labelFor(e));setTimeout(()=>{if(!dragging)finish();},0);},true);
 // Canvas zoom and scrolling change only the viewport. They are navigation
 // state, so they must never create an edit entry or truncate redo history.
 document.addEventListener('keydown',e=>{if(document.querySelector('#agentDialog[open]')||e.target?.closest?.('#bulkReplaceDialog,#skuWorkflowDialog'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!inline(e)){e.preventDefault();e.stopImmediatePropagation();step(e.shiftKey);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!inline(e)){e.preventDefault();step(true);}else if(ignored(e))return;else if(e.target?.id==='replacementViewport'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){begin(labelFor(e));setTimeout(finish,0);}else if(inline(e)&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){begin('修改文案');setTimeout(finish,0);}},true);
 window.addEventListener('blur',()=>{dragging=false;finish();});
 return {undo:()=>step(),redo:()=>step(true),transaction:(action,reason='manual')=>{finish();begin(reasonLabels[reason]||'编辑排版');try{return action();}finally{finish(reason);}},goTo:index=>restore(index),getEntries:()=>{ensure();return view();},subscribe:fn=>{ensure();listeners.add(fn);fn(view());return()=>listeners.delete(fn);},refresh:()=>{const previous=key;ensure();if(previous!==key)emit();}};
}
