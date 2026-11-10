const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readKnowledge,validateKnowledge}=require('./localization-knowledge.cjs');
const {verifyEnvelope}=require('./protocol.cjs');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function createKnowledgeSync({directory,authorization,config,enabled=true,clock=Date.now,intervalMs=300000}={}){
 let running=null,timer,closed=false,lastAttempt=0,lastSuccess=0,nextAttempt=0,message='',uploaded=0,downloaded=0,manifest=[];
 const stateFile=path.join(directory,'..','sync-state.json');
 const ready=()=>authorization?.status().active&&authorization?.lease;
 function status(){return {enabled,lastSuccess:lastSuccess?new Date(lastSuccess).toISOString():null,nextAttemptAt:nextAttempt?new Date(nextAttempt).toISOString():null,uploaded,downloaded,files:manifest.length,message:message||(enabled?'通用学习库自动同步；离线使用本机已验证规则':'通用学习库同步未启用')};}
 async function perform({force=false}={}){
  if(closed||!enabled||!ready())return status();
  const now=clock();if(!force&&(now<nextAttempt||lastAttempt&&now-lastAttempt<60000))return status();lastAttempt=now;
  try{
   await fs.mkdir(directory,{recursive:true});
   let persisted;try{persisted=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch{}
   const local=await readKnowledge(directory,{includeDocuments:true});
   // Only the bounded, structured knowledge documents enter this route.
   // Never scan artwork, projects, screenshots, drafts, or case queues.
   const notes=[...local.warnings];
   let attempts=0;for(const document of local.documents){const known=persisted?.manifest?.find(f=>f.id===document.id);if(known&&known.revision>=document.revision&&known.digest===digest(document))continue;if(known&&known.revision>document.revision)continue;
    if(attempts++>=8){notes.push('剩余学习文件将在下次定时同步继续上传');break;}
    try{const ack=await authorization.uploadKnowledge(document);if(ack.accepted)uploaded++;}catch(e){if(e.code==='knowledge_revision_conflict')notes.push('学习库存在同版本冲突，保留本地文件并同步云端版本：'+document.id);else notes.push('学习文件上传暂缓，将自动重试：'+document.id+' / '+e.message);}
   }
   const requestId=crypto.randomUUID(),envelope=await authorization.syncKnowledge(local.files,requestId),snapshot=verifyEnvelope(envelope,config.leaseKeys);
   if(snapshot.schema!=='sparkit-knowledge-sync/v1'||snapshot.appId!==config.appId||snapshot.deviceId!==authorization.device||snapshot.requestId!==requestId||!Array.isArray(snapshot.manifest)||snapshot.manifest.length>32||!Array.isArray(snapshot.documents)||snapshot.documents.length>32||Buffer.byteLength(JSON.stringify(snapshot))>300000)throw Error('云端学习库响应不完整或身份不符');
   const ids=new Set();for(const f of snapshot.manifest){if(!f||!/^[-a-z0-9]{1,80}$/.test(f.id)||ids.has(f.id)||!Number.isSafeInteger(f.revision)||f.revision<1||!/^[a-f0-9]{64}$/.test(f.digest)||!['active','withdrawn'].includes(f.status))throw Error('云端学习库清单无效');ids.add(f.id);}
   const documents=new Map();for(const doc of snapshot.documents){validateKnowledge(doc);const entry=snapshot.manifest.find(f=>f.id===doc.id);if(documents.has(doc.id)||!entry||entry.revision!==doc.revision||entry.status!==doc.status||entry.digest!==digest(doc))throw Error('云端学习文件摘要不符');documents.set(doc.id,doc);}
   for(const entry of snapshot.manifest){const old=local.files.find(f=>f.id===entry.id);if(old&&old.revision>entry.revision){notes.push('保留较新的本机学习规则：'+entry.id);continue;}if(old&&old.revision===entry.revision&&old.digest===entry.digest)continue;if(!documents.has(entry.id))throw Error('云端学习库缺少变更文件');}
   const merged=new Map(local.documents.map(doc=>[doc.id,doc]));for(const doc of documents.values()){const old=merged.get(doc.id);if(!old||old.revision<=doc.revision)merged.set(doc.id,doc);}if([...merged.values()].filter(doc=>doc.status==='active').reduce((n,doc)=>n+doc.rules.length,0)>48)throw Error('合并后的学习规则超过本机上下文限额，保留现有文件');
   // Validate all incoming content before committing any file. Per-file atomic
   // replacement prevents a task from seeing a half-written JSON document.
   for(const doc of documents.values()){const old=local.files.find(f=>f.id===doc.id);if(old&&old.revision>doc.revision)continue;const target=path.join(directory,'cloud-'+doc.id+'.json');await fs.writeFile(target+'.tmp',JSON.stringify(doc,null,2),{mode:0o600});await fs.rename(target+'.tmp',target);downloaded++;}
   const effective=await readKnowledge(directory);manifest=snapshot.manifest;lastSuccess=clock();nextAttempt=0;message=[...notes,...effective.warnings].join('；')||'已同步通用学习库；下一次排版自动使用最新适用规则';
   await fs.writeFile(stateFile+'.tmp',JSON.stringify({manifest,lastSuccess}),{mode:0o600});await fs.rename(stateFile+'.tmp',stateFile);
  }catch(e){message='学习库同步暂未完成，继续使用本机规则：'+e.message;nextAttempt=clock()+intervalMs;}
  return status();
 }
 return {status,sync(options){if(running)return running;running=perform(options).finally(()=>{running=null;});return running;},start(){if(!enabled||closed)return;timer=setInterval(()=>void this.sync(),intervalMs);timer.unref?.();void this.sync();},close(){closed=true;clearInterval(timer);}};
}
module.exports={createKnowledgeSync};
