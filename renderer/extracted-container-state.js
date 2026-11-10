// Raster extraction definitions are separate from the immutable imported artwork.
// Rehydrate their virtual shape metadata whenever a project/language is reopened.
export function restoreExtractedContainers(file,items=[]){
 const copy=value=>JSON.parse(JSON.stringify(value));
 file.extractedContainers=copy(items);
 const native=(file.containers||[]).filter(c=>!c.extracted),ids=new Set(native.map(c=>c.id));
 for(const item of file.extractedContainers){
  if(!Number.isInteger(item.id)||item.id>=0||ids.has(item.id))continue;
  const anchor=file.layers?.find(l=>l.id===item.anchorTextId);
  native.push({id:item.id,name:item.name,kind:'shape',shapeType:'rectangle',box:[...item.box],radii:[...item.radii],color:item.fill,issues:[],extracted:true,
   ...(anchor?{parentId:anchor.parentId,group:anchor.group,stackIndex:Number.isFinite(anchor.stackIndex)?anchor.stackIndex+.5:undefined}:{})});
  ids.add(item.id);
 }
 file.containers=native;
 return file;
}
