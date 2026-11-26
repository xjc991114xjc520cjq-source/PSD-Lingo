// Prepare a manual-install DMG, then remove only this product's existing copies.
// App data, Keychain, other products and other Codex tasks stay outside the scope.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
async function main(){
 if(process.platform!=='darwin')throw Error('Mac required');const session=path.resolve(__dirname,'../..'),home='/Users/jingchun',source=path.join(session,'packages/expanded5/Payload/Sparkit.app');
 const desktop=path.join(home,'Desktop/灵搭Sparkit-Mac手动安装测试-0.3.107-5');await fs.mkdir(desktop);const staging=await fs.mkdtemp(path.join(session,'packages/manual-dmg-'));
 const candidates=[];
 async function identify(app){try{return (await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(app,'Contents/Info.plist')])).stdout.trim()==='com.sparkit.desktop';}catch{return false;}}
 for(const parent of ['/Applications',path.join(home,'Applications')])for(const item of await fs.readdir(parent,{withFileTypes:true}).catch(()=>[]))if(item.isDirectory()&&item.name.endsWith('.app')&&await identify(path.join(parent,item.name)))candidates.push(path.join(parent,item.name));
 async function scan(directory){for(const item of await fs.readdir(directory,{withFileTypes:true})){if(!item.isDirectory()||item.isSymbolicLink())continue;const target=path.join(directory,item.name);if(item.name.endsWith('.app')){if(await identify(target))candidates.push(target);}else await scan(target);}}
 await scan(path.join(session,'packages')); // Do not scan other Codex tasks or tool runtimes.
 const {stdout:processes}=await exec('/bin/ps',['-axo','pid=,command=']);for(const app of candidates)if(processes.split('\n').some(line=>line.includes(app+'/Contents/MacOS/Sparkit')))throw Error('Sparkit is running; preserve unsaved work before uninstalling');
 await exec('/usr/bin/codesign',['--verify','--deep','--strict',source]);await exec('/usr/bin/ditto',[source,path.join(staging,'Sparkit.app')]);await fs.symlink('/Applications',path.join(staging,'Applications'));
 await require('./mac-startup-repair.cjs').generate(source,staging);
 const guide='灵搭 Sparkit · Apple 芯片 Mac 手动安装测试\n\n1. 双击 Sparkit-0.3.107-5-arm64.dmg。\n2. 将 Sparkit.app 拖到 Applications（应用程序）。\n3. 在应用程序中打开 Sparkit。\n4. 若提示“损坏”或首次启动受阻，双击本文件夹的“Sparkit-首次启动修复.command”，核对通过后它只处理已安装的 Sparkit，并再次打开。若修复工具也被拦截，直接告诉我，我会通过已有 SSH 处理，不需要你反复输入命令。\n\n此次已清理旧版应用副本，保留账号、钥匙串、项目和设置，不会自动安装新版。内部版本0.3.107，第5号Mac测试包。原生Adobe功能需要另行安装 Photoshop/Illustrator。\n\n这是临时签名测试版，尚未取得 Apple Developer ID 签名与公证；修复是本机定向放行，不是Apple公证。\n';
 await fs.writeFile(path.join(desktop,'先读我-安装步骤.txt'),guide);await fs.writeFile(path.join(staging,'先读我-安装步骤.txt'),guide);
 for(const name of ['Sparkit-首次启动修复.command','startup-repair-manifest.json']){await fs.copyFile(path.join(staging,name),path.join(desktop,name));}await fs.chmod(path.join(desktop,'Sparkit-首次启动修复.command'),0o755);
 const dmg=path.join(desktop,'Sparkit-0.3.107-5-arm64.dmg');await exec('/usr/bin/hdiutil',['create','-volname','灵搭 Sparkit 安装','-srcfolder',staging,'-format','UDZO','-ov',dmg],{timeout:180000,maxBuffer:1024*1024});
 await exec('/usr/bin/hdiutil',['verify',dmg],{timeout:60000});const hash=crypto.createHash('sha256').update(await fs.readFile(dmg)).digest('hex');await fs.writeFile(path.join(desktop,'SHA256.txt'),hash+'  '+path.basename(dmg)+'\n');
 const mounted=path.join(session,'tmp/manual-install-mount');await fs.mkdir(mounted);await exec('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mounted,dmg],{timeout:60000});
 try{await exec('/usr/bin/codesign',['--verify','--deep','--strict',path.join(mounted,'Sparkit.app')]);if(await fs.readlink(path.join(mounted,'Applications'))!=='/Applications')throw Error('Applications link missing');}finally{await exec('/usr/bin/hdiutil',['detach',mounted]);}
 const trash=await fs.mkdtemp(path.join(home,'.Trash/Sparkit-old-apps-')),moved=[];
 for(let i=0;i<candidates.length;i++){const original=candidates[i],resolved=await fs.realpath(original);if(resolved!==original||!(['/Applications/',home+'/Applications/',session+'/packages/'].some(prefix=>original.startsWith(prefix))))throw Error('Unexpected uninstall scope: '+original);if(!await identify(original))throw Error('App identity changed');const destination=path.join(trash,String(i+1)+'-'+path.basename(original));await fs.rename(original,destination);moved.push({original,trash:destination});}
 const report={desktop,dmg,sha256:hash,moved,installedVersionRemoved:moved.some(item=>item.original.startsWith('/Applications/')||item.original.startsWith(home+'/Applications/')),newVersionInstalled:false,dataRemoved:false,keychainChanged:false,otherProductsTouched:false,manualInstallationPending:true,appleNotarized:false,finishedAt:new Date().toISOString()};await fs.writeFile(path.join(session,'logs/manual-install-handoff.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(trash,'uninstall-receipt.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
