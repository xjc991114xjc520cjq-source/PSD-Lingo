// A detached desktop app can inherit a terminal pipe which closes later.
// Only broken logging pipes are tolerated; application exceptions remain visible.
const fs=require('node:fs'),path=require('node:path'),{format}=require('node:util');
function installProcessLogging({streams=[process.stdout,process.stderr],consoleObject=console,directory}={}){
 const broken=new Set(),listeners=[],originals=new Map();
 const record=text=>{if(!directory)return;try{fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'main-errors.log');if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,new Date().toISOString()+' '+text.slice(0,16000)+'\n');}catch{/* Logging must not cause another exception. */}};
 const isBroken=error=>error?.code==='EPIPE'||error?.code==='ERR_STREAM_DESTROYED';
 for(const stream of streams.filter(Boolean)){const listener=error=>{if(!isBroken(error))throw error;broken.add(stream);record('Logging pipe closed: '+error.code);};stream.on('error',listener);listeners.push([stream,listener]);}
 for(const name of ['log','info','warn','error','debug']){const original=consoleObject[name];if(typeof original!=='function')continue;originals.set(name,original);consoleObject[name]=function(...args){if(name==='error'||name==='warn')record(format(...args));const stream=name==='error'||name==='warn'?streams[1]:streams[0];if(broken.has(stream))return;try{return original.apply(this,args)}catch(error){if(!isBroken(error))throw error;broken.add(stream);record('Logging pipe closed: '+error.code);}};}
 return ()=>{for(const [stream,listener] of listeners)stream.removeListener('error',listener);for(const [name,original] of originals)consoleObject[name]=original;};
}
module.exports={installProcessLogging};
