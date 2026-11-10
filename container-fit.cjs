const {targetBox}=require('./position.cjs');
const {normalizeRadii}=require('./rectangle-shape.cjs');
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0;
const validRadii=r=>Array.isArray(r)&&r.length===4&&r.every(n=>Number.isFinite(n)&&n>=0);
// Rectangle corner values are document pixels, never transform percentages.
function rectangleRadii(radii,box){if(!validRadii(radii)||!validBox(box))return null;try{return normalizeRadii(radii,box);}catch{return null;}}
function contains(outer,inner,tolerance=1){return validBox(outer)&&validBox(inner)&&inner[0]>=outer[0]-tolerance&&inner[1]>=outer[1]-tolerance&&inner[0]+inner[2]<=outer[0]+outer[2]+tolerance&&inner[1]+inner[3]<=outer[1]+outer[3]+tolerance;}
function sourceTolerance(text){return Math.max(2,Math.min(8,(Number(text.size)||20)*.15));}
function eligibleContainers(file,text){
 const original=text.sourceBox||text.box;if(!validBox(original))return [];
 return (file.containers||[]).filter(shape=>shape.kind==='shape'&&Number.isInteger(shape.id)&&!shape.issues?.length&&contains(shape.box,original,sourceTolerance(text))&&shape.box[2]*shape.box[3]<=file.width*file.height*.35&&shape.box[2]*shape.box[3]<=original[2]*original[3]*100);
}
function recommendedContainer(file,text){
 const candidates=eligibleContainers(file,text),same=candidates.filter(s=>(s.parentId!==undefined&&text.parentId!==undefined?s.parentId===text.parentId:s.group===text.group)&&Number.isFinite(s.stackIndex)&&Number.isFinite(text.stackIndex)&&s.stackIndex>text.stackIndex);
 return {candidates,recommended:same.length===1?same[0]:null,ambiguous:same.length>1||!same.length&&candidates.length>1};
}
function replacementBounds(text,fit){
 const b=targetBox(text.box,text.position),width=fit?.width,height=fit?.height;
 if(!validBox(b)||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)return null;
 const factor=text.alignment==='center'?.5:text.alignment==='right'?1:0;
 return [b[0]+(b[2]-width)*factor,b[1],width,height];
}
function containerOverflow(shapeBox,textBox){
 if(!validBox(shapeBox)||!validBox(textBox))return null;
 const x=Math.max(0,shapeBox[0]-textBox[0],textBox[0]+textBox[2]-shapeBox[0]-shapeBox[2]),y=Math.max(0,shapeBox[1]-textBox[1],textBox[1]+textBox[3]-shapeBox[1]-shapeBox[3]);
 return {overflow:x>1||y>1,major:x>Math.max(3,shapeBox[2]*.1)||y>Math.max(3,shapeBox[3]*.1),x,y};
}
function expandsIntoNeighbour(file,shape,box,other,otherBox=other.box){
 const overlaps=(a,b)=>validBox(a)&&validBox(b)&&a[0]<b[0]+b[2]-1&&a[0]+a[2]>b[0]+1&&a[1]<b[1]+b[3]-1&&a[1]+a[3]>b[1]+1;
 if(other.id===shape.id||other.issues?.length||!validBox(otherBox)||otherBox[2]*otherBox[3]>file.width*file.height*.35)return false;
 return overlaps(box,otherBox)&&!overlaps(shape.box,otherBox);
}
function activeContainerEdits(file){
 const active=(file.layers||[]).filter(text=>text.recordId&&!text.skipExport&&!text.issues?.length);
 return (file.containerEdits||[]).flatMap(edit=>{
  const original=active.find(text=>text.id===edit.textLayerId),associated=active.filter(text=>text.containerId===edit.layerId);
  const owner=associated.find(text=>text.id===edit.textLayerId)||associated[0]||(original&&original.containerId===undefined?original:null);
  return owner?[{...edit,textLayerId:owner.id,sourceBox:[...edit.sourceBox],box:[...edit.box],...(edit.radii?{radii:[...edit.radii]}:{}),...(edit.sourceRadii?{sourceRadii:[...edit.sourceRadii]}:{})}]:[];
 });
}
function fitContainer(file,text,shape,fit,currentBox=shape.box){
 if(shape.shapeType!=='rectangle'||!validRadii(shape.radii))return {ok:false,reason:'此图层不是可编辑矩形。请在 Photoshop 使用矩形工具制作背景；不会拉伸普通路径或缩放其圆角。'};
 const original=text.sourceBox||text.box,rendered=replacementBounds(text,fit);
 if(!contains(shape.box,original,sourceTolerance(text))||!validBox(currentBox)||!rendered)return {ok:false,reason:'无法确认原文字与背景容器的对应关系。'};
 const padding=[Math.max(0,original[0]-shape.box[0]),Math.max(0,original[1]-shape.box[1]),Math.max(0,shape.box[0]+shape.box[2]-original[0]-original[2]),Math.max(0,shape.box[1]+shape.box[3]-original[1]-original[3])];
 const left=Math.min(currentBox[0],rendered[0]-padding[0]),top=Math.min(currentBox[1],rendered[1]-padding[1]),right=Math.max(currentBox[0]+currentBox[2],rendered[0]+rendered[2]+padding[2]),bottom=Math.max(currentBox[1]+currentBox[3],rendered[1]+rendered[3]+padding[3]);
 const box=[left,top,right-left,bottom-top].map(n=>Math.round(n*10)/10);
 if(!contains([0,0,file.width,file.height],box,0))return {ok:false,reason:'保留原内边距后会超出画布，请先移动文字或手动调整容器。'};
 return {ok:true,box,padding,changed:box.some((n,i)=>Math.abs(n-currentBox[i])>.05)};
}
module.exports={validBox,validRadii,rectangleRadii,contains,eligibleContainers,recommendedContainer,replacementBounds,containerOverflow,expandsIntoNeighbour,activeContainerEdits,fitContainer};
