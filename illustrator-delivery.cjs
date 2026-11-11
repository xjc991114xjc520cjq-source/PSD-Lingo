const fs=require('node:fs/promises');
const {hashFile}=require('./photoshop-file-io.cjs');
// Run only on the application's freshly saved copy. Reopen before rasterizing.
const nativeDelivery=String.raw`
function deliverySnapshot(d){var a=[];for(var i=0;i<d.textFrames.length;i++){var t=d.textFrames[i],b=t.geometricBounds;a.push({text:text(t.contents),font:t.textRange.characterAttributes.textFont.name,box:[b[0],b[1],b[2],b[3]],hidden:t.hidden});}return a;}
function deliveryReopenCheck(d,expected){var actual=deliverySnapshot(d);if(actual.length!==expected.length)throw Error('保存重开后的文字对象数量变化');for(var i=0;i<actual.length;i++){var a=actual[i],e=expected[i];if(a.text!==e.text||a.font!==e.font||a.hidden!==e.hidden)throw Error('保存重开后的文字或字体变化：'+(i+1));for(var j=0;j<4;j++)if(Math.abs(a.box[j]-e.box[j])>.1)throw Error('保存重开后的文字位置变化：'+(i+1));}}
function deliveryJpegs(d,boards,output){
 var r=rect(d),out=[];
 for(var i=0;i<boards.length;i++){
  var spec=boards[i],found=-1;
  for(var k=0;k<d.artboards.length;k++){var b=d.artboards[k].artboardRect,c=[b[0]-r[0],r[1]-b[1],b[2]-b[0],b[1]-b[3]],same=d.artboards[k].name===spec.name;for(var j=0;j<4;j++)if(Math.abs(c[j]-spec.crop[j])>.1)same=false;if(same){if(found>=0)throw Error('目标画板身份不唯一');found=k;}}
  if(found<0)throw Error('目标画板来源变化：'+spec.name);
  d.artboards.setActiveArtboardIndex(found);var dest=new File(output.replace(/\.ai$/i,'')+'-board-'+(found+1)+'.jpg');if(dest.exists)throw Error('目标JPG已存在，未覆盖');
  var o=new ExportOptionsJPEG();o.artBoardClipping=true;o.antiAliasing=true;o.qualitySetting=100;o.horizontalScale=100;o.verticalScale=100;o.optimization=true;
  d.exportFile(dest,ExportType.JPEG,o);if(!dest.exists||dest.length<=0)throw Error('画板JPG未生成：'+spec.name);
  out.push({name:spec.name,index:found,crop:spec.crop,path:dest.fsName});
 }
 return {reopened:true,boards:out};
}
`;
function validateBoards(boards){
 if(!Array.isArray(boards)||!boards.length||boards.length>1000)throw Error('缺少明确的最终交付画板');
 const seen=new Set();for(const b of boards){if(!b||typeof b.name!=='string'||!b.name||seen.has(b.name)||!Array.isArray(b.crop)||b.crop.length!==4||!b.crop.every(Number.isFinite)||b.crop[0]<0||b.crop[1]<0||b.crop[2]<=0||b.crop[3]<=0)throw Error('最终交付画板身份或范围无效');seen.add(b.name);}
}
async function verifyDelivery(result,{nativeImage=require('electron').nativeImage,expectedBoards}={}){
 if(!result.delivery?.reopened)throw Error('原生副本尚未重开核验');
 const boards=result.delivery.boards;validateBoards(boards);
 if(expectedBoards){validateBoards(expectedBoards);if(boards.length!==expectedBoards.length||expectedBoards.some(e=>!boards.some(b=>b.name===e.name&&b.crop.every((n,i)=>Math.abs(n-e.crop[i])<=.1))))throw Error('最终JPG数量或画板范围与计划不符');}
 for(const b of boards){const bytes=await fs.readFile(b.path),image=nativeImage.createFromBuffer(bytes),size=image.getSize();if(image.isEmpty()||bytes.length<100||Math.abs(size.width-b.crop[2])>1||Math.abs(size.height-b.crop[3])>1)throw Error('画板JPG无法解码或尺寸不符：'+b.name);const bitmap=image.toBitmap();let varied=false;for(let i=4;i<bitmap.length;i+=4)if(bitmap[i]!==bitmap[0]||bitmap[i+1]!==bitmap[1]||bitmap[i+2]!==bitmap[2]){varied=true;break;}if(!varied)throw Error('画板JPG为空白或纯色，不能视为完成：'+b.name);Object.assign(b,{width:size.width,height:size.height,bytes:bytes.length,hash:await hashFile(b.path)});}
 result.delivery.nativeHash=await hashFile(result.output);result.delivery.verified=true;return result;
}
async function deliveryVisual(result,{boardName,crop},{nativeImage=require('electron').nativeImage}={}){
 if(!result.delivery?.verified||await hashFile(result.output)!==result.delivery.nativeHash)throw Error('原生交付文件已变化，不能复用最终审验');
 const b=result.delivery.boards.find(b=>b.name===boardName);if(!b||await hashFile(b.path)!==b.hash)throw Error('最终JPG缺失或已变化');
 crop=crop||b.crop;if(!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[2]<=0||crop[3]<=0||crop[0]<b.crop[0]||crop[1]<b.crop[1]||crop[0]+crop[2]>b.crop[0]+b.crop[2]+.01||crop[1]+crop[3]>b.crop[1]+b.crop[3]+.01)throw Error('最终JPG审验范围越界');
 let image=nativeImage.createFromPath(b.path);if(image.isEmpty())throw Error('最终JPG解码失败');
 const x=Math.max(0,Math.floor((crop[0]-b.crop[0])*b.width/b.crop[2])),y=Math.max(0,Math.floor((crop[1]-b.crop[1])*b.height/b.crop[3]));
 image=image.crop({x,y,width:Math.min(b.width-x,Math.max(1,Math.ceil(crop[2]*b.width/b.crop[2]))),height:Math.min(b.height-y,Math.max(1,Math.ceil(crop[3]*b.height/b.crop[3])))});
 const s=image.getSize(),scale=Math.min(1,1600/s.width,1800/s.height);if(scale<1)image=image.resize({width:Math.max(1,Math.round(s.width*scale)),height:Math.max(1,Math.round(s.height*scale)),quality:'best'});
 let bytes=image.toPNG();while(bytes.length>1000000&&image.getSize().width>160){image=image.resize({width:Math.max(1,Math.floor(image.getSize().width*.75)),quality:'best'});bytes=image.toPNG();}if(bytes.length>1000000)throw Error('最终图审验预览过大');
 const identity=result.delivery.nativeHash+'|'+b.hash;
 return {stage:'current',quality:'native-background',origin:'exported-jpeg',crop:[...crop],dataURL:'data:image/png;base64,'+bytes.toString('base64'),provenance:{backgroundKey:identity,expectedBackgroundKey:identity,renderRevision:b.hash,expectedRenderRevision:b.hash},deliveryEvidence:{nativePath:result.output,nativeHash:result.delivery.nativeHash,jpegPath:b.path,jpegHash:b.hash,board:b.name,reopened:true}};
}
module.exports={nativeDelivery,validateBoards,verifyDelivery,deliveryVisual};
