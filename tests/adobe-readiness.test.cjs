const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('Adobe readiness reconnects transient stale/busy COM objects without replaying file scripts',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adobe-ready-'));
 try{
 const source=path.join(dir,'Test.cs'),exe=path.join(dir,'Test.exe');
 fs.writeFileSync(source,`using System;using System.Runtime.InteropServices;class Test{
 static void Check(bool value){if(!value)throw new Exception("assertion failed");}
 static void Main(string[] args){if(args.Length>0){if(args[0]=="hang"){AdobeConnection.BoundedPreflight(delegate{System.Threading.Thread.Sleep(10000);},100,"Photoshop");throw new Exception("timeout did not stop helper");}AdobeConnection.BoundedPreflight(delegate{},100,"Photoshop");System.Threading.Thread.Sleep(300);Console.WriteLine("long-file-script-survived");return;}int acquired=0,probed=0,released=0,waited=0,scripts=0;
 object app=AdobeConnection.AwaitReady(delegate{acquired++;return new object();},delegate(object a){probed++;if(probed<3)throw new COMException("busy",unchecked((int)0x8001010A));},delegate(object a){released++;},delegate(int ms){waited+=ms;});scripts++;
 Check(AdobeConnection.LocalServerExecutable("\\\"D:\\\\Custom Apps\\\\Photoshop.exe\\\" /Automation")=="D:\\\\Custom Apps\\\\Photoshop.exe");
 Check(AdobeConnection.LocalServerExecutable("D:/PS2025/Adobe Photoshop 2025/Photoshop.exe /Automation")=="D:/PS2025/Adobe Photoshop 2025/Photoshop.exe");
 Check(app!=null&&acquired==3&&probed==3&&released==2&&waited==1500&&scripts==1);
 int attempts=0;try{AdobeConnection.AwaitReady(delegate{attempts++;throw new COMException("denied",unchecked((int)0x80070005));},delegate(object a){},delegate(object a){},delegate(int ms){});throw new Exception("expected denial");}catch(COMException){Check(attempts==1);}
 attempts=0;released=0;try{AdobeConnection.AwaitReady(delegate{attempts++;return new object();},delegate(object a){throw new System.Reflection.TargetInvocationException(new COMException("disconnected",unchecked((int)0x80010108)));},delegate(object a){released++;},delegate(int ms){});throw new Exception("expected exhaustion");}catch(System.Reflection.TargetInvocationException){Check(attempts==4&&released==4);}
 Console.WriteLine("ready-recovery-ok");}}`);
 execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+exe,source,path.resolve(__dirname,'../services/adobe-connection.cs')],{windowsHide:true});
 assert.match(execFileSync(exe,{encoding:'utf8',windowsHide:true}),/ready-recovery-ok/);
 const {spawnSync}=require('node:child_process'),hang=spawnSync(exe,['hang'],{encoding:'utf8',windowsHide:true,timeout:3000});assert.equal(hang.status,20);assert.match(hang.stderr,/preflight timed out; file script was not submitted/);
 assert.match(execFileSync(exe,['long'],{encoding:'utf8',windowsHide:true,timeout:3000}),/long-file-script-survived/);
 const ai=fs.readFileSync(path.resolve(__dirname,'../services/illustrator-bridge.cs'),'utf8'),ps=fs.readFileSync(path.resolve(__dirname,'../services/windows-device.cs'),'utf8');
 assert.match(ai,/ConnectReady\("Illustrator"/);assert.match(ps,/ConnectReady\("Photoshop"/);assert.match(ps,/connection preflight failed; file script was not submitted/);assert.ok(ai.indexOf('ConnectReady')<ai.indexOf('dispatched=true'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Photoshop readiness timeout remains recoverable and records that no file script was submitted',async()=>{
 const fsp=require('node:fs/promises'),vm=require('node:vm'),{createRequire}=require('node:module'),dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ps-preflight-')),local=createRequire(path.resolve(__dirname,'../photoshop-preview.cjs')),mod={exports:{}};
 const fakeFs=Object.create(fsp);fakeFs.access=async()=>{};
 vm.runInNewContext(await fsp.readFile(path.resolve(__dirname,'../photoshop-preview.cjs'),'utf8'),{module:mod,exports:mod.exports,process:{platform:'win32'},__dirname:path.resolve(__dirname,'..'),require:name=>name==='node:fs/promises'?fakeFs:name==='./services/authorization.cjs'?{helper:async()=>{throw Error('Photoshop connection preflight timed out; file script was not submitted.');}}:local(name)});
 try{await assert.rejects(mod.exports.executeScript(dir,'// never submitted'),e=>e.code==='adobe_preflight_timeout'&&e.nativePhase==='preflight'&&e.uncertain!==true);const receipt=JSON.parse(await fsp.readFile(path.join(dir,'bridge-status.json'),'utf8'));assert.equal(receipt.uncertain,false);assert.equal(receipt.state,'failed');}finally{await fsp.rm(dir,{recursive:true,force:true});}
});
test('Adobe connection phase and recoverable codes survive the IPC error contract',()=>{
 const {errorDetails,restoreError}=require('../services/operation-error.cjs'),{bridgeError}=require('../services/illustrator-connection.cjs');
 for(const code of ['adobe_preflight_timeout','adobe_preflight_failed']){const wire={error:'Adobe not ready',...errorDetails(Object.assign(Error('Adobe not ready'),{code,nativePhase:'preflight'}))},restored=restoreError(wire);assert.equal(restored.code,code);assert.equal(restored.nativePhase,'preflight');assert.notEqual(restored.uncertain,true);}
 assert.equal(bridgeError('Illustrator connection preflight timed out; file script was not submitted',20).code,'adobe_preflight_timeout');
 assert.equal(errorDetails({nativePhase:'untrusted free text'}).nativePhase,undefined);
});
