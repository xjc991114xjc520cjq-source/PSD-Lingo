// Preserve the existing brand mark, with macOS icon padding and a solid tile.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
app.whenReady().then(async()=>{let win;try{
 const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
 const url='data:image/png;base64,'+(await fs.readFile(input)).toString('base64');
 win=new BrowserWindow({show:false,webPreferences:{offscreen:true}});await win.loadURL('data:text/html,<canvas width="1024" height="1024"></canvas>');
 const data=await win.webContents.executeJavaScript(`(async()=>{const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.fillStyle='#222329';ctx.beginPath();ctx.roundRect(100,100,824,824,184);ctx.fill();ctx.strokeStyle='#45464d';ctx.lineWidth=2;ctx.stroke();const image=new Image();image.src=${JSON.stringify(url)};await image.decode();ctx.imageSmoothingQuality='high';ctx.drawImage(image,192,192,640,640);return canvas.toDataURL('image/png').split(',')[1];})()`);
 await fs.writeFile(output,Buffer.from(data,'base64'));console.log(output);win.destroy();app.exit(0);
 }catch(e){console.error(e);win?.destroy();app.exit(1);}});
