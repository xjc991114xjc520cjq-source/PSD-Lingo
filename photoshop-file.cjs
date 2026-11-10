// Validate before allocating the full document; PSB uses the same 26-byte header.
const PSD_MAX_BYTES=300*1024*1024,PSB_MAX_BYTES=6*1024*1024*1024;
function inspectPhotoshopFile(header,length){
 if(!Number.isSafeInteger(length)||length<26)throw new Error('文件长度无效，请重新选择 PSD / PSB。');
 if(header.length<26||header.toString('ascii',0,4)!=='8BPS')throw new Error('文件不是有效的 PSD / PSB。');
 const version=header.readUInt16BE(4),format=version===1?'PSD':version===2?'PSB':null;
 if(!format)throw new Error('不支持的 Photoshop 文件版本，请使用 PSD / PSB。');
 const maximumBytes=version===2?PSB_MAX_BYTES:PSD_MAX_BYTES;
 if(length>maximumBytes)throw new Error(format+' 单文件上限 '+(version===2?'6 GiB':'300 MB')+'。请在副本中减少无关图层或拆分文件后导入。');
 if(header.readUInt16BE(22)!==8||header.readUInt16BE(24)!==3)throw new Error('目前支持 8 位 RGB PSD / PSB。请在副本中转换后导入。');
 const width=header.readUInt32BE(18),height=header.readUInt32BE(14),maximumSide=version===2?300000:30000;
 if(!width||!height)throw new Error(format+' 画布尺寸无效：'+width+' × '+height+' 像素。');
 if(width>maximumSide||height>maximumSide)throw new Error(format+' 画布 '+width+' × '+height+' 像素超过格式最长边 '+maximumSide+' 像素限制。请另存为 PSB 或检查文件头尺寸。');
 return {format,width,height};
}
function previewDimensions(width,height){
 const scale=Math.min(1,16384/width,16384/height,Math.sqrt(6000000/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
module.exports={inspectPhotoshopFile,previewDimensions,PSD_MAX_BYTES,PSB_MAX_BYTES};
