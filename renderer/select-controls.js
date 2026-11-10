import {transitionSurface} from './spark-motion.js';
// One themed popup for static and dynamically created single-choice controls.
// Keep the real select/value/change contract used by settings and editor code.
export function nextOption(options,index,direction){
 const allowed=options.map((o,i)=>!o.disabled&&!o.hidden?i:-1).filter(i=>i>=0);
 if(!allowed.length)return -1;
 if(direction==='first')return allowed[0];if(direction==='last')return allowed.at(-1);
 return direction>0?(allowed.find(i=>i>index)??allowed.at(-1)):([...allowed].reverse().find(i=>i<index)??allowed[0]);
}
export function installSelectControls(doc=document){
 if(doc.documentElement.dataset.themedSelects)return;
 doc.documentElement.dataset.themedSelects='true';
 const win=doc.defaultView;let current=null,menu=null,index=-1,search='',searchTime=0,serial=0,observer=null;
 const eligible=s=>s?.tagName==='SELECT'&&!s.multiple&&s.size<=1&&!s.disabled;
 const options=()=>Array.from(current?.options||[]).map(o=>({disabled:o.disabled||o.parentElement?.disabled===true,hidden:o.hidden||o.parentElement?.hidden===true}));
 function close(){if(!current)return;const previous=current;current=null;observer?.disconnect();observer=null;previous.setAttribute('aria-expanded','false');previous.removeAttribute('aria-controls');previous.removeAttribute('aria-activedescendant');if(menu)transitionSurface(menu,false,{remove:true});menu=null;search='';}
 function place(){if(!current||!menu)return;const r=current.getBoundingClientRect(),margin=8,roomBelow=win.innerHeight-r.bottom-margin,roomAbove=r.top-margin,above=roomBelow<160&&roomAbove>roomBelow;
  menu.style.width=Math.min(Math.max(r.width,180),win.innerWidth-margin*2)+'px';menu.style.maxHeight=Math.max(40,Math.min(320,above?roomAbove:roomBelow))+'px';
  menu.style.left=Math.max(margin,Math.min(win.innerWidth-menu.offsetWidth-margin,r.left))+'px';menu.style.top=(above?Math.max(margin,r.top-menu.offsetHeight-4):r.bottom+4)+'px';
 }
 function highlight(n){index=n;for(const row of menu.querySelectorAll('[role=option]')){const active=Number(row.dataset.index)===index;row.classList.toggle('is-active',active);if(active){current.setAttribute('aria-activedescendant',row.id);const top=row.offsetTop,bottom=top+row.offsetHeight;if(top<menu.scrollTop)menu.scrollTop=top;else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight;}}}
 function commit(n){if(!current||n<0||options()[n]?.disabled||options()[n]?.hidden)return;const s=current,changed=s.selectedIndex!==n;s.selectedIndex=n;close();s.focus({preventScroll:true});if(changed){s.dispatchEvent(new win.Event('input',{bubbles:true}));s.dispatchEvent(new win.Event('change',{bubbles:true}));}}
 function open(s){close();current=s;search='';menu=doc.createElement('div');menu.className='app-select-menu';menu.id='app-select-menu-'+ ++serial;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',s.getAttribute('aria-label')||s.labels?.[0]?.textContent||'选择选项');menu.setAttribute('popover','manual');
  const state=options();Array.from(s.options).forEach((o,i)=>{if(state[i].hidden)return;if(o.parentElement?.tagName==='OPTGROUP'&&o===o.parentElement.querySelector('option')){const group=doc.createElement('div');group.className='app-select-group';group.textContent=o.parentElement.label;menu.append(group);}const row=doc.createElement('div');row.className='app-select-option';row.id=menu.id+'-'+i;row.dataset.index=i;row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===s.selectedIndex));row.setAttribute('aria-disabled',String(state[i].disabled));const label=doc.createElement('span');label.textContent=o.label||o.textContent;row.append(label);row.onpointermove=()=>{if(!state[i].disabled)highlight(i);};row.onmousedown=e=>{e.preventDefault();e.stopPropagation();commit(i);};menu.append(row);});
  (s.closest('dialog[open]')||doc.body).append(menu);if(menu.showPopover)menu.showPopover();s.setAttribute('aria-expanded','true');s.setAttribute('aria-controls',menu.id);s.focus({preventScroll:true});place();transitionSurface(menu,true,{source:s});highlight(state[s.selectedIndex]&&!state[s.selectedIndex].disabled&&!state[s.selectedIndex].hidden?s.selectedIndex:nextOption(state,-1,1));
  // A refresh must not let an old option index select a different new value.
  observer=new win.MutationObserver(close);observer.observe(s,{subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:['disabled','hidden','label','selected']});
 }
 const pointer=e=>{const s=e.target.closest?.('select');if(eligible(s)){e.preventDefault();e.stopPropagation();if(current===s)close();else open(s);}else if(menu&&!menu.contains(e.target))close();};
 doc.addEventListener('pointerdown',pointer,true);
 // Prevent the system popup even for synthetic compatibility mouse events.
 doc.addEventListener('mousedown',e=>{if(eligible(e.target.closest?.('select'))){e.preventDefault();e.stopPropagation();}},true);
 doc.addEventListener('keydown',e=>{const s=e.target;if(!eligible(s))return;
  if(e.key==='Tab'){close();return;}if(e.key==='Escape'){if(current){e.preventDefault();e.stopPropagation();close();}return;}
  if(e.altKey&&e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();close();return;}
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();if(current!==s){open(s);return;}if(e.key==='Enter'||e.key===' '){commit(index);return;}highlight(nextOption(options(),index,e.key==='Home'?'first':e.key==='End'?'last':e.key==='ArrowDown'?1:-1));return;}
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopPropagation();if(current!==s)open(s);const now=Date.now();search=now-searchTime<700?search+e.key:e.key;searchTime=now;const all=Array.from(s.options),state=options(),n=all.findIndex((o,i)=>!state[i].disabled&&!state[i].hidden&&o.label.trim().toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));if(n>=0)highlight(n);}
 },true);
 doc.addEventListener('focusin',e=>{if(current&&e.target!==current&&!menu.contains(e.target))close();});
 const lifetime=new win.MutationObserver(()=>{if(current&&!current.isConnected)close();});lifetime.observe(doc.body,{childList:true,subtree:true});
 doc.addEventListener('scroll',e=>{if(menu&&!menu.contains(e.target))close();},true);
 const closeDialog=e=>{if(current&&e.target.contains?.(current))close();};
 doc.addEventListener('close',closeDialog,true);doc.addEventListener('cancel',closeDialog,true);win.addEventListener('resize',()=>{if(current)place();});win.addEventListener('blur',close);
 return {close};
}
