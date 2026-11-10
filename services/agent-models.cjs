const {spawn}=require('node:child_process');
const {validateLocalExecutable,localEnvironment}=require('./ai-match.cjs');
async function listLocalModels(credentials,{spawnFn=spawn,validate=validateLocalExecutable,timeoutMs=20000,env=process.env}={}){
 await validate(credentials.executable);
 return new Promise((resolve,reject)=>{let child,buffer='',bytes=0,finished=false;const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);child?.stdin?.end();child?.kill();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('本机 Codex 模型获取超时，可刷新或使用当前设置模型')),timeoutMs);
 try{child=spawnFn(credentials.executable,['app-server'],{windowsHide:true,shell:false,env:localEnvironment(env),stdio:['pipe','pipe','pipe']});}catch(e){finish(e);return;}
 child.on('error',e=>finish(e));child.on('close',()=>{if(!finished)finish(Error('当前 Codex 未返回模型列表，请更新 CLI 或使用当前设置模型'));});child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
 const send=v=>child.stdin.write(JSON.stringify(v)+'\n');
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024)return finish(Error('本机模型列表响应过大'));buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let v;try{v=JSON.parse(line);}catch{continue;}if(v.id===1){if(v.error)return finish(Error('本机 Codex 初始化失败'));send({method:'initialized',params:{}});send({id:2,method:'model/list',params:{limit:100,includeHidden:false}});}if(v.id===2){if(v.error)return finish(Error('当前 CLI 不支持模型发现，请更新 CLI 或使用当前设置模型'));const data=v.result?.data;if(!Array.isArray(data))return finish(Error('本机模型列表格式无效'));const models=[...new Set(data.map(x=>x.model||x.id).filter(x=>typeof x==='string'&&x.length<=200&&!/[\r\n\0]/.test(x)))];finish(null,{models,mode:'local',nextCursor:v.result.nextCursor||null});}}});
 send({id:1,method:'initialize',params:{clientInfo:{name:'sparkit',title:'Sparkit',version:'0.3.49'},capabilities:{}}});
 });
}
module.exports={listLocalModels};
