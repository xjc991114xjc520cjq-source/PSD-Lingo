const crypto=require('node:crypto');
// Lossless references, not model-written summaries: retain every user message,
// tool argument, failure and the first copy of every exact result.
function historyFor(history,start=0){
 const seen=new Map();return history.map((h,index)=>{
  if(h.type!=='tool_result')return {...h,event:index};
  const key=h.tool+'|'+JSON.stringify(h.result),previous=seen.get(key);if(previous!==undefined)return {type:h.type,tool:h.tool,event:index,resultUnchangedFromEvent:previous};
  seen.set(key,index);return {...h,event:index};
 }).slice(start);
}
function taskData(task,start=0){return {originalRequest:task.request,typographySettings:task.typographySettings||[],reviewProfile:task.reviewProfile||'delivery',taskKind:task.taskKind||'production',attachments:task.files,outputDirectory:task.outputDirectory,history:historyFor(task.history||[],start),availableReferenceImages:(task.referenceVisuals||[]).map(({fileId,name})=>({fileId,name}))};}
const imageId=image=>crypto.createHash('sha256').update(image).digest('hex');
function recordMetrics(task,m){
 if(!task)return;const p=task.performance||={calls:0,failedCalls:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,usageReportedCalls:0,promptBytes:0,imageCount:0,durationMs:0,resumedTurns:0,reusedOperations:0,phases:{}};
 if(m.nativeTurn){p.nativeTurns=(p.nativeTurns||0)+1;p.promptBytes+=m.promptBytes||0;return;}
 if(m.toolBytes!==undefined){p.toolResultBytes=(p.toolResultBytes||0)+m.toolBytes;p.imageCount+=m.toolImages||0;p.nativeToolCalls=(p.nativeToolCalls||0)+1;return;}
 if(m.reused){p.reusedOperations++;return;}
 const number=n=>Number.isFinite(n)&&n>=0?n:0,u=m.usage;p.calls++;if(m.failed)p.failedCalls=(p.failedCalls||0)+1;p.promptBytes+=number(m.promptBytes);p.imageCount+=number(m.imageCount);p.durationMs+=number(m.durationMs);if(m.sessionReused)p.resumedTurns++;
 if(u){p.usageReportedCalls++;p.inputTokens+=number(u.input_tokens);p.cachedInputTokens+=number(u.cached_input_tokens);p.outputTokens+=number(u.output_tokens);}
 const phase=m.taskName||'unknown';p.phases[phase]=(p.phases[phase]||0)+1;
}
module.exports={historyFor,taskData,imageId,recordMetrics};
