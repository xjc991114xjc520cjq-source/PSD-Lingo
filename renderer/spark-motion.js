const motions=new WeakMap();
const origins=new WeakMap();
export function transitionSurface(el,visible,{display,remove=false,source}={}){
 const previous=motions.get(el);previous?.cancel();motions.delete(el);
 const finish=()=>{if(visible){el.hidden=false;if(display)el.style.display=display;}else if(remove)el.remove();else{el.hidden=true;if(display)el.style.display='none';}el.style.pointerEvents='';};
 if(!el.animate){finish();return;}
 if(!visible&&el.hidden){finish();return;}
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||globalThis.document?.documentElement?.classList.contains('spark-reduce-motion');
 if(visible){el.hidden=false;if(display)el.style.display=display;el.style.pointerEvents='';}else el.style.pointerEvents='none';
 if(visible){
  const r=el.getBoundingClientRect?.(),s=source?.getBoundingClientRect?.();
  if(r?.width&&s?.width){const x=s.left+s.width/2-r.left-r.width/2,y=s.top+s.height/2-r.top-r.height/2;origins.set(el,`translate(${x}px,${y}px) scale(${Math.max(.12,Math.min(.9,s.width/r.width))},${Math.max(.08,Math.min(.9,s.height/r.height))})`);}
 }
 const origin=origins.get(el)||'translateY(-12px) scale(.9)';
 const frames=reduced?(visible?[{opacity:0},{opacity:1}]:[{opacity:1},{opacity:0}]):(visible?[{opacity:.05,transform:origin},{opacity:1,transform:'none'}]:[{opacity:1,transform:'none'},{opacity:0,transform:origin}]);
 const animation=el.animate(frames,{duration:reduced?100:visible?220:160,easing:visible?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.5,0,.3,1)'});motions.set(el,animation);
 animation.finished.then(()=>{if(motions.get(el)!==animation)return;motions.delete(el);finish();}).catch(()=>{});
}
