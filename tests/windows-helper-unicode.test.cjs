const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {helper}=require('../services/authorization.cjs');

test('compiled Windows helper validates UTF8 Chinese and supplementary-character script paths without Adobe', {skip:process.platform!=='win32'}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sparkit-unicode-'));
 try {
  const exe=path.join(dir,'helper.exe');
  execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/reference:System.Web.Extensions.dll','/reference:System.Security.dll','/out:'+exe,path.join(__dirname,'../services/windows-device.cs'),path.join(__dirname,'../services/windows-adobe-notices.cs')],{windowsHide:true});
  const folder=path.join(dir,'代表验证 中文 空格 😀');fs.mkdirSync(folder);
  const file=path.join(folder,'预览.jsx');fs.writeFileSync(file,'// validation only; never execute');
  assert.deepEqual(await helper(exe,{op:'validate-photoshop-script',path:file}),{valid:true,path:file});
  await assert.rejects(helper(exe,{op:'validate-photoshop-script',path:path.join(folder,'不存在.jsx')}),/missing or invalid/);
  const wrong=path.join(folder,'非脚本.txt');fs.writeFileSync(wrong,'');
  await assert.rejects(helper(exe,{op:'validate-photoshop-script',path:wrong}),/missing or invalid/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
