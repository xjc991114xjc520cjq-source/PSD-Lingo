const test=require('node:test'),assert=require('node:assert/strict');
const {appleScript,runMacAdobeScript}=require('../services/macos-adobe.cjs');
const io={stat:async()=>({isFile:()=>true})};
const {prepareMacAdobe}=require('../services/macos-adobe.cjs');
test('Mac application discovery spends only its remaining deadline on LaunchServices',async()=>{
 let time=0;const budgets=[];
 const exec=(file,args,options,cb)=>{budgets.push(options.timeout);if(file.endsWith('osascript')){time+=1200;cb(null,'{"running":false}','');}else cb(null,'','');};
 assert.equal((await require('../services/macos-adobe.cjs').findMacAdobe('photoshop',{exec,timeoutMs:2000,now:()=>time})).running,false);
 assert.deepEqual(budgets,[2000,800]);
 let dispatched=0;await assert.rejects(require('../services/macos-adobe.cjs').findMacAdobe('photoshop',{timeoutMs:100,now:()=>time,exec:(file,args,o,cb)=>{dispatched++;time+=100;cb(Object.assign(Error('timeout'),{killed:true}));}}),e=>e.code==='adobe_preflight_timeout');assert.equal(dispatched,1);
});
function executor(reply){const calls=[];return {calls,exec(file,args,options,callback){const call={file,args,options};calls.push(call);return {stdin:{on(){},end(source){call.source=source;setImmediate(()=>reply(callback));}}};}};}
test('macOS dispatch keeps Chinese paths and shell metacharacters in argv',async()=>{
 const fake=executor(cb=>cb(null,'','')),jsx='/Users/test/中文 "$(touch nope)".jsx';
 assert.equal((await runMacAdobeScript('photoshop',jsx,{platform:'darwin',io,discover:async()=>{},ready:async()=>{},exec:fake.exec})).completed,true);
 assert.deepEqual(fake.calls[0].args,['-',jsx]);assert.equal(fake.calls[0].file,'/usr/bin/osascript');
 assert.ok(!fake.calls[0].source.includes(jsx));assert.ok(!fake.calls[0].options.shell);
});
test('host-specific AppleScript uses the appropriate file command',()=>{
 assert.match(appleScript('photoshop'),/do javascript file jsxFile/);
 assert.match(appleScript('illustrator'),/do javascript jsxFile/);
 assert.throws(()=>appleScript('finder'),/不支持/);
});

test('Mac readiness retries only harmless probes and launches a stopped application once',async()=>{
 let probes=0,launches=0,time=0;
 const exec=(file,args,options,callback)=>{if(file==='/usr/bin/open'){launches++;callback(null,'','');}else if(++probes<3)callback(Error('busy'),'','event timed out (-1712)');else callback(null,'sparkit-native-ready\n','');};
 const result=await prepareMacAdobe('photoshop',{exec,discover:async()=>({running:false}),now:()=>time,wait:async ms=>{time+=ms;}});
 assert.equal(probes,3);assert.equal(launches,1);assert.equal(result.ready,true);assert.equal(time,1500);
});

test('Mac preflight is bounded and Automation denial never triggers retries or file dispatch',async()=>{
 let time=0,probes=0,files=0;
 const timeout=(file,args,options,callback)=>{probes++;time+=Math.min(options.timeout,100);callback(Object.assign(Error('timeout'),{killed:true}));};
 await assert.rejects(prepareMacAdobe('illustrator',{exec:timeout,discover:async()=>({running:true}),timeoutMs:150,now:()=>time,wait:async ms=>{time+=ms;}}),e=>e.code==='adobe_preflight_timeout'&&e.uncertain===false);
 assert.equal(time,150);assert.equal(probes,1);
 const denied=(file,args,options,callback)=>{probes++;callback(Error('denied'),'','not authorized (-1743)');};
 await assert.rejects(prepareMacAdobe('illustrator',{exec:denied,discover:async()=>({running:true})}),e=>e.code==='adobe_preflight_failed'&&/自动化/.test(e.message));
 await assert.rejects(runMacAdobeScript('photoshop','/tmp/a.jsx',{platform:'darwin',io,exec:()=>{files++;},ready:async()=>{throw Object.assign(Error('not ready'),{nativePhase:'preflight',uncertain:false});}}),/not ready/);assert.equal(files,0);
});
test('invalid platform or script path never dispatches',async()=>{
 const fake=executor(()=>{});
 await assert.rejects(runMacAdobeScript('photoshop','/tmp/a.jsx',{platform:'win32',io,discover:async()=>{},ready:async()=>{},exec:fake.exec}),/只能在 Mac/);
 for(const jsx of ['relative.jsx','/tmp/a\n.jsx','/tmp/a\0.jsx'])await assert.rejects(runMacAdobeScript('photoshop',jsx,{platform:'darwin',io,discover:async()=>{},ready:async()=>{},exec:fake.exec}),/路径无效/);
 await assert.rejects(runMacAdobeScript('photoshop','/tmp/a.jsx',{platform:'darwin',io:{stat:async()=>({isFile:()=>false})},exec:fake.exec}),/不存在/);
 assert.equal(fake.calls.length,0);
});
test('timeout after dispatch is uncertain and never retried',async()=>{
 const fake=executor(cb=>cb(Object.assign(Error('timed out'),{killed:true}),'' ,''));
 await assert.rejects(runMacAdobeScript('illustrator','/tmp/a.jsx',{platform:'darwin',io,discover:async()=>{},ready:async()=>{},exec:fake.exec}),e=>e.uncertain===true);
 assert.equal(fake.calls.length,1);
});
test('denied Apple Events explains Automation settings',async()=>{
 const fake=executor(cb=>cb(Error('failed'),'','Not authorized (-1743)'));
 await assert.rejects(runMacAdobeScript('photoshop','/tmp/a.jsx',{platform:'darwin',io,discover:async()=>{},ready:async()=>{},exec:fake.exec}),/隐私与安全性/);
});
test('missing osascript is a preflight error',async()=>{
 const fake=executor(cb=>cb(Object.assign(Error('missing'),{code:'ENOENT'})));
 await assert.rejects(runMacAdobeScript('photoshop','/tmp/a.jsx',{platform:'darwin',io,discover:async()=>{},ready:async()=>{},exec:fake.exec}),e=>!e.uncertain&&e.nativePhase==='preflight');
});
test('Mac update lifecycle cannot fetch or install a Windows package',async()=>{
 const {Updates}=require('../services/updates.cjs');let fetched=0;
 const updates=new Updates({platform:'darwin',config:{updateManifestUrl:'https://example.com'},arch:'arm64',dataDir:'unused',version:'0.3.107',fetch:()=>{fetched++;throw Error('must not fetch');}});
 await updates.init();await updates.check();assert.equal(fetched,0);assert.equal(updates.status().configured,false);
 await assert.rejects(updates.install({}),/更新通道尚未配置/);assert.equal(updates.phase,'idle');updates.close();
});

test('Photoshop waiting for Illustrator does not deadlock; same host remains serialized',async()=>{
 const pending=[],started=[];
 const exec=(file,args,options,cb)=>({stdin:{on(){},end(){started.push(args[1]);pending.push(cb);}}});
 const opts={platform:'darwin',io,exec,discover:async()=>{},ready:async()=>{}};
 const ps=runMacAdobeScript('photoshop','/tmp/ps.jsx',opts);await new Promise(r=>setImmediate(r));
 const ps2=runMacAdobeScript('photoshop','/tmp/ps2.jsx',opts),ai=runMacAdobeScript('illustrator','/tmp/ai.jsx',opts);
 await new Promise(r=>setImmediate(r));assert.deepEqual(started,['/tmp/ps.jsx','/tmp/ai.jsx']);
 pending[1](null,'','');await ai;pending[0](null,'','');await ps;
 await new Promise(r=>setImmediate(r));assert.equal(started[2],'/tmp/ps2.jsx');pending[2](null,'','');await ps2;
});
