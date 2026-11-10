// Plan in isolated per-language workspaces. Export starts only after planning
// settles, so cancellation never accidentally exports an unplanned language.
export async function autoLayoutBatch({documents,template,options,call,autoLayoutLanguage,onProgress=()=>{},isCancelled=()=>false,useAi=true}){
 const issues=[],planned=[];
 for(let index=0;index<documents.length;index++){
  if(isCancelled())return {cancelled:true,planned,issues};
  const document=documents[index],progress={current:index,total:documents.length,language:document.name};
  if(document.manualPlan){onProgress({...progress,message:`保留已确认排版：${document.name}`});planned.push(document);continue;}
  if(!autoLayoutLanguage)throw new Error('批量自动排版未连接，请更新软件后重试。');
  onProgress({...progress,message:`正在适配 ${index+1}/${documents.length}：${document.name}`});
  try{
   const prepared=await call('prepareBatchPreview',{id:document.id,...options,layouts:document.computed.layouts});
   if(isCancelled())return {cancelled:true,planned,issues};
   const result=await autoLayoutLanguage({prepared,document,template,useAi,isCancelled,onProgress:p=>onProgress({...progress,...p})});
   if(isCancelled()||result?.cancelled)return {cancelled:true,planned,issues};
   if(!result?.plan?.files?.length)throw new Error('自动排版没有产生有效导出文件。');
   document.manualPlan=result.plan;document.previewLayers=result.layers;document.autoPlanned=true;document.layoutIssues=result.issues||[];
   document.problem=document.layoutIssues.length?'有 '+document.layoutIssues.length+' 项需检查；可预览单独调整。':'';
   for(const issue of document.layoutIssues)issues.push({language:document.name,message:typeof issue==='string'?issue:issue.message||String(issue)});
   planned.push(document);
  }catch(error){
   if(isCancelled())return {cancelled:true,planned,issues};
   document.layoutIssues=[error.message];document.problem='自动排版未完成：'+error.message;issues.push({language:document.name,message:error.message,blocked:true});
  }
 }
 return {cancelled:false,planned,issues};
}
