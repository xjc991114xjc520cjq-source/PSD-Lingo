// One finite composition. Automatic playback uses the browser animation timeline.
let activeStartup;
function createStartupTimeline({manual=false,reduced}={}){
 activeStartup?.skip();
 const quiet=reduced??(matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('spark-reduce-motion'));
 const host=document.createElement('section');host.id='sparkStartup';host.setAttribute('aria-label','灵搭 Sparkit 正在启动');
 host.innerHTML=`<div class="startup-ground"></div><div class="startup-colors" aria-hidden="true"><div class="startup-ribbon ribbon-apricot"></div><div class="startup-ribbon ribbon-coral"></div><div class="startup-ribbon ribbon-jade"></div><div class="startup-ribbon ribbon-gold"></div></div><div class="startup-orbit" aria-hidden="true"><svg viewBox="0 0 240 240"><defs><linearGradient id="startupOrbitColor" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#ffc993"/><stop offset=".45" stop-color="#ff7c4e"/><stop offset=".78" stop-color="#c7edca"/><stop offset="1" stop-color="#78bcb6"/></linearGradient></defs><circle class="startup-track" cx="120" cy="120" r="96"/><circle class="startup-arc" cx="120" cy="120" r="96"/></svg></div><div class="startup-emblem" aria-hidden="true"><img src="assets/logo1.png" alt=""></div><div class="startup-name"><h1>灵搭 <span>Sparkit</span></h1><p>为灵感搭把手</p></div><button class="startup-skip" type="button">跳过动画 <kbd>Esc</kbd></button>`;
 document.body.append(host);
 const background=[...document.body.children].filter(el=>el!==host&&el instanceof HTMLElement).map(el=>[el,el.inert]);
 background.forEach(([el])=>{el.inert=true;});
 const animations=[],duration=quiet?360:3000,ease='cubic-bezier(.16,1,.3,1)';
 const animate=(selector,frames,delay,ms,easing=ease)=>{
  const a=host.querySelector(selector).animate(frames,{delay,duration:ms,easing,fill:delay>=2400||(quiet&&delay>=120)?'forwards':'both'});if(manual)a.pause();animations.push(a);return a;
 };
 let resolve;const finished=new Promise(r=>resolve=r);let closed=false,timer;
 const finish=()=>{if(closed)return;closed=true;clearTimeout(timer);document.removeEventListener('keydown',escape,true);host.remove();background.forEach(([el,inert])=>{el.inert=inert;});animations.forEach(a=>a.cancel());resolve();};
 const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}else if(e.ctrlKey||e.metaKey){e.preventDefault();e.stopImmediatePropagation();}};
 host.querySelector('button').onclick=finish;document.addEventListener('keydown',escape,true);
 if(quiet){
  host.classList.add('startup-quiet');animate('.startup-emblem',[{opacity:0},{opacity:1}],0,100);animate('.startup-name',[{opacity:0},{opacity:1}],30,100);animate('.startup-ground',[{opacity:1},{opacity:0}],120,240);animate('.startup-emblem',[{opacity:1},{opacity:0}],180,180);animate('.startup-name',[{opacity:1},{opacity:0}],180,180);
 }else{
  animate('.ribbon-apricot',[{transform:'translate(-32%, 18%) rotate(-32deg) scale(1.2)',opacity:0},{transform:'translate(3%, -8%) rotate(12deg) scale(1.1)',opacity:1,offset:.25},{transform:'translate(26%, -18%) rotate(38deg) scale(.45)',opacity:.9,offset:.72},{transform:'translate(36%, -8%) rotate(70deg) scale(.04)',opacity:0}],0,1600,'cubic-bezier(.4,0,.3,1)');
  animate('.ribbon-coral',[{transform:'translate(28%, 38%) rotate(-36deg) scale(1.2)',opacity:0},{transform:'translate(-9%, -12%) rotate(-12deg) scale(1)',opacity:1,offset:.3},{transform:'translate(3%, -8%) rotate(36deg) scale(.5)',opacity:.8,offset:.72},{transform:'translate(-7%, -5%) rotate(70deg) scale(.05)',opacity:0}],80,1520,'cubic-bezier(.4,0,.3,1)');
  animate('.ribbon-jade',[{transform:'translate(36%, -36%) rotate(20deg) scale(1.2)',opacity:0},{transform:'translate(-6%, 8%) rotate(-20deg) scale(.9)',opacity:.9,offset:.3},{transform:'translate(-15%, 20%) rotate(-50deg) scale(.4)',opacity:.7,offset:.72},{transform:'translate(-28%, 14%) rotate(-75deg) scale(.05)',opacity:0}],50,1500,'cubic-bezier(.4,0,.3,1)');
  animate('.ribbon-gold',[{transform:'translate(-18%, -40%) rotate(-40deg) scale(1)',opacity:0},{transform:'translate(14%, 5%) rotate(-10deg) scale(.7)',opacity:.8,offset:.35},{transform:'translate(13%, 16%) rotate(25deg) scale(.04)',opacity:0}],150,1470,'cubic-bezier(.4,0,.3,1)');
  animate('.startup-orbit',[{opacity:0,transform:'translate(-50%,-50%) rotate(-150deg) scale(.45)'},{opacity:.9,offset:.3},{opacity:1,transform:'translate(-50%,-50%) rotate(120deg) scale(1)',offset:.65},{opacity:0,transform:'translate(-50%,-50%) rotate(200deg) scale(.57)'}],400,1420);
  animate('.startup-arc',[{strokeDashoffset:560},{strokeDashoffset:0}],400,1400);
  animate('.startup-emblem',[{opacity:0,transform:'translate(-50%,-50%) rotate(-24deg) scale(.35)'},{opacity:1,transform:'translate(-50%,-50%) rotate(0deg) scale(1)'}],1140,660);

  animate('.startup-skip',[{opacity:0},{opacity:.8}],1750,250);
  const from=host.getBoundingClientRect(),to=document.querySelector('.spark-brand .spark-logo')?.getBoundingClientRect();
  const dx=to?to.left+to.width/2-(from.left+from.width/2):0,dy=to?to.top+to.height/2-(from.top+from.height*.43):-140;

  animate('.startup-skip',[{opacity:.8},{opacity:0}],2430,180);
  animate('.startup-emblem',[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:1,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${to?to.width/104:.20})`}],2100,750,'cubic-bezier(.45,0,.2,1)');
  animate('.startup-ground',[{opacity:1},{opacity:0}],2600,300,'cubic-bezier(.4,0,.2,1)');
 }
 const api={duration,finished,skip:finish,animate,play(){const start=document.timeline.currentTime;animations.forEach(a=>{a.play();a.startTime=start;});timer=setTimeout(finish,duration+34);},seek(ms){animations.forEach(a=>{a.pause();a.currentTime=Math.min(duration,Math.max(0,ms));});},get active(){return !closed;}};
 activeStartup=api;
 if(!manual)timer=setTimeout(finish,duration+34);
 return api;
}


function enhanceStartup(anim){
const emblem=document.querySelector('.startup-emblem');
emblem.insertAdjacentHTML('beforeend',`<svg class="emblem-art" viewBox="90 0 283 310"><defs>
<mask id="logo-mask" maskUnits="userSpaceOnUse" x="90" y="0" width="283" height="310" style="mask-type:alpha"><image href="assets/logo1.png" width="452" height="425"/></mask>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe2a5"/><stop offset=".38" stop-color="#ffb765"/><stop offset=".67" stop-color="#ff7c32"/><stop offset="1" stop-color="#e95421"/></linearGradient>
<linearGradient id="spec"><stop stop-color="#fff4d8" stop-opacity="0"/><stop offset=".5" stop-color="#fff4d8"/><stop offset="1" stop-color="#fff4d8" stop-opacity="0"/></linearGradient>
<filter id="edge" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="wide"/><feComposite in="wide" in2="SourceAlpha" operator="out" result="edge"/><feFlood flood-color="#ffdea5"/><feComposite in2="edge" operator="in"/></filter>
</defs><image class="logo-outline" href="assets/logo1.png" width="452" height="425" filter="url(#edge)"/>
<g mask="url(#logo-mask)"><rect class="logo-fill" x="90" y="0" width="283" height="310" fill="url(#metal)"/><rect class="logo-sweep" x="30" y="-80" width="90" height="500" fill="url(#spec)" transform="rotate(25 231 155)"/></g></svg>`);
const host=document.querySelector('#sparkStartup');
host.insertAdjacentHTML('beforeend',`<svg class="handoff" viewBox="0 0 1280 800" preserveAspectRatio="none"><path pathLength="1" stroke="#ffbd82" d="M 522 335 C 520 236 690 205 728 282 C 755 345 661 316 640 344"/><path pathLength="1" stroke="#a8d9cd" d="M 755 363 C 745 453 589 467 552 395 C 526 342 610 360 640 344"/></svg>`);
// Build the decorative tracks once. Never seek paused animations on every frame.
const s=(a,b,t)=>{let v=Math.max(0,Math.min(1,(t-a)/(b-a)));return v*v*(3-2*v)};
const track=(selector,value)=>{
 const frames=Array.from({length:91},(_,i)=>({...value(i*anim.duration/90),offset:i/90}));
 anim.animate(selector,frames,0,anim.duration,'linear');
};
track('.startup-name',t=>({opacity:1-s(2080,2310,t),transform:'translate(-50%,0)'}));
for(const [selector,start,duration,travel] of [['h1',1450,220,9],['p',1550,180,6]]){
 track('.startup-name '+selector,t=>{const progress=s(start,start+duration,t),ease=1-Math.pow(1-progress,3);return {opacity:progress,transform:'translateY('+((1-ease)*travel)+'px)',clipPath:'inset(0 0 '+((1-ease)*100)+'% 0)'};});
}
track('.logo-fill',t=>({clipPath:'inset('+(100-s(1170,1660,t)*100)+'% 0 0 0)'}));
track('.logo-outline',t=>({opacity:s(930,1280,t)*(1-s(1640,1900,t))*.9}));
track('.logo-sweep',t=>({transform:'translateX('+(15+s(1630,2110,t)*360-30)+'px) rotate(25deg)',transformOrigin:'231px 155px',opacity:s(1630,1720,t)*(1-s(2010,2140,t))*.75}));
for(const i of [0,1]){
 const selector='.handoff path:nth-child('+(i+1)+')';host.querySelector(selector).style.strokeDasharray='.22 .78';
 track(selector,t=>({strokeDashoffset:1.22-s(770+i*90,1400+i*90,t)*1.22,opacity:s(770,900,t)*(1-s(1320,1480,t))*.8}));
}
}

export function playSparkitStartup({manual=false,reduced}={}){
 const quiet=reduced??(matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('spark-reduce-motion'));
 const timeline=createStartupTimeline({manual:true,reduced:quiet});
 if(!quiet)enhanceStartup(timeline);
 window.sparkitBoot?.handoff();if(!manual)timeline.play();
 return {duration:timeline.duration,ready:Promise.resolve(),finished:timeline.finished,skip:timeline.skip,seek:timeline.seek,get active(){return timeline.active;},get renderer(){return 'waapi';}};
}
