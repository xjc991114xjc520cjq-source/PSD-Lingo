// Build a fresh candidate from our previous package, never modify the installed app.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),exec=require('node:util').promisify(execFile);
async function main(){
 if(process.platform!=='darwin')throw Error('Mac required');
 const root=path.resolve(__dirname,'..'),session=path.dirname(root),source=process.argv[2],output=process.argv[3],candidate=process.argv[4]||'6';if(!/^\d+$/.test(candidate))throw Error('Invalid candidate');if(!source||!output)throw Error('Specify source app and new output directory');
 await exec('/usr/bin/codesign',['--verify','--deep','--strict',source]);await fs.mkdir(output);
 const staging=await fs.mkdtemp(path.join(session,'packages/startup-candidate'+candidate+'-')),app=path.join(staging,'Sparkit.app'),renderer=path.join(app,'Contents/Resources/app/renderer');
 await exec('/usr/bin/ditto',[source,app]);
 for(const file of ['bundle.js','spark-startup.css','agent.css'])await fs.copyFile(path.join(root,'renderer',file),path.join(renderer,file));
 await exec('/usr/bin/codesign',['--force','--sign','-','--options','runtime','--entitlements',path.join(root,'tools/mac-entitlements.plist'),app]);await exec('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 await fs.symlink('/Applications',path.join(staging,'Applications'));await require('./mac-startup-repair.cjs').generate(app,output);
 await fs.writeFile(path.join(output,'先读我-安装步骤.txt'),'启动动画优化测试包，启动动画修复候选（内部版本0.3.107）。\n先正常退出当前Sparkit，再双击DMG，将Sparkit拖到Applications并选择替换，然后打开。账号、设置、项目保留。\n若提示损坏或启动受阻，联系开发人员通过现有SSH处理，或使用本文件夹的首次启动修复工具。\n此包为临时签名测试版，尚未Apple公证。\n');
 const dmg=path.join(output,'Sparkit-0.3.107-'+candidate+'-arm64.dmg');await exec('/usr/bin/hdiutil',['create','-volname','灵搭 Sparkit 启动优化','-srcfolder',staging,'-format','UDZO',dmg],{timeout:180000});await exec('/usr/bin/hdiutil',['verify',dmg],{timeout:60000});
 const sha256=crypto.createHash('sha256').update(await fs.readFile(dmg)).digest('hex');await fs.writeFile(path.join(output,'SHA256.txt'),sha256+'  '+path.basename(dmg)+'\n');
 const report={candidate,app,dmg,sha256,staging,source,installedAppChanged:false,notarized:false,createdAt:new Date().toISOString()};await fs.writeFile(path.join(session,'logs/startup-candidate'+candidate+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
