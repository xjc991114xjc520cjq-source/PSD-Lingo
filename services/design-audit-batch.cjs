// Share one owning Codex exchange across a small set of complete page reviews.
// Individual suggestLayout parsers still validate every page and every skill.
async function auditBatch(pages,credentials,deps,{suggestLayout}){
 if(!Array.isArray(pages)||!pages.length||pages.length>3||pages.some(p=>p?.phase!=='audit'))throw Error('整页合并审验需要1至3个完整画板请求');
 if(!deps.localAnalysis){const results=[];for(const p of pages)results.push(await suggestLayout(p,credentials,deps));return {pages:results};}
 const held=[],ready=[];let prepareError,cancelled;
 const work=pages.map((page,index)=>{
  let prepared;ready.push(new Promise(r=>prepared=r));
  return Promise.resolve().then(()=>suggestLayout(page,credentials,{...deps,localAnalysis:request=>new Promise((resolve,reject)=>{if(cancelled)return reject(cancelled);held[index]={request,resolve,reject};prepared();})})).catch(error=>{prepareError||=error;throw error;}).finally(prepared);
 });
 // Attach rejection handlers immediately while the other pages prepare images.
 const settled=Promise.allSettled(work);
 await Promise.all(ready);
 try{
  if(prepareError)throw prepareError;
  deps.signal?.throwIfAborted();
  const pending=held.map((h,index)=>h&&({...h,index})).filter(Boolean);
  if(!pending.length){const results=await settled;const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;return {pages:results.map(r=>r.value)};}
  const properties={},images=[],instructions=[...new Set(pending.map(h=>h.request.sharedInstructions).filter(Boolean))];
  const sections=pending.map(({request,index})=>{
   const key='page'+index,first=images.length;images.push(...request.images);properties[key]=request.outputSchema;
   const split=request.prompt.lastIndexOf('\n数据：');let prompt=request.prompt;
   if(split>=0){const common=prompt.slice(0,split);if(!instructions.includes(common))instructions.push(common);prompt=prompt.slice(split);}
   return `${key} / ${pages[index].activeBoard?.name||index} / 图像索引 ${first} 至 ${images.length-1}\n${prompt}`;
  });
  const outputSchema={type:'object',additionalProperties:false,properties,required:Object.keys(properties)};
  const parse=answer=>{const result=JSON.parse(answer);require('./analysis-contract.cjs').validateAnswer(answer,outputSchema);pending.forEach(({request,index})=>request.validateAnswer?.(JSON.stringify(result['page'+index])));return result;};
  const answer=await deps.localAnalysis({taskName:'design_page_audit_batch',outputSchema,images,sharedInstructions:instructions.join('\n'),prompt:'以下是独立画板的完整导出图。一次检查所有页面；每页分别执行全部适用设计技能及文案检查，返回page0等对应结果。不得以代表页通过替代其他页审验，不跨页混用文案、图像或layerKey。一次列全有依据的问题和联合修改指导。\n'+sections.join('\n\n'),validateAnswer:parse});
  deps.signal?.throwIfAborted();const result=parse(answer);
  pending.forEach(h=>h.resolve(JSON.stringify(result['page'+h.index])));
 }catch(error){cancelled=error;held.forEach(h=>h.reject(error));await settled;throw error;}
 const results=await settled;const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
 return {pages:results.map(r=>r.value)};
}
module.exports={auditBatch};
