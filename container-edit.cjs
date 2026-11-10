const {normalizeRadii}=require('./rectangle-shape.cjs');
function validateContainerEdits(edits,{width,height,textIds=[],containers}={}){
  if(edits===undefined)return [];
  if(!Array.isArray(edits)||edits.length>500)throw new Error('底部容器调整参数无效');
  const seen=new Set(),texts=new Set(textIds);
  for(const e of edits){
    if(!e||!Number.isInteger(e.layerId)||seen.has(e.layerId)||texts.has(e.layerId)||!Number.isInteger(e.textLayerId)||!texts.has(e.textLayerId))throw new Error('底部容器关联或图层 ID 无效');
    seen.add(e.layerId);
    for(const b of [e.sourceBox,e.box])if(!Array.isArray(b)||b.length!==4||b.some(v=>!Number.isFinite(v)||Math.abs(v)>300000)||b[2]<=0||b[3]<=0)throw new Error('底部容器边界无效');
    if(!(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0))throw new Error('底部容器缺少画布尺寸');
    if(e.box[0]<0||e.box[1]<0||e.box[0]+e.box[2]>width+.01||e.box[1]+e.box[3]>height+.01)throw new Error('底部容器目标区域超出画布');
    if(e.radii!==undefined)e.radii=normalizeRadii(e.radii,e.box);
    if(e.sourceRadii!==undefined)normalizeRadii(e.sourceRadii,e.sourceBox);
    if(containers){const c=containers.find(c=>c.id===e.layerId);if(!c||c.kind!=='shape'||c.issues?.length||JSON.stringify(c.box)!==JSON.stringify(e.sourceBox))throw new Error('底部容器原图层校验失败，请重新导入');}
    if(containers){const c=containers.find(c=>c.id===e.layerId),resize=e.box[2]!==e.sourceBox[2]||e.box[3]!==e.sourceBox[3];
      if((resize||e.radii!==undefined)&&c.shapeType!=='rectangle')throw new Error('此容器不是 Photoshop 矩形工具的实时形状，仅支持移动');
      if(c.shapeType==='rectangle'){
        if(e.sourceRadii&&e.sourceRadii.some((v,i)=>Math.abs(v-c.radii[i])>.01))throw new Error('底部容器原始圆角已变化，请重新导入');
        e.radii=normalizeRadii(e.radii||c.radii,e.box);e.sourceRadii=[...c.radii];
      }
    }
  }
  return edits;
}
// Shared by preview and export. All transforms target a document duplicate.
const containerScript=String.raw`
function containerBounds(l){var b=l.bounds;return [b[0].as('px'),b[1].as('px'),b[2].as('px')-b[0].as('px'),b[3].as('px')-b[1].as('px')];}
function liveRectangleOrigin(d){
 var listKey=stringIDToTypeID('keyDescriptorList'),origKey=stringIDToTypeID('vectorOrigination'),list=null;
 if(d.hasKey(origKey))d=d.getObjectValue(origKey);
 if(!d.hasKey(listKey))return null;list=d.getList(listKey);if(list.count!==1)return null;
 var o=list.getObjectValue(0),type=stringIDToTypeID('keyOriginType'),invalid=stringIDToTypeID('keyShapeInvalidated'),rkey=stringIDToTypeID('keyOriginRRectRadii');
 if(!o.hasKey(type)||o.getInteger(type)!==1||o.hasKey(invalid)&&o.getBoolean(invalid))return null;
 var radii=[0,0,0,0];if(o.hasKey(rkey)){var r=o.getObjectValue(rkey),names=['topLeft','topRight','bottomRight','bottomLeft'];for(var i=0;i<4;i++){var k=stringIDToTypeID(names[i]);if(!r.hasKey(k))return null;radii[i]=r.getUnitDoubleValue(k);if(!isFinite(radii[i])||radii[i]<0)return null;}}
 return {radii:radii};
}
function checkContainer(doc,e){
 var l=findContainer(doc,e.layerId),p=l;
 if(!l||l.typename!=='ArtLayer'||l.kind!==LayerKind.SOLIDFILL||l.grouped)throw new Error('底部容器不是独立可编辑形状：'+e.layerId);
 while(p&&p.typename!=='Document'){
  var locked=false;try{locked=p.allLocked;}catch(_){}try{locked=locked||p.positionLocked;}catch(_){}if(!p.visible||locked)throw new Error('底部容器或分组隐藏／锁定：'+e.layerId);
  if(p!==l){
   var ar=new ActionReference();ar.putIdentifier(stringIDToTypeID('layer'),p.id);var ad=executeActionGet(ar);
   if((ad.hasKey(stringIDToTypeID('group'))&&ad.getBoolean(stringIDToTypeID('group')))||(ad.hasKey(stringIDToTypeID('hasUserMask'))&&ad.getBoolean(stringIDToTypeID('hasUserMask')))||(ad.hasKey(stringIDToTypeID('hasVectorMask'))&&ad.getBoolean(stringIDToTypeID('hasVectorMask')))||(ad.hasKey(stringIDToTypeID('hasFilterMask'))&&ad.getBoolean(stringIDToTypeID('hasFilterMask')))||ad.hasKey(stringIDToTypeID('layerEffects')))throw new Error('底部容器所属分组包含剪贴、蒙版或效果：'+e.layerId);
   var peers=p.parent.layers;for(var pi=1;pi<peers.length;pi++)if(peers[pi].id===p.id&&peers[pi-1].grouped)throw new Error('底部容器所属分组包含剪贴关系：'+e.layerId);
  }
  p=p.parent;
 }
 var siblings=l.parent.layers;for(var s=1;s<siblings.length;s++)if(siblings[s].id===l.id&&siblings[s-1].grouped)throw new Error('底部容器包含剪贴关系：'+e.layerId);
 var r=new ActionReference();r.putIdentifier(stringIDToTypeID('layer'),l.id);var d=executeActionGet(r);
 if(!d.hasKey(stringIDToTypeID('hasVectorMask'))||!d.getBoolean(stringIDToTypeID('hasVectorMask')))throw new Error('底部容器缺少可编辑形状路径：'+e.layerId);
 if(d.hasKey(stringIDToTypeID('strokeStyle'))){var stroke=d.getObjectValue(stringIDToTypeID('strokeStyle'));if(stroke.hasKey(stringIDToTypeID('strokeEnabled'))&&stroke.getBoolean(stringIDToTypeID('strokeEnabled')))throw new Error('底部容器包含复杂描边：'+e.layerId);}
 if((d.hasKey(stringIDToTypeID('hasUserMask'))&&d.getBoolean(stringIDToTypeID('hasUserMask')))||(d.hasKey(stringIDToTypeID('hasFilterMask'))&&d.getBoolean(stringIDToTypeID('hasFilterMask')))||d.hasKey(stringIDToTypeID('layerEffects')))throw new Error('底部容器包含蒙版或效果：'+e.layerId);
 if(e.radii||e.sourceRadii){var live=liveRectangleOrigin(d);if(!live)throw new Error('底部容器不是已验证的 Photoshop 实时矩形：'+e.layerId);if(!e.sourceRadii||e.sourceRadii.length!==4)throw new Error('底部容器缺少原始圆角：'+e.layerId);for(var ri=0;ri<4;ri++)if(Math.abs(live.radii[ri]-e.sourceRadii[ri])>.1)throw new Error('底部容器原始圆角已变化：'+e.layerId);}
 var b=containerBounds(l);for(var k=0;k<4;k++)if(Math.abs(b[k]-e.sourceBox[k])>1)throw new Error('底部容器原始边界已变化：'+e.layerId);
 return l;
}
function findContainer(c,id){for(var i=0;i<c.layers.length;i++){var l=c.layers[i];if(l.id===id)return l;if(l.typename==='LayerSet'){var f=findContainer(l,id);if(f)return f;}}return null;}
function rectangleRadii(r,box){var ratio=1,sums=[r[0]+r[1],r[3]+r[2],r[0]+r[3],r[1]+r[2]],limits=[box[2],box[2],box[3],box[3]];for(var i=0;i<4;i++){if(!isFinite(r[i])||r[i]<0)throw new Error('矩形圆角无效');if(sums[i]>limits[i])ratio=Math.min(ratio,limits[i]/sums[i]);}return [r[0]*ratio,r[1]*ratio,r[2]*ratio,r[3]*ratio];}
function editLiveRectangle(doc,l,e){
 doc.activeLayer=l;
 var d=new ActionDescriptor(),r=new ActionReference();r.putEnumerated(stringIDToTypeID('path'),stringIDToTypeID('path'),stringIDToTypeID('vectorMask'));r.putIdentifier(stringIDToTypeID('layer'),l.id);d.putReference(stringIDToTypeID('null'),r);
 d.putInteger(stringIDToTypeID('keyOriginType'),1);
 var b=new ActionDescriptor();b.putUnitDouble(stringIDToTypeID('top'),stringIDToTypeID('pixelsUnit'),e.box[1]);b.putUnitDouble(stringIDToTypeID('left'),stringIDToTypeID('pixelsUnit'),e.box[0]);b.putUnitDouble(stringIDToTypeID('bottom'),stringIDToTypeID('pixelsUnit'),e.box[1]+e.box[3]);b.putUnitDouble(stringIDToTypeID('right'),stringIDToTypeID('pixelsUnit'),e.box[0]+e.box[2]);d.putObject(stringIDToTypeID('keyOriginShapeBBox'),stringIDToTypeID('classFloatRect'),b);
 var corners=rectangleRadii(e.radii||e.sourceRadii,e.box),cr=new ActionDescriptor(),names=['topLeft','topRight','bottomRight','bottomLeft'];for(var j=0;j<4;j++)cr.putUnitDouble(stringIDToTypeID(names[j]),stringIDToTypeID('pixelsUnit'),corners[j]);d.putObject(stringIDToTypeID('keyOriginRRectRadii'),stringIDToTypeID('radii'),cr);
 d.putInteger(stringIDToTypeID('keyActionMode'),1);
 try{executeAction(stringIDToTypeID('changePathDetails'),d,DialogModes.NO);}catch(error){throw new Error('Photoshop 无法编辑此实时矩形，请确认图层来自矩形工具：'+e.layerId+' / '+error.message);}
}
function applyContainers(doc,edits){for(var i=0;i<edits.length;i++){var e=edits[i],l=checkContainer(doc,e),b=containerBounds(l);
 if(e.radii||e.sourceRadii)editLiveRectangle(doc,l,e);
 else {if(Math.abs(e.box[2]-b[2])>.01||Math.abs(e.box[3]-b[3])>.01)throw new Error('此容器不是已验证的实时矩形，不能缩放圆角：'+e.layerId);l.translate(new UnitValue(e.box[0]-b[0],'px'),new UnitValue(e.box[1]-b[1],'px'));}
 b=containerBounds(l);for(var k=0;k<4;k++)if(Math.abs(b[k]-e.box[k])>2)throw new Error('底部容器调整结果与预览不一致：'+e.layerId);}}
`;
module.exports={validateContainerEdits,containerScript};
