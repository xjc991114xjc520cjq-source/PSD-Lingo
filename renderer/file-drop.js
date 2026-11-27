const isFileDrag = event => {
 const transfer=event.dataTransfer;
 return !!transfer && (Array.from(transfer.types||[]).includes('Files') || Array.from(transfer.items||[]).some(item=>item.kind==='file') || transfer.files?.length>0);
};

// File drops must never navigate Electron away from the editor. Text drags keep
// their normal behavior, including editing text within the preview.
export function preventFileNavigation(document){
 const prevent=event=>{if(isFileDrag(event))event.preventDefault();};
 document.addEventListener('dragover',prevent);
 document.addEventListener('drop',prevent);
 return ()=>{document.removeEventListener('dragover',prevent);document.removeEventListener('drop',prevent);};
}

export function bindFileDrop(element,{extensions,multiple=false,allowDirectories=false,onPaths,onError,isBusy=()=>false,desktop=window.desktop}){
 const allowed=extensions.map(extension=>extension.toLowerCase().replace(/^\./,''));
 let depth=0,inFlight=false;
 const clear=()=>{depth=0;element.classList.remove('drop-active');};
 const busy=()=>inFlight||isBusy();
 const report=error=>onError?.(typeof error?.message==='string'?error.message:String(error));
 const enter=event=>{
  if(!isFileDrag(event))return;
  event.preventDefault();event.stopPropagation();
  if(busy())return;
  depth++;element.classList.add('drop-active');
 };
 const over=event=>{
  if(!isFileDrag(event))return;
  event.preventDefault();event.stopPropagation();
  event.dataTransfer.dropEffect=busy()?'none':'copy';
 };
 const leave=event=>{
  if(!depth)return;
  event.preventDefault();event.stopPropagation();
  depth=Math.max(0,depth-1);
  if(!depth)clear();
 };
 const drop=async event=>{
  if(!isFileDrag(event))return;
  event.preventDefault();event.stopPropagation();clear();
  if(busy()){report('正在处理文件，请等待完成后再拖入。');return;}
  inFlight=true;
  try{
   const files=Array.from(event.dataTransfer.files||[]);
   if(!files.length)throw new Error('请从文件管理器拖入本地文件。');
   if(!multiple&&files.length!==1)throw new Error('此区域每次只接受一个文件，请逐个导入。');
   if(!allowDirectories&&Array.from(event.dataTransfer.items||[]).some(item=>item.kind==='file'&&item.webkitGetAsEntry?.()?.isDirectory))throw new Error('请拖入文件，文件夹请使用“选择文件夹”按钮。');
   if(typeof desktop?.getDroppedPaths!=='function')throw new Error('无法读取拖入文件的路径，请使用选择文件按钮导入。');
   const paths=desktop.getDroppedPaths(files);
   if(!Array.isArray(paths)||paths.length!==files.length||paths.some(path=>typeof path!=='string'||!path.trim()))throw new Error('无法读取文件路径，请拖入本地文件，或使用选择文件按钮导入。');
   if(!allowDirectories&&paths.some(path=>!allowed.includes(path.split(/[\\/]/).pop().split('.').slice(1).pop()?.toLowerCase())))throw new Error(`此区域仅支持 ${allowed.map(extension=>'.'+extension).join('、')} 文件，请检查后重新拖入。`);
   await onPaths(paths,{target:event.target});
  }catch(error){report(error);}finally{inFlight=false;}
 };
 const listeners={dragenter:enter,dragover:over,dragleave:leave,drop};
 for(const [name,listener]of Object.entries(listeners))element.addEventListener(name,listener);
 return ()=>{clear();for(const [name,listener]of Object.entries(listeners))element.removeEventListener(name,listener);};
}
