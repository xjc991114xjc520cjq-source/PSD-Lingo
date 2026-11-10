const {normalizeRadii}=require('./rectangle-shape.cjs');
function validateExtractedContainers(items,{width,height,fingerprint,layers}={}){
 if(items===undefined)return [];
 if(!Array.isArray(items)||items.length>500)throw Error('拆分容器数量无效');
 const seen=new Set();
 for(const e of items){
  if(!e||!Number.isInteger(e.id)||e.id>=0||seen.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>200)throw Error('拆分容器标识无效');seen.add(e.id);
  if(!/^[a-f0-9]{64}$/i.test(e.sourceFingerprint||'')||fingerprint&&e.sourceFingerprint!==fingerprint)throw Error('拆分容器原稿来源不一致，请重新导入');
  if(!Array.isArray(e.box)||e.box.length!==4||e.box.some(v=>!Number.isFinite(v))||e.box[0]<0||e.box[1]<0||e.box[2]<=0||e.box[3]<=0||!(width>0&&height>0)||e.box[0]+e.box[2]>width+.01||e.box[1]+e.box[3]>height+.01)throw Error('拆分容器区域无效');
  if(e.cleanupBox!==undefined){const b=e.cleanupBox,s=e.box;if(!Array.isArray(b)||b.length!==4||b.some(v=>!Number.isFinite(v))||b[0]<0||b[1]<0||b[2]<=0||b[3]<=0||b[0]+b[2]>width+.01||b[1]+b[3]>height+.01)throw Error('拆分容器清理区域无效');const padding=[s[0]-b[0],s[1]-b[1],b[0]+b[2]-s[0]-s[2],b[1]+b[3]-s[1]-s[3]];if(padding.some(v=>v<-.01||v>32))throw Error('拆分容器清理区域必须包围原容器且边缘不超过 32 像素');}
  if(!/^#[a-f0-9]{6}$/i.test(e.fill||'')||!/^#[a-f0-9]{6}$/i.test(e.background||''))throw Error('拆分容器颜色无效');
  e.radii=normalizeRadii(e.radii,e.box);
  if(!Number.isInteger(e.anchorTextId)||e.anchorTextId<=0)throw Error('拆分容器缺少原稿文字层定位');
  if(layers&&!layers.some(l=>l.id===e.anchorTextId&&l.supported))throw Error('拆分容器关联文字层不可编辑');
  if(layers){const l=layers.find(l=>l.id===e.anchorTextId),b=l.box,cx=b[0]+b[2]/2,cy=b[1]+b[3]/2;if(cx<e.box[0]||cy<e.box[1]||cx>e.box[0]+e.box[2]||cy>e.box[1]+e.box[3])throw Error('拆分容器关联文字不在原容器内');}
 }
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){for(const [a,b] of [[items[i].cleanupBox||items[i].box,items[j].box],[items[j].cleanupBox||items[j].box,items[i].box]])if(Math.min(a[0]+a[2],b[0]+b[2])>Math.max(a[0],b[0])+.01&&Math.min(a[1]+a[3],b[1]+b[3])>Math.max(a[1],b[1])+.01)throw Error('拆分容器区域重叠，请缩小框选范围');}
 return items;
}
function extractedMetadata(items=[]){return items.map(e=>({id:e.id,name:e.name,kind:'shape',shapeType:'rectangle',box:[...e.box],radii:[...e.radii],color:e.fill,issues:[],extracted:true,parentId:null,stackIndex:1e9}));}
// Only runs on a duplicate. Flat-background restoration is explicit: detection
// must reject patterned/photo backgrounds rather than inventing hidden pixels.
const extractionScript=String.raw`
function extractionRectangle(doc,name,box,color,radii){
 var make=new ActionDescriptor(),ref=new ActionReference();ref.putClass(stringIDToTypeID('contentLayer'));make.putReference(charIDToTypeID('null'),ref);
 var using=new ActionDescriptor(),solid=new ActionDescriptor(),rgb=new ActionDescriptor();rgb.putDouble(charIDToTypeID('Rd  '),parseInt(color.substr(1,2),16));rgb.putDouble(charIDToTypeID('Grn '),parseInt(color.substr(3,2),16));rgb.putDouble(charIDToTypeID('Bl  '),parseInt(color.substr(5,2),16));solid.putObject(charIDToTypeID('Clr '),charIDToTypeID('RGBC'),rgb);using.putObject(charIDToTypeID('Type'),stringIDToTypeID('solidColorLayer'),solid);
 var shape=new ActionDescriptor();shape.putUnitDouble(charIDToTypeID('Top '),charIDToTypeID('#Pxl'),box[1]);shape.putUnitDouble(charIDToTypeID('Left'),charIDToTypeID('#Pxl'),box[0]);shape.putUnitDouble(charIDToTypeID('Btom'),charIDToTypeID('#Pxl'),box[1]+box[3]);shape.putUnitDouble(charIDToTypeID('Rght'),charIDToTypeID('#Pxl'),box[0]+box[2]);using.putObject(charIDToTypeID('Shp '),charIDToTypeID('Rctn'),shape);make.putObject(charIDToTypeID('Usng'),stringIDToTypeID('contentLayer'),using);executeAction(charIDToTypeID('Mk  '),make,DialogModes.NO);
 var result=doc.activeLayer;result.name=name;editLiveRectangle(doc,result,{box:box,radii:radii,sourceRadii:[0,0,0,0]});return result;
}
function extractionIntersects(layer,box){var b=layer.bounds,left=b[0].as('px'),top=b[1].as('px'),right=b[2].as('px'),bottom=b[3].as('px');return Math.min(right,box[0]+box[2])>Math.max(left,box[0])&&Math.min(bottom,box[1]+box[3])>Math.max(top,box[1]);}
function extractionSafeLayer(layer){
 if(layer.grouped||layer.opacity<99.99)throw Error('拆分容器所在图层包含剪贴或透明度');
 try{if(layer.fillOpacity<99.99)throw Error('拆分容器所在图层包含填充透明度');}catch(error){if(String(error.message).indexOf('填充透明度')>=0)throw error;}
 try{if(layer.blendMode!==BlendMode.NORMAL&&layer.blendMode!==BlendMode.PASSTHROUGH)throw Error('拆分容器所在图层混合模式不安全');}catch(error){if(String(error.message).indexOf('混合模式')>=0)throw error;}
 var ref=new ActionReference();ref.putIdentifier(stringIDToTypeID('layer'),layer.id);var descriptor=executeActionGet(ref),names=['hasUserMask','hasVectorMask','hasFilterMask'];
 for(var i=0;i<names.length;i++){var key=stringIDToTypeID(names[i]);if(descriptor.hasKey(key)&&descriptor.getBoolean(key))throw Error('拆分容器所在图层包含蒙版');}
 if(descriptor.hasKey(stringIDToTypeID('layerEffects')))throw Error('拆分容器所在图层包含效果');
 var peers=layer.parent.layers;for(var p=1;p<peers.length;p++)if(peers[p].id===layer.id&&peers[p-1].grouped)throw Error('拆分容器所在图层承载剪贴关系');
}
function extractionInsertionAnchor(doc,anchor,box){
 var bottom=anchor,p=anchor;while(p&&p.typename!=='Document'){if(!p.visible||p.allLocked)throw Error('拆分容器所在分组隐藏或锁定');extractionSafeLayer(p);p=p.parent;}
 // Photoshop layers are top first. Put the shape after the lowest visible
 // intersecting text sibling; never cover another caption in the container.
 function scan(container,visible){for(var i=0;i<container.layers.length;i++){var l=container.layers[i],shown=visible&&l.visible;if(!shown)continue;if(l.typename==='LayerSet')scan(l,shown);else if(l.kind===LayerKind.TEXT&&extractionIntersects(l,box)){if(l.parent!==anchor.parent)throw Error('容器覆盖了不同分组的文字，无法安全拆分');extractionSafeLayer(l);bottom=l;}}}
 scan(doc,true);return bottom;
}
function materializeExtracted(doc,items,edits){
 var mapped=[],map={};
 for(var i=0;i<items.length;i++){
  var e=items[i],anchor=findContainer(doc,e.anchorTextId);
  if(!anchor||anchor.typename!=='ArtLayer'||anchor.kind!==LayerKind.TEXT||anchor.grouped)throw Error('拆分容器的文字层定位不安全：'+e.name);
  anchor=extractionInsertionAnchor(doc,anchor,e.cleanupBox||e.box);
  var clean=extractionRectangle(doc,e.name+' · 原容器清理',e.cleanupBox||e.box,e.background,[0,0,0,0]);clean.move(anchor,ElementPlacement.PLACEAFTER);
  var shape=extractionRectangle(doc,e.name,e.box,e.fill,e.radii);shape.move(clean,ElementPlacement.PLACEBEFORE);checkContainer(doc,{layerId:shape.id,sourceBox:e.box,radii:e.radii,sourceRadii:e.radii});map[String(e.id)]=shape.id;
 }
 for(var j=0;j<edits.length;j++){var original=edits[j],copy={};for(var k in original)if(original.hasOwnProperty(k))copy[k]=original[k];if(copy.layerId<0){if(!map[String(copy.layerId)])throw Error('拆分容器未生成');copy.layerId=map[String(copy.layerId)];}mapped.push(copy);}
 return mapped;
}
`;
module.exports={validateExtractedContainers,extractedMetadata,extractionScript};
