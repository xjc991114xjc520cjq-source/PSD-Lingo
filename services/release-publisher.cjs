const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const JSZip=require('jszip');
const {canonical,validateManifest,compareVersion}=require('./protocol.cjs');
const config=require('./product-config.cjs');
async function prepareRelease({payloadPath,privateKeyPath,outputDirectory,version,minimumSupportedVersion='0.3.2',isMandatory=false,notes='',policyRevision=Date.now(),installerPath},cfg=config){
 if(typeof isMandatory!=='boolean')throw new Error('请选择可选或强制更新');
 compareVersion(version,version);compareVersion(minimumSupportedVersion,version);
 if(!outputDirectory||!payloadPath||!privateKeyPath)throw new Error('请选择应用载荷、签名私钥和保存目录');
 const bytes=await fs.readFile(payloadPath);if(bytes.length>250*1024*1024)throw new Error('应用载荷超过 250 MiB');
 const zip=await JSZip.loadAsync(bytes),pkgEntry=zip.file('package.json');if(!pkgEntry)throw new Error('请选择 PSD-Lingo-app-版本.zip，不能使用源码或完整安装包');
 const pkg=JSON.parse(await pkgEntry.async('string'));
 if(pkg.name!=='psd-lingo'||pkg.version!==version||pkg.main!=='main.cjs'||!zip.file('main.cjs')||!zip.file('renderer/index.html'))throw new Error('应用载荷产品或版本与填写内容不一致');
 const key=await fs.readFile(privateKeyPath,'utf8'),pub=crypto.createPublicKey(key);
 if(pub.asymmetricKeyType!=='ec'||pub.asymmetricKeyDetails.namedCurve!=='prime256v1')throw new Error('更新私钥必须为 P-256');
 if(!cfg.updateKeys['update-1']||!pub.export({type:'spki',format:'der'}).equals(crypto.createPublicKey(cfg.updateKeys['update-1']).export({type:'spki',format:'der'})))throw new Error('签名私钥与客户端固定的更新公钥不匹配');
 const repo='https://github.com/'+cfg.githubRepository,tag='v'+version,name='PSD-Lingo-app-'+version+'.zip';
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const payload={appId:cfg.appId,version,releaseTag:tag,downloadUrl:repo+'/releases/download/'+tag+'/'+name,pageUrl:repo+'/releases/tag/'+tag,isMajorUpdate:false,isMandatory,minimumSupportedVersion,notes,runtimeMajor:35,updaterProtocol:1,policyRevision,publishedAtUtc:new Date().toISOString(),sha256,length:bytes.length};
 const envelope={algorithm:'ES256',keyId:'update-1',payload,signature:crypto.sign('sha256',Buffer.from(canonical(payload)),{key,dsaEncoding:'ieee-p1363'}).toString('base64')};
 validateManifest(envelope,cfg,'0.0.0');
 await fs.mkdir(outputDirectory,{recursive:true});
 const manifestPath=path.join(outputDirectory,'update.json');
 let previous;try{previous=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('已有 update.json 无法读取，请选择空目录');}
 if(previous){validateManifest(previous,cfg,'0.0.0');if(policyRevision<=(previous.payload.policyRevision??Date.parse(previous.payload.publishedAtUtc)))throw new Error('策略序号必须高于该目录已生成的清单');if(previous.payload.version===version&&previous.payload.sha256!==sha256)throw new Error('同一版本不可替换不同应用载荷，请增加版本号');if(compareVersion(version,previous.payload.version)<0)throw new Error('不可回退版本，请用更高版本号发布修复');}
 await fs.writeFile(path.join(outputDirectory,name),bytes);
 let sums=[sha256+'  '+name];
 if(installerPath){const installer=await fs.readFile(installerPath);if(installer.subarray(0,2).toString()!=='MZ'||installer.subarray(-48,-40).toString()!=='PLSETUP1')throw new Error('请选择 PSD Lingo 单 EXE 安装程序');const installerName='PSD-Lingo-'+version+'-Setup.exe';await fs.writeFile(path.join(outputDirectory,installerName),installer);sums.push(crypto.createHash('sha256').update(installer).digest('hex')+'  '+installerName);}
 await fs.writeFile(manifestPath+'.tmp',JSON.stringify(envelope,null,2)+'\n');await fs.rename(manifestPath+'.tmp',manifestPath);
 sums.push(crypto.createHash('sha256').update(await fs.readFile(manifestPath)).digest('hex')+'  update.json');
 await fs.writeFile(path.join(outputDirectory,'SHA256SUMS.txt'),sums.join('\n')+'\n');
 const instructions='# '+version+' 更新发布\n\n类型：'+(isMandatory?'强制必须更新':'用户可跳过')+'\n最低支持版本：'+minimumSupportedVersion+'\n策略序号：'+policyRevision+'\n\n'+notes+'\n\n1. 打开 '+repo+'/releases/new ，标签选择 '+tag+'。已发布此版本时编辑现有 Release。\n2. 上传此目录的应用载荷 ZIP、update.json、SHA256SUMS.txt 和可选安装 EXE（不上传私钥）。\n3. 同版本调整强制策略时，替换 update.json 和校验表，保留原应用载荷。\n4. 新版本先使用草稿，核对完成后发布，设为 Latest，不勾选 Pre-release。\n5. 客户端启动、回到窗口及每 5 分钟检查；离线用户联网后收到。GitHub CDN 可能有缓存延迟。\n6. 先验证可选更新可安装，再发布更高策略序号的强制清单。离线时保留已经收到的强制策略。\n\n强制更新期间禁止新导出和 AI 任务，允许编辑、保存与退出；不强杀 Photoshop 工作任务。回滚修复须用更高应用版本号。\n';
 await fs.writeFile(path.join(outputDirectory,'发布说明.md'),instructions);
 return {version,isMandatory,minimumSupportedVersion,policyRevision,outputDirectory,manifestPath,releaseUrl:repo+'/releases/new',files:[name,'update.json','SHA256SUMS.txt',...(installerPath?['PSD-Lingo-'+version+'-Setup.exe']:[])]};
}
module.exports={prepareRelease};
