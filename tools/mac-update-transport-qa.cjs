// Real loopback HTTP/Range transport, isolated signing key, real PKG rejection.
// No publishing, production key, system installation or trust-setting changes.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Updates}=require('../services/updates.cjs'),{canonical}=require('../services/protocol.cjs'),{feedUrl}=require('../services/macos-updates.cjs');
async function main(){
 if(process.platform!=='darwin')throw Error('Mac required');
 const session=path.resolve(__dirname,'../..'),pkg=process.argv[2]||path.join(session,'packages/candidate4.pkg'),bytes=await fs.readFile(pkg),directory=await fs.mkdtemp(path.join(session,'data/update-transport-'));
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),config={appId:'PSDLingo',githubRepository:'example/sparkit',updateKeys:{qa:pair.publicKey}};config.macUpdateManifestUrl=feedUrl(config);
 const version='0.3.108',releaseTag='mac-v'+version+'-arm64',base='https://github.com/example/sparkit/releases/';
 const payload={appId:config.appId,platform:'darwin',arch:'arm64',updaterProtocol:2,packageType:'pkg',version,releaseTag,downloadUrl:base+'download/'+releaseTag+'/Sparkit-'+version+'-Mac-arm64-Setup.pkg',pageUrl:base+'tag/'+releaseTag,length:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),minimumSupportedVersion:'0.3.107',publishedAtUtc:new Date().toISOString(),policyRevision:1,isMandatory:true,isMajorUpdate:false,notes:'Isolated Mac transport QA'};
 const envelope={algorithm:'ES256',keyId:'qa',payload,signature:crypto.sign('sha256',Buffer.from(canonical(payload)),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};
 let requests=0,interrupted=false,opened=false;
 const server=http.createServer((req,res)=>{requests++;if(req.url==='/manifest'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(envelope));}
 const match=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');if(!match){res.writeHead(416);return res.end();}const start=+match[1],end=+match[2],block=bytes.subarray(start,end+1);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':block.length});
 if(!interrupted){interrupted=true;res.write(block.subarray(0,100));return setTimeout(()=>res.destroy(),5);}res.end(block);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='http://127.0.0.1:'+server.address().port;
 const updates=new Updates({platform:'darwin',arch:'arm64',config,version:'0.3.107',dataDir:directory,macOpenInstaller:async()=>{opened=true;},fetch:(url,options)=>{assert([config.macUpdateManifestUrl,payload.downloadUrl].includes(url));return fetch(address+(url===config.macUpdateManifestUrl?'/manifest':'/package'),options);}});
 try{await updates.check();assert(updates.status().required);let rejected='';try{await updates.install({});throw Error('Unsigned PKG was accepted');}catch(e){rejected=e.message;assert.match(rejected,/pkgutil|Developer ID|signature|签名/i);}
 assert.equal(opened,false);assert.equal(interrupted,true);assert.equal(updates.busy,false);assert.equal(updates.phase,'idle');assert(updates.status().required);
 const report={passed:true,realHttp:true,fullPackageBytes:bytes.length,sha256:payload.sha256,requests,interruptedAndRetried:true,signedManifestVerified:true,unsignedPackageRejected:true,installerOpened:false,productionPublished:false,reportScope:'Isolated transport and rejection test; trusted installer success requires signed notarized PKG',rejected};
 await fs.writeFile(path.join(session,'logs/update-transport-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{updates.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
