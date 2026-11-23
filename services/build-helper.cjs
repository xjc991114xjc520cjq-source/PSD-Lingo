const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
fs.mkdirSync(path.join(__dirname,'bin'),{recursive:true});
execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/reference:Microsoft.CSharp.dll','/out:'+path.join(__dirname,'bin/sparkit-brand.exe'),path.join(__dirname,'windows-brand.cs')],{stdio:'inherit',windowsHide:true});
execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/reference:System.Web.Extensions.dll','/reference:System.Security.dll','/out:'+path.join(__dirname,'bin/psd-lingo-service.exe'),path.join(__dirname,'windows-device.cs'),path.join(__dirname,'windows-adobe-notices.cs'),path.join(__dirname,'adobe-connection.cs')],{stdio:'inherit',windowsHide:true});
execFileSync(path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+path.join(__dirname,'bin/illustrator-bridge.exe'),path.join(__dirname,'illustrator-bridge.cs'),path.join(__dirname,'adobe-connection.cs')],{stdio:'inherit',windowsHide:true});
