// Completion is derived from the final software result, never from old errors
// or a model-written paragraph. Keep the original history available in details.
function completionFor(task){
 if(task.taskKind==='image-audit'){const r=[...(task.history||[])].reverse().find(h=>h.type==='tool_result'&&h.tool==='audit_images'&&h.result?.auditCompleted)?.result;return {title:'审验已完成',tone:'success',summary:r?`已检查 ${r.total} 张图片 · ${r.needsChanges} 张有修改建议`:'图片审验已结束',verification:'仅检查成品图，未修改原文件',outputDirectory:'',hasOutputs:false};}

 const deliveries=require('./agent-delivery-scope.cjs').latestDeliveries(task.history),results=[...new Set(deliveries.map(d=>d.result))];
 const entries=[...new Map(deliveries.filter(d=>d.entry?.output).map(d=>[d.entry.output,d.entry])).values()];
 const outputs=entries.map(r=>r.output);
 const boardCount=entries.reduce((n,r)=>n+(r.delivery?.boards?.length||0),0)||results.reduce((n,r)=>n+(r.audits||[]).reduce((m,a)=>m+(a.boards?.length||0),0),0);
 const attention=results.some(r=>require('./agent-operation-result.cjs').operationFailure(r));
 const verified=outputs.length>0&&results.length>0&&results.every(r=>r.qualityPassed===true)&&!attention;
 return {title:attention?'部分结果待确认':'任务已完成',tone:attention?'attention':'success',summary:outputs.length?[boardCount?`${boardCount} 张画板`:null,`${outputs.length} 份可编辑文件`].filter(Boolean).join(' · '):'本轮分析与操作已结束，可继续补充要求。',verification:verified?'已保存，并通过最终图片审验':attention?'文件已保留，查看详情了解待处理项':'',outputDirectory:task.outputDirectory||'',hasOutputs:outputs.length>0};
}
module.exports={completionFor};
