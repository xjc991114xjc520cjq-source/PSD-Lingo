const fs=require('node:fs/promises');
const path=require('node:path');
// Filesystem-only discovery: never launch an executable or run a shell command.
async function discoverCodex({savedPath='',env=process.env,platform=process.platform,arch=process.arch,io=fs,root=__dirname}={}){
 const p=platform==='win32'?path.win32:path.posix,windows=platform==='win32',candidates=[],seen=new Set();
 const clean=value=>typeof value==='string'?value.trim().replace(/^"(.*)"$/,'$1'):'';
 async function add(value){value=clean(value);if(!value||!p.isAbsolute(value)||/[\r\n\0]/.test(value))return;value=p.normalize(value);const key=windows?value.toLowerCase():value;if(seen.has(key))return;seen.add(key);if(windows&&!/\.exe$/i.test(value))return;try{const stat=await io.stat(value);if(stat.isFile()){if(!windows)await io.access(value,1);candidates.push(value);}}catch{}}
 async function children(root,match){if(!root)return [];try{return (await io.readdir(root,{withFileTypes:true})).filter(item=>item.isDirectory()&&match.test(item.name)).map(item=>item.name).sort().reverse().slice(0,16);}catch{return [];}}
 async function nativePackage(root){
  const triples=windows?[arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc']:[];
  for(const triple of triples)for(const packageRoot of [p.join(root,'@openai','codex'),p.join(root,'@openai','codex-win32-'+(arch==='arm64'?'arm64':'x64')),p.join(root,'@openai','codex','node_modules','@openai','codex-win32-'+(arch==='arm64'?'arm64':'x64'))])await add(p.join(packageRoot,'vendor',triple,'codex','codex.exe'));
 }
 const packagedSaved=windows&&/[\\/]WindowsApps[\\/]/i.test(clean(savedPath));
 if(!packagedSaved)await add(savedPath);
 if(candidates.length)return {path:candidates[0],candidates};
 if(platform==='darwin'){await add(require('./bundled-codex.cjs').bundledCodexPath({platform,root}));if(candidates.length)return {path:candidates[0],candidates,bundled:true};}
 const envGet=name=>env[name]??Object.entries(env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]??'';
 const home=windows?(envGet('USERPROFILE')||envGet('HOME')):envGet('HOME'),local=envGet('LOCALAPPDATA'),roaming=envGet('APPDATA');
 // The desktop app extracts its runnable CLI outside the protected MSIX tree.
 // Prefer that native binary over WindowsApps entries which can stat/read but
 // fail CreateProcess with EPERM when launched from another desktop app.
 if(windows&&local){const root=p.join(local,'OpenAI','Codex','bin');await add(p.join(root,'codex.exe'));for(const name of await children(root,/^[a-z0-9._-]+$/i))await add(p.join(root,name,'codex.exe'));}
 const pathEntries=String(envGet('PATH')).split(windows?';':':').map(clean).filter(v=>v&&p.isAbsolute(v)).slice(0,80);
 for(const directory of [...new Set(pathEntries)]){await add(p.join(directory,windows?'codex.exe':'codex'));if(windows){await nativePackage(p.join(directory,'node_modules'));}}
 if(home){await add(p.join(home,'.codex','bin',windows?'codex.exe':'codex'));await add(p.join(home,'.local','bin',windows?'codex.exe':'codex'));}
 if(platform==='darwin'){
  // Finder launches do not inherit a shell's Homebrew PATH. Search fixed install roots only.
  const triple=arch==='arm64'?'aarch64-apple-darwin':'x86_64-apple-darwin';
  for(const root of ['/opt/homebrew/lib/node_modules','/usr/local/lib/node_modules']){
   for(const pkg of ['@openai/codex',`@openai/codex-darwin-${arch==='arm64'?'arm64':'x64'}`,`@openai/codex/node_modules/@openai/codex-darwin-${arch==='arm64'?'arm64':'x64'}`])await add(p.join(root,pkg,'vendor',triple,'codex','codex'));
  }
  for(const directory of ['/opt/homebrew/bin','/usr/local/bin'])await add(p.join(directory,'codex'));
 }
 if(windows){
  if(roaming)await nativePackage(p.join(roaming,'npm','node_modules'));
  if(local)for(const directory of [p.join(local,'Programs','Codex'),p.join(local,'Programs','OpenAI Codex'),p.join(local,'Codex')])for(const suffix of ['codex.exe','resources/codex.exe','resources/app/bin/codex.exe'])await add(p.join(directory,suffix));
  if(local){const root=p.join(local,'Microsoft','WinGet','Packages');for(const name of await children(root,/^OpenAI\.Codex/i))for(const suffix of ['codex.exe','codex-x86_64-pc-windows-msvc.exe','codex-aarch64-pc-windows-msvc.exe'])await add(p.join(root,name,suffix));}
  if(packagedSaved)await add(savedPath);
  const programFiles=envGet('ProgramFiles');
  if(programFiles){const root=p.join(programFiles,'WindowsApps');for(const name of await children(root,/^OpenAI\.Codex_/i))for(const suffix of ['app/resources/codex.exe','resources/codex.exe','codex.exe'])await add(p.join(root,name,suffix));}
 }
 if(!candidates.length)throw new Error('未找到 Codex CLI。请先安装官方 Codex CLI，或点击“手动选择”指定 '+(windows?'codex.exe':'codex')+'。');
 return {path:candidates[0],candidates};
}
module.exports={discoverCodex};
