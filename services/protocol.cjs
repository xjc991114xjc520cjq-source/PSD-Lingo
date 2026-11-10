const crypto = require('node:crypto');
function canonical(value) {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function compareVersion(a,b) {
  if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b))throw new Error('版本格式必须为 x.y.z');
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  if([...x,...y].some(n=>!Number.isSafeInteger(n)))throw new Error('版本号超出范围');
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;
}
function verifyEnvelope(envelope,keys) {
  if(!envelope||envelope.algorithm!=='ES256'||!keys[envelope.keyId]||typeof envelope.signature!=='string')throw new Error('签名密钥或算法不受信任');
  const signature=Buffer.from(envelope.signature,'base64');
  if(signature.length!==64||!crypto.verify('sha256',Buffer.from(canonical(envelope.payload)),{key:keys[envelope.keyId],dsaEncoding:'ieee-p1363'},signature))throw new Error('服务响应签名校验失败');
  return envelope.payload;
}
function deviceId(spki) {return 'win-'+crypto.createHash('sha256').update(Buffer.from(spki,'base64')).digest('hex').slice(0,24);}
function checkLease(envelope,keys,{appId,device,version}) {
  const p=verifyEnvelope(envelope,keys),now=Date.parse(p.serverTimeUtc),expiry=Date.parse(p.expiresAtUtc);
  if(p.appId!==appId||p.deviceId!==device||p.buildId!==version||!Array.isArray(p.features)||!p.leaseId||!Number.isFinite(now)||!Number.isFinite(expiry)||expiry<=now||expiry-now>900000)throw new Error('授权租约内容无效');
  return {payload:p,duration:expiry-now};
}
function validateManifest(envelope,config,currentVersion) {
  const p=verifyEnvelope(envelope,config.updateKeys);
  if(p.appId!==config.appId)throw new Error('更新清单属于其他产品');
  
  if(p.runtimeMajor!==35||p.updaterProtocol!==1)throw new Error('此更新需要新版运行引擎，请安装完整便携包');
  if(typeof p.isMandatory!=='boolean'||typeof p.isMajorUpdate!=='boolean'||typeof p.notes!=='string'||p.notes.length>10000||!Number.isFinite(Date.parse(p.publishedAtUtc)))throw new Error('更新清单字段无效');
  compareVersion(p.minimumSupportedVersion,p.version);
  if(compareVersion(p.minimumSupportedVersion,p.version)>0)throw new Error('最低版本高于更新版本');
  if(!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.length)||p.length<1||p.length>250*1024*1024||!/^v?\d+\.\d+\.\d+$/.test(p.releaseTag))throw new Error('更新资产字段无效');
  if(p.releaseTag.replace(/^v/,'')!==p.version)throw new Error('发布标签与版本不一致');
  const base='https://github.com/'+config.githubRepository+'/releases/';
  const u=new URL(p.downloadUrl),page=new URL(p.pageUrl);
  if(u.username||u.password||u.search||u.hash||page.username||page.password||page.search||page.hash||!p.downloadUrl.startsWith(base+'download/'+p.releaseTag+'/')||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[^/]+\/[^/]+\.zip$/.test(p.downloadUrl)||p.pageUrl!==base+'tag/'+p.releaseTag)throw new Error('更新 URL 不在产品发布仓库白名单');
  if(p.policyRevision!==undefined&&(!Number.isSafeInteger(p.policyRevision)||p.policyRevision<1))throw new Error('更新策略序号无效');
  return compareVersion(p.version,currentVersion)>0?p:null;
}
module.exports={canonical,compareVersion,verifyEnvelope,deviceId,checkLease,validateManifest};
