const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {writeVerifiedFile}=require('./durable-file.cjs');
const {validateManifest,compareVersion}=require('./protocol.cjs');
function revision(m){return m.policyRevision??Date.parse(m.publishedAtUtc);}
function mandatory(m,version){return !!m&&(m.isMandatory||compareVersion(version,m.minimumSupportedVersion)<0);}
class Updates {
 constructor({config,version,dataDir,fetch,onChange=()=>{}}){Object.assign(this,{config,version,dataDir,fetch,onChange});this.available=null;this.message='';this.busy=false;this.phase='idle';this.lastCheck=0;this.preferences={};this.latest=null;this.result=null;}
 async writeJson(name,value){await fs.mkdir(this.dataDir,{recursive:true});const dest=path.join(this.dataDir,name),tmp=dest+'.tmp';await fs.writeFile(tmp,JSON.stringify(value));await fs.rename(tmp,dest);}
 select(manual=false){const m=this.latest;this.available=m&&(mandatory(m,this.version)||manual||(m.version!==this.preferences.skip&&Date.now()>=(this.preferences.laterUntil||0)))?m:null;}
 async init(){
  try{this.preferences=JSON.parse(await fs.readFile(path.join(this.dataDir,'update-preferences.json'),'utf8'));}catch{}
  try{const e=JSON.parse(await fs.readFile(path.join(this.dataDir,'update-policy.json'),'utf8'));this.latest=validateManifest(e,this.config,this.version);this.acceptedEnvelope=e;if(this.latest){this.select();this.message=this.available?'发现版本 '+this.latest.version:'已记住更新设置';}}catch{}
  try{const dir=path.join(this.dataDir,'updates'),names=(await fs.readdir(dir)).filter(n=>/^install-[a-f0-9]+\.json\.result$/.test(n));const items=await Promise.all(names.map(async n=>({n,time:(await fs.stat(path.join(dir,n))).mtimeMs})));items.sort((a,b)=>b.time-a.time);if(items[0])this.result=(await fs.readFile(path.join(dir,items[0].n),'utf8')).slice(0,2000);}catch{}
  this.onChange(this.status());
  if(this.config.updateManifestUrl){this.start=setTimeout(()=>this.check(false).catch(()=>{}),1800);this.interval=setInterval(()=>this.check(false).catch(()=>{}),300000);this.start.unref?.();this.interval.unref?.();}
 }
 status(){return {configured:!!this.config.updateManifestUrl,available:this.available,message:this.message||(!this.config.updateManifestUrl?'尚未配置更新仓库':'等待检查更新'),busy:this.busy,phase:this.phase,required:mandatory(this.available,this.version),lastCheck:this.lastCheck,result:this.result,pollMinutes:5};}
 assert(){if(this.phase==='downloading'||this.phase==='staging'||this.phase==='restarting')throw new Error('正在安装更新，请等待完成。项目仍可保存。');if(mandatory(this.available,this.version))throw new Error('请先安装强制更新，再执行导出或 AI 文案对应。编辑和保存项目仍可使用。');}
 async check(manual=true){
  if(!this.config.updateManifestUrl){this.message='尚未配置更新仓库';return this.status();}
  if(this.busy||!manual&&Date.now()-this.lastCheck<30000)return this.status();
  this.lastCheck=Date.now();this.busy=true;this.phase='checking';this.onChange(this.status());
  try{
   const url='https://github.com/'+this.config.githubRepository+'/releases/latest/download/update.json';
   if(this.config.updateManifestUrl!==url)throw new Error('更新清单地址无效');
   const r=await this.fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw new Error('更新检查失败 HTTP '+r.status);
   if(Number(r.headers.get('content-length'))>65536)throw new Error('更新清单过大');
   const reader=r.body.getReader();let chunks=[],length=0;try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>65536)throw new Error('更新清单过大');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
   const e=JSON.parse(Buffer.concat(chunks).toString('utf8')),m=validateManifest(e,this.config,this.version);
   const previous=this.acceptedEnvelope?.payload;
   // Signed policy revisions are monotonic, including optional -> mandatory for an existing version.
   if(previous&&(revision(e.payload)<revision(previous)||revision(e.payload)===revision(previous)&&JSON.stringify(e)!==JSON.stringify(this.acceptedEnvelope)||compareVersion(e.payload.version,previous.version)<0))throw new Error('更新清单比已验证版本旧，保留当前更新策略');
   await this.writeJson('update-policy.json',e);this.acceptedEnvelope=e;this.latest=m;this.select(manual);
   this.message=this.available?'发现版本 '+m.version:m?'已跳过或稍后提醒此版本':'已是最新版本';
  }catch(e){this.message='检查更新未成功：'+e.message+(mandatory(this.available,this.version)?'；已收到的强制更新仍需安装':'');if(manual)throw e;}
  finally{this.busy=false;this.phase='idle';this.onChange(this.status());}
  return this.status();
 }
 async defer(skip){if(this.busy)throw new Error('更新正在处理，请稍候');if(!this.available)return this.status();this.assert();if(skip)this.preferences.skip=this.available.version;else this.preferences.laterUntil=Date.now()+1800000;await this.writeJson('update-preferences.json',this.preferences);this.available=null;this.message=skip?'已跳过此版本；强制更新仍会通知':'30 分钟后提醒；期间仍检查强制更新';this.onChange(this.status());clearTimeout(this.later);if(!skip){this.later=setTimeout(()=>{this.select();this.onChange(this.status());this.check(false).catch(()=>{});},1800100);this.later.unref?.();}return this.status();}
 async download(m,onProgress=()=>{}){const directory=path.join(this.dataDir,'updates');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,m.sha256+'.zip.tmp');for(let round=0;round<2;round++){let size=(await fs.stat(file).catch(()=>({size:0}))).size;if(size>m.length){await fs.unlink(file);size=0;}while(size<m.length){const end=Math.min(size+4*1024*1024,m.length)-1;let complete=false;for(let attempt=0;attempt<4&&!complete;attempt++){try{const r=await this.fetch(m.downloadUrl,{headers:{Range:`bytes=${size}-${end}`},signal:AbortSignal.timeout(45000)});if(r.status!==206||r.headers.get('content-range')!==`bytes ${size}-${end}/${m.length}`)throw new Error('更新服务器未返回有效 Range');const reader=r.body.getReader();let chunks=[],length=0;try{while(true){let timer;const result=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('下载停滞')),8000);})]).finally(()=>clearTimeout(timer));if(result.done)break;length+=result.value.length;if(length>end-size+1)throw new Error('下载块超出范围');chunks.push(Buffer.from(result.value));}}finally{await reader.cancel().catch(()=>{});}if(length!==end-size+1)throw new Error('更新下载块长度不一致');await fs.appendFile(file,Buffer.concat(chunks));size=end+1;onProgress(size/m.length);complete=true;}catch(e){if(attempt===3)throw e;}}}const bytes=await fs.readFile(file);if(crypto.createHash('sha256').update(bytes).digest('hex')===m.sha256)return bytes;await fs.unlink(file);}throw new Error('更新文件 SHA-256 校验失败');}
 async stage(bytes,manifest,appPath){const JSZip=require('jszip');const zip=await JSZip.loadAsync(bytes);const staged=appPath+'.next';const expected=path.join(path.dirname(appPath),'app');if(path.resolve(appPath)!==path.resolve(expected))throw new Error('更新仅支持打包后的 resources/app');await fs.rm(staged,{recursive:true,force:true});await fs.mkdir(staged);let total=0,count=0;try{for(const entry of Object.values(zip.files)){const n=entry.name;if(entry.unsafeOriginalName&&entry.unsafeOriginalName!==n||n.includes('\\')||n.includes(':')||n.startsWith('/')||n.split('/').some(p=>p==='..'||/[. ]$/.test(p))||((entry.unixPermissions||0)&0xf000)===0xa000)throw new Error('更新压缩包路径不安全');if(entry.dir)continue;if(++count>10000)throw new Error('更新文件数量超限');if((entry._data?.uncompressedSize||0)>500*1024*1024-total)throw new Error('更新解压体积超限');const content=await entry.async('nodebuffer');total+=content.length;if(total>500*1024*1024)throw new Error('更新解压体积超限');const dest=path.join(staged,n);if(!dest.startsWith(staged+path.sep))throw new Error('更新路径越界');await fs.mkdir(path.dirname(dest),{recursive:true});await writeVerifiedFile(dest,content);}const pkg=JSON.parse(await fs.readFile(path.join(staged,'package.json'),'utf8'));if(pkg.name!=='psd-lingo'||pkg.version!==manifest.version||pkg.main!=='main.cjs')throw new Error('更新包产品或版本不一致');await fs.access(path.join(staged,'main.cjs'));await fs.access(path.join(staged,'renderer/index.html'));return staged;}catch(e){await fs.rm(staged,{recursive:true,force:true});throw e;}}
 async install({appPath,exe,helperPath,quit,onProgress}){if(this.busy)throw new Error('更新正在处理');if(!this.available)throw new Error('请先检查更新');this.busy=true;this.phase='downloading';this.onChange(this.status());const m=this.available;try{const bytes=await this.download(m,onProgress);this.phase='staging';this.onChange(this.status());const staged=await this.stage(bytes,m,appPath);const backup=appPath+'.previous';// A prior backup is discarded only after a verified new payload is fully staged.
 await fs.rm(backup,{recursive:true,force:true});const dir=path.join(this.dataDir,'updates');const nonce=crypto.randomBytes(24).toString('hex'),ticket=path.join(dir,'install-'+nonce+'.json'),ack=path.join(dir,'ack-'+nonce);await writeVerifiedFile(ticket,JSON.stringify({exe,app:appPath,staged,ack,nonce,pid:String(process.pid)}));const copied=path.join(dir,'updater-'+nonce+'.exe');await fs.copyFile(helperPath,copied);const child=spawn(copied,['update',ticket],{cwd:dir,detached:true,windowsHide:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();this.phase='restarting';this.onChange(this.status());quit();return {restarting:true};}finally{this.busy=false;if(this.phase!=='restarting')this.phase='idle';this.onChange(this.status());}}
 close(){clearTimeout(this.start);clearInterval(this.interval);clearTimeout(this.later);}
}
module.exports={Updates,mandatory};
