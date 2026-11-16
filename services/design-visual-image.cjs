// Current design evidence has its own contract; learning thumbnails remain PNG-only.
const {validateLayoutPng}=require('./layout-memory.cjs');
const MAX_BYTES=1024*1024,MAX_SIDE=2400;
function validateDesignImage(url){
 if(typeof url!=='string'||url.length>Math.ceil(MAX_BYTES*4/3)+64)throw Error('设计审验图片超过 1 MiB，请压缩审验副本');
 if(url.startsWith('data:image/png;base64,')){try{const bytes=validateLayoutPng(url,MAX_BYTES);if(!bytes)throw Error('图片为空');return {bytes,url,extension:'png'};}catch(e){throw Error('设计审验 PNG 无效：'+e.message.replace(/^排版记忆：/,''));}}
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(url))throw Error('设计审验图片须为受限 PNG 或 JPEG');
 const bytes=Buffer.from(url.split(',')[1],'base64');if(bytes.length<12||bytes.length>MAX_BYTES||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)throw Error('设计审验 JPEG 数据无效');
 let p=2,size=null,sos=false;while(p+4<=bytes.length){if(bytes[p++]!==255)throw Error('设计审验 JPEG 标记无效');while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===0xda){sos=true;break;}if(marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;const n=bytes.readUInt16BE(p);if(n<2||p+n>bytes.length)throw Error('设计审验 JPEG 区块无效');if([0xc0,0xc1,0xc2].includes(marker)){if(n<8)throw Error('设计审验 JPEG 帧无效');size={width:bytes.readUInt16BE(p+5),height:bytes.readUInt16BE(p+3)};}p+=n;}
 if(!sos||!size||!size.width||!size.height||Math.max(size.width,size.height)>MAX_SIDE)throw Error('设计审验 JPEG 尺寸无效');return {bytes,url,extension:'jpeg',...size};
}
function encodeDesignImage(image){
 if(image.isEmpty())throw Error('设计审验图片为空');const initial=image.getSize();if(Math.max(initial.width,initial.height)>MAX_SIDE)image=image.resize(initial.width>=initial.height?{width:MAX_SIDE}:{height:MAX_SIDE});
 for(let round=0;round<12;round++){for(const quality of [88,78,68]){const bytes=image.toJPEG(quality);if(bytes.length<=MAX_BYTES){const url='data:image/jpeg;base64,'+bytes.toString('base64');validateDesignImage(url);return {dataURL:url,encodedSize:image.getSize(),encodedBytes:bytes.length};}}const size=image.getSize();image=image.resize({width:Math.max(1,Math.floor(size.width*.8)),height:Math.max(1,Math.floor(size.height*.8))});}throw Error('设计审验图片压缩失败，最终 JPG 保留');
}
module.exports={validateDesignImage,encodeDesignImage,MAX_BYTES,MAX_SIDE};
