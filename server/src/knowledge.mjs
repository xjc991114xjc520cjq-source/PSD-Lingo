import schema from '../../services/localization-knowledge-schema.cjs';
const enc=new TextEncoder();
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
export async function storeKnowledge(env,device,value,Fault){
 try{schema.validateKnowledge(value);}catch{throw new Fault('invalid_knowledge',400);}
 const payload=JSON.stringify(value),digest=await sha(payload);
 try{await env.DB.prepare('INSERT INTO workflow_knowledge(id,revision,digest,status,payload,bytes,rule_count,updated,device_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,status=excluded.status,payload=excluded.payload,bytes=excluded.bytes,rule_count=excluded.rule_count,updated=excluded.updated,device_id=excluded.device_id WHERE excluded.revision>workflow_knowledge.revision').bind(value.id,value.revision,digest,value.status,payload,enc.encode(payload).length,value.rules.length,Date.now(),device).run();}catch(e){if(/knowledge_capacity/i.test(e.message))throw new Fault('knowledge_capacity',429);throw e;}
 const current=await env.DB.prepare('SELECT id,revision,digest,status FROM workflow_knowledge WHERE id=?').bind(value.id).first();
 if(current.revision===value.revision&&current.digest!==digest)throw new Fault('knowledge_revision_conflict',409,{id:current.id,revision:current.revision});
 return {accepted:current.digest===digest,stale:current.revision>value.revision,current};
}
export async function knowledgeSnapshot(env,known,Fault){
 if(!Array.isArray(known)||known.length>64||known.some(x=>!x||!/^[-a-z0-9]{1,80}$/.test(x.id)||!Number.isSafeInteger(x.revision)||x.revision<1||!/^[a-f0-9]{64}$/.test(x.digest)))throw new Fault('invalid_knowledge_cursor',400);
 const rows=(await env.DB.prepare('SELECT id,revision,digest,status,payload FROM workflow_knowledge ORDER BY id LIMIT 33').all()).results;
 if(rows.length>32||rows.reduce((n,r)=>n+enc.encode(r.payload).length,0)>262144)throw new Fault('knowledge_capacity',503);
 return {schema:'sparkit-knowledge-sync/v1',manifest:rows.map(({id,revision,digest,status})=>({id,revision,digest,status})),documents:rows.filter(r=>!known.some(k=>k.id===r.id&&k.revision===r.revision&&k.digest===r.digest)).map(r=>JSON.parse(r.payload))};
}
