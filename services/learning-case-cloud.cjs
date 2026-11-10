const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {buildCases}=require('./learning-case.cjs'),{normalizeLayoutSample}=require('./layout-memory.cjs');
function createCaseCloud({directory,enabled,ready,upload,encode,summary,clock=()=>Date.now()}){
 const queue=path.join(directory,'full-case-outbox');let tail=Promise.resolve(),timer,closed=false,lastError='',nextAttempt=0,pending=0,synced=0,scanned=false;
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 async function files(){await fs.mkdir(queue,{recursive:true});return (await fs.readdir(queue)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));}
 async function save(name,value){const file=path.join(queue,name);await fs.writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(file+'.tmp',file);}
 async function backfill(){if(scanned)return;let raw;try{raw=await fs.readFile(path.join(directory,'confirmed','samples.jsonl'),'utf8');}catch(e){if(e.code==='ENOENT'){scanned=true;return;}throw e;}
 for(const line of raw.split('\n')){let row;try{row=JSON.parse(line);}catch{continue;}if(!/^[a-f0-9]{64}$/.test(row.id))continue;const name=row.id+'.json';try{await fs.access(path.join(queue,name));continue;}catch{}
 const records=await buildCases(row,{readImage:async(id,key)=>{if(!/^(source|substituted|after|r[0-9]+-(source|substituted|final))$/.test(key))throw Error('Invalid image key');return fs.readFile(path.join(directory,'confirmed','thumbnails',id+'-'+key+'.png'));},encode});if(!records.length)continue;const list=await files();let bytes=0;for(const f of list)bytes+=(await fs.stat(path.join(queue,f))).size;const value={records,accepted:[],nextAttempt:0};if(bytes+Buffer.byteLength(JSON.stringify(value))>512*1024*1024)throw Error('本机完整案例待传空间不足，历史记录尚未全部加入队列');await save(name,value);
 }scanned=true;}
 async function enqueueFull(input){if(!enabled)return;const {sample,images}=normalizeLayoutSample(input,1024*1024),id=crypto.createHash('sha256').update(JSON.stringify(sample)).digest('hex'),name=id+'.json';
 try{await fs.access(path.join(queue,name));return;}catch{}
 const records=await buildCases({...sample,id,savedAt:new Date(clock()).toISOString()},{readImage:async(_id,key)=>{if(!images[key])throw Error('missing image');return images[key];},encode});
 if(!records.length){lastError='完整案例缺少三阶段有效截图，保留本机草稿等待补全';return {complete:false};}
 const list=await files();let bytes=0;for(const f of list)bytes+=(await fs.stat(path.join(queue,f))).size;
 const value={records,accepted:[],nextAttempt:0};if(bytes+Buffer.byteLength(JSON.stringify(value))>512*1024*1024)throw Error('完整案例本机待传空间已达 512 MiB；保留草稿，请联网同步后重试');
 await save(name,value);return {complete:true};
 }
 async function flush(){if(!enabled||closed)return view();await summary?.flush();await backfill();const names=await files();pending=0;for(const name of names){const state=JSON.parse(await fs.readFile(path.join(queue,name),'utf8'));pending+=state.records.filter(r=>!state.accepted.includes(r.id)).length;}
 if(!ready()||clock()<nextAttempt)return view();let sent=0;
 for(const name of names){const state=JSON.parse(await fs.readFile(path.join(queue,name),'utf8'));if(state.nextAttempt>clock())continue;for(const record of state.records){if(state.accepted.includes(record.id))continue;if(sent>=8)return view();sent++;
 try{const result=await upload(record);if(result.accepted!==record.id)throw Error('云端确认不完整');state.accepted.push(record.id);state.nextAttempt=0;await save(name,state);pending--;synced++;lastError='';}catch(e){lastError=e.message;state.nextAttempt=Math.max(clock()+300000,Date.parse(e.resetAtUtc)||0);nextAttempt=state.nextAttempt;await save(name,state);return view();}}
 if(state.accepted.length===state.records.length){state.records=[];await save(name,state);}
 // Keep acknowledgement file: prevents duplicate uploads on repeated exports/restarts.
 }return view();}
 function view(){return {configured:enabled,pending,synced,nextAttemptAt:nextAttempt?new Date(nextAttempt).toISOString():null,message:lastError||(enabled?'完整案例自动上传云端；北京时间 00:00 起归档 GitHub，AI 检索全部历史':'云端未配置')};}
 return {enqueueFull:input=>serial(()=>enqueueFull(input)),flush:()=>serial(flush),status:()=>serial(async()=>{const base=await summary?.status();return {...base,...view()};}),start(){summary?.start();if(enabled){timer=setInterval(()=>void serial(flush).catch(e=>{lastError=e.message;}),300000);timer.unref?.();void serial(flush).catch(e=>{lastError=e.message;});}},close(){closed=true;clearInterval(timer);summary?.close();}};
}
module.exports={createCaseCloud};
