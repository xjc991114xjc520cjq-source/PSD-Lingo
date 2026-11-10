// Shipped with the app: source relationships do not depend on installed skills.
const {validBox}=require('./container-fit.cjs');
const overlap=(a,b)=>a[0]<b[0]+b[2]-.1&&a[0]+a[2]>b[0]+.1&&a[1]<b[1]+b[3]-.1&&a[1]+a[3]>b[1]+.1;
function titleRelations(rows){
 const result=[];
 for(const upper of rows){
  if(upper.containerId!=null||!validBox(upper.sourceBox))continue;
  const a=upper.sourceBox;
  const candidates=rows.filter(lower=>{
   const b=lower.sourceBox,gap=b?.[1]-a[1]-a[3];
   return lower!==upper&&lower.containerId==null&&validBox(b)&&lower.parentId===upper.parentId&&upper.originalSize>=lower.originalSize*1.2&&gap>=0&&gap<=upper.originalSize*.85&&Math.min(a[0]+a[2],b[0]+b[2])>Math.max(a[0],b[0]);
  }).sort((l,r)=>l.sourceBox[1]-r.sourceBox[1]);
  if(candidates.length)result.push({upper:upper.layerKey,lower:candidates[0].layerKey,gap:candidates[0].sourceBox[1]-a[1]-a[3]});
 }
 return result;
}
function reconcileTitleSpacing({request,working,accepted,records,fitText}){
 const allowed=new Map(accepted.map(a=>[String(a.id),a]));
 const bounds=l=>{const record=records.find(r=>r.id===l.recordId),b=l.box;if(!record||l.skipExport)return l.sourceBox||b;const f=fitText(l,record),x=l.position?.x??b[0],y=l.position?.y??b[1],factor=l.alignment==='center'?.5:l.alignment==='right'?1:0;return [x+Math.max(0,b[2]-f.width)*factor,y,f.width,f.height];};
 for(const relation of titleRelations(request.layers)){
  // A single-text task never moves its immutable neighbours.
  if(!allowed.has(relation.upper)||!allowed.has(relation.lower))continue;
  const upper=working.layers.find(l=>String(l.id)===relation.upper),lower=working.layers.find(l=>String(l.id)===relation.lower);
  const a=bounds(upper),b=bounds(lower),gap=Math.max(relation.gap,Math.min(upper.manual?.size||upper.size,lower.manual?.size||lower.size)*.15),y=a[1]+a[3]+gap;
  if(b[1]<=y+.5)continue;
  const next=[b[0],y,b[2],b[3]];
  if(y<0||y+b[3]>request.canvas.height||working.layers.some(l=>l!==upper&&l!==lower&&l.visible!==false&&overlap(next,l.recordId&&!l.skipExport?bounds(l):(l.sourceBox||l.box))))continue;
  const patch={...lower,box:[lower.box[0],y,lower.box[2],lower.box[3]],position:{x:lower.position?.x??lower.box[0],y}};
  Object.assign(lower,patch);allowed.get(relation.lower).candidate=patch;
 }
}
module.exports={titleRelations,reconcileTitleSpacing};
