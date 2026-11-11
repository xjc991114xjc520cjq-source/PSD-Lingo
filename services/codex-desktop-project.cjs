const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
// Observation only. All desktop mutations go through Codex's registered URL
// handler, so its own project manager owns cache, backend mapping and events.
async function readRegistration(home,directory,preferredId){
 let state;try{state=JSON.parse(await fs.readFile(path.join(home,'.codex-global-state.json'),'utf8'));}
 catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw Error('无法确认 Codex 桌面项目注册状态：'+e.message);}
 const projects=state['local-projects'];if(!projects||typeof projects!=='object')return null;
 const host=Object.entries(state['app-server-project-id-by-legacy-project-id-by-host']||{}).find(([key])=>key.startsWith('local:')&&samePath(key.slice(6),home));
 if(!host)return null;const mapping=host[1];
 const ids=[...(Array.isArray(state['project-order'])?state['project-order']:[]),...Object.keys(projects)];
 const matches=[...new Set(ids)].filter(id=>projects[id]?.rootPaths?.some(root=>samePath(root,directory))&&typeof mapping[id]==='string'&&mapping[id]);
 const id=matches.find(id=>mapping[id]===preferredId)||matches[0];
 return id?{projectId:mapping[id],desktopProjectId:id}:null;
}
class CodexDesktopProject{
 constructor({read=readRegistration,open=uri=>require('electron').shell.openExternal(uri),wait=delay,timeoutMs=90000,pollMs=300,now=Date.now}={}){Object.assign(this,{read,open,wait,timeoutMs,pollMs,now});}
 async ensure({directory,projectId,env=process.env,signal,onStatus=()=>{}}){
  signal?.throwIfAborted();const home=path.resolve(env.CODEX_HOME||path.join(os.homedir(),'.codex'));
  let registered=await this.read(home,directory,projectId);signal?.throwIfAborted();if(registered)return registered;
  onStatus('首次设置：正在将任务目录注册到 Codex 桌面项目；如出现文件夹授权，请在 Codex 中确认');
  const url=new URL('codex://threads/new');url.searchParams.set('path',directory);
  // No prompt and no submission: this opens only the desktop setup/composer.
  try{await this.open(url.href);}catch(e){throw Error('无法打开本机 Codex 完成项目注册，请安装桌面版并启用 codex:// 链接：'+e.message);}
  const deadline=this.now()+this.timeoutMs;
  while(this.now()<deadline){signal?.throwIfAborted();registered=await this.read(home,directory,projectId);if(registered){signal?.throwIfAborted();return registered;}await this.wait(Math.min(this.pollMs,Math.max(1,deadline-this.now())),undefined,{signal});}
  throw Error('Codex 桌面尚未确认项目注册，未创建对话或启动模型。请在 Codex 中完成目录授权；若已关闭提示，可重新开始任务');
 }
}
module.exports={CodexDesktopProject,readRegistration,samePath};
