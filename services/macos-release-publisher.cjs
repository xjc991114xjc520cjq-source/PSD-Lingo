const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonical,compareVersion}=require('./protocol.cjs'),{validateMacManifest,verifyPackage}=require('./macos-updates.cjs');
// Preparation only. Publishing the versioned asset and mac-updates feed is separate.
async function prepareMacRelease(options,config=require('./product-config.cjs'),{verify=verifyPackage}={}){
 const {payloadPath,privateKeyPath,outputDirectory,version,notes='',isMandatory=false,isMajorUpdate=false,minimumSupportedVersion='0.0.0',policyRevision=Date.now(),keyId='update-1'}=options;
 compareVersion(version,version);const bytes=await fs.readFile(payloadPath);await verify(payloadPath);
 const releaseTag='mac-v'+version+'-arm64',asset=`Sparkit-${version}-Mac-arm64-Setup.pkg`,base='https://github.com/'+config.githubRepository+'/releases/';
 const payload={appId:config.appId,platform:'darwin',arch:'arm64',updaterProtocol:2,packageType:'pkg',version,releaseTag,downloadUrl:base+'download/'+releaseTag+'/'+asset,pageUrl:base+'tag/'+releaseTag,length:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),minimumSupportedVersion,publishedAtUtc:new Date().toISOString(),policyRevision,isMandatory,isMajorUpdate,notes};
 const envelope={algorithm:'ES256',keyId,payload,signature:crypto.sign('sha256',Buffer.from(canonical(payload)),{key:await fs.readFile(privateKeyPath),dsaEncoding:'ieee-p1363'}).toString('base64')};
 validateMacManifest(envelope,config,'0.0.0','arm64');
 const manifestPath=path.join(outputDirectory,'update-macos-arm64.json');
 let previous;try{previous=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){validateMacManifest(previous,config,'0.0.0','arm64');if(policyRevision<=previous.payload.policyRevision||compareVersion(version,previous.payload.version)<0)throw Error('Mac 更新策略序号必须增加，版本不能回退');}
 await fs.mkdir(outputDirectory,{recursive:true});const destination=path.join(outputDirectory,asset);
 if(path.resolve(payloadPath)!==path.resolve(destination))await fs.copyFile(payloadPath,destination);
 await require('./durable-file.cjs').writeVerifiedFile(manifestPath,JSON.stringify(envelope,null,2));
 return {version,releaseTag,assetPath:destination,manifestPath,sha256:payload.sha256,published:false,feedTag:'mac-updates',makeLatest:false};
}
module.exports={prepareMacRelease};
