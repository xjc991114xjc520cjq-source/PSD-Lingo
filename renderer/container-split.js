// Selection is in document pixels, so zooming and panning never change its scope.
export function containerSplitRegion(start,end,width,height){
 const clamp=(n,max)=>Math.max(0,Math.min(max,n));
 const a=[clamp(start[0],width),clamp(start[1],height)],b=[clamp(end[0],width),clamp(end[1],height)];
 return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];
}
export function installContainerSplit({$,state,file,toast,extract}){
 const button=$('splitContainers'),toggle=$('splitContainerOptions'),menu=$('splitContainerMenu'),group=$('containerSplitTools');
 const pill=document.createElement('div');pill.id='containerSplitCapsule';pill.className='container-split-capsule';pill.hidden=true;pill.setAttribute('role','group');pill.setAttribute('aria-label','框选区域操作');
 const action=document.createElement('button');action.type='button';action.textContent='拆分范围内的容器';
 const close=document.createElement('button');close.type='button';close.className='split-capsule-close';close.setAttribute('aria-label','取消框选');close.title='取消框选 · Esc';close.innerHTML='<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
 pill.append(action,close);document.body.append(pill);
 const panes=[{stage:$('stage'),viewport:$('viewport'),original:true},{stage:$('replacementStage'),viewport:$('replacementViewport'),original:false}];
 for(const pane of panes){pane.overlay=document.createElement('div');pane.overlay.className='container-split-region';pane.overlay.hidden=true;pane.stage.append(pane.overlay);}
 let mode='region',armed=false,busy=false,drag=null,selection=null,lastFile=file(),space=false;
 const listeners=[];
 const listen=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
 function hideMenu(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function release(){if(drag?.pane.stage.hasPointerCapture?.(drag.id))drag.pane.stage.releasePointerCapture(drag.id);drag=null;}
 function clear(){release();selection=null;pill.hidden=true;for(const p of panes)p.overlay.hidden=true;}
 function cancel(){clear();armed=false;hideMenu();sync();}
 function sync(){const f=file();button.disabled=toggle.disabled=busy||!f||!!f.demo||f.format==='AI';button.classList.toggle('active',armed);button.setAttribute('aria-pressed',String(armed));button.textContent=busy?'正在拆分…':'拆分容器';button.title=f?.format==='AI'?'AI 首版暂不支持 Photoshop 容器拆分':mode==='page'?'识别并拆分当前 PSD 全页的背景容器':'框选一个范围，识别并拆出背景中的矩形容器';for(const p of panes)p.stage.classList.toggle('container-split-armed',armed);action.disabled=close.disabled=busy;action.textContent=busy?'正在识别并拆分…':'拆分范围内的容器';for(const option of menu.querySelectorAll('[data-split-scope]'))option.setAttribute('aria-checked',String(option.dataset.splitScope===mode));}
 function update(){if(file()!==lastFile){lastFile=file();cancel();}sync();position();}
 function point(pane,e){const f=file(),r=pane.stage.getBoundingClientRect();return [(e.clientX-r.left)/r.width*f.width,(e.clientY-r.top)/r.height*f.height];}
 function paint(pane,region){const f=file();Object.assign(pane.overlay.style,{left:region[0]/f.width*100+'%',top:region[1]/f.height*100+'%',width:region[2]/f.width*100+'%',height:region[3]/f.height*100+'%'});pane.overlay.hidden=false;}
 function position(){if(!selection||pill.hidden)return;const f=file();if(f!==selection.file){cancel();return;}const {pane,region}=selection,s=pane.stage.getBoundingClientRect(),v=pane.viewport.getBoundingClientRect(),left=Math.max(v.left,s.left+region[0]/f.width*s.width),right=Math.min(v.right,s.left+(region[0]+region[2])/f.width*s.width),top=s.top+region[1]/f.height*s.height,bottom=s.top+(region[1]+region[3])/f.height*s.height;
  if(right<left||bottom<v.top||top>v.bottom){pill.style.visibility='hidden';return;}pill.style.visibility='visible';const r=pill.getBoundingClientRect(),minX=Math.max(8,v.left+6),maxX=Math.min(window.innerWidth-8,v.right-6)-r.width,minY=Math.max(8,v.top+6),maxY=Math.min(window.innerHeight-8,v.bottom-6)-r.height;
  Object.assign(pill.style,{left:Math.max(minX,Math.min(maxX,left))+'px',top:Math.max(minY,Math.min(maxY,bottom+8))+'px',maxWidth:Math.max(80,v.width-12)+'px'});
 }
 async function run(region){const f=file();if(!f||f.demo||f.format==='AI'||busy)return;busy=true;armed=false;hideMenu();sync();try{await extract({file:f,region:region?region.map(n=>Math.round(n*100)/100):null});clear();}catch(error){toast('容器拆分未完成：'+error.message,true);}finally{busy=false;sync();}}
 button.onclick=()=>{if(mode==='page'){clear();run(null);}else{clear();armed=!armed;hideMenu();sync();if(armed){$('viewport').focus({preventScroll:true});toast('在任一预览中拖动框选范围，松开后点击“拆分范围内的容器”。');}}};
 toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){const r=toggle.getBoundingClientRect();Object.assign(menu.style,{left:Math.max(8,Math.min(window.innerWidth-208,r.right-200))+'px',top:Math.min(window.innerHeight-120,r.bottom+5)+'px'});}};
 for(const option of menu.querySelectorAll('[data-split-scope]'))option.onclick=()=>{mode=option.dataset.splitScope;cancel();button.focus();};
 action.onclick=()=>{if(selection?.file===file())run(selection.region);};close.onclick=cancel;
 for(const pane of panes){
  listen(pane.stage,'pointerdown',e=>{if(e.button!==0||busy||space||e.altKey||pane.viewport.classList.contains('panning')||pane.viewport.classList.contains('space-pan')||!file()||file().demo)return;if(!armed&&!(pane.original&&state.tool==='box'))return;if(e.target.closest('input,textarea,button'))return;
   clear();const start=point(pane,e);drag={pane,id:e.pointerId,start,exclusive:armed};if(armed){e.preventDefault();e.stopImmediatePropagation();pane.viewport.focus({preventScroll:true});pane.stage.setPointerCapture(e.pointerId);}paint(pane,[...start,0,0]);
  },true);
  listen(pane.stage,'pointermove',e=>{if(!drag||drag.pane!==pane||drag.id!==e.pointerId)return;paint(pane,containerSplitRegion(drag.start,point(pane,e),file().width,file().height));if(drag.exclusive){e.preventDefault();e.stopImmediatePropagation();}},true);
  listen(pane.stage,'pointerup',e=>{if(!drag||drag.pane!==pane||drag.id!==e.pointerId)return;const f=file(),region=containerSplitRegion(drag.start,point(pane,e),f.width,f.height),exclusive=drag.exclusive;release();if(exclusive){e.preventDefault();e.stopImmediatePropagation();}if(region[2]<4||region[3]<4){clear();return;}selection={pane,region,file:f};paint(pane,region);armed=false;sync();pill.hidden=false;position();},true);
  listen(pane.stage,'pointercancel',cancel,true);listen(pane.viewport,'scroll',position,{passive:true});
 }
 listen(document,'pointerdown',e=>{if(pill.contains(e.target)||group.contains(e.target))return;hideMenu();if(!panes.some(p=>p.stage.contains(e.target)))cancel();else if(!armed&&!drag&&selection)clear();},true);
 listen(document,'focusin',e=>{if(!pill.contains(e.target)&&!group.contains(e.target)&&!panes.some(p=>p.viewport.contains(e.target)))cancel();});
 listen(window,'keydown',e=>{if(e.code==='Space'&&!e.target.closest?.('input,textarea,select,[contenteditable="true"]'))space=true;if(e.key==='Escape'&&(armed||selection||!menu.hidden)){cancel();e.preventDefault();}});
 listen(window,'keyup',e=>{if(e.code==='Space')space=false;});listen(window,'blur',()=>{space=false;cancel();});listen(window,'resize',position);
 // Navigation updates stage dimensions after its wheel handler.
 listen(window,'wheel',()=>requestAnimationFrame(position),{passive:true});
 sync();return {update,cancel,isBusy:()=>busy,destroy:()=>{cancel();listeners.forEach(fn=>fn());pill.remove();panes.forEach(p=>p.overlay.remove());}};
}
