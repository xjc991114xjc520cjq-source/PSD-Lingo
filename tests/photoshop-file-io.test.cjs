const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {inspectFile,hashFile}=require('../photoshop-file-io.cjs');
const PSB_MAX_BYTES=6*1024**3;
const snapshot=size=>({size,mtimeMs:123,ctimeMs:456,ino:789,dev:10,isFile:()=>true});
function header(){const b=Buffer.alloc(26);b.write('8BPS');b.writeUInt16BE(2,4);b.writeUInt32BE(36000,14);b.writeUInt32BE(800,18);b.writeUInt16BE(8,22);b.writeUInt16BE(3,24);return b;}
test('6 GiB PSB inspection reads only its 26-byte header with 64-bit-safe size',async()=>{
 let closed=false,readBytes=0;const io={open:async()=>({stat:async()=>snapshot(PSB_MAX_BYTES),read:async(buffer,offset,length,position)=>{assert.equal(position,0);header().copy(buffer);readBytes+=length;return {bytesRead:26};},close:async()=>{closed=true;}})};
 const info=await inspectFile('six-gib.psb',io);assert.equal(info.format,'PSB');assert.equal(info.stat.size,6442450944);assert.equal(readBytes,26);assert.ok(closed);
});
test('PSB above 6 GiB is accepted with a header-only read and closes its handle',async()=>{
 let closed=false;const io={open:async()=>({stat:async()=>snapshot(PSB_MAX_BYTES+1),read:async b=>{header().copy(b);return {bytesRead:26};},close:async()=>{closed=true;}})};
 assert.equal((await inspectFile('large.psb',io)).stat.size,PSB_MAX_BYTES+1);assert.ok(closed);
});
test('streaming checksum crosses 4 GiB and reaches 6 GiB without file Buffer allocation',async()=>{
 // Simulate lengths only: this code-level test does not create/read a real giant file.
 const stat=snapshot(PSB_MAX_BYTES);let processed=0,updates=0;
 const stream=async function*(file,options){assert.equal(options.highWaterMark,1024*1024);for(let i=0;i<6144;i++)yield {length:1024*1024};};
 const createDigest=()=>({update(chunk){processed+=chunk.length;updates++;},digest(encoding){assert.equal(encoding,'hex');return 'mock-streamed-digest';}});
 assert.equal(await hashFile('six-gib.psb',{expectedStat:stat,io:{stat:async()=>stat},stream,createDigest}),'mock-streamed-digest');
 assert.equal(processed,6442450944);assert.equal(updates,6144);
});
test('streamed SHA256 equals actual bytes and rejects truncation/growth/source replacement',async()=>{
 const bytes=Buffer.from('editable PSB metadata'),stat=snapshot(bytes.length),stream=async function*(){yield bytes.subarray(0,5);yield bytes.subarray(5);};
 assert.equal(await hashFile('file',{expectedStat:stat,io:{stat:async()=>stat},stream}),crypto.createHash('sha256').update(bytes).digest('hex'));
 await assert.rejects(hashFile('file',{expectedStat:{...stat,size:bytes.length+1},io:{stat:async()=>stat},stream}),/发生变化/);
 await assert.rejects(hashFile('file',{expectedStat:{...stat,size:bytes.length-1},io:{stat:async()=>stat},stream}),/发生变化/);
 await assert.rejects(hashFile('file',{expectedStat:stat,io:{stat:async()=>({...stat,ino:999})},stream}),/发生变化/);
});
test('Windows Electron checks compare handle snapshots even when path stat reports another device',async()=>{
 const bytes=Buffer.from('stable source'),stat=snapshot(bytes.length);let closed=0,pathStats=0;
 const io={open:async()=>({stat:async()=>stat,close:async()=>closed++}),stat:async()=>{pathStats++;return {...stat,dev:0};}};
 const stream=async function*(){yield bytes;};
 assert.equal(await hashFile('source',{expectedStat:stat,io,stream}),crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(pathStats,0);assert.equal(closed,1);
 for(const field of ['dev','ino','mtimeMs','ctimeMs']){const changed={...stat,[field]:stat[field]+1};await assert.rejects(hashFile('source',{expectedStat:stat,io:{open:async()=>({stat:async()=>changed,close:async()=>closed++})},stream}),/发生变化/);}
});
test('real filesystem inspection fingerprint stays stable and catches same-size replacement',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-hash-'));
 try{const p=path.join(dir,'source.psb'),bytes=Buffer.concat([header(),Buffer.from('source')]);await fs.writeFile(p,bytes);const info=await inspectFile(p);assert.equal(await hashFile(p,{expectedStat:info.stat}),crypto.createHash('sha256').update(bytes).digest('hex'));await fs.rename(p,p+'.old');await fs.writeFile(p,bytes);await assert.rejects(hashFile(p,{expectedStat:info.stat}),/发生变化/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
