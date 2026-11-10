const MAX_BYTES=64*1024;
function validateKnowledge(value){
 const fail=()=>{throw Error('学习库文件格式或大小无效');};
 if(!value||new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES||value.schema!=='sparkit-layout-knowledge/v1'||!/^[-a-z0-9]{1,80}$/.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1||!['active','withdrawn'].includes(value.status)||value.scope!=='cross-document-layout'||!Array.isArray(value.rules)||value.rules.length>24)fail();
 if(Object.keys(value).some(k=>!['schema','id','revision','updatedAt','status','scope','evidence','rules'].includes(k)))fail();
 const ids=new Set();for(const r of value.rules){if(!r||!/^[-a-z0-9]{1,80}$/.test(r.id)||ids.has(r.id)||Object.keys(r).some(k=>!['id','appliesTo','recognize','arrange','verify','skip'].includes(k)))fail();ids.add(r.id);for(const k of ['appliesTo','recognize','arrange','verify','skip'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>1800)fail();}
 return value;
}

module.exports={validateKnowledge,MAX_BYTES};
