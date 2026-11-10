const fs=require('node:fs/promises'),path=require('node:path');
const {compactSamples}=require('./learning-summary.cjs');
function createLearningCloud({directory,enabled=false,upload,ready=()=>false,clock=()=>Date.now(),io=fs}={}){
 const file=path.join(directory,'cloud-queue.json');let state=null,tail=Promise.resolve(),timer,closed=false,lastError='';
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 async function load(){if(state)return;try{state=JSON.parse(await io.readFile(file,'utf8'));if(state.version!==1||!Array.isArray(state.pending)||!Array.isArray(state.acked))throw new Error('Invalid cloud queue');}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,pending:[],acked:[],day:'',sent:0,nextAttempt:0,failures:0};}}
 async function save(){await io.mkdir(directory,{recursive:true});await io.writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await io.rename(file+'.tmp',file);}
 async function scan(){let raw;try{raw=await io.readFile(path.join(directory,'confirmed','samples.jsonl'),'utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}
 const known=new Set([...state.acked,...state.pending.map(r=>r.id)]);let added=false;
 for(const line of raw.split('\n')){if(!line)continue;let sample;try{sample=JSON.parse(line);}catch{continue;}
 for(const r of compactSamples(sample)){if(known.has(r.id))continue;if(state.pending.length>=5000){lastError='云端待传队列已满，完整成果仍在本机记录中';if(added)await save();return;}state.pending.push(r);known.add(r.id);added=true;}}
 if(added)await save();}
 function view(){return {configured:enabled,pending:state?.pending.length||0,synced:state?.acked.length||0,nextAttemptAt:state?.nextAttempt?new Date(state.nextAttempt).toISOString():null,message:!enabled?'云端尚未配置，记录仅保存在本机':lastError||(!ready()?'等待有效授权后同步':'排版摘要自动同步；PSD 和图片保留本机')};}
 async function flush(){if(!enabled||closed)return view();await load();await scan();const now=clock(),day=new Date(now).toISOString().slice(0,10);if(state.day!==day){state.day=day;state.sent=0;}
 if(!ready()||state.nextAttempt>now||!state.pending.length)return view();
 if(state.sent>=1000){state.nextAttempt=Date.parse(day)+86400000;await save();return view();}
 const batch=state.pending.slice(0,Math.min(8,1000-state.sent));
 // Persist attempt count before network I/O, so crashes cannot cause a tight retry loop.
 state.sent+=batch.length;state.nextAttempt=now+300000;await save();
 try{const r=await upload(batch);if(!Array.isArray(r.accepted)||batch.some(s=>!r.accepted.includes(s.id)))throw new Error('云端确认不完整，已保留待传记录');
 const ids=new Set(batch.map(s=>s.id));state.pending=state.pending.filter(s=>!ids.has(s.id));state.acked=[...new Set([...state.acked,...ids])].slice(-50000);state.failures=0;state.nextAttempt=clock()+300000;lastError='';await save();
 }catch(e){state.failures=(state.failures||0)+1;lastError=e.message;const reset=Date.parse(e.resetAtUtc);state.nextAttempt=Number.isFinite(reset)&&reset>clock()?reset:clock()+Math.min(3600000,300000*2**Math.min(state.failures-1,4));await save();}
 return view();}
 return {flush:()=>serial(flush),status:()=>serial(async()=>{if(enabled)await load();return view();}),start(){if(enabled&&!timer){timer=setInterval(()=>void serial(flush).catch(e=>{lastError=e.message;}),300000);timer.unref?.();void serial(flush).catch(e=>{lastError=e.message;});}},close(){closed=true;clearInterval(timer);}};
}
module.exports={createLearningCloud};
