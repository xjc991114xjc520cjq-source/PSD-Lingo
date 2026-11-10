import {transitionSurface} from './spark-motion.js';
// Independent, non-modal tool windows. Geometry never enters project history.
export function clampFloatingRect(rect,viewport,{minWidth=280,minHeight=180}={}){
 const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
 // Tool windows are allowed to leave the main app bounds. Keep only a usable
 // minimum size; the OS window manager remains responsible for visibility.
 return {left:finite(rect.left,viewport.width-410),top:finite(rect.top,112),width:Math.max(minWidth,finite(rect.width,380)),height:Math.max(minHeight,finite(rect.height,320))};
}
export function floatingGestureRect(rect,direction,dx,dy){
 let {left,top,width,height}=rect;
 if(direction==='move')return {left:left+dx,top:top+dy,width,height};
 if(direction.includes('w')){left+=dx;width-=dx;}if(direction.includes('e'))width+=dx;
 if(direction.includes('n')){top+=dy;height-=dy;}if(direction.includes('s'))height+=dy;
 return {left,top,width,height};
}
export function installFloatingPanel(content,{title,button,onVisibilityChange=()=>{},storageKey='psd-lingo.container-window',window:win=window,document:doc=document}={}){
 const shell=doc.createElement('section');shell.id='containerFloatingWindow';shell.className='floating-panel';shell.setAttribute('role','region');shell.setAttribute('aria-label',title);
 const header=doc.createElement('div');header.className='floating-panel-header';
 const caption=doc.createElement('div');caption.className='floating-panel-title';caption.textContent=title;caption.tabIndex=0;caption.setAttribute('aria-label',title+'，方向键移动，Shift 加方向键每次移动 10 像素');caption.title='拖动标题移动窗口 · 方向键微调位置';
 const actions=doc.createElement('div');actions.className='floating-panel-actions';
 const collapse=doc.createElement('button'),close=doc.createElement('button');collapse.type=close.type='button';close.textContent='关闭';close.setAttribute('aria-label','关闭'+title);actions.append(collapse,close);header.append(caption,actions);content.classList.add('floating-panel-content');shell.append(header,content);doc.body.append(shell);
 button.setAttribute('aria-controls',shell.id);button.setAttribute('aria-haspopup','false');
 let stored={};try{stored=JSON.parse(win.localStorage.getItem(storageKey)||'{}')||{};}catch{}
 let preferred={left:win.innerWidth-410,top:112,width:380,height:340,...stored.rect},rect,visible=stored.open===true,collapsed=stored.collapsed===true,drag=null;
 const viewport=()=>({width:win.innerWidth,height:win.innerHeight});
 function persist(){try{win.localStorage.setItem(storageKey,JSON.stringify({rect:preferred,open:visible,collapsed}));}catch{}}
 function layout(){rect=clampFloatingRect(preferred,viewport());Object.assign(shell.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:collapsed?'auto':rect.height+'px'});}
 let lastVisibility;
 function render(){if(lastVisibility!==visible){if(lastVisibility===undefined)shell.hidden=!visible;else transitionSurface(shell,visible,{source:button});lastVisibility=visible;}content.hidden=collapsed;shell.classList.toggle('floating-panel-collapsed',collapsed);collapse.textContent=collapsed?'展开':'收起';collapse.setAttribute('aria-label',(collapsed?'展开':'收起')+title);collapse.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-expanded',String(visible));layout();onVisibilityChange(visible);}
 function show({focus=false}={}){visible=true;render();persist();if(focus)caption.focus();}
 function hide(){end();const inside=shell.contains(doc.activeElement);visible=false;render();persist();if(inside)button.focus();}
 function toggle(){if(visible)hide();else show({focus:true});}
 button.onclick=toggle;close.onclick=hide;collapse.onclick=()=>{collapsed=!collapsed;render();persist();};
 function begin(event,direction){if(event.button!==0||event.target.closest?.('button'))return;event.preventDefault();event.stopPropagation();drag={id:event.pointerId,x:event.clientX,y:event.clientY,direction,rect:{...rect},target:event.currentTarget};event.currentTarget.setPointerCapture?.(event.pointerId);}
 function move(event){if(!drag||drag.id!==event.pointerId)return;event.preventDefault();preferred=clampFloatingRect(floatingGestureRect(drag.rect,drag.direction,event.clientX-drag.x,event.clientY-drag.y),viewport());layout();}
 function end(event){if(!drag||event&&drag.id!==event.pointerId)return;const old=drag;drag=null;if(old.target.hasPointerCapture?.(old.id))old.target.releasePointerCapture(old.id);persist();}
 header.onpointerdown=event=>begin(event,'move');header.onpointermove=move;header.onpointerup=end;header.onpointercancel=end;
 function keyboard(event,direction){const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;preferred=clampFloatingRect(floatingGestureRect(rect,direction,delta[0]*step,delta[1]*step),viewport());layout();persist();}
 caption.onkeydown=event=>keyboard(event,'move');shell.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}};
 const names={nw:'左上',n:'上',ne:'右上',e:'右',se:'右下',s:'下',sw:'左下',w:'左'};
 for(const direction of Object.keys(names)){const handle=doc.createElement('div');handle.className='floating-panel-resize';handle.dataset.direction=direction;handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整窗口'+names[direction]+'边界，方向键调整大小');handle.setAttribute('aria-orientation',direction==='n'||direction==='s'?'horizontal':'vertical');handle.onpointerdown=event=>begin(event,direction);handle.onpointermove=move;handle.onpointerup=end;handle.onpointercancel=end;handle.onkeydown=event=>keyboard(event,direction);shell.append(handle);}
 win.addEventListener('resize',layout);win.addEventListener('blur',()=>end());render();
 function reset(){end();preferred={left:win.innerWidth-410,top:112,width:380,height:340};collapsed=false;render();persist();}
 return {show,hide,toggle,reset,isOpen:()=>visible,element:shell};
}
