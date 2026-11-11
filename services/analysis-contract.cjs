// Preflight the JSON Schema vocabulary used by suspended software analyses.
// This checks wire format only. The operation's semantic/visual parser remains
// authoritative; no content, grouping, comparisons or verdicts are synthesized.
function issuesFor(value,schema,path='$',issues=[]){
 if(!schema||typeof schema!=='object'||issues.length>=80)return issues;
 const add=(rule,expected)=>issues.push({path,rule,expected});
 const type=value===null?'null':Array.isArray(value)?'array':typeof value;
 if(schema.anyOf){const branches=schema.anyOf.map(s=>({schema:s,issues:issuesFor(value,s,path,[])}));if(branches.some(b=>!b.issues.length))return issues;const matching=branches.filter(b=>b.schema.type===type);if(!matching.length){add('anyOf',shape(schema));return issues;}const best=matching.reduce((a,b)=>a.issues.length<=b.issues.length?a:b).issues;issues.push(...best.slice(0,80-issues.length));return issues;}
 if(schema.type&&!(schema.type===type||schema.type==='integer'&&Number.isInteger(value))){add('type',schema.type);return issues;}
 if(schema.enum&&!schema.enum.includes(value))add('enum',schema.enum);
 if(type==='object'){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))issues.push({path:path+'.'+key,rule:'required',expected:shape(schema.properties?.[key]||{})});
  for(const key of Object.keys(value)){if(schema.additionalProperties===false&&!Object.hasOwn(schema.properties||{},key))issues.push({path:path+'.'+key,rule:'additionalProperty',expected:'only declared properties'});else issuesFor(value[key],schema.properties?.[key],path+'.'+key,issues);if(issues.length>=80)break;}
 }
 if(type==='array'){
  if(schema.minItems!==undefined&&value.length<schema.minItems)add('minItems',schema.minItems);
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)add('maxItems',schema.maxItems);
  for(let i=0;i<value.length&&issues.length<80;i++)issuesFor(value[i],schema.items,path+'['+i+']',issues);
 }
 if(type==='string'){
  const length=[...value].length;
  if(schema.minLength!==undefined&&length<schema.minLength)add('minLength',schema.minLength);
  if(schema.maxLength!==undefined&&length>schema.maxLength)add('maxLength',schema.maxLength);
 }
 if(type==='number'){
  if(!Number.isFinite(value))add('finite','finite number');
  if(schema.minimum!==undefined&&value<schema.minimum)add('minimum',schema.minimum);
  if(schema.maximum!==undefined&&value>schema.maximum)add('maximum',schema.maximum);
 }
 return issues.slice(0,80);
}
function shape(schema={}){
 if(schema.anyOf)return schema.anyOf.map(s=>shape(s)).join(' | ');
 if(schema.enum)return schema.enum.map(v=>JSON.stringify(v)).join(' | ');
 if(schema.type==='object')return '{'+Object.entries(schema.properties||{}).map(([k,v])=>k+((schema.required||[]).includes(k)?'':'?')+':'+shape(v)).join(', ')+'}';
 if(schema.type==='array')return 'Array<'+shape(schema.items||{})+'>';
 return schema.type||'JSON';
}
function validateAnswer(raw,schema){
 let value;try{value=JSON.parse(raw);}catch{const error=Error('分析回答不是有效JSON：请提交完整JSON对象，不要添加Markdown代码围栏');error.contractIssues=[{path:'$',rule:'json',expected:'valid JSON'}];throw error;}
 const issues=issuesFor(value,schema);
 if(issues.length){const error=Error('分析回答格式不符合约定：'+issues.slice(0,12).map(i=>i.path+' '+i.rule+' '+JSON.stringify(i.expected)).join('; '));error.contractIssues=issues;throw error;}
 return value;
}
module.exports={issuesFor,shape,validateAnswer};
