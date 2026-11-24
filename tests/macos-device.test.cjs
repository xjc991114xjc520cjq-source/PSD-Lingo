const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {invokeDeviceService,deviceHelperPath}=require('../services/device-service.cjs');
const {deviceId}=require('../services/protocol.cjs');
function processFixture(action){const calls=[];return {calls,spawn(file,args,options){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>{child.killed=true;};child.stdin.end=input=>{calls.push({file,args,options,input,child});setImmediate(()=>action(child));};return child;}};}
test('Mac transport resolves native helper and keeps all secrets on stdin',async()=>{
 const f=processFixture(c=>{c.stdout.emit('data',Buffer.from('{"value":"cipher"}'));c.emit('close',0);});
 const reply=await invokeDeviceService('windows.exe',{op:'protect',value:'secret'},{platform:'darwin',root:'/app/services',spawnFn:f.spawn});
 assert.equal(reply.value,'cipher');assert.equal(f.calls[0].file,path.join('/app/services','bin','sparkit-device'));
 assert.deepEqual(f.calls[0].args,[]);assert.equal(f.calls[0].options.shell,false);assert.match(f.calls[0].input,/secret/);
 assert.equal(deviceHelperPath('windows.exe',{platform:'win32'}),'windows.exe');
});
test('unsupported Mac operations fail before dispatch; no EXE fallback',async()=>{
 let calls=0;await assert.rejects(invokeDeviceService('windows.exe',{op:'install-font'},{platform:'darwin',spawnFn:()=>calls++}),/尚未支持/);assert.equal(calls,0);
 await assert.rejects(invokeDeviceService('x',{op:'identity'},{platform:'linux'}),/尚未支持/);
});
test('malformed/oversized native responses and timeouts fail closed',async()=>{
 for(const value of ['invalid','[]','x'.repeat(1024*1024+1)]){
  const f=processFixture(c=>{c.stdout.emit('data',Buffer.from(value));c.emit('close',0);});
  await assert.rejects(invokeDeviceService('x',{op:'identity'},{platform:'darwin',spawnFn:f.spawn}),/响应/);
 }
 const f=processFixture(()=>{});await assert.rejects(invokeDeviceService('x',{op:'identity'},{platform:'darwin',timeoutMs:5,spawnFn:f.spawn}),/超时/);assert.equal(f.calls[0].child.killed,true);
});
test('Windows Adobe errors retain classification; Mac stderr cannot echo credentials',async()=>{
 const f=processFixture(c=>{c.stderr.emit('data',Buffer.from('Photoshop script failed: fixture'));c.emit('close',1);});
 await assert.rejects(invokeDeviceService('x',{op:'photoshop-script'},{platform:'win32',spawnFn:f.spawn}),/Photoshop script failed:/);
 const m=processFixture(c=>{c.stderr.emit('data',Buffer.from('sensitive-request'));c.emit('close',1);});
 await assert.rejects(invokeDeviceService('x',{op:'sign'},{platform:'darwin',spawnFn:m.spawn}),e=>!e.message.includes('sensitive-request'));
});

// Simulated native service: tests real Worker SQL/proof/leases, not Apple Keychain.
function simulatedDevice(){
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=keys.publicKey.export({format:'der',type:'spki'}).toString('base64'),key=crypto.randomBytes(32);
 const helper=async(_file,r)=>{
  if(r.op==='identity')return {spki};
  if(r.op==='sign')return {signature:crypto.sign('sha256',Buffer.from(r.value,'base64'),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};
  if(r.op==='protect'){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.concat([cipher.update(Buffer.from(r.value,'base64')),cipher.final()]);return {value:'mac-keychain-v1:'+Buffer.concat([iv,bytes,cipher.getAuthTag()]).toString('base64')};}
  if(r.op==='unprotect'){assert.ok(r.value.startsWith('mac-keychain-v1:'));const bytes=Buffer.from(r.value.slice(16),'base64'),cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return {value:Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('base64')};}
  throw Error('unsupported');
 };return {helper,spki};
}
test('Mac identity preserves legacy Windows hash and agrees with Worker',async()=>{
 const {identity}=await import('../server/src/worker.mjs'),{spki}=simulatedDevice();
 assert.equal(await identity(spki),deviceId(spki));assert.equal(await identity(spki,'darwin'),deviceId(spki,'darwin'));
 assert.match(deviceId(spki),/^win-/);assert.match(deviceId(spki,'darwin'),/^mac-/);assert.throws(()=>deviceId(spki,'linux'));
});
test('Mac client activates, persists, restarts, renews and obeys revocation via actual Worker SQL',async()=>{
 const {fixture}=require('./support/worker-fixture.cjs'),{Authorization}=require('../services/authorization.cjs');
 const f=await fixture(),created=await f.create(),device=simulatedDevice(),dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mac-auth-'));
 const options={platform:'darwin',helperFn:device.helper,dataDir,version:'0.2.0',fetch:f.fetch,config:{authorizationEnabled:true,appId:'PSDLingo',serverUrl:'https://fixture.invalid',leaseKeys:{'lease-1':f.key.publicKey}}};
 const first=new Authorization(options),second=new Authorization(options);
 try{
  await first.init();await first.activate(created.data.license);first.assert('psd-export');assert.match(first.device,/^mac-/);
  const saved=await fs.readFile(path.join(dataDir,'license.keychain'),'utf8');assert.ok(!saved.includes(created.data.license));
  await second.init();second.assert('psd-export');assert.equal(first.device,second.device);await second.renew();second.assert('psd-export');
  const other=simulatedDevice();const limited=await f.post('/v1/challenge',{appId:'PSDLingo',buildId:'0.2.0',spki:other.spki,deviceId:deviceId(other.spki,'darwin'),license:created.data.license});assert.equal(limited.data.code,'device_limit');
  await f.post('/admin/devices/'+second.device+'/revoke',{},f.token);await second.renew();assert.equal(second.status().code,'device_revoked');assert.throws(()=>second.assert('psd-export'));
  const invalid=await f.post('/v1/challenge',{appId:'PSDLingo',buildId:'0.2.0',spki:device.spki,deviceId:'mac-'+'0'.repeat(24),license:created.data.license});assert.equal(invalid.data.code,'invalid_device');
 }finally{first.close();second.close();f.db.close();await fs.rm(dataDir,{recursive:true,force:true});}
});
test('Mac Codex settings use separate encrypted file, restore credentials and reject corrupt ciphertext',async()=>{
 const {CodexSettings}=require('../services/codex-settings.cjs'),device=simulatedDevice(),dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mac-settings-'));
 const options={dataDir,platform:'darwin',helperFn:device.helper};
 try{
  const settings=new CodexSettings(options);await settings.save({apiKey:'fixture-key',apiModel:'fixture-model'});
  assert.match(settings.file,/codex-settings\.keychain$/);assert.ok(!(await fs.readFile(settings.file,'utf8')).includes('fixture-key'));
  assert.equal((await new CodexSettings(options).credentials()).apiKey,'fixture-key');
  await fs.writeFile(settings.file,'invalid');await assert.rejects(settings.get(),/无法读取/);await assert.rejects(settings.save({apiKey:'other'}),/无法读取/);
 }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
