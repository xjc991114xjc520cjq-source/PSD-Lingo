const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {diagnostic,scrub}=require('./diagnostic-schema.cjs');
function createDiagnosticCloud({directory,version,enabled=true,ready=()=>false,upload,clock=Date.now,environment=()=>({}),onChange=()=>{},io=fs}={}){
 const file=path.join(directory,'reports.json');let state,tail=Promise.resolve(),timer,soon,closed=false,lastError='';
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 async function load(){if(state)return;try{state=JSON.parse(await io.readFile(file,'utf8'));if(state.version!==1||!Array.isArray(state.reports))throw Error('诊断队列格式无效');}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,reports:[],nextAttempt:0,failures:0,day:'',requests:0};}}
 async function save(){await io.mkdir(directory,{recursive:true});await io.writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await io.rename(file+'.tmp',file);}
 function view(){const reports=state?.reports||[],last=reports.at(-1);return {enabled,pending:reports.filter(r=>!r.synced).length,lastId:last?.value.id||'',lastStatus:last?(last.synced?'已上传':'待上传'):'暂无错误记录',message:lastError||(!enabled?'自动上报已关闭':!ready()?'等待联网和有效授权':'错误摘要自动上传，原稿及提示词保留本机'),recent:reports.slice(-10).reverse().map(r=>({id:r.value.id,at:r.value.at,operation:r.value.operation,code:r.value.code,count:r.value.count,synced:r.synced}))};}
 function changed(){try{onChange(view());}catch{}}
 async function record(input){await load();const now=clock(),value=diagnostic({...input,id:crypto.randomUUID(),at:now,version,environment:{...environment(),...input.environment}}),key=crypto.createHash('sha256').update(JSON.stringify([value.version,value.kind,value.operation,value.message,value.code,value.taskId,value.source])).digest('hex');
  state.reports=state.reports.filter(r=>r.value.at>now-30*86400000);const prior=state.reports.findLast(r=>r.key===key&&now-r.lastAt<600000);let id;
  if(prior){prior.value.count++;prior.lastAt=now;prior.synced=false;id=prior.value.id;}else{state.reports.push({value,key,lastAt:now,synced:false});id=value.id;}
  if(state.reports.length>500)state.reports.splice(0,state.reports.length-500);await save();changed();scheduleSoon();return id;
 }
 function scheduleSoon(){if(!closed&&enabled&&!soon){soon=setTimeout(()=>{soon=null;void serial(flush).catch(()=>{});},10000);soon.unref?.();}}
 async function flush(){await load();if(!enabled||closed||!ready())return view();const now=clock(),day=new Date(now).toISOString().slice(0,10);if(state.day!==day){state.day=day;state.requests=0;}const batch=state.reports.filter(r=>!r.synced).slice(0,8);if(!batch.length||state.nextAttempt>now)return view();if(state.requests>=100){state.nextAttempt=Date.parse(day)+86400000;await save();return view();}
  state.requests++;state.nextAttempt=now+60000;await save();try{const response=await upload(batch.map(r=>r.value));if(!Array.isArray(response.accepted)||batch.some(r=>!response.accepted.includes(r.value.id)))throw Error('云端未完整确认，已保留待传记录');for(const row of batch)row.synced=true;state.failures=0;lastError='';state.nextAttempt=clock()+60000;}catch(e){state.failures++;lastError='暂未上传：'+scrub(e.message,160);const reset=Date.parse(e.resetAtUtc);state.nextAttempt=Number.isFinite(reset)&&reset>now?reset:clock()+Math.min(3600000,60000*2**Math.min(state.failures,6));}await save();changed();return view();
 }
 return {record:input=>serial(()=>record(input)),view,status:()=>serial(async()=>{await load();return view();}),flush:()=>serial(flush),start(){if(timer||!enabled)return;timer=setInterval(()=>void serial(flush).catch(()=>{}),60000);timer.unref?.();scheduleSoon();},close(){closed=true;clearInterval(timer);clearTimeout(soon);return tail;}};
}
function createAgentDiagnostics(record){const seen=new Map();return state=>{const history=state.history||[],start=seen.get(state.id)||0;if(seen.size>32)seen.delete(seen.keys().next().value);seen.set(state.id,history.length);for(const event of history.slice(start))if(event.type==='tool_error')void record({kind:'assistant-tool',operation:event.tool||'assistant',error:Error(String(event.error||'软件操作失败')),taskId:state.id,phase:state.phase,steps:history.filter(h=>h.tool).slice(-8).map(h=>({tool:h.tool,status:h.type}))}).catch(()=>{});};}
module.exports={createDiagnosticCloud,createAgentDiagnostics};
