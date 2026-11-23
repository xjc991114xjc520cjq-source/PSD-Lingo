const {validateArtboardPlan}=require('../photoshop-artboard-plan.cjs');
// Read-only expansion must preserve every configured target and its source identity.
function mergeNativeScan(file,meta){
 const plan=file.artboardPlan;if(!plan)return null;
 if(!plan.nativeTextScanId||plan.nativeTextScanId!==file.nativeTextScanId||plan.operation!=='edit')throw Error('当前计划不是同一原生文字改字计划，不能叠加扫描');
 for(const change of plan.boards.flatMap(b=>b.changes)){
  const before=file.layers.find(l=>l.id===change.layerId),after=meta.layers.find(l=>l.id===change.layerId);
  const signature=l=>JSON.stringify([l?.original,l?.boardId,l?.nativePath,l?.engine,l?.localBox,l?.nativeCanvas,l?.mixedStyleRuns,l?.font,l?.size,l?.supported,l?.box,l?.boardBox]);
  if(!before||!after||signature(before)!==signature(after))throw Error('补充扫描发现已配置文字的来源或样式变化；已保留现有计划，请先核对该对象：'+change.layerId);
 }
 const merged={...plan,nativeTextScanId:meta.nativeTextScanId};validateArtboardPlan(merged,{...file,...meta});return merged;
}
module.exports={mergeNativeScan};
