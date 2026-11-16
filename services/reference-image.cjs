const fs=require('node:fs/promises');
// Original files stay intact; only the image sent to the model is compacted.
function referenceImage(bytes,mime,{nativeImage}={}){
 if(bytes.length<=8*1024*1024)return {images:['data:image/'+mime+';base64,'+bytes.toString('base64')]};
 const signature=mime==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!signature)throw Error('参考图片格式无效');
 nativeImage=nativeImage||require('electron').nativeImage;
 const encoded=require('./design-visual-image.cjs').encodeDesignImage(nativeImage.createFromBuffer(bytes));
 return {images:[encoded.dataURL],sourceBytes:bytes.length,previewBytes:encoded.encodedBytes,previewResized:true};
}
async function readReferenceImage(file,mime){
 const stat=await fs.stat(file);
 if(stat.size<=8*1024*1024)return referenceImage(await fs.readFile(file),mime);
 const encoded=require('./design-visual-image.cjs').encodeDesignImage(require('electron').nativeImage.createFromPath(file));
 return {images:[encoded.dataURL],sourceBytes:stat.size,previewBytes:encoded.encodedBytes,previewResized:true};
}
module.exports={referenceImage,readReferenceImage};
