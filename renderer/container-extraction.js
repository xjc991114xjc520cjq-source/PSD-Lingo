import {detectRasterContainers,detectorWorkerSource} from '../container-raster-detect.cjs';
import {showTaskProgress} from './dialogs.js';
import {restoreExtractedContainers} from './extracted-container-state.js';
async function detectInBackground(input){
 if(typeof Worker==='undefined')return detectRasterContainers(input);
 const url=URL.createObjectURL(new Blob([detectorWorkerSource],{type:'text/javascript'})),worker=new Worker(url);
 try{return await new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);worker.onerror=()=>reject(Error('后台容器识别失败，请缩小框选范围后重试。'));worker.postMessage(input,[input.data.buffer]);});}finally{worker.terminate();URL.revokeObjectURL(url);}
}
export function createContainerExtractor({call,history,render,toast,state,getFile,onPreview}){
 let busy=false;
 return async({file:f,region=null})=>{
  if(busy)throw Error('正在拆分容器，请稍候。');if(!f?.path||!f.fingerprint)throw Error('请先导入本机 PSD / PSB 文件。');busy=true;
  const signature=()=>JSON.stringify([f.fingerprint,f.extractedContainers||[],f.containerEdits||[],f.layers]);
  const progress=showTaskProgress({title:'拆分背景容器'}),before=signature();
  try{
   progress.update({phase:'读取背景',message:'隐藏文字后识别矩形与圆角矩形，原文件保持不变。'});
   const imageUrl=await call('previewBackground',{path:f.path,fingerprint:f.fingerprint,ids:f.layers.map(l=>l.id),containerEdits:[],extractedContainers:[]});
   const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('背景预览读取失败，请重新载入背景后重试。'));i.src=imageUrl;});
   progress.update({phase:'识别容器',message:'检查容器边缘、圆角、填色和背景；复杂纹理不会被自动抹除。'});
   await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
   const roi=region||[0,0,f.width,f.height],pad=8,x=Math.max(0,roi[0]-pad),y=Math.max(0,roi[1]-pad),w=Math.min(f.width-x,roi[2]+pad*2),h=Math.min(f.height-y,roi[3]+pad*2),scale=Math.min(1,2000/Math.max(w,h),Math.sqrt(3500000/(w*h))),canvas=document.createElement('canvas');
   if(scale<1/16)throw Error('当前范围过大，无法可靠还原容器边缘。请改为框选局部范围后拆分。');
   canvas.width=Math.max(1,Math.ceil(w*scale));canvas.height=Math.max(1,Math.ceil(h*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,x/f.width*image.width,y/f.height*image.height,w/f.width*image.width,h/f.height*image.height,0,0,w*scale,h*scale);
   const result=await detectInBackground({data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height,offsetX:x,offsetY:y,scale,exclude:(f.containers||[]).map(c=>c.box)});
   const shapes=result.shapes.filter(s=>!region||(s.box[0]>=roi[0]-1&&s.box[1]>=roi[1]-1&&s.box[0]+s.box[2]<=roi[0]+roi[2]+1&&s.box[1]+s.box[3]<=roi[1]+roi[3]+1));
   if(getFile&&getFile()!==f||signature()!==before)throw Error('识别期间项目已变化，请重新框选。');
   if(!shapes.length){toast('未找到可安全拆分的新容器。请框住完整的纯色矩形及周围背景；渐变、描边、纹理或遮挡暂不自动拆分。',true);return {count:0,rejected:result.rejected};}
   let next=Math.min(0,...(f.extractedContainers||[]).map(s=>s.id))-1;const extracted=shapes.map((s,i)=>{const anchor=f.layers.find(l=>{const b=l.sourceBox||l.box;return l.id>0&&!l.issues?.length&&l.visible!==false&&b&&b[0]+b[2]/2>=s.box[0]&&b[0]+b[2]/2<=s.box[0]+s.box[2]&&b[1]+b[3]/2>=s.box[1]&&b[1]+b[3]/2<=s.box[1]+s.box[3];});const edge=2/scale;return {id:next--,name:'拆分容器 '+((f.extractedContainers?.length||0)+i+1),box:s.box.map(v=>Math.round(v*100)/100),cleanupBox:[s.box[0]-edge,s.box[1]-edge,s.box[2]+2*edge,s.box[3]+2*edge].map(v=>Math.round(v*100)/100),radii:s.radii.map(v=>Math.round(v*100)/100),fill:s.fill,background:s.background,sourceFingerprint:f.fingerprint,...(anchor?{anchorTextId:anchor.id}:{})};}).filter(s=>s.anchorTextId);
   if(!extracted.length){toast('已发现纯色形状，但内部没有可编辑文字作为图层定位；为保留底图层级，本次未拆分。',true);return {count:0,rejected:shapes.length};}
   progress.update({phase:'验证形状图层',message:'在 Photoshop 副本中验证形状、原容器清理与图层顺序，通过后才写入项目。'});
   const all=[...(f.extractedContainers||[]),...extracted],nativePreview=await call('previewBackground',{path:f.path,fingerprint:f.fingerprint,ids:f.layers.filter(l=>l.recordId&&!l.skipExport&&!l.issues?.length).map(l=>l.id),containerEdits:f.containerEdits||[],extractedContainers:all});
   if(getFile&&getFile()!==f||signature()!==before)throw Error('验证期间项目已变化，请重新框选。');
   history.transaction(()=>{restoreExtractedContainers(f,all);if(state)state.checked=false;},'container-extraction');
   onPreview?.(f,nativePreview);
   render();toast('已拆分 '+extracted.length+' 个可编辑容器；可在预览中调整，Ctrl＋Z 撤回。'+(result.rejected?' 部分复杂区域未处理。':''));return {count:extracted.length,rejected:result.rejected};
  }finally{busy=false;progress.close();}
 };
}
