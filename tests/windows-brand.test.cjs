const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
test('Windows logo migration waits for application exit and embeds every ICO size',async()=>{
 if(process.platform!=='win32')return;
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sparkit-brand-')),exe=path.join(dir,'PSD Lingo.exe'),ico=path.join(root,'renderer/assets/sparkit.ico'),marker=path.join(dir,'ok');
 try{
  const src=path.join(dir,'Wait.cs');fs.writeFileSync(src,'class Wait {static void Main(string[] a){for(int i=0;i<200&&!System.IO.File.Exists(a[0]);i++)System.Threading.Thread.Sleep(100);}}');
  cp.execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/out:'+exe,src],{windowsHide:true});
  const gate=path.join(dir,'exit');const app=cp.spawn(exe,[gate],{windowsHide:true});await new Promise((r,j)=>{app.once('spawn',r);app.once('error',j)});
  const helper=cp.spawn(path.join(root,'services/bin/sparkit-brand.exe'),['after-exit',exe,ico,String(app.pid),marker],{windowsHide:true});
  await new Promise(r=>setTimeout(r,100));assert.equal(fs.existsSync(marker),false);fs.writeFileSync(gate,'exit');
  const code=await new Promise((r,j)=>{helper.once('close',r);helper.once('error',j)});assert.equal(code,0);assert.equal(fs.readFileSync(marker,'utf8'),'ok');
  const icon=fs.readFileSync(ico),binary=fs.readFileSync(exe);for(let i=0;i<icon.readUInt16LE(4);i++){const n=6+16*i,len=icon.readUInt32LE(n+8),offset=icon.readUInt32LE(n+12);assert.ok(binary.includes(icon.subarray(offset,offset+len)),'embedded icon size '+i);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Windows branding does not patch executable while update restart owns it',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.resolve(__dirname,'../services/windows-brand.cjs'),'utf8');
 for(const updating of [false,true]){let beforeQuit;const calls=[],mod={exports:{}};const fakeFs={existsSync:()=>false,readFileSync:()=>Buffer.from('icon'),mkdirSync(){},copyFileSync(){}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,Buffer,process:{platform:'win32',execPath:'C:/runtime/PSD Lingo.exe',pid:12},require:n=>n==='node:fs'?fakeFs:n==='node:child_process'?{spawn:(_exe,args)=>{calls.push(args);return {on(){},unref(){}}}}:require(n)});
 mod.exports.install({app:{isPackaged:true,getAppPath:()=> 'C:/runtime/resources/app',getPath:()=> 'C:/profile',getVersion:()=> 'test',once:(_event,fn)=>{beforeQuit=fn;}},icon:'C:/icon.ico',isUpdating:()=>updating});beforeQuit();assert.equal(calls.filter(a=>a[0]==='after-exit').length,updating?0:1);
 }
});
