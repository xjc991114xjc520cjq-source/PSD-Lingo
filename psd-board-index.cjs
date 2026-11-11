// Bounded, read-only PSD/PSB layer index. No channel pixels or smart objects opened.
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {sameSnapshot}=require('./photoshop-file-io.cjs');
async function readBoardIndex(file,{signal,maxBytes=16*1024*1024}={}){
 const h=await fs.open(file,'r');let pos=0,bytesRead=0;const digest=crypto.createHash('sha256');
 try{const before=await h.stat();if(!before.isFile())throw Error('请选择PSD/PSB文件');
 async function take(n,end=before.size){signal?.throwIfAborted();if(!Number.isSafeInteger(n)||n<0||pos+n>end||pos+n>before.size||bytesRead+n>maxBytes)throw Error('画板结构越界或读取预算超限');const b=Buffer.alloc(n);let at=0;while(at<n){const r=await h.read(b,at,n-at,pos+at);if(!r.bytesRead)throw Error('画板结构截断');at+=r.bytesRead;}digest.update(String(pos)+':');digest.update(b);pos+=n;bytesRead+=n;return b;}
 async function num(n=4,end){const b=await take(n,end),v=n===8?Number(b.readBigUInt64BE()):b.readUInt32BE();if(!Number.isSafeInteger(v))throw Error('文件区段过大');return v;}
 function skip(n,end=before.size){if(!Number.isSafeInteger(n)||n<0||pos+n>end)throw Error('画板结构区段越界');pos+=n;}
 const header=await take(26);if(header.toString('ascii',0,4)!=='8BPS'||![1,2].includes(header.readUInt16BE(4)))throw Error('文件不是PSD/PSB');const large=header.readUInt16BE(4)===2;
 for(let i=0;i<2;i++){const n=await num();skip(n);}const length=await num(large?8:4),sectionEnd=pos+length;if(sectionEnd>before.size)throw Error('图层区段超出文件');if(!length)throw Error('未找到画板结构');const layerLength=await num(large?8:4),layerEnd=pos+layerLength;if(layerEnd>sectionEnd||layerLength<2)throw Error('此文件没有常规图层索引，需Photoshop原生检查');const count=Math.abs((await take(2,layerEnd)).readInt16BE());if(count>50000)throw Error('图层数量过大');const layers=[];
 for(let i=0;i<count;i++){const b=await take(18,layerEnd),l={name:'',id:null,hidden:false};skip(b.readUInt16BE(16)*(large?10:6),layerEnd);const blend=await take(12,layerEnd);if(blend.toString('ascii',0,4)!=='8BIM')throw Error('图层混合签名错误');l.hidden=!!(blend[10]&2);const extra=await num(4,layerEnd),end=pos+extra;if(end>layerEnd)throw Error('图层属性越界');for(let k=0;k<2;k++){const n=await num(4,end);skip(n,end);}const len=(await take(1,end))[0];l.name=(await take(len,end)).toString('latin1');skip((4-(len+1)%4)%4,end);
 while(pos+12<=end){const signature=(await take(4,end)).toString('ascii'),key=(await take(4,end)).toString('ascii');if(!['8BIM','8B64'].includes(signature))throw Error('图层扩展签名无效');const wide=signature==='8B64'||large&&['LMsk','Lr16','Lr32','Layr','Mt16','Mt32','Mtrn','Alph','FMsk','lnk2','FEid','FXid','PxSD'].includes(key),size=await num(wide?8:4,end),start=pos;if(start+size>end)throw Error('图层扩展越界');
 if(key==='luni'){const n=await num(4,start+size);if(n>10000||4+n*2>size)throw Error('图层名称过长或截断');l.name=(await take(n*2,start+size)).swap16().toString('utf16le');}
 else if(key==='lyid')l.id=await num(4,start+size);
 else if(key==='artb'){const data=await take(size,end),reader=require('ag-psd/dist/psdReader.js').createReader(data.buffer,data.byteOffset,data.byteLength),d=require('ag-psd/dist/descriptor.js').readVersionAndDescriptor(reader),a=d.artboardRect;l.box=[a?.Left,a?.['Top '],a?.Rght-a?.Left,a?.Btom-a?.['Top ']];if(!l.box.every(Number.isFinite)||l.box[2]<=0||l.box[3]<=0)throw Error('画板范围无效');}
 pos=start;skip(size+size%2,end);
 }pos=end;layers.push(l);
 }
 const boards=layers.filter(l=>l.box);if(!boards.length)throw Error('未发现命名原生画板，不将普通图层名猜作产品画板');if(boards.some(b=>!Number.isInteger(b.id))||new Set(boards.map(b=>b.id)).size!==boards.length)throw Error('画板ID缺失或重复');const after=await h.stat(),pathHandle=await fs.open(file,'r');let current;try{current=await pathHandle.stat();}finally{await pathHandle.close();}if(!sameSnapshot(before,after)||!sameSnapshot(before,current))throw Error('读取画板期间源文件已变化');return {version:1,format:large?'PSB':'PSD',width:header.readUInt32BE(18),height:header.readUInt32BE(14),boards,structureDigest:digest.digest('hex'),snapshot:{size:before.size,mtimeMs:before.mtimeMs,ctimeMs:before.ctimeMs,ino:before.ino,dev:before.dev},bytesRead,pixelDataRead:false};
 }finally{await h.close();}
}
module.exports={readBoardIndex};
