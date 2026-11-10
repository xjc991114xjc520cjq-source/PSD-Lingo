// Metadata only. Authentication is completed before any learning quota write.
export function validateSamples(samples,Fault){
 if(!Array.isArray(samples)||!samples.length||samples.length>8)throw new Fault('invalid_learning_batch',400);
 for(const r of samples){if(!r||!/^[a-f0-9]{64}$/.test(r.id)||new TextEncoder().encode(JSON.stringify(r.value)).length>3072)throw new Fault('invalid_learning_record',400);
 const v=r.value;if(v?.version!==1||!/^[a-f0-9]{64}$/.test(v.projectId)||!['layer','container'].includes(v.change?.kind)||!['manual','redo','batch-save'].includes(v.reason)||!v.stages?.final||!('source'in v.stages)||!('substituted'in v.stages))throw new Fault('invalid_learning_record',400);
 // Reject arbitrary fields, strings and images; the fixed summary schema contains no document text or local path.
 const keys={root:['version','projectId','context','change','stages','operationCount','reason'],context:['width','height','language'],change:['kind','id'],stages:['source','substituted','final'],layer:['id','box','layoutBox','position','font','size','alignment','style','fit','text'],container:['id','box','radii']};
 const check=(obj,allowed)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))throw new Fault('invalid_learning_record',400);};
 check(v,keys.root);check(v.context,keys.context);check(v.change,keys.change);check(v.stages,keys.stages);
 if(!Number.isFinite(v.context.width)||v.context.width<=0||!Number.isFinite(v.context.height)||v.context.height<=0||typeof v.context.language!=='string'||v.context.language.length>80||typeof v.change.id!=='string'||v.change.id.length>128||!Number.isInteger(v.operationCount)||v.operationCount<0||v.operationCount>200)throw new Fault('invalid_learning_record',400);
 for(const s of Object.values(v.stages)){if(s===null)continue;check(s,keys[v.change.kind]);for(const [k,x] of Object.entries(s)){if(['id','font','alignment'].includes(k)){if(typeof x!=='string'||x.length>128)throw new Fault('invalid_learning_record',400);}else if(k==='text'){if(!Array.isArray(x)||x.length!==3||!x.slice(0,2).every(n=>Number.isInteger(n)&&n>=0)||!['han','arabic','cyrillic','other'].includes(x[2]))throw new Fault('invalid_learning_record',400);}else if(x!==null&&!(typeof x==='number'&&Number.isFinite(x))&&!(Array.isArray(x)&&x.length<=5&&x.every(n=>n===null||Number.isFinite(n))))throw new Fault('invalid_learning_record',400);}}
 }
}
export async function storeSamples(env,samples,deviceId,Fault){
 const day=new Date().toISOString().slice(0,10),resetAtUtc=new Date(Date.parse(day)+86400000).toISOString(),n=samples.length;
 const statements=[['global',6000],[deviceId,1000]].map(([scope,limit])=>env.DB.prepare('INSERT INTO learning_quota(day,scope,count) VALUES(?,?,?) ON CONFLICT(day,scope) DO UPDATE SET count=CASE WHEN count+excluded.count<=? THEN count+excluded.count ELSE -1 END').bind(day,scope,n,limit));
 statements.push(...samples.map(r=>env.DB.prepare('INSERT OR IGNORE INTO learning_records(device_id,id,created,payload) VALUES(?,?,?,?)').bind(deviceId,r.id,Date.now(),JSON.stringify(r.value))));
 try{await env.DB.batch(statements);}catch(e){if(/CHECK constraint failed/i.test(String(e.message)))throw new Fault('learning_quota_exceeded',429,{resetAtUtc});throw e;}
 return {accepted:samples.map(s=>s.id),resetAtUtc,retentionDays:7};
}
