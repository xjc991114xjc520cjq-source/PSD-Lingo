// Navigation operates on the viewport, without changing any layer parameters.
export function installPreviewNavigation(viewport,stage,{getScale,setScale}){
  let space=false,pan=null,suppressUntil=0;
  const editable=target=>target?.closest?.('input,textarea,select,[contenteditable="true"]');
  const focused=()=>viewport.contains(document.activeElement);
  viewport.tabIndex=0;
  let surface=null;
  function pad(){if(!(getScale()>0))return;
    const before=stage.getBoundingClientRect();
    if(!surface){surface=document.createElement('div');surface.className='preview-navigation-surface';stage.before(surface);surface.append(stage);stage.style.margin='0';}
    const x=Math.round(viewport.clientWidth*.6),y=Math.round(viewport.clientHeight*.6);
    // Padding belongs to scroll content, never to the fixed viewport. Viewport
    // padding larger than its size grows the viewport and feeds back on every zoom.
    surface.style.padding=y+'px '+x+'px';
    const after=stage.getBoundingClientRect();viewport.scrollLeft+=after.left-before.left;viewport.scrollTop+=after.top-before.top;
  }
  window.addEventListener('keydown',e=>{if(e.code==='Space'&&focused()&&!editable(e.target)){space=true;viewport.classList.add('space-pan');e.preventDefault();}});
  function release(){space=false;viewport.classList.remove('space-pan','panning');if(pan&&viewport.hasPointerCapture(pan.id))viewport.releasePointerCapture(pan.id);pan=null;}
  window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;viewport.classList.remove('space-pan');}});
  window.addEventListener('blur',release);
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0||editable(e.target))return;viewport.focus({preventScroll:true});pad();
    if(!space)return;e.preventDefault();e.stopImmediatePropagation();pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');
  },true);
  viewport.addEventListener('pointermove',e=>{if(!pan)return;e.preventDefault();e.stopImmediatePropagation();viewport.scrollLeft=pan.left-(e.clientX-pan.x);viewport.scrollTop=pan.top-(e.clientY-pan.y);},true);
  function end(e){if(!pan)return;e.preventDefault();e.stopImmediatePropagation();suppressUntil=performance.now()+250;if(viewport.hasPointerCapture(pan.id))viewport.releasePointerCapture(pan.id);pan=null;viewport.classList.remove('panning');}
  viewport.addEventListener('pointerup',end,true);viewport.addEventListener('pointercancel',end,true);
  viewport.addEventListener('click',e=>{if(space||performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('wheel',e=>{
    if(!e.altKey||!focused()||editable(e.target)||!(getScale()>0))return;
    e.preventDefault();pad();const before=stage.getBoundingClientRect(),old=getScale();
    const anchorX=Math.max(before.left,Math.min(before.right,e.clientX)),anchorY=Math.max(before.top,Math.min(before.bottom,e.clientY));
    const x=(anchorX-before.left)/old,y=(anchorY-before.top)/old;
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1),scale=Math.max(.03,Math.min(8,old*Math.exp(-delta*.0015)));
    setScale(scale);const after=stage.getBoundingClientRect();viewport.scrollLeft+=after.left+x*scale-anchorX;viewport.scrollTop+=after.top+y*scale-anchorY;
  },{passive:false});
  function centerCanvas(){if(!(getScale()>0))return;pad();const v=viewport.getBoundingClientRect(),s=stage.getBoundingClientRect();viewport.scrollLeft+=s.left+s.width/2-v.left-viewport.clientLeft-viewport.clientWidth/2;viewport.scrollTop+=s.top+s.height/2-v.top-viewport.clientTop-viewport.clientHeight/2;}
  return {isPanning:()=>space||!!pan,centerCanvas};
}
