// Pure geometry context shared by the renderer and the isolated design task.
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0;
const {recommendedContainer}=require('./container-fit.cjs');
const {manualStyleFor}=require('./layout.cjs');
const {measuredSpaceOptions}=require('./design-space-options.cjs');
function buildDesignLayoutRequest({file,layer,records,fitText,auditOnly=false}){
 if(!file||!layer||!file.layers.includes(layer))throw Error('请选择需要排版的文字。');
 const rows=file.layers.filter(l=>l.visible!==false&&validBox(l.box)).map(l=>{
  const record=records.find(r=>r.id===l.recordId),active=!!record&&!l.skipExport&&!l.issues?.length,fit=active&&fitText?fitText(l,record):null;
  const mixed=file.mixedTextEdits?.find(e=>e.layerId===l.id);
  const typography=manualStyleFor(active?l:{...l,manual:undefined});
  const box=[...(active?l.box:l.sourceBox||l.box)];if(active&&l.position){box[0]=l.position.x;box[1]=l.position.y;}
  const recommendation=l.containerId===undefined?recommendedContainer(file,l):null;
  const containerId=l.containerId===undefined?recommendation.recommended?.id:l.containerId;
  return {boardNames:l.boardNames||[],boardBox:l.boardBox||null,layerKey:String(l.id),name:String(l.name||''),parentId:String(l.parentId??''),original:String(l.original||''),target:mixed?mixed.target:active?(typeof l.customText==='string'?l.customText:String(record.target)):String(l.original||''),...(mixed?{nativeMixedEdit:mixed,mixedStyleRuns:l.mixedStyleRuns,note:'混合改字已由原生实际渲染；box仍是原稿参考边界，不代表当前字形边界，只能依据实际图像审验。如需修改分段/缩放/锚点使用edit_mixed_text，不使用普通排版覆盖。'}:{}),bound:active,immutable:!active||l.id!==layer.id,sourceBox:[...(l.sourceBox||l.box)],box,capitalization:l.capitalization||'normal',font:String(typography.font||''),size:typography.size,originalSize:l.size,weight:typography.weight,stretchX:typography.stretchX,stretchY:typography.stretchY,alignment:l.alignment||'left',tracking:typography.tracking,leading:typography.leading,containerId:containerId===undefined||containerId===null?null:String(containerId),containerAmbiguous:recommendation?.ambiguous||false,...(fit?{fit:{width:fit.width,height:fit.height,size:fit.size,lines:fit.lines,ok:fit.ok}}:{})};
 });
 for(const row of rows){const original=file.layers.find(l=>String(l.id)===row.layerKey);if(row.bound)row.spaceOptions=measuredSpaceOptions({file,layer:original,record:records.find(r=>r.id===original.recordId),fitText});}
 const selected=rows.find(l=>l.layerKey===String(layer.id));if(!selected?.bound&&!auditOnly)throw Error('请先为当前文字指定文案。');
 const containers=(file.containers||[]).filter(c=>validBox(c.box)).map(c=>{const edit=(file.containerEdits||[]).find(e=>String(e.layerId)===String(c.id));return {id:String(c.id),name:String(c.name||''),parentId:String(c.parentId??''),shapeType:String(c.shapeType||''),sourceBox:[...c.box],box:[...(edit?.box||c.box)],radii:[...(edit?.radii||c.radii||[])],editable:c.supported!==false};});
 return {version:1,designSkillIdentity:require('./services/design-skill-manifest.json'),artworkObjects:(file.artworkObjects||[]).map(o=>({objectId:o.objectId,kind:o.kind,box:o.box,boardNames:o.boardNames,editable:false})),selectedLayerKey:selected?.layerKey||String(layer.id),canvas:{width:file.width,height:file.height},layers:rows,containers,visualInput:'geometry-only'};
}
module.exports={buildDesignLayoutRequest,validBox};
