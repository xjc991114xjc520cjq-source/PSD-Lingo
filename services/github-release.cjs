const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const config=require('./product-config.cjs');
const {validateManifest}=require('./protocol.cjs');
async function publishRelease({directory,token,fetch=globalThis.fetch,onProgress=()=>{}},cfg=config){
 if(typeof token!=='string'||!token.trim())throw new Error('请填写具有此仓库 Contents 读写权限的 GitHub Token；仅本次发布使用');
 const envelope=JSON.parse(await fs.readFile(path.join(directory,'update.json'),'utf8'));
 const m=validateManifest(envelope,cfg,'0.0.0'),base='https://api.github.com/repos/'+cfg.githubRepository;
 async function request(url,method='GET',body,extra={}){
  const r=await fetch(url,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token.trim(),...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
  const data=r.status===204?null:await r.json();if(!r.ok){const e=new Error('GitHub 发布失败 HTTP '+r.status+'：'+(data?.message||'请求失败'));e.status=r.status;throw e;}return data;
 }
 const fileName=decodeURIComponent(new URL(m.downloadUrl).pathname.split('/').pop());
 const payload=await fs.readFile(path.join(directory,fileName));
 if(payload.length!==m.length||crypto.createHash('sha256').update(payload).digest('hex')!==m.sha256)throw new Error('待上传载荷与签名清单不一致，请重新生成');
 const assets=[{name:fileName,bytes:payload},{name:'update.json',bytes:await fs.readFile(path.join(directory,'update.json'))},{name:'SHA256SUMS.txt',bytes:await fs.readFile(path.join(directory,'SHA256SUMS.txt'))}];
 const installerName='PSD-Lingo-'+m.version+'-Setup.exe';try{assets.push({name:installerName,bytes:await fs.readFile(path.join(directory,installerName))});}catch(e){if(e.code!=='ENOENT')throw e;}
 // No token is written to disk, returned to the renderer, or included in release files.
 let release;try{release=await request(base+'/releases/tags/'+m.releaseTag);}catch(e){if(e.status!==404)throw e;}
 if(!release){release=await request(base+'/releases','POST',{tag_name:m.releaseTag,target_commitish:'main',name:'PSD Lingo '+m.version,body:m.notes,draft:true,prerelease:false});}
 if(release.tag_name!==m.releaseTag||!release.upload_url?.startsWith('https://uploads.github.com/repos/'+cfg.githubRepository+'/releases/'))throw new Error('GitHub 返回的发布目标不一致');
 const uploadBase=release.upload_url.split('{')[0];
 let existing=await request(base+'/releases/'+release.id+'/assets?per_page=100');
 const oldManifest=existing.find(a=>a.name==='update.json');
 const newManifest=assets.find(a=>a.name==='update.json');
 if(oldManifest&&!release.draft&&oldManifest.digest!=='sha256:'+crypto.createHash('sha256').update(newManifest.bytes).digest('hex')){
  const r=await fetch('https://github.com/'+cfg.githubRepository+'/releases/download/'+m.releaseTag+'/update.json',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('无法核对现有更新策略，停止覆盖');
  const old=validateManifest(await r.json(),cfg,'0.0.0');
  if((m.policyRevision??Date.parse(m.publishedAtUtc))<=(old.policyRevision??Date.parse(old.publishedAtUtc)))throw new Error('新策略序号必须高于已发布策略，请重新生成');
 }
 for(const asset of assets){
  const digest='sha256:'+crypto.createHash('sha256').update(asset.bytes).digest('hex'),old=existing.find(a=>a.name===asset.name);
  if(old?.size===asset.bytes.length&&old.digest===digest){onProgress('已核对 '+asset.name);continue;}
  if(old&&asset.name===fileName)throw new Error('同一版本已有不同应用载荷；请增加版本号');
  if(old&&asset.name===installerName)throw new Error('同一版本已有不同安装包；请增加版本号');
  onProgress('正在上传 '+asset.name);
  const temporary=old?asset.name+'.pending-'+crypto.randomBytes(6).toString('hex'):asset.name;
  const uploaded=await request(uploadBase+'?name='+encodeURIComponent(temporary),'POST',asset.bytes,{'Content-Type':'application/octet-stream'});
  if(uploaded.size!==asset.bytes.length||uploaded.digest!==digest)throw new Error('GitHub 上传后的文件校验不一致，发布已停止');
  if(old){await request(base+'/releases/assets/'+old.id,'DELETE');await request(base+'/releases/assets/'+uploaded.id,'PATCH',{name:asset.name});}
 }
 onProgress('正在公开发布并设置 Latest');
 const published=await request(base+'/releases/'+release.id,'PATCH',{draft:false,prerelease:false,make_latest:'true',name:'PSD Lingo '+m.version,body:m.notes+'\n\n更新方式：'+(m.isMandatory?'强制更新':'用户可跳过')+'。单 EXE 用于首次安装，应用 ZIP 由客户端自动更新器使用。'});
 if(published.draft||published.tag_name!==m.releaseTag)throw new Error('GitHub 未确认公开发布');
 return {url:cfg.updateManifestUrl.replace('/latest/download/update.json','/tag/'+m.releaseTag),version:m.version,isMandatory:m.isMandatory};
}
module.exports={publishRelease};
