const {test}=require('node:test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
test('native save watcher whitelist excludes destructive and unrecognized notices',{skip:process.platform!=='win32'},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'notice-policy-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const harness=path.join(dir,'policy.cs'),exe=path.join(dir,'policy.exe');
 await fs.writeFile(harness,'class PolicyCheck {static void Main(){string ok="This document contains nested layer groups that may change in appearance if opened in applications older than Photoshop CS6.";if(!AdobeSaveNotice.Known(ok)||AdobeSaveNotice.Known(ok+" Overwrite existing file?")||AdobeSaveNotice.Known("Save changes before closing?")||AdobeSaveNotice.Known("Could not complete the command because of a program error.")||AdobeSaveNotice.Known(""))throw new System.Exception("Unsafe notice policy");}}');
 await exec(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/out:'+exe,path.resolve(__dirname,'../services/windows-adobe-notices.cs'),harness],{windowsHide:true});await exec(exe,[],{windowsHide:true});
});
