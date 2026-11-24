const path=require('node:path');
const {spawn}=require('node:child_process');
const macOperations=new Set(['identity','sign','protect','unprotect']);
function deviceHelperPath(file,{platform=process.platform,root=__dirname}={}){
 if(platform==='win32')return file;
 if(platform==='darwin')return path.join(root,'bin','sparkit-device');
 throw Error('此操作系统尚未支持设备服务');
}
// Credentials travel over stdin, never argv, environment variables or a shell.
function invokeDeviceService(file,request,{timeoutMs=15000,platform=process.platform,spawnFn=spawn,root=__dirname}={}){
 if(platform==='darwin'&&!macOperations.has(request?.op))return Promise.reject(Error('Mac 设备服务尚未支持此操作：'+String(request?.op)));
 let executable;try{executable=deviceHelperPath(file,{platform,root});}catch(error){return Promise.reject(error);}
 const input=JSON.stringify(request)+'\n';if(Buffer.byteLength(input)>1024*1024)return Promise.reject(Error('设备请求超出限制'));
 return new Promise((resolve,reject)=>{
  let settled=false,timer,child,out=[],size=0,errors=[],errorSize=0;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  try{
   child=spawnFn(executable,[],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
   if(timeoutMs>0)timer=setTimeout(()=>{finish(Error('设备服务超时'));child.kill();},timeoutMs);
   child.on('error',error=>finish(error));
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){finish(Error('设备响应超出限制'));child.kill();}else out.push(Buffer.from(chunk));});
   // Preserve Windows Adobe failure classification; Mac helper errors are generic.
   child.stderr.on('data',chunk=>{errorSize+=chunk.length;if(errorSize<=65536)errors.push(Buffer.from(chunk));});
   child.on('close',code=>{if(settled)return;if(code!==0)return finish(Error(platform==='win32'&&errors.length?Buffer.concat(errors).toString('utf8'):'设备服务失败，请检查本机密钥访问权限'));try{const value=JSON.parse(Buffer.concat(out).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();finish(null,value);}catch{finish(Error('设备服务响应无效'));}});
   child.stdin.on('error',error=>finish(error));child.stdin.end(input,'utf8');
  }catch(error){finish(error);child?.kill();}
 });
}
module.exports={deviceHelperPath,invokeDeviceService};
