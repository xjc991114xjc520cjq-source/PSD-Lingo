const {test}=require('node:test'),assert=require('node:assert/strict');
const {writeVerifiedFile}=require('../services/durable-file.cjs');
test('update staging flushes then closes before readback and rejects zeroed payload',async()=>{
 for(const corrupt of [false,true]){const events=[],expected=Buffer.from('complete application payload');let data;
 const io={open:async()=>({writeFile:async b=>{events.push('write');data=corrupt?Buffer.alloc(b.length):b;},sync:async()=>events.push('sync'),close:async()=>events.push('close')}),readFile:async()=>{events.push('read');return data;}};
 if(corrupt)await assert.rejects(writeVerifiedFile('payload',expected,io),/写入后校验失败/);else await writeVerifiedFile('payload',expected,io);
 assert.deepEqual(events,['write','sync','close','read']);}
});
test('failed durable flush closes handle and prevents readback acceptance',async()=>{
 let closed=false;await assert.rejects(writeVerifiedFile('payload','bytes',{open:async()=>({writeFile:async()=>{},sync:async()=>{throw Error('disk failed')},close:async()=>{closed=true;}}),readFile:async()=>assert.fail('must not accept failed flush')}),/disk failed/);assert.equal(closed,true);
});
