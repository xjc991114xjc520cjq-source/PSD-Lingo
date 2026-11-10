const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
function install({app,icon,isUpdating=()=>false}){
 if(process.platform!=='win32'||!app.isPackaged)return;
 const exe=process.execPath;if(path.basename(exe).toLowerCase()!=='psd lingo.exe')return;
 const helper=path.join(app.getAppPath(),'sparkit-brand.exe');
 const launch=args=>{const child=spawn(helper,args,{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();};
 launch(['shortcuts',exe,icon]);
 const marker=path.join(app.getPath('userData'),'windows-brand-'+crypto.createHash('sha256').update(exe+app.getVersion()).update(fs.readFileSync(icon)).digest('hex').slice(0,16)+'.ok');
 if(fs.existsSync(marker))return;
 app.once('before-quit',()=>{
  if(isUpdating())return;
  try{const dir=path.join(app.getPath('userData'),'branding');fs.mkdirSync(dir,{recursive:true});const copied=path.join(dir,'sparkit-brand-'+app.getVersion()+'.exe');fs.copyFileSync(helper,copied);const child=spawn(copied,['after-exit',exe,icon,String(process.pid),marker],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}catch{}
 });
}
module.exports={install};
