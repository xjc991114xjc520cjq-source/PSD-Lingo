const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {invokeDeviceService}=require('../services/device-service.cjs');
// Explicit native gate. Windows skips this; simulation results must not count as Mac acceptance.
test('real Mac Secure Enclave identity, P1363 proof and Keychain ciphertext survive helper restarts',{skip:process.platform!=='darwin'},async()=>{
 const call=request=>invokeDeviceService(null,request);
 const a=await call({op:'identity'}),b=await call({op:'identity'});assert.equal(a.spki,b.spki);
 const bytes=Buffer.from('Sparkit Mac native self-test 中文\0fixture'),signed=await call({op:'sign',value:bytes.toString('base64')}),signature=Buffer.from(signed.signature,'base64');
 assert.equal(signature.length,64);assert.ok(crypto.verify('sha256',bytes,{key:crypto.createPublicKey({key:Buffer.from(a.spki,'base64'),format:'der',type:'spki'}),dsaEncoding:'ieee-p1363'},signature));
 const encrypted=await call({op:'protect',value:bytes.toString('base64')});assert.match(encrypted.value,/^mac-keychain-v1:/);
 const again=await call({op:'protect',value:bytes.toString('base64')});assert.notEqual(encrypted.value,again.value);
 assert.equal((await call({op:'unprotect',value:encrypted.value})).value,bytes.toString('base64'));
 const damaged=Buffer.from(encrypted.value.slice('mac-keychain-v1:'.length),'base64');damaged[damaged.length-1]^=1;
 await assert.rejects(call({op:'unprotect',value:'mac-keychain-v1:'+damaged.toString('base64')}));
 await assert.rejects(call({op:'unprotect',value:'windows-dpapi-ciphertext'}));
});
