const fs=require('node:fs/promises'),path=require('node:path');
const pending=new Map();
async function acknowledgeStartup({argv,dataDir}){
 const ack=argv.find(a=>a.startsWith('--update-ack='))?.slice(13),nonce=argv.find(a=>a.startsWith('--update-nonce='))?.slice(15);
 if(!ack||!/^[a-f0-9]{48}$/.test(nonce||''))return false;
 const expected=path.join(dataDir,'updates','ack-'+nonce);if(path.resolve(ack)!==path.resolve(expected))return false;
 if(pending.has(expected))return pending.get(expected);
 const job=(async()=>{if(await fs.readFile(expected,'utf8').catch(()=>null)===nonce)return true;await fs.mkdir(path.dirname(expected),{recursive:true});
 // Publish a complete nonce atomically. Old helpers must not observe a newly
 // created zero-byte file while Node still holds its writer open.
 const temp=expected+'.'+process.pid+'.tmp';await fs.writeFile(temp,nonce,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST')throw e;const current=await fs.readFile(temp,'utf8');if(current!==nonce)throw Error('启动确认临时文件不匹配');});
 try{await fs.rename(temp,expected);}catch(e){if(await fs.readFile(expected,'utf8').catch(()=>null)!==nonce)throw e;await fs.unlink(temp).catch(()=>{});}return true;})();pending.set(expected,job);try{return await job;}finally{pending.delete(expected);}
}
module.exports={acknowledgeStartup};
