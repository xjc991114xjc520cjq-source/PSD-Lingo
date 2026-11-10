const fs=require('node:fs/promises'),path=require('node:path');const {helper}=require('./authorization.cjs');
const {DEFAULT_API_BASE_URL,normalizeApiBaseUrl,normalizeApiProtocol}=require('./api-endpoint.cjs');
class CodexSettings{
 constructor({dataDir,helperPath,helperFn=helper,io=fs}){this.file=path.join(dataDir,'codex-settings.dpapi');this.helperPath=helperPath;this.helperFn=helperFn;this.io=io;this.pending=Promise.resolve();}
 empty(){return {mode:'api',executable:'',apiModel:'',localModel:'',apiKey:'',apiBaseUrl:DEFAULT_API_BASE_URL,apiProtocol:'auto'};}
 async read(){let encrypted;try{encrypted=await this.io.readFile(this.file,'utf8');}catch(e){if(e.code==='ENOENT')return this.empty();throw new Error('无法读取本机保存的连接设置。请清除后重新填写。');}try{const decoded=await this.helperFn(this.helperPath,{op:'unprotect',value:encrypted});const value=JSON.parse(Buffer.from(decoded.value,'base64').toString('utf8'));return this.validate(value);}catch{throw new Error('无法读取本机保存的连接设置。请清除后重新填写。');}}
 validate(v){
  if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('连接设置无效');
  const mode=v.mode===undefined?'api':v.mode;if(mode!=='api'&&mode!=='local')throw new Error('连接方式无效');
  const result={mode,apiBaseUrl:normalizeApiBaseUrl(v.apiBaseUrl),apiProtocol:normalizeApiProtocol(v.apiProtocol)};
  for(const [key,max] of [['executable',32768],['apiModel',200],['localModel',200],['apiKey',8192]]){
   const value=v[key]===undefined&&['apiModel','localModel'].includes(key)?(v.model===undefined?'':v.model):v[key];
   if(typeof value!=='string'||value.length>max||/[\r\n\0]/.test(value))throw new Error('连接设置内容或长度无效');result[key]=value.trim();
  }
  return result;
 }
 public(v){return {mode:v.mode,executable:v.executable,apiModel:v.apiModel,localModel:v.localModel,apiBaseUrl:v.apiBaseUrl,apiProtocol:v.apiProtocol,model:v.mode==='api'?v.apiModel:v.localModel,hasApiKey:!!v.apiKey};}
 get(){return this.pending.then(async()=>this.public(await this.read()));}
 save(input){const action=this.pending.then(async()=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('连接设置无效');
  const old=await this.read(),merged={...old,...input,apiKey:input.apiKey===undefined||input.apiKey===''?old.apiKey:input.apiKey};
  // Keep older clients usable without coupling the two providers' model choices.
  if(input.model!==undefined){const field=merged.mode==='local'?'localModel':'apiModel';if(input[field]===undefined)merged[field]=input.model;}
  const value=this.validate(merged);
  const encrypted=(await this.helperFn(this.helperPath,{op:'protect',value:Buffer.from(JSON.stringify(value),'utf8').toString('base64')})).value;
  await this.io.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';try{await this.io.writeFile(temp,encrypted,{mode:0o600});await this.io.rename(temp,this.file);}finally{await this.io.rm(temp,{force:true});}return this.public(value);
 });this.pending=action.catch(()=>{});return action;}
 clear(){const action=this.pending.then(async()=>{await this.io.rm(this.file,{force:true});await this.io.rm(this.file+'.tmp',{force:true});return this.public(this.empty());});this.pending=action.catch(()=>{});return action;}
 async credentials(){await this.pending;const v=await this.read();
  if(v.mode==='local'){
   if(!v.executable)throw new Error('请先在“AI 文案对应设置”中选择本机 Codex 程序并保存。');
   return {mode:'local',executable:v.executable,localModel:v.localModel,model:v.localModel};
  }
  if(!v.apiKey||!v.apiModel)throw new Error('请先在“AI 文案对应设置”中保存 API Key 和 API 模型名称。');
  return {mode:'api',apiKey:v.apiKey,apiModel:v.apiModel,apiBaseUrl:v.apiBaseUrl,apiProtocol:v.apiProtocol,model:v.apiModel};
 }
}
module.exports={CodexSettings};
