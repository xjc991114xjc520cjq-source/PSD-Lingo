const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const key=p=>require('./file-identity.cjs').fileKey(p);
// Only structure and a separately hashed preview, never a customer source copy.
async function capture({snapshot,metadata,nativeText,productCopy,directory}){
 const files=snapshot?.continuationInputs?.files||[...(snapshot?.project?.files||[]),...(snapshot?.batchPreview?.state?.files||[])],imports=[];
 for(const f of files){const cached=metadata.get(f.path)||(f.learningSource?.layers?{fingerprint:f.fingerprint,metadata:{bitsPerChannel:8,colorMode:3,width:f.width,height:f.height,layers:f.learningSource.layers,containers:f.learningSource.containers||[],artboards:f.artboards||[]}}:null);if(!cached||cached.fingerprint!==f.fingerprint)continue;
  let preview;const image=f.preview;if(typeof image==='string'&&image.startsWith('data:image/')){await fs.mkdir(directory,{recursive:true});const hash=digest(image),file=path.join(directory,hash+'.preview');await fs.writeFile(file,image);preview={path:file,hash};}
  imports.push({path:f.path,fingerprint:f.fingerprint,metadata:cached.metadata,previewArtifact:preview});
 }
 return {schema:1,imports,nativeText:nativeText.capture(files.map(f=>f.nativeTextScanId||f.artboardPlan?.nativeTextScanId)),productCopy:productCopy.capture(files.map(f=>f.productCopyScanId||f.artboardPlan?.productCopyScanId))};
}
async function restoreFile(file,{runtime,verifiedSources,metadata,imported,nativeText,productCopy,onProgress=()=>{}}){
 if(runtime?.schema!==1||verifiedSources?.get(key(file.path))!==file.fingerprint)return null;
 const entry=runtime.imports?.find(e=>key(e.path)===key(file.path)&&e.fingerprint===file.fingerprint);if(!entry?.metadata?.layers)return null;
 let preview;if(entry.previewArtifact){try{preview=await fs.readFile(entry.previewArtifact.path,'utf8');if(digest(preview)!==entry.previewArtifact.hash)return null;}catch{return null;}}
 nativeText.restore(runtime.nativeText);productCopy.restore(runtime.productCopy);
 const meta={bitsPerChannel:8,colorMode:3,...structuredClone(entry.metadata)};metadata.set(file.path,{fingerprint:file.fingerprint,metadata:meta});imported.set(file.path,file.fingerprint);
 onProgress('已校验原稿，复用已有文件分析：'+file.name);
 return {path:file.path,name:file.name,fingerprint:file.fingerprint,format:file.format,width:meta.width,height:meta.height,metadata:meta,...(preview?{preview}:{})};
}
module.exports={capture,restoreFile};
