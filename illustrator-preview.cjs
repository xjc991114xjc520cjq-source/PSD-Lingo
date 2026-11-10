const fs=require('node:fs/promises'),path=require('node:path');
// Illustrator imageCapture requires >=72 dpi. Downsample tiles outside Adobe,
// preserving the document's coordinate system and never scaling artwork.
const nativeCapture=String.raw`
function capture(d,r,p){
 var w=r[2]-r[0],h=r[1]-r[3];if(!(w>0&&h>0))throw Error('AI 预览范围无效：'+w+' × '+h);
 var scale=Math.min(1,16384/w,16384/h,Math.sqrt(6000000/(w*h))),o=new ImageCaptureOptions();
 o.resolution=72;o.antiAliasing=true;o.transparency=false;o.matte=true;var white=new RGBColor();white.red=white.green=white.blue=255;o.matteColor=white;
 var folder=new Folder(p+'.tiles'),tiles=[],edge=2048;if(!folder.exists&&!folder.create())throw Error('无法创建 AI 预览临时目录');
 var columns=Math.ceil(w/edge),rows=Math.ceil(h/edge);if(columns*rows>100000)throw Error('AI 画板总范围过大，请分组导入；原稿未修改');
 for(var y=0;y<rows;y++)for(var x=0;x<columns;x++){
  var left=x*edge,top=y*edge,right=Math.min(w,left+edge),bottom=Math.min(h,top+edge),tile=[r[0]+left,r[1]-top,r[0]+right,r[1]-bottom],name='tile-'+y+'-'+x+'.png',file=new File(folder.fsName+'/'+name);
  try{d.imageCapture(file,tile,o);}catch(e){var names=[];for(var k=0;k<d.artboards.length;k++){var b=d.artboards[k].artboardRect;if(tile[0]<b[2]&&tile[2]>b[0]&&tile[1]>b[3]&&tile[3]<b[1])names.push(d.artboards[k].name);}throw Error('生成 AI 预览失败；画板：'+(names.length?names.join('、'):'画板间区域')+'；分块 '+(y+1)+','+(x+1)+'；72 dpi；'+e);}
  tiles.push({name:name,box:[left,top,right-left,bottom-top]});
 }
 write(p+'.tiles.json',{width:w,height:h,outputWidth:Math.max(1,Math.floor(w*scale)),outputHeight:Math.max(1,Math.floor(h*scale)),tiles:tiles});
}
`;
async function composeCapture(p,{electron=require('electron')}={}){
 const manifest=JSON.parse((await fs.readFile(p+'.tiles.json','utf8')).replace(/^\uFEFF/,'')),folder=p+'.tiles';
 const {width,height,outputWidth:w,outputHeight:h,tiles}=manifest;
 if(![width,height,w,h].every(n=>Number.isFinite(n)&&n>0)||w*h>6000000||w>16384||h>16384||!Array.isArray(tiles)||tiles.length>100000)throw Error('AI 预览分块信息无效');
 const window=new electron.BrowserWindow({show:false,width:1,height:1,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 try{
  await window.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"><canvas id="preview"></canvas>'));
  await window.webContents.executeJavaScript(`var canvas=document.getElementById('preview');canvas.width=${w};canvas.height=${h};var ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);`);
  for(const tile of tiles){
   if(!/^tile-\d+-\d+\.png$/.test(tile.name)||!Array.isArray(tile.box)||tile.box.length!==4||!tile.box.every(Number.isFinite))throw Error('AI 预览分块路径或坐标无效');
   const [x,y,tw,th]=tile.box,left=Math.floor(x*w/width),top=Math.floor(y*h/height),right=Math.floor((x+tw)*w/width),bottom=Math.floor((y+th)*h/height);
   if(x<0||y<0||tw<=0||th<=0||x+tw>width+.01||y+th>height+.01)throw Error('AI 预览分块超出范围');
   const file=path.join(folder,tile.name);if(right>left&&bottom>top){const image=electron.nativeImage.createFromPath(file);if(image.isEmpty())throw Error('AI 预览分块无法读取：'+tile.name);const url=image.resize({width:right-left,height:bottom-top,quality:'best'}).toDataURL();await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(url)};await image.decode();ctx.drawImage(image,${left},${top},${right-left},${bottom-top});})()`);}
   await fs.unlink(file);
  }
  const data=await window.webContents.executeJavaScript("canvas.toDataURL('image/png')");await fs.writeFile(p,Buffer.from(data.split(',')[1],'base64'));
  await fs.rmdir(folder);await fs.unlink(p+'.tiles.json');
 }finally{if(!window.isDestroyed())window.destroy();}
}
module.exports={nativeCapture,composeCapture};
