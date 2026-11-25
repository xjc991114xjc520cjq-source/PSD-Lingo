const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Apple Silicon required');
 const root=path.resolve(__dirname,'..'),dist=path.join(root,'work/mac-dist'),app=path.join(dist,'Sparkit.app'),version=require('../package.json').version;
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const pkg=path.join(dist,`Sparkit-${version}-Mac-arm64-Setup.pkg`);
 // No installer scripts, security-policy changes, quarantine removal or credential operations.
 const staging=path.join(dist,'installer-root'),components=path.join(dist,'installer-components.plist');
 await fs.mkdir(staging,{recursive:true});execFileSync('/usr/bin/ditto',[app,path.join(staging,'Sparkit.app')]);
 execFileSync('/usr/bin/pkgbuild',['--analyze','--root',staging,components]);
 execFileSync('/usr/libexec/PlistBuddy',['-c','Set :0:BundleIsRelocatable false',components]);
 execFileSync('/usr/bin/pkgbuild',['--root',staging,'--component-plist',components,'--install-location','/Applications','--identifier','com.sparkit.desktop','--version',version,pkg],{stdio:'inherit'});
 const assess=spawnSync('/usr/sbin/spctl',['--assess','--type','install','--verbose=2',pkg],{encoding:'utf8'});
 const report={version,platform:process.platform,arch:process.arch,installer:path.basename(pkg),sha256:crypto.createHash('sha256').update(await fs.readFile(pkg)).digest('hex'),bytes:(await fs.stat(pkg)).size,installLocation:'/Applications/Sparkit.app',installerScripts:false,signing:'unsigned-installer/ad-hoc-app',notarized:false,gatekeeperAccepted:assess.status===0,gatekeeperAssessment:(assess.stderr||assess.stdout).trim(),builtAt:new Date().toISOString()};
 await fs.writeFile(path.join(dist,'installer-build-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
