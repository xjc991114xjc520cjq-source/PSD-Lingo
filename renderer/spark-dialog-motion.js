// A surface keeps its trigger through its entire lifetime, including dismissal.
const origins=new WeakMap(),running=new WeakMap();
let trigger=null;
export function setMotionTrigger(element){if(element?.isConnected)trigger=element;}
export const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('spark-reduce-motion');
export function sourceTransform(surface,source){
 const r=surface.getBoundingClientRect(),s=source?.isConnected?source.getBoundingClientRect():null;
 if(!s||!s.width||!r.width)return {transform:'translateY(45px) scale(.92)',origin:'50% 100%',source:null};
 const dx=s.left+s.width/2-r.left-r.width/2,dy=s.top+s.height/2-r.top-r.height/2;
 return {transform:`translate(${dx}px,${dy}px) scale(${Math.max(.06,Math.min(.46,s.width/r.width))},${Math.max(.06,Math.min(.3,s.height/r.height))})`,origin:'50% 50%',source:{x:s.x,y:s.y,width:s.width,height:s.height}};
}
export function installDialogMotion(){
 document.addEventListener('click',event=>{const b=event.target.closest('button,summary,select');if(b&&event.bubbles&&b.getClientRects().length)setMotionTrigger(b);},true);
 const proto=HTMLDialogElement.prototype,show=proto.showModal,close=proto.close;
 proto.showModal=function(){
  const previous=running.get(this),wasOpen=this.open;
  const present=previous?getComputedStyle(this):null;
  const interrupted=present?{opacity:present.opacity,transform:present.transform}:null;
  previous?.cancel();running.delete(this);delete this.dataset.sparkClosing;
  if(wasOpen){
   if(interrupted){const a=this.animate([interrupted,{opacity:1,transform:'none'}],{duration:reducedMotion()?90:180,easing:'cubic-bezier(.16,1,.3,1)'});running.set(this,a);a.finished.then(()=>{if(running.get(this)===a){running.delete(this);this.style.willChange='';}}).catch(()=>{});}
   return;
  }
  const source=trigger||document.activeElement;show.call(this);this.style.willChange='transform,opacity';
  const origin=sourceTransform(this,source);origins.set(this,{...origin,element:source});
  this.style.transformOrigin=origin.origin;
  this.dataset.motionSource=source?.id||source?.dataset?.route||'control';
  const reduced=reducedMotion();
  const frames=reduced?[{opacity:.2},{opacity:1}]:[
   {opacity:.05,transform:origin.transform,offset:0},
   {opacity:1,transform:'translate(0,0) scale(1.012)',offset:.76},
   {opacity:1,transform:'translate(0,0) scale(1)',offset:1}
  ];
  const a=this.animate(frames,{duration:reduced?90:280,easing:'cubic-bezier(.2,.8,.2,1)'});running.set(this,a);
  a.finished.then(()=>{if(running.get(this)===a){running.delete(this);this.style.willChange='';}}).catch(()=>{});
 };
 proto.close=function(value){
  if(!this.open)return Promise.resolve();
  if(this.dataset.sparkClosing==='true')return running.get(this)?.finished.catch(()=>{});
  const computed=getComputedStyle(this),present={opacity:computed.opacity,transform:computed.transform};
  running.get(this)?.cancel();const origin=origins.get(this);
  const target=origin?.element?.isConnected?sourceTransform(this,origin.element):origin;
  this.dataset.sparkClosing='true';
  const reduced=reducedMotion();
  const a=this.animate(reduced?[{opacity:1},{opacity:0}]:[
   present,
   {opacity:0,transform:target?.transform||'translateY(45px) scale(.92)'}
  ],{duration:reduced?90:210,easing:'cubic-bezier(.5,0,.3,1)',fill:'forwards'});
  running.set(this,a);
  return a.finished.catch(()=>{}).then(()=>{
   if(running.get(this)!==a)return;
   running.delete(this);delete this.dataset.sparkClosing;close.call(this,value);a.cancel();this.style.willChange='';
   if(origin?.element?.isConnected)origin.element.focus({preventScroll:true});
  });
 };
 // Target-specific cancel handlers (confirm/progress) retain their own semantics.
 document.addEventListener('cancel',event=>{
  if(!(event.target instanceof HTMLDialogElement))return;
  event.target.addEventListener('cancel',e=>{if(!e.defaultPrevented){e.preventDefault();e.target.close();}},{once:true});
 },true);
}
