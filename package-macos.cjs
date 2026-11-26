const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Apple Silicon Mac required');
 const root=__dirname,dist=path.join(root,'work/mac-dist'),app=path.join(dist,'Sparkit.app'),contents=path.join(app,'Contents'),resources=path.join(contents,'Resources'),payload=path.join(resources,'app');
 await fs.mkdir(dist,{recursive:true});
 // Only remove this script's fixed output, never a caller-supplied directory.
 await fs.rm(app,{recursive:true,force:true});
 execFileSync('/usr/bin/ditto',[path.join(root,'node_modules/electron/dist/Electron.app'),app]);
 await fs.rename(path.join(contents,'MacOS/Electron'),path.join(contents,'MacOS/Sparkit'));
 const plist=path.join(contents,'Info.plist'),pb='/usr/libexec/PlistBuddy';
 for(const [key,value]of Object.entries({CFBundleExecutable:'Sparkit',CFBundleIdentifier:'com.sparkit.desktop',CFBundleName:'Sparkit',CFBundleDisplayName:'灵搭 Sparkit',CFBundleShortVersionString:require('./package.json').version,CFBundleVersion:require('./package.json').version,LSMinimumSystemVersion:'13.0',NSAppleEventsUsageDescription:'灵搭需要通过自动化读取和修改您选择的 Photoshop 与 Illustrator 工作副本。'})){
  try{execFileSync(pb,['-c',`Set :${key} ${value}`,plist],{stdio:'pipe'});}catch{execFileSync(pb,['-c',`Add :${key} string ${value}`,plist]);}
 }
 const iconset=path.join(dist,'Sparkit.iconset');await fs.mkdir(iconset,{recursive:true});
 const macIcon=path.join(dist,'mac-icon-source.png');execFileSync(require('electron'),[path.join(root,'tools/mac-icon.cjs'),path.join(root,'renderer/assets/sparkit-icon.png'),macIcon],{stdio:'inherit'});
 for(const size of [16,32,128,256,512])for(const scale of [1,2])execFileSync('/usr/bin/sips',['-z',String(size*scale),String(size*scale),macIcon,'--out',path.join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)],{stdio:'pipe'});
 execFileSync('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'sparkit.icns')]);
 execFileSync(pb,['-c','Set :CFBundleIconFile sparkit.icns',plist]);
 await fs.mkdir(path.join(payload,'bin'),{recursive:true});
 require('esbuild').buildSync({entryPoints:[path.join(root,'main.cjs')],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:path.join(payload,'main.cjs'),external:['electron','@openai/codex-sdk']});
 await fs.copyFile(path.join(root,'services/bin/sparkit-device'),path.join(payload,'bin/sparkit-device'));await fs.chmod(path.join(payload,'bin/sparkit-device'),0o755);
 const codexRoot=path.join(root,'node_modules/@openai/codex-darwin-arm64'),codexSource=path.join(codexRoot,'vendor/aarch64-apple-darwin/bin/codex');
 await fs.cp(path.join(codexRoot,'vendor/aarch64-apple-darwin'),path.join(payload,'bin/codex'),{recursive:true});await fs.chmod(path.join(payload,'bin/codex/bin/codex'),0o755);
 const codexMinimum=execFileSync('/usr/bin/otool',['-l',codexSource],{encoding:'utf8'}).match(/minos[ ]+([0-9.]+)/)?.[1]||'13.0';
 const minimumMacOS=parseFloat(codexMinimum)>13?codexMinimum:'13.0';execFileSync(pb,['-c','Set :LSMinimumSystemVersion '+minimumMacOS,plist]);
 await fs.copyFile(path.join(root,'preload.cjs'),path.join(payload,'preload.cjs'));
 for(const folder of ['design-skills','design-plugins'])await fs.cp(path.join(root,'services',folder),path.join(payload,folder),{recursive:true});
 await fs.mkdir(path.join(payload,'renderer'),{recursive:true});
 for(const file of await fs.readdir(path.join(root,'renderer')))if(/\.(css|html)$/.test(file)||['bundle.js','spark-boot.js'].includes(file))await fs.copyFile(path.join(root,'renderer',file),path.join(payload,'renderer',file));
 await fs.cp(path.join(root,'renderer/assets'),path.join(payload,'renderer/assets'),{recursive:true});
 const sdk=path.join(payload,'node_modules/@openai/codex-sdk');await fs.mkdir(sdk,{recursive:true});
 for(const file of ['dist','package.json'])await fs.cp(path.join(root,'node_modules/@openai/codex-sdk',file),path.join(sdk,file),{recursive:true});
 await fs.cp(path.join(root,'第三方许可'),path.join(payload,'第三方许可'),{recursive:true});
 await fs.copyFile(path.join(root,'vendor/ssf/LICENSE'),path.join(payload,'第三方许可/ssf-LICENSE'));
 // Retain the official CLI distribution's attribution alongside its unmodified binary.
 for(const file of ['LICENSE','NOTICE','README.md']){try{await fs.copyFile(path.join(codexRoot,file),path.join(payload,'第三方许可','OpenAI-Codex-'+file));}catch(e){if(e.code!=='ENOENT')throw e;}}
 await fs.writeFile(path.join(payload,'package.json'),JSON.stringify({name:'psd-lingo',productName:'灵搭 Sparkit',version:require('./package.json').version,main:'main.cjs'}));
 await require('@electron/osx-sign').sign({app,binaries:[path.join(payload,'bin/codex/bin/codex')],identity:'-',identityValidation:false,platform:'darwin',preAutoEntitlements:false,preEmbedProvisioningProfile:false,optionsForFile:()=>({entitlements:path.join(root,'tools/mac-entitlements.plist'),hardenedRuntime:true,timestamp:'none'})});
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
 const zip=path.join(dist,`Sparkit-${require('./package.json').version}-Mac-arm64-test.zip`);
 await fs.rm(zip,{force:true});execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip]);
 const report={version:require('./package.json').version,platform:process.platform,arch:process.arch,minimumMacOS,codexMinimumMacOS:codexMinimum,signing:'ad-hoc',notarized:false,bundledCodex:require(path.join(codexRoot,'package.json')).version,zip:path.basename(zip),sha256:crypto.createHash('sha256').update(await fs.readFile(zip)).digest('hex'),builtAt:new Date().toISOString()};
 await fs.writeFile(path.join(dist,'build-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
