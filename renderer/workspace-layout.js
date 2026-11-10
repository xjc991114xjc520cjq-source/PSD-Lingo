const KEY='PSD-Lingo-workspace-layout-v1';
export const DEFAULT_WORKSPACE_LAYOUT=Object.freeze({left:230,right:325,original:50});
const number=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function clampWorkspaceLayout(value={},width=1200){
  const room=Math.max(0,number(width,1200)-32),factor=Math.min(1,room/800);
  const leftMin=180*factor,rightMin=260*factor,centerMin=360*factor;
  let left=clamp(number(value.left,230),leftMin,Math.max(leftMin,room-rightMin-centerMin));
  const right=clamp(number(value.right,325),rightMin,Math.max(rightMin,room-left-centerMin));
  return {left,right,original:clampPreviewSplit(value.original,Math.max(0,room-left-right))};
}
export function clampPreviewSplit(value=50,width=600){
  const available=Math.max(0,number(width,600)-10),minimum=available>0?Math.min(50,150/available*100):50;
  return clamp(number(value,50),minimum,100-minimum);
}
export function readWorkspaceLayout(storage){
  try{const value=JSON.parse(storage?.getItem(KEY));return value&&typeof value==='object'&&!Array.isArray(value)?{left:number(value.left,230),right:number(value.right,325),original:number(value.original,50)}:{...DEFAULT_WORKSPACE_LAYOUT};}catch{return {...DEFAULT_WORKSPACE_LAYOUT};}
}
export function installWorkspaceLayout({onResize=()=>{},document:doc=globalThis.document,window:win=globalThis.window}={}){
  const main=doc?.querySelector('main'),comparison=doc?.getElementById('comparison'),replacement=doc?.getElementById('replacementPane');
  if(!main||!comparison||!replacement)return {reset(){},destroy(){}};
  let storage;try{storage=win.localStorage;}catch{}
  let layout=readWorkspaceLayout(storage),drag=null,destroyed=false;
  const cleanups=[],separators=[];
  const listen=(node,type,handler)=>{node.addEventListener(type,handler);cleanups.push(()=>node.removeEventListener(type,handler));};
  // A narrow window still uses the editor's three columns. Only a future,
  // explicitly stacked layout should disable the horizontal separators.
  const stacked=()=>main.classList.contains('workspace-stacked');
  const width=()=>main.getBoundingClientRect().width;
  const save=()=>{try{storage?.setItem(KEY,JSON.stringify(layout));}catch{}};
  function paint(notify=true){
    layout=clampWorkspaceLayout(layout,width());
    layout.original=clampPreviewSplit(layout.original,comparison.getBoundingClientRect().width);
    main.style.setProperty('--workspace-left',layout.left+'px');main.style.setProperty('--workspace-right',layout.right+'px');
    comparison.style.setProperty('--preview-original',String(layout.original));
    for(const node of separators){
      const type=node.dataset.split,isPreview=type==='preview';node.hidden=stacked()||(isPreview&&replacement.hidden);
      const current=isPreview?layout.original:layout[type];
      node.setAttribute('aria-valuenow',String(Math.round(current)));node.setAttribute('aria-valuetext',Math.round(current)+(isPreview?'%':' 像素'));
      if(isPreview){const min=clampPreviewSplit(-1e9,comparison.getBoundingClientRect().width);node.setAttribute('aria-valuemin',String(min));node.setAttribute('aria-valuemax',String(100-min));}
      else {const min=type==='left'?180:260;node.setAttribute('aria-valuemin',String(Math.min(min,current)));node.setAttribute('aria-valuemax',String(Math.max(Math.round(current),Math.round(width()-32-(type==='left'?260:180)-360))));}
    }
    if(notify)onResize();
  }
  function finish(cancel=false){
    if(!drag)return;const old=drag;drag=null;
    try{old.node.releasePointerCapture?.(old.id);}catch{}
    doc.body.style.cursor=old.cursor;doc.body.style.userSelect=old.userSelect;main.classList.remove('workspace-resizing');
    if(cancel){layout=old.layout;paint();}else save();
  }
  function resetPart(type){if(drag)finish(true);if(type==='preview')layout.original=50;else layout[type]=DEFAULT_WORKSPACE_LAYOUT[type];paint();save();}
  function create(type,parent,label){
    const node=doc.createElement('div');node.className=type==='preview'?'preview-separator':'workspace-separator';node.dataset.split=type;node.tabIndex=0;
    node.setAttribute('role','separator');node.setAttribute('aria-orientation','vertical');node.setAttribute('aria-label',label);node.title=label+'；拖动调整，双击恢复';
    parent.append(node);separators.push(node);
    listen(node,'pointerdown',event=>{
      if(event.button!==0||stacked()||node.hidden)return;finish(true);event.preventDefault();
      drag={node,id:event.pointerId,x:event.clientX,layout:{...layout},cursor:doc.body.style.cursor,userSelect:doc.body.style.userSelect};
      doc.body.style.cursor='col-resize';doc.body.style.userSelect='none';main.classList.add('workspace-resizing');
      try{node.setPointerCapture?.(event.pointerId);}catch{}
    });
    listen(node,'keydown',event=>{
      if(stacked()||node.hidden)return;
      if(event.key==='Home'){event.preventDefault();resetPart(type);return;}
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
      const delta=(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?40:10);
      if(type==='preview')layout.original+=delta/Math.max(1,comparison.getBoundingClientRect().width-10)*100;
      else layout[type]+=type==='right'?-delta:delta;
      paint();save();
    });
    listen(node,'dblclick',event=>{event.preventDefault();resetPart(type);});
    listen(node,'lostpointercapture',()=>{if(drag?.node===node)finish(true);});
    return node;
  }
  main.classList.add('workspace-resizable');
  create('left',main,'调整文字层区域宽度');create('right',main,'调整文案操作区域宽度');
  const preview=create('preview',comparison,'调整原稿与替换预览宽度');comparison.insertBefore(preview,replacement);
  listen(doc,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;event.preventDefault();const type=drag.node.dataset.split,delta=event.clientX-drag.x;
    layout={...drag.layout};
    if(type==='preview')layout.original+=delta/Math.max(1,comparison.getBoundingClientRect().width-10)*100;
    else layout[type]+=type==='right'?-delta:delta;
    paint();
  });
  listen(doc,'pointerup',event=>{if(drag&&event.pointerId===drag.id)finish();});
  listen(doc,'pointercancel',event=>{if(drag&&event.pointerId===drag.id)finish(true);});
  listen(win,'blur',()=>finish(true));listen(win,'resize',()=>{finish(true);paint();});
  let observer;
  if(win.MutationObserver){observer=new win.MutationObserver(()=>{if(!destroyed)paint();});observer.observe(replacement,{attributes:true,attributeFilter:['hidden']});}
  paint(false);
  return {
    reset(){finish(true);layout={...DEFAULT_WORKSPACE_LAYOUT};try{storage?.removeItem(KEY);}catch{}paint();},
    getLayout(){return {...layout};},
    destroy(){finish(true);destroyed=true;observer?.disconnect();cleanups.forEach(fn=>fn());separators.forEach(node=>node.remove());main.classList.remove('workspace-resizable');}
  };
}
