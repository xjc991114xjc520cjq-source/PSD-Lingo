// One set of live controls, temporarily hosted near the selected canvas object.
// Moving (rather than cloning) preserves event handlers and unique control IDs.
export function contextPosition(anchor,size,viewport){
 const width=Math.max(120,Number(size.width)||380),height=Math.max(80,Number(size.height)||240);
 return {left:Number(anchor.right)+12,top:Number(anchor.top),width,height};
}
export function installContextProperties({$,onClear=()=>{},document:doc=document,window:win=window}){
 const make=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 const shell=make('section','context-properties');shell.id='contextProperties';shell.hidden=true;shell.setAttribute('role','region');shell.setAttribute('aria-label','所选对象属性');
 const header=make('div','context-properties-header'),title=make('b','','文字属性'),actions=make('div','context-properties-actions'),pin=make('button','text-button','固定位置'),expand=make('button','text-button','展开全部'),close=make('button','text-button','关闭');
 for(const b of [pin,expand,close])b.type='button';pin.setAttribute('aria-pressed','false');expand.setAttribute('aria-expanded','false');close.setAttribute('aria-label','取消选择并关闭属性');actions.append(pin,expand,close);header.append(title,actions);
 const body=make('div','context-properties-body'),basic=make('div','context-properties-basic typography-grid'),advanced=make('div','context-properties-advanced'),shape=make('div','context-properties-shape');advanced.hidden=true;body.append(basic,advanced,shape);shell.append(header,body);doc.body.append(shell);
 let selected=null,expanded=false,pinned=false,preferred=null,drag=null,homes=[],mode=null;
 try{const stored=JSON.parse(win.localStorage.getItem('psd-lingo.context-properties')||'null');if(stored){pinned=stored.pinned===true;preferred=stored.position;}}catch{}
 function persist(){try{win.localStorage.setItem('psd-lingo.context-properties',JSON.stringify({pinned,position:preferred}));}catch{}}
 function move(n,target){if(!n||homes.some(h=>h.node===n))return;const marker=doc.createComment('context property home');n.before(marker);homes.push({node:n,marker,hidden:n.hidden});target.append(n);}
 function restore(){for(const {node,marker,hidden} of homes){node.hidden=hidden;marker.replaceWith(node);}homes=[];basic.replaceChildren();advanced.replaceChildren();shape.replaceChildren();}
 function mountText(){
  for(const id of ['editSize','editWeight','editFont','allowWrap'])move($(id)?.closest('label'),basic);
  for(const selector of ['.typography-editor','.text-content-editor'])move(doc.querySelector(selector),advanced);
  for(const selector of ['.alignment-editor','.smart-detail']){const n=doc.querySelector(selector);move(n?.closest('details')||n,advanced);}
  const adapt=make('button','ghost compact','自动适配当前文字');adapt.type='button';adapt.onclick=()=>$('adaptCurrent').click();basic.append(adapt);
 }
 function render(){shell.hidden=!selected;shape.hidden=mode!=='shape';basic.hidden=mode!=='text';advanced.hidden=mode!=='text'||!expanded;shell.classList.toggle('is-expanded',expanded);shell.dataset.kind=mode||'';shape.classList.toggle('context-shape-expanded',expanded);expand.textContent=expanded?'收起':'展开全部';expand.setAttribute('aria-expanded',String(expanded));pin.textContent=pinned?'取消固定':'固定位置';pin.setAttribute('aria-pressed',String(pinned));if(selected)position();}
 function position(){
  const anchor=selected?.anchor||{left:win.innerWidth/2,right:win.innerWidth/2,top:100},rect=shell.getBoundingClientRect();
  const desired=pinned&&preferred?{left:preferred.left,right:preferred.left-12,top:preferred.top}:anchor;
  const p=contextPosition(desired,{width:Math.min(380,win.innerWidth-20),height:Math.min(rect.height||240,win.innerHeight-20)},{width:win.innerWidth,height:win.innerHeight});
  if(pinned&&preferred){p.left=preferred.left;p.top=preferred.top;}
  Object.assign(shell.style,{left:p.left+'px',top:p.top+'px',width:p.width+'px',maxHeight:'none'});
 }
 function show(selection){if(!selection)return clear();const next=selection.type||'text';if(mode!==next){restore();expanded=false;mode=next;if(next==='text')mountText();else{move(selection.element,shape);if(selection.element)selection.element.hidden=false;}}else if(next==='shape'&&selection.element&&!shape.contains(selection.element)){restore();move(selection.element,shape);selection.element.hidden=false;}selected=selection;title.textContent=(next==='shape'?'形状属性':'文字属性')+(selection.name?' · '+selection.name:'');title.title=selection.name||'';render();}
 function update(selection){if(!selected)return;if(!selection||selection.type!==selected.type||selection.id!==selected.id)return clear();selected={...selected,...selection};position();}
 function clear(){selected=null;shell.hidden=true;restore();mode=null;}
 pin.onclick=()=>{pinned=!pinned;if(pinned){const r=shell.getBoundingClientRect();preferred={left:r.left,top:r.top};}persist();render();};expand.onclick=()=>{expanded=!expanded;for(const d of advanced.querySelectorAll('details'))d.open=expanded;render();};close.onclick=()=>{clear();onClear();};
 header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;e.preventDefault();const r=shell.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture?.(e.pointerId);});
 header.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;pinned=true;preferred={left:drag.left+e.clientX-drag.x,top:drag.top+e.clientY-drag.y};render();});
 const end=()=>{if(drag){drag=null;persist();}};header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);win.addEventListener('blur',end);win.addEventListener('resize',position);
 shell.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();clear();onClear();}});
 return {show,update,clear,element:shell,isOpen:()=>!!selected};
}
