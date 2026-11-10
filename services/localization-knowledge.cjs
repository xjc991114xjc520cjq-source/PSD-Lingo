// Small local knowledge files are data, never executable recipes or customer artwork.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const bundled=require('./localization-knowledge.json');
const {validateKnowledge,MAX_BYTES}=require("./localization-knowledge-schema.cjs");
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function readKnowledge(directory,{includeDocuments=false}={}){
 const selected=new Map(),warnings=[];const base=validateKnowledge(structuredClone(bundled));selected.set(base.id,base);
 if(directory){let names=[];try{names=await fs.readdir(directory);}catch(e){if(e.code!=='ENOENT')warnings.push('本机学习库读取失败，已使用内置规则');}
  if(names.length>128)throw Error('本机学习库条目过多，请整理后重试');
  for(const name of names.sort()){if(!/^[a-z0-9-]+\.json$/.test(name))continue;try{const file=path.join(directory,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('非受限数据文件');const v=validateKnowledge(JSON.parse(await fs.readFile(file,'utf8'))),old=selected.get(v.id);if(!old||v.revision>old.revision)selected.set(v.id,v);else if(v.revision===old.revision&&digest(v)!==digest(old))throw Error('同版本内容冲突');}catch{warnings.push('忽略无效或冲突学习文件：'+name);}}
 }
 const files=[...selected.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const active=files.filter(f=>f.status==='active');if(active.reduce((n,f)=>n+f.rules.length,0)>48)throw Error('本次学习规则超过上下文限额');
 return {schema:'sparkit-layout-knowledge-context/v1',files:files.map(f=>({id:f.id,revision:f.revision,status:f.status,digest:digest(f)})),rules:active.flatMap(f=>f.rules.map(r=>({...r,libraryId:f.id,revision:f.revision}))),warnings,...(includeDocuments?{documents:files}:{})};
}
module.exports={readKnowledge,validateKnowledge,MAX_BYTES};
