const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {installerTheme,installerThemeSource}=require('../installer/theme.cjs');
const JSZip=require('jszip'),crypto=require('node:crypto');
function compileInstaller(compiler,args){try{cp.execFileSync(compiler,args,{stdio:'pipe',windowsHide:true});}catch(error){throw new Error(Buffer.from(error.stdout||'').toString('latin1')+'\n'+Buffer.from(error.stderr||'').toString('latin1'));}}
test('installer resolves shared theme overrides and aliases without modifying CSS',()=>{
 const css=':root{--ink:#253438;--green:#147d70;--dialog-muted:var(--ink);--dialog-surface:#fff}:root{--green:rgb(18, 90, 70)}';
 assert.deepEqual(installerTheme(css),{Surface:[255,255,255],Ink:[37,52,56],Muted:[37,52,56],Accent:[18,90,70]});
 assert.match(installerThemeSource(css),/Accent = Color.FromArgb\(18,90,70\)/);
 assert.throws(()=>installerTheme(':root{--ink:var(--ink)}'),/missing|cycle/);
});
test('native installer compiles using current application stylesheet rather than duplicated palette',()=>{
 const root=path.join(__dirname,'..'),css=fs.readFileSync(path.join(root,'renderer/style.css'),'utf8'),source=fs.readFileSync(path.join(root,'installer/setup.cs'),'utf8');
 assert.match(source,/BackColor=SetupTheme.Surface/);assert.match(source,/bar.ForeColor=SetupTheme.Accent/);assert.doesNotMatch(source,/Color.FromArgb\(/);
 assert.match(source,/if\(firstInstall&&!args.Contains\("--no-shortcut"\)&&!HasDesktopShortcut\(\)\)/);
 const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');if(!fs.existsSync(compiler))return;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'psd-lingo-theme-compile-'));try{const theme=path.join(temp,'SetupTheme.cs');fs.writeFileSync(theme,installerThemeSource(css));compileInstaller(compiler,['/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll','/out:'+path.join(temp,'compile-only.exe'),path.join(root,'installer/setup.cs'),theme]);assert(fs.statSync(path.join(temp,'compile-only.exe')).size>0);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('installer does not replace the current version or downgrade an isolated installation',async()=>{
 const root=path.join(__dirname,'..'),compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');if(!fs.existsSync(compiler))return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psd-lingo-version-gate-')),target=path.join(dir,'install'),runtime=path.join(target,'runtime'),app=path.join(runtime,'resources','app');
 try{
  fs.mkdirSync(app,{recursive:true});fs.writeFileSync(path.join(runtime,'PSD Lingo.exe'),'existing-exe');fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'psd-lingo',main:'main.cjs',version:'0.3.23'}));fs.writeFileSync(path.join(runtime,'marker'),'keep-existing');
  const theme=path.join(dir,'SetupTheme.cs'),stub=path.join(dir,'setup.exe');fs.writeFileSync(theme,installerThemeSource(fs.readFileSync(path.join(root,'renderer/style.css'),'utf8')));
  compileInstaller(compiler,['/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll','/out:'+stub,path.join(root,'installer/setup.cs'),theme]);
  for(const [version,status] of [['0.3.23','already-current'],['0.3.22','newer-installed']]){
   const zip=new JSZip();zip.file('PSD Lingo.exe','replacement-exe');zip.file('resources/app/package.json',JSON.stringify({name:'psd-lingo',main:'main.cjs',version}));
   const payload=await zip.generateAsync({type:'nodebuffer'}),trailer=Buffer.alloc(48),setup=path.join(dir,'installer-'+version+'.exe'),result=path.join(dir,'result-'+version+'.json');trailer.write('PLSETUP1');trailer.writeBigInt64LE(BigInt(payload.length),8);crypto.createHash('sha256').update(payload).digest().copy(trailer,16);fs.writeFileSync(setup,Buffer.concat([fs.readFileSync(stub),payload,trailer]));
   cp.execFileSync(setup,['--target',target,'--no-shortcut','--no-registration','--no-error-dialog'],{env:{...process.env,PSD_LINGO_SETUP_RESULT:result},windowsHide:true,timeout:20000});
   assert.equal(JSON.parse(fs.readFileSync(result,'utf8')).status,status);assert.equal(fs.readFileSync(path.join(runtime,'marker'),'utf8'),'keep-existing');assert.equal(fs.readFileSync(path.join(app,'package.json'),'utf8').includes('0.3.23'),true);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
