const fs=require('node:fs/promises');
// Payloads must reach disk before the updater swaps app / app.previous.
// Read-back catches failed/truncated writes; sync requests durable file data.
async function writeVerifiedFile(file,bytes,io=fs){
 const expected=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 const handle=await io.open(file,'w');
 try{await handle.writeFile(expected);await handle.sync();}finally{await handle.close();}
 if(!(await io.readFile(file)).equals(expected))throw Error('更新文件写入后校验失败，未切换版本');
}
module.exports={writeVerifiedFile};
