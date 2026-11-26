const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Updates}=require('../services/updates.cjs'),{canonical}=require('../services/protocol.cjs');
const {feedUrl,validateMacManifest,stagePackage}=require('../services/macos-updates.cjs');
function fixture(){
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),config={appId:'PSDLingo',githubRepository:'example/sparkit',updateKeys:{test:keys.publicKey}};
 config.macUpdateManifestUrl=feedUrl(config);
 const bytes=Buffer.from('isolated package fixture'),version='0.3.108',releaseTag=`mac-v${version}-arm64`,base='https://github.com/example/sparkit/releases/';
 const p={appId:config.appId,platform:'darwin',arch:'arm64',updaterProtocol:2,packageType:'pkg',version,releaseTag,downloadUrl:`${base}download/${releaseTag}/Sparkit-${version}-Mac-arm64-Setup.pkg`,pageUrl:base+'tag/'+releaseTag,length:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),minimumSupportedVersion:'0.3.107',publishedAtUtc:new Date().toISOString(),policyRevision:1,isMandatory:false,isMajorUpdate:false,notes:'Mac only'};
 const sign=p=>({algorithm:'ES256',keyId:'test',payload:p,signature:crypto.sign('sha256',Buffer.from(canonical(p)),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')});
 return {config,p,bytes,sign};
}
test('Mac signed channel rejects Windows, wrong architecture, URLs, protocol, tampering and invalid sizes',()=>{
 const f=fixture(),validate=p=>validateMacManifest(f.sign(p),f.config,'0.3.107','arm64');assert.equal(validate(f.p).version,'0.3.108');
 for(const patch of [{platform:'win32'},{arch:'x64'},{updaterProtocol:1},{packageType:'zip'},{downloadUrl:f.p.downloadUrl+'?x=1'},{releaseTag:'v0.3.108'},{length:2**31},{policyRevision:0}])assert.throws(()=>validate({...f.p,...patch}));
 const e=f.sign(f.p);e.payload.notes='tampered';assert.throws(()=>validateMacManifest(e,f.config,'0.3.107','arm64'),/签名/);
 assert.throws(()=>validateMacManifest(f.sign(f.p),f.config,'0.3.107','x64'));
});
test('Mac check, resumed download, verified full-package handoff, mandatory persistence and rollback defense',async()=>{
 const f=fixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-mac-update-'));let policy=f.sign(f.p),opened=0,verified=0,quit=0;const urls=[];
 const options={platform:'darwin',arch:'arm64',config:f.config,version:'0.3.107',dataDir:dir,macVerifyPackage:async file=>{assert.deepEqual(await fs.readFile(file),f.bytes);verified++;},macOpenInstaller:async file=>{assert.equal(path.extname(file),'.pkg');opened++;},fetch:async(url,options)=>{urls.push(url);if(url===feedUrl(f.config))return Response.json(policy);assert.equal(url,f.p.downloadUrl);const m=/bytes=(\d+)-(\d+)/.exec(options.headers.Range),a=+m[1],b=+m[2];return new Response(f.bytes.subarray(a,b+1),{status:206,headers:{'content-range':`bytes ${a}-${b}/${f.bytes.length}`}});}};
 const u=new Updates(options);let restart;
 try{await u.init();await u.check();await u.defer(true);assert.equal(u.available,null);
 policy=f.sign({...f.p,isMandatory:true,policyRevision:2});await u.check();assert(u.status().required);
 const downloads=path.join(dir,'updates');await fs.mkdir(downloads,{recursive:true});await fs.writeFile(path.join(downloads,f.p.sha256+'.zip.tmp'),f.bytes.subarray(0,5));
 assert.deepEqual(await u.install({quit:()=>quit++}),{installerOpened:true,restarting:false});assert.equal(verified,1);assert.equal(opened,1);assert.equal(quit,0);assert.equal(u.phase,'idle');assert.equal(u.busy,false);
 u.close();restart=new Updates({...options,fetch:async()=>{throw Error('offline');}});await restart.init();assert(restart.status().required);await assert.rejects(restart.check(),/offline/);assert(restart.status().required);
 policy=f.sign({...f.p,policyRevision:1});await assert.rejects(u.check(),/比已验证版本旧/);assert(u.status().required);assert(!urls.some(url=>url.includes('releases/latest')));
 }finally{u.close();restart?.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('Mac staging rejects corrupted or untrusted package and never opens Installer on failed validation',async()=>{
 const f=fixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-mac-reject-'));let opened=false;
 try{await assert.rejects(stagePackage(Buffer.from('bad'),f.p,dir),/SHA-256/);
 const u=new Updates({platform:'darwin',arch:'arm64',config:f.config,version:'0.3.107',dataDir:dir,macVerifyPackage:async()=>{throw Error('not notarized');},macOpenInstaller:async()=>{opened=true;}});u.available=f.p;u.download=async()=>f.bytes;
 await assert.rejects(u.install({}),/not notarized/);assert.equal(opened,false);assert.equal(u.busy,false);assert.equal(u.phase,'idle');assert.deepEqual((await fs.readdir(path.join(dir,'updates'))).filter(n=>n.endsWith('.pkg')),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Mac publisher prepares a separate signed feed, rejects wrong key and stale policy without publishing Windows latest',async()=>{
 const {prepareMacRelease}=require('../services/macos-release-publisher.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'mac-publisher-')),pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),f=fixture();
 const config={...f.config,updateKeys:{qa:pair.publicKey}},privateKeyPath=path.join(dir,'private.pem'),payloadPath=path.join(dir,'fixture.pkg'),outputDirectory=path.join(dir,'output');
 try{await fs.writeFile(privateKeyPath,pair.privateKey.export({type:'pkcs8',format:'pem'}));await fs.writeFile(payloadPath,f.bytes);
 const options={payloadPath,privateKeyPath,outputDirectory,version:'0.3.108',policyRevision:4,keyId:'qa'};
 const result=await prepareMacRelease(options,config,{verify:async()=>{}});assert.equal(result.makeLatest,false);assert.equal(result.published,false);assert.equal(result.feedTag,'mac-updates');assert.equal(validateMacManifest(JSON.parse(await fs.readFile(result.manifestPath)),config,'0.3.107','arm64').version,'0.3.108');
 assert.deepEqual((await fs.readdir(outputDirectory)).sort(),['Sparkit-0.3.108-Mac-arm64-Setup.pkg','update-macos-arm64.json']);
 await assert.rejects(prepareMacRelease(options,config,{verify:async()=>{}}),/策略序号/);
 await assert.rejects(prepareMacRelease({...options,policyRevision:5},{...config,updateKeys:{qa:f.config.updateKeys.test}},{verify:async()=>{}}),/签名/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
