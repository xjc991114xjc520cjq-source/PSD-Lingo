// One consolidated diagnosis guides a batch correction. Evidence remains data,
// and never expands the authorized set of editable objects.
const text={type:'string',minLength:1,maxLength:1200};
const schema={type:'array',maxItems:60,items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},sourceChecks:{type:'array',minItems:1,maxItems:20,items:{type:'string'}},layerKeys:{type:'array',maxItems:500,items:{type:'string'}},problem:text,cause:text,action:text,acceptance:text,dependsOn:{type:'array',maxItems:60,items:{type:'string'}}},required:['id','sourceChecks','layerKeys','problem','cause','action','acceptance','dependsOn']}};
function failures(value){return [...(value.checks||[]).filter(c=>c.verdict!=='pass').map(c=>'check:'+c.id),...(value.designChecks||[]).filter(c=>c.verdict!=='accept').map(c=>'design:'+c.id),...(value.skillReviews||[]).filter(c=>['revise','uncertain'].includes(c.verdict)).map(c=>'skill:'+c.id),...(value.groups||[]).filter(c=>c.verdict!=='accept').map(c=>'group:'+c.id)];}
function validateRepairPlan(value,request){
 if(request.repairGuidanceVersion!==1&&!value.repairPlan)return;
 const plan=value.repairPlan,failed=failures(value),known=new Set([...(request.layers||[]).map(l=>l.layerKey),...(request.containers||[]).map(l=>l.id),...(request.artworkObjects||[]).map(l=>l.objectId)]);
 if(!Array.isArray(plan)||plan.length>60||new Set(plan.map(p=>p?.id)).size!==plan.length)throw Error('设计审验缺少合并后的修改清单');
 const ids=new Set(plan.map(p=>p?.id)),covered=new Set();
 for(const p of plan){if(!p||Object.keys(p).some(k=>!schema.items.required.includes(k))||typeof p.id!=='string'||!/^[-a-zA-Z0-9_:]{1,100}$/.test(p.id)||!Array.isArray(p.sourceChecks)||!p.sourceChecks.length||p.sourceChecks.some(s=>!failed.includes(s))||!Array.isArray(p.layerKeys)||new Set(p.layerKeys).size!==p.layerKeys.length||p.layerKeys.some(k=>!known.has(k))||!Array.isArray(p.dependsOn)||new Set(p.dependsOn).size!==p.dependsOn.length||p.dependsOn.some(id=>id===p.id||!ids.has(id))||['problem','cause','action','acceptance'].some(k=>typeof p[k]!=='string'||!p[k].trim()||p[k].length>1200))throw Error('设计修改清单的范围、依据或执行说明无效');for(const s of p.sourceChecks)covered.add(s);}
 const visiting=new Set(),visited=new Set();function visit(id){if(visiting.has(id))throw Error('设计修改清单依赖循环');if(visited.has(id))return;visiting.add(id);for(const dep of plan.find(p=>p.id===id).dependsOn)visit(dep);visiting.delete(id);visited.add(id);}for(const id of ids)visit(id);
 if(failed.some(id=>!covered.has(id)))throw Error('设计修改清单遗漏未通过项');
 return plan;
}
const policy=`联合审验也是修改指导：本次一次看完整页，列齐所有当前有证据的问题，再将不同技能针对同一根因的意见合并为repairPlan，不得一次只挑一个问题。每项给出稳定id、sourceChecks（check:/design:/skill:/group:前缀）、真实layerKeys（对象未知为空）、problem可见后果、cause结构根因、action可执行的联合修改、acceptance改后视觉标准和dependsOn前置项。标题-副标题-说明、价格组件、参数块-分隔符等相互影响的对象应一起说明；区分可改文字、只读背景、需补资料和当前接口不支持的操作，不假装能改未知图案。先解决整组结构，再检查细节，不复制完整文案和样本绝对坐标。所有fail/revise/uncertain检查都必须被清单引用；通过时清单为空。多个技能意见不是多次修改任务，须去重、消除冲突并明确顺序。修改后仍用真实图验证是否满足标准，不能承诺未渲染稿件完美。`;
module.exports={schema,validateRepairPlan,policy};
