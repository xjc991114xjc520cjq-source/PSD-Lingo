const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
function feedUrl(config){const channel=config.macUpdateChannel==='mac-dmg-updates'?'mac-dmg-updates':'mac-updates';return `https://github.com/${config.githubRepository}/releases/download/${channel}/update-macos-arm64.json`;}
function validateMacManifest(envelope,config,currentVersion,arch){
 const {verifyEnvelope,compareVersion}=require('./protocol.cjs'),p=verifyEnvelope(envelope,config.updateKeys);
 const dmg=p.packageType==='dmg'&&p.updaterProtocol===3;
 if(arch!=='arm64'||p.appId!==config.appId||p.platform!=='darwin'||p.arch!=='arm64'||!(dmg||p.updaterProtocol===2&&p.packageType==='pkg'))throw Error('Mac 更新产品、平台、架构或协议不匹配');
 if(typeof p.isMandatory!=='boolean'||typeof p.isMajorUpdate!=='boolean'||typeof p.notes!=='string'||p.notes.length>10000||!Number.isFinite(Date.parse(p.publishedAtUtc)))throw Error('Mac 更新清单字段无效');
 if(compareVersion(p.minimumSupportedVersion,p.version)>0)throw Error('最低版本高于更新版本');
 if(!Number.isSafeInteger(p.policyRevision)||p.policyRevision<1||!Number.isSafeInteger(p.length)||p.length<1||p.length>1024*1024*1024||!/^([a-f0-9]{64})$/.test(p.sha256))throw Error('Mac 更新资产或策略字段无效');
 const tag=`mac-v${p.version}-arm64`,base=`https://github.com/${config.githubRepository}/releases/`;
 const asset=dmg?`Sparkit-${p.version}-Mac-arm64.dmg`:`Sparkit-${p.version}-Mac-arm64-Setup.pkg`;
 if(p.releaseTag!==tag||p.downloadUrl!==`${base}download/${tag}/${asset}`||p.pageUrl!==`${base}tag/${tag}`)throw Error('Mac 更新 URL 不在独立发布通道白名单');
 return compareVersion(p.version,currentVersion)>0?p:null;
}
async function verifyPackage(file){
 // Keep the complete signed bundle intact. Never replace resources inside a signed app.
 const {stdout,stderr}=await exec('/usr/sbin/pkgutil',['--check-signature',file],{timeout:30000});
 if(!/Developer ID Installer:/.test(stdout+stderr))throw Error('Mac 更新安装包缺少 Developer ID Installer 签名');
 await exec('/usr/sbin/spctl',['--assess','--type','install',file],{timeout:60000});
}
async function stagePackage(bytes,manifest,dataDir,verify=verifyPackage){
 if(bytes.length!==manifest.length||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Mac 更新安装包长度或 SHA-256 不匹配');
 const dir=path.join(dataDir,'updates');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,`${manifest.sha256}.pkg`);
 await require('./durable-file.cjs').writeVerifiedFile(file,bytes);
 try{await verify(file);return file;}catch(error){await fs.unlink(file).catch(()=>{});throw error;}
}
async function openInstaller(file){await exec('/usr/bin/open',['-b','com.apple.installer',file],{timeout:15000});}
module.exports={feedUrl,validateMacManifest,stagePackage,verifyPackage,openInstaller};
