const fs=require('node:fs/promises');
const {readDocxText}=require('../document-reader.cjs');
// Limit each model message, never the source file. Returned offsets are explicit.
function createDocumentReader(){
 let cached;
 return async function readDocument(file,{textOffset=0,textLimit=120000}={}){
  if(!Number.isSafeInteger(textOffset)||textOffset<0||!Number.isInteger(textLimit)||textLimit<4||textLimit>120000)throw Error('文档分页参数无效');
  if(/\.docx$/i.test(file)){
   const stat=await fs.stat(file),key=JSON.stringify([file,stat.size,stat.mtimeMs,stat.ctimeMs]);
   if(cached?.key!==key)cached={key,text:await readDocxText(await fs.readFile(file))};
   const source=cached.text;if(textOffset>source.length)throw Error('文档分页位置超出正文');let end=Math.min(source.length,textOffset+textLimit);if(end<source.length&&/[\uD800-\uDBFF]/.test(source[end-1]))end--;
   return {text:source.slice(textOffset,end),textOffset,nextTextOffset:end<source.length?end:null,totalCharacters:source.length,offsetUnit:'utf16',...(end<source.length?{notice:'正文尚未读完，使用 nextTextOffset 继续读取；不能把当前页视为完整文档。'}:{})};
  }
  const handle=await fs.open(file,'r');try{
   const stat=await handle.stat();if(!stat.isFile()||textOffset>stat.size)throw Error('文档或分页位置无效');
   const bytes=Buffer.alloc(Math.min(textLimit,stat.size-textOffset));let read=0;while(read<bytes.length){const r=await handle.read(bytes,read,bytes.length-read,textOffset+read);if(!r.bytesRead)throw Error('文档读取截断');read+=r.bytesRead;}
   let end=bytes.length;if(textOffset+end<stat.size){let start=end-1;while(start>=0&&(bytes[start]&0xc0)===0x80)start--;if(start>=0){const lead=bytes[start],size=lead<0x80?1:lead<0xe0?2:lead<0xf0?3:4;if(end-start<size)end=start;}}
   const after=await handle.stat();if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw Error('文档读取期间已变化');const next=textOffset+end;
   return {text:bytes.subarray(0,end).toString('utf8'),textOffset,nextTextOffset:next<stat.size?next:null,totalBytes:stat.size,offsetUnit:'bytes',...(next<stat.size?{notice:'正文尚未读完，使用 nextTextOffset 继续读取；不能把当前页视为完整文档。'}:{})};
  }finally{await handle.close();}
 };
}
module.exports={createDocumentReader};
