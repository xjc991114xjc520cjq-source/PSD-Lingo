// Explicit, geometry-based layout assistance. This does not infer image content.
const {validBox,validRadii,recommendedContainer}=require('./container-fit.cjs');
const {manualStyleFor,manualStyleIssues}=require('./layout.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const ceil=n=>Math.ceil((n-1e-7)*10)/10;
const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
function placed(layer){return layer.position?[layer.position.x,layer.position.y,layer.box[2],layer.box[3]]:[...layer.box];}
function failure(reason){return {ok:false,reason};}
function proposeVisualLayout(file,layer,record,fitText){
 if(!file||!layer||!record||typeof fitText!=='function'||!validBox(layer.box)||!Number.isFinite(file.width)||!Number.isFinite(file.height))return failure('请先选择已绑定文案的有效文字层。');
 if(layer.issues?.length||layer.skipExport)return failure('此文字层已跳过或存在结构问题，请先确认图层。');
 const original=layer.sourceBox||layer.box,current=placed(layer),baseSize=layer.manual?.size||layer.size;
 if(!validBox(original)||!validBox(current)||!(baseSize>0))return failure('文字区域或字号无效。');
 const minimum=Math.min(baseSize,Math.max(1,Number(layer.minSize)||baseSize));
 const gap=Math.max(8,baseSize*.25),neighbours=(file.layers||[]).filter(l=>l.id!==layer.id&&l.visible!==false&&validBox(l.box)).map(l=>({id:l.id,box:l.skipExport?[...(l.sourceBox||l.box)]:placed(l)}));
 const result=recommendedContainer(file,layer);
 if(layer.containerId===undefined&&result.ambiguous)return failure('检测到多个可能的背景容器，请先明确选择对应容器，再进行排版。');
 const shape=layer.containerId===null?null:Number.isInteger(layer.containerId)?result.candidates.find(s=>s.id===layer.containerId):result.recommended;
 if(Number.isInteger(layer.containerId)&&!shape)return failure('指定容器与原文字区域不对应，请重新选择容器。');
 // Only native rectangles are eligible for automated resizing. Other shapes remain untouched.
 const rectangle=shape?.shapeType==='rectangle'&&validRadii(shape.radii)?shape:null;
 if(shape&&!rectangle)return failure('此背景不是带可编辑圆角的原生矩形，请手动调整，不会将文字扩展到容器外。');
 const shared=rectangle&&(file.layers||[]).some(l=>l.id!==layer.id&&l.visible!==false&&((l.containerId!==undefined&&l.containerId!==null&&String(l.containerId)===String(rectangle.id))||(l.containerId===undefined&&recommendedContainer(file,l).recommended?.id===rectangle.id)));
 const prior=rectangle&&(file.containerEdits||[]).find(e=>e.layerId===rectangle.id);
 const containerBox=rectangle?(validBox(prior?.box)?prior.box:rectangle.box):null;
 const occupied=containerBox||current;
 // Container padding is not a page gutter: inset text must not forbid its own
 // native background from occupying the established outer column.
 const gutterBox=containerBox||original;
 const gutter=Math.max(0,Math.min(gutterBox[0],file.width-gutterBox[0]-gutterBox[2],file.width*.12));
 let left=gutter,right=file.width-gutter;
 for(const {box}of neighbours){
  if(box[1]>=occupied[1]+occupied[3]+gap||box[1]+box[3]<=occupied[1]-gap)continue;
  if(box[0]>=occupied[0]+occupied[2]-1)right=Math.min(right,box[0]-gap);
  else if(box[0]+box[2]<=occupied[0]+1)left=Math.max(left,box[0]+box[2]+gap);
  else if(overlaps(occupied,box))return failure('当前文字与其他文字区域重叠，无法可靠判断可用空间，请先手动整理。');
 }
 left=Math.max(0,left);right=Math.min(file.width,right);
 // Text may be paragraph-left but optically centered by placement in a row of
 // equal product cards. Recover that original rhythm from three regular peers.
 const row=(file.layers||[]).filter(l=>l.visible!==false&&validBox(l.sourceBox||l.box)).map(l=>l.sourceBox||l.box).filter(b=>Math.abs(b[1]-original[1])<=Math.max(3,original[3]*.25)&&Math.abs(b[3]-original[3])<=original[3]*.3&&b[2]>=original[2]*.65&&b[2]<=original[2]*1.35).sort((a,b)=>a[0]-b[0]);
 const gaps=row.slice(1).map((b,i)=>b[0]+b[2]/2-row[i][0]-row[i][2]/2),regularRow=row.length>=3&&gaps.every(g=>g>original[2]*1.2)&&Math.max(...gaps)<=Math.min(...gaps)*1.2;
 const sourceAlignment=regularRow?'center':layer.sourceAlignment||layer.alignment||'left',sourceCenter=original[0]+original[2]/2;
 const centeredWidth=!containerBox&&sourceAlignment==='center'?2*Math.max(0,Math.min(sourceCenter-left,right-sourceCenter)):null;
 const startX=containerBox?containerBox[0]:centeredWidth!==null?sourceCenter-centeredWidth/2:current[0];
 const availableWidth=centeredWidth!==null?centeredWidth:right-startX;
 if(startX<left-1||availableWidth<=0)return failure('当前文字位置没有可安全扩展的水平空间。');
 let bottom=Math.min(file.height,containerBox?containerBox[1]+Math.max(containerBox[3],baseSize*2.4):current[1]+original[3]);
 for(const {box}of neighbours){
  if(box[1]>=occupied[1]+occupied[3]-1&&box[0]<right&&box[0]+box[2]>startX)bottom=Math.min(bottom,box[1]-gap);
 }
 const top=containerBox?containerBox[1]:current[1];
 const availableHeight=bottom-top;
 if(availableHeight<=0)return failure('相邻文字之间没有足够的垂直留白。');
 const sizes=[baseSize];for(let ratio=.95;baseSize*ratio>minimum+.01;ratio-=.05)sizes.push(Math.round(baseSize*ratio*100)/100);if(minimum<baseSize)sizes.push(minimum);
 let chosen;
 for(const size of sizes){
  const sourceLeft=rectangle?original[0]-rectangle.box[0]:0,sourceRight=rectangle?rectangle.box[0]+rectangle.box[2]-original[0]-original[2]:0;
  const sourceInset=(layer.sourceAlignment||layer.alignment)==='right'?sourceRight:sourceLeft;
  const padding=rectangle?Math.max(12,size*.6,Math.min(baseSize,Math.max(0,sourceInset))):0;
  const verticalPadding=rectangle?Math.min(Math.max(8,size*.4),containerBox[3]*.22):0;
  const width=availableWidth-padding*2,height=availableHeight-verticalPadding*2;
  if(width<=0||height<=0)continue;
  const manual=manualStyleFor(layer,{size,tracking:layer.manual?.tracking??layer.tracking??0,leading:(layer.manual?.leading||layer.leading||baseSize*1.2)*size/baseSize});
  if(manualStyleIssues(manual).length)return failure('当前字体或排版参数无效，请检查文字属性；未修改排版。');
  // Preserve existing font, weight, stretching and custom text; no generated wording.
  for(const allowWrap of [false,true]){
   if(allowWrap&&layer.smart?.allowWrap===false)continue;
   const trial={...copy(layer),box:[startX+padding,top+verticalPadding,width,height],manual,smart:{...copy(layer.smart||{}),allowWrap,allowLeading:false,trackingLimit:0}};
   const fit=fitText(trial,record);
   if(fit?.ok&&Number.isFinite(fit.width)&&Number.isFinite(fit.height)&&fit.width>0&&fit.height>0&&fit.width<=width+.01&&fit.height<=height+.01){chosen={fit,manual,padding,verticalPadding,allowWrap};break;}
  }
  if(chosen)break;
 }
 if(!chosen)return failure('在保留字号下限、文字内容及相邻留白后仍无法容纳。已保留当前排版，请手动调整容器或文字。');
 const {fit,manual,padding,verticalPadding,allowWrap}=chosen,inkWidth=ceil(fit.width),inkHeight=ceil(fit.height);
 let x=current[0],y=current[1],containerEdit;
 if(rectangle){
  const box=[containerBox[0],containerBox[1],Math.max(containerBox[2],ceil(inkWidth+padding*2)),Math.max(containerBox[3],ceil(inkHeight+verticalPadding*2))];
  if(shared&&(box[2]>containerBox[2]+.01||box[3]>containerBox[3]+.01))return failure('此容器承载多个文字层，不会自动扩展影响其他文字，请手动调整。');
  if(box[2]>availableWidth+.01||box[3]>availableHeight+.01)return failure('容器所需内边距会碰到相邻内容，已保留当前排版。');
  const lp=original[0]-rectangle.box[0],rp=rectangle.box[0]+rectangle.box[2]-original[0]-original[2];
  const centered=Math.abs(lp-rp)<=Math.max(4,layer.size*.3),anchor=centered?'center':(layer.sourceAlignment||layer.alignment||'left');
  const inset=Math.max(padding,Math.min(Math.max(0,anchor==='right'?rp:lp),baseSize));
  x=anchor==='center'?box[0]+(box[2]-inkWidth)/2:anchor==='right'?box[0]+box[2]-inset-inkWidth:box[0]+inset;
  if(x+inkWidth>box[0]+box[2]-padding+.01||x<box[0]+padding-.01)return failure('保留原稿对齐和内边距后空间不足，请手动调整容器。');
  y=box[1]+(box[3]-inkHeight)/2;
  const blockers=[...neighbours,...(file.containers||[]).filter(c=>c.id!==rectangle.id&&validBox(c.box)).map(c=>({box:(file.containerEdits||[]).find(e=>e.layerId===c.id)?.box||c.box}))];
  if(blockers.some(n=>overlaps(box,n.box)&&!overlaps(containerBox,n.box)))return failure('扩展容器会遮挡相邻文字或形状，已保留当前排版。');
  containerEdit={...copy(prior||{}),layerId:rectangle.id,textLayerId:layer.id,sourceBox:[...rectangle.box],box,sourceRadii:[...rectangle.radii],radii:[...(prior?.radii||rectangle.radii)]};
 }else{
  const factor=sourceAlignment==='center'?.5:sourceAlignment==='right'?1:0;
  const anchor=layer.sourceAlignment||regularRow?original:current;
  x=Math.max(left,Math.min(right-inkWidth,anchor[0]+(anchor[2]-inkWidth)*factor));
 }
 const box=[x,y,inkWidth,inkHeight];
 if(box[0]<0||box[1]<0||box[0]+box[2]>file.width+.01||box[1]+box[3]>file.height+.01||neighbours.some(n=>overlaps(box,n.box)))return failure('调整结果会超出画布或与其他文字重叠，已保留当前排版。');
 return {ok:true,layerPatch:{sourceBox:[...original],box,position:{x,y},manual,smart:{...copy(layer.smart||{}),allowWrap,allowLeading:false,trackingLimit:0}},...(containerEdit?{containerEdit}:{}),summary:rectangle?'已按矩形容器居中，保留内边距与圆角；请检查整体视觉效果。':'已结合文字区域和相邻留白调整，优先保留字号与完整行；图片内容仍需预览确认。'};
}
module.exports={proposeVisualLayout};
