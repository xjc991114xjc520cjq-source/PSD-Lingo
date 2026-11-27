// A separate top-layer viewer keeps the full board readable above the assistant.
export async function showProductBoardPreview({load,title='完整画板'}){
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='product-board-viewer';dialog.setAttribute('aria-label',title+'完整画板');
 const header=document.createElement('header'),heading=document.createElement('h2'),close=document.createElement('button'),tools=document.createElement('div'),status=document.createElement('p'),viewport=document.createElement('div'),image=document.createElement('img');
 heading.textContent=title;close.type='button';close.textContent='关闭';header.append(heading,close);tools.className='product-board-viewer-tools';status.setAttribute('role','status');status.textContent='正在读取完整画板，首次查看需要生成预览…';viewport.className='product-board-viewport';image.alt=title+'完整画面';image.draggable=false;viewport.append(image);dialog.append(header,tools,status,viewport);document.body.append(dialog);
 let scale=1,naturalWidth=0,naturalHeight=0;
 const setScale=value=>{scale=Math.max(.05,Math.min(8,value));image.style.width=Math.round(naturalWidth*scale)+'px';image.style.height=Math.round(naturalHeight*scale)+'px';percent.textContent=Math.round(scale*100)+'%';};
 const control=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;tools.append(b);return b;};
 const fit=()=>{if(naturalWidth)setScale(Math.min(1,(viewport.clientWidth-32)/naturalWidth,(viewport.clientHeight-32)/naturalHeight));};
 const minus=control('缩小',()=>setScale(scale/1.25)),plus=control('放大',()=>setScale(scale*1.25)),full=control('适合窗口',fit),actual=control('实际大小',()=>setScale(1)),percent=document.createElement('output');tools.append(percent);for(const b of [minus,plus,full,actual])b.disabled=true;
 close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();},{once:true});dialog.showModal();
 viewport.addEventListener('wheel',e=>{if(!naturalWidth)return;e.preventDefault();setScale(scale*(e.deltaY<0?1.15:1/1.15));},{passive:false});
 try{const result=await load();if(!dialog.isConnected)return;if(!/^data:image\/(jpeg|png);base64,/.test(result.dataURL||''))throw Error('没有获得可显示的画板图片');image.src=result.dataURL;await image.decode();if(!dialog.isConnected)return;naturalWidth=image.naturalWidth;naturalHeight=image.naturalHeight;status.textContent='原稿完整画板 · '+naturalWidth+' × '+naturalHeight+' · 可滚轮缩放，放大后拖动滚动条查看';for(const b of [minus,plus,full,actual])b.disabled=false;requestAnimationFrame(fit);}catch(e){if(dialog.isConnected){status.textContent='画板预览未能打开：'+e.message;const retry=control('重试查看',()=>{dialog.close();void showProductBoardPreview({load,title});});retry.focus();}}
 return dialog;
}
