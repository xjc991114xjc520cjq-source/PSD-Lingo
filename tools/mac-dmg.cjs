const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const exec=require('node:util').promisify(require('node:child_process').execFile);
async function buildDmg(app,out){
 if(process.platform!=='darwin')throw Error('Build DMG on macOS');
 const {verifyApp,verifyDmgDistribution}=require('../services/macos-dmg-updater.cjs');
 const version=JSON.parse(await fs.readFile(path.join(app,'Contents/Resources/app/package.json'),'utf8')).version;
 await verifyApp(app,version);await fs.mkdir(out,{recursive:true});
 const staging=await fs.mkdtemp(path.join(out,'dmg-content-'));
 await exec('/usr/bin/ditto',[app,path.join(staging,'Sparkit.app')],{timeout:180000});
 await fs.symlink('/Applications',path.join(staging,'Applications'));
 await require('./mac-startup-repair.cjs').generate(app,staging);
 await fs.writeFile(path.join(staging,'安装说明.txt'),'将 Sparkit.app 拖到 Applications，然后打开。首次安装若提示损坏，可使用本包绑定的“Sparkit-首次启动修复.command”，或联系开发人员处理。安装此版本后，后续更新会自动校验 DMG、退出、替换完整应用并重新打开。请先保存项目。当前为发布方签名的测试分发，尚无 Apple 公证。\n');
 const dmg=path.join(out,`Sparkit-${version}-Mac-arm64.dmg`);
 await exec('/usr/bin/hdiutil',['create','-volname','Sparkit '+version,'-srcfolder',staging,'-format','UDZO','-ov',dmg],{timeout:240000});
 await verifyDmgDistribution(dmg,version);
 const bytes=await fs.readFile(dmg),report={version,dmg,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),deepAppSignatureVerified:true,dmgVerified:true,notarized:false,distribution:'publisher-signed-test'};
 await fs.writeFile(path.join(out,'dmg-build-report.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module)buildDmg(path.resolve(process.argv[2]),path.resolve(process.argv[3])).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={buildDmg};
