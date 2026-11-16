// Completion is derived from the final software result, never from old errors
// or a model-written paragraph. Keep the original history available in details.
function completionFor(task){
 const exports=(task.history||[]).filter(h=>h.type==='tool_result'&&h.tool==='export_files'&&h.result);
 const result=exports.at(-1)?.result;
 const outputs=[...new Set((result?.results||[]).map(r=>r.output).filter(p=>typeof p==='string'&&p))];
 const boardCount=(result?.audits||[]).reduce((n,a)=>n+(a.boards?.length||0),0)||(result?.results||[]).reduce((n,r)=>n+(r.delivery?.boards?.length||0),0);
 const attention=!!(result&&(result.failed>0||result.qualityPassed===false));
 return {title:attention?'部分结果待确认':'任务已完成',tone:attention?'attention':'success',summary:outputs.length?[boardCount?`${boardCount} 张画板`:null,`${outputs.length} 份可编辑文件`].filter(Boolean).join(' · '):'本轮分析与操作已结束，可继续补充要求。',verification:result?.qualityPassed===true?'已保存，并通过最终图片审验':attention?'文件已保留，查看详情了解待处理项':'',outputDirectory:task.outputDirectory||'',hasOutputs:outputs.length>0};
}
module.exports={completionFor};
