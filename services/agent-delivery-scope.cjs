// Export coverage comes from software-selected indices, never from model prose.
function fileIndices(args={},result={}){
 const indices=result?.fileIndices??args?.fileIndices;
 return Array.isArray(indices)&&indices.length&&indices.every(n=>Number.isInteger(n)&&n>=0)?[...new Set(indices)]:null;
}
function coversFile(args,result,index){const indices=fileIndices(args,result);return indices===null||indices.includes(index);}
function applyExportOutcome(unresolved,args,result,error){
 const indices=fileIndices(args,result),keys=indices?indices.map(i=>'export:file:'+i):['export:all'];
 // Only software can identify that this result covers the entire workspace.
 // Replace an older unknown/full failure with the new per-file outcomes.
 if(result?.exportScope==='all'&&(!error||Array.isArray(result.fileOutcomes)&&indices?.every(i=>result.fileOutcomes.some(o=>o.fileIndex===i))))for(const key of unresolved.keys())if(key.startsWith('export:'))unresolved.delete(key);
 if(indices&&Array.isArray(result?.fileOutcomes)&&indices.every(i=>result.fileOutcomes.some(o=>o.fileIndex===i))){
  for(const i of indices){const key='export:file:'+i,outcome=result.fileOutcomes.find(o=>o.fileIndex===i),failure=require('./agent-operation-result.cjs').operationFailure(outcome);if(failure)unresolved.set(key,failure);else unresolved.delete(key);}
  return;
 }
 if(error){for(const key of keys)unresolved.set(key,error);}
 else if(indices){for(const key of keys)unresolved.delete(key);}
 else for(const key of unresolved.keys())if(key.startsWith('export:'))unresolved.delete(key);
}
function latestDeliveries(history=[]){
 const slots=new Map();let args={};
 for(const h of history){
  if(h.type==='tool_start'&&h.tool==='export_files')args=h.args||{};
  if(h.type!=='tool_result'||h.tool!=='export_files'||!h.result)continue;
  const r=h.result,indices=fileIndices(args,r);
  // A full export supersedes the previous full set. Subset exports update only
  // the corresponding files and must not erase other successful deliveries.
  if(!indices||r.exportScope==='all')slots.clear();
  const entries=r.results||[];
  if(!entries.length)for(const key of indices||['all'])slots.set('scope:'+key,{result:r});
  entries.forEach((entry,i)=>{
   const key=indices&&indices[i]!==undefined?'scope:'+indices[i]:'file:'+(entry.file||entry.output||i);
   const outcome=indices&&r.fileOutcomes?.find(o=>o.fileIndex===indices[i]);
   const result=outcome||r,prior=slots.get(key);
   slots.set(key,{entry:prior?.result===result&&prior.entry?.output===entry.output?{...prior.entry,...entry,delivery:entry.delivery||prior.entry.delivery}:entry,result});
  });
 }
 return [...slots.values()];
}
module.exports={fileIndices,coversFile,applyExportOutcome,latestDeliveries};
