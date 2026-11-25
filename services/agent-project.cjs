const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const namePattern=/[<>:"/\\|?*\x00-\x1f]/;
function validateProject(v){
 if(!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||namePattern.test(v.name)||/[. ]$/.test(v.name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(v.name)||['.','..'].includes(v.name))throw Error('项目名称无效，请使用不含路径符号的名称');
 if(typeof v.parentDirectory!=='string'||!path.isAbsolute(v.parentDirectory)||/[\x00-\x1f]/.test(v.parentDirectory))throw Error('请选择项目所在的盘位和文件夹');
 if(typeof v.key!=='string'||!v.key||v.key.length>100||v.projectId!==undefined&&(typeof v.projectId!=='string'||!v.projectId||v.projectId.length>300))throw Error('项目配置无效');
 return {name:v.name.trim(),parentDirectory:path.resolve(v.parentDirectory),key:v.key,...(v.projectId?{projectId:v.projectId}:{})};
}
const rootOf=v=>path.join(v.parentDirectory,v.name);
class AgentProject{
 constructor(directory,{desktop=new (require('./codex-desktop-project.cjs').CodexDesktopProject)()}={}){this.desktop=desktop;this.file=path.join(directory,'agent-project.json');this.directory=directory;this.pending=Promise.resolve();}
 async read(){try{return validateProject(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(e){if(e.code!=='ENOENT')throw Error('无法读取 Codex 项目配置，请重新保存项目设置');return {name:'Sparkit',parentDirectory:path.join(this.directory,'codex-projects'),key:'default-'+createHash('sha256').update(require('./file-identity.cjs').fileKey(this.directory)).digest('hex')};}}
 async get(){await this.pending;const v=await this.read();return {...v,directory:rootOf(v)};}
 write(v){const job=this.pending.then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(v,null,2),{mode:0o600});await fs.rename(this.file+'.tmp',this.file);return {...v,directory:rootOf(v)};});this.pending=job.catch(()=>{});return job;}
 async save(input){const next=validateProject({...input,key:randomUUID(),projectId:undefined}),old=await this.get();return this.write(next.name===old.name&&next.parentDirectory===old.parentDirectory?validateProject(old):next);}
 async prepare(session,snapshot,options={}){
  const v=validateProject(snapshot),directory=rootOf(v);options.signal?.throwIfAborted();await fs.mkdir(directory,{recursive:true});await fs.access(directory,require('node:fs').constants.W_OK);
  let project;
  try{
   const registration=await this.desktop.ensure({directory,projectId:v.projectId,...options});
   options.signal?.throwIfAborted();
   if(!registration?.projectId)throw Error('Codex 桌面未确认项目注册');
   project=(await session.request('project/read',{projectId:registration.projectId})).project;
   if(project?.id!==registration.projectId)throw Error('Codex 桌面与后台的项目编号不一致');
  }catch(e){throw Error('Codex 项目建立或读取失败，未创建项目外对话：'+e.message);}
  if(!project||typeof project.id!=='string'||!project.id||!project.roots?.some(r=>typeof r.path==='string'&&require('./file-identity.cjs').fileKey(r.path)===require('./file-identity.cjs').fileKey(directory)))throw Error('Codex 项目目录与已保存位置不同，请人工确认项目设置后重新开始');
  options.signal?.throwIfAborted();const bound={...v,projectId:project.id};const current=await this.get();if(current.key===v.key)await this.write(bound);
  return {...bound,directory};
 }
}
module.exports={AgentProject,validateProject,rootOf};
