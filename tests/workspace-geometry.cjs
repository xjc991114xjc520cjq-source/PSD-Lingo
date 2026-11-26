// Exercise the shipped renderer at desktop and compact sizes; no native documents.
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
module.exports=async function({win,js,wait,out}){
 const results=[];
 const settle=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 for(const [width,height] of [[1600,1000],[1400,960],[1150,760],[1024,700]]){
  win.setSize(width,height);await js(`window.sparkitNavigate('home');document.getElementById('sparkHome').scrollTop=0`);await settle();
  const card=await js(`(()=>{const n=document.getElementById('sparkHomeAssistant'),r=n.getBoundingClientRect(),g=n.parentElement.getBoundingClientRect();return {width:r.width,gridWidth:g.width,height:r.height,top:r.top,bottom:r.bottom,viewport:innerHeight,overflow:n.scrollWidth>n.clientWidth,label:n.textContent}})()`);
  assert.ok(card.width>=card.gridWidth-2&&card.height>=130,'assistant is a large full-width card');assert.ok(card.top>38&&card.bottom<card.viewport,'assistant card visible on arrival');assert.equal(card.overflow,false);assert.match(card.label,/AI 助手/);
  await fs.writeFile(`${out}/home-assistant-${width}.png`,(await win.webContents.capturePage()).toPNG());
  const taskTarget=await js(`(()=>{const n=document.querySelector('.spark-task-list>button'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(taskTarget.x),y:Math.round(taskTarget.y)});await js('new Promise(r=>setTimeout(r,200))');
  assert.ok(await js(`parseFloat(getComputedStyle(document.querySelector('.spark-task-list>button')).borderRadius)>=12`));await fs.writeFile(`${out}/home-task-hover-${width}.png`,(await win.webContents.capturePage()).toPNG());win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1});
  await js(`document.getElementById('sparkHomeAssistant').focus()`);await fs.writeFile(`${out}/home-assistant-focus-${width}.png`,(await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('sparkHomeAssistant').dispatchEvent(new PointerEvent('pointermove',{clientX:350,clientY:200,pointerType:'mouse'}))`);await settle();assert.ok(await js(`document.getElementById('sparkHomeAssistant').style.getPropertyValue('--assistant-x')`));
  await js(`document.getElementById('sparkHomeAssistant').dispatchEvent(new PointerEvent('pointerleave'))`);assert.equal(await js(`document.getElementById('sparkHomeAssistant').style.getPropertyValue('--assistant-x')`),'');
  const sample=await js(`(()=>{const panel=document.querySelector('.spark-workspace-files'),p=panel.getBoundingClientRect(),nodes=[...panel.querySelectorAll('.spark-sample-preview,.spark-sample-info,.spark-sample-flow')].filter(n=>getComputedStyle(n).display!=='none');return nodes.map(n=>{const r=n.getBoundingClientRect();return {inside:r.left>=p.left+12&&r.right<=p.right-12&&r.top>=p.top+12&&r.bottom<=p.bottom-12,overflow:n.scrollWidth>n.clientWidth+2}})})()`);assert.ok(sample.every(n=>n.inside&&!n.overflow),'example image, copy and action fit inside card with bottom spacing');
  await js(`document.querySelector('.spark-workspace-files').scrollIntoView({block:'end'})`);await settle();await fs.writeFile(`${out}/home-example-${width}.png`,(await win.webContents.capturePage()).toPNG());
  const interactions=await js(`new Promise(resolve=>{const cards=[...document.querySelectorAll('.spark-interactive-card')];for(const n of cards)n.dispatchEvent(new PointerEvent('pointermove',{clientX:400,clientY:300,pointerType:'mouse'}));requestAnimationFrame(()=>requestAnimationFrame(()=>{const ok=cards.every(n=>!!n.style.getPropertyValue('--assistant-x'));for(const n of cards)n.dispatchEvent(new PointerEvent('pointerleave'));resolve({count:cards.length,ok,cleared:cards.every(n=>!n.style.getPropertyValue('--assistant-x'))});}));})`);assert.deepEqual(interactions,{count:5,ok:true,cleared:true});
  await js(`document.getElementById('sparkHomeAssistant').scrollIntoView({block:'start'})`);await settle();
  await js(`document.getElementById('sparkHomeAssistant').click()`);await wait(`document.getElementById('agentDialog').open`);assert.equal(await js(`document.getElementById('agentDialog').dataset.motionSource`),'sparkHomeAssistant');assert.equal(await js(`document.body.dataset.sparkRoute`),'home');await js(`document.getElementById('agentDialog').close()`);await wait(`!document.getElementById('agentDialog').open`);assert.equal(await js(`document.activeElement.id`),'sparkHomeAssistant');
  win.setSize(width,height);await js(`window.sparkitNavigate('editor')`);await settle();
  const editor=await js(`(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}},shell=rect(document.querySelector('.shell')),title=rect(document.querySelector('.command-bar .brand'));return {shell,title,steps:[...document.querySelectorAll('.steps .step')].map(n=>({row:rect(n),number:rect(n.querySelector('span')),label:rect(n.querySelector('b'))})),viewport:{w:innerWidth,h:innerHeight},nav:rect(document.querySelector('.workspace-navigation')),main:rect(document.querySelector('.shell>main'))}})()`);
  assert.ok(editor.title.x-editor.shell.x>=16&&editor.title.y-editor.shell.y>=16,'title clears rounded corners');
  for(const s of editor.steps){assert.ok(Math.abs(s.number.w-22)<0.1);assert.ok(Math.abs(s.number.h-22)<0.1);assert.ok(s.label.x>=s.number.right+5,'step number never overlaps label');assert.ok(s.label.right<=s.row.right+1,'step label stays inside');}
  assert.ok(editor.main.h>200,'wrapped chrome preserves usable editor height');
  const labels=await js(`Array.from(document.querySelectorAll('.spark-sidebar nav button>span')).filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight)}))`);assert.ok(labels.every(n=>n.height<=n.line+2),'sidebar labels stay on one line');
  await fs.writeFile(`${out}/layout-${width}-editor.png`,(await win.webContents.capturePage()).toPNG());
  for(const route of ['batch','sku','bulk']){
   await js(`window.sparkitNavigate(${JSON.stringify(route)})`);await settle();
   await js(`Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))`);
   const geometry=await js(`(()=>{const d=document.querySelector('dialog[open]'),h=d?.querySelector('h2');if(!d||!h)return null;const r=d.getBoundingClientRect(),t=h.getBoundingClientRect();return {id:d.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,inset:t.left-r.left,titleTop:t.top-r.top,vw:innerWidth,vh:innerHeight,overflow:d.scrollWidth>d.clientWidth+2}})()`);
   assert.ok(geometry,route+' opens');assert.ok(geometry.left>=0&&geometry.top>=38&&geometry.right<=geometry.vw&&geometry.bottom<=geometry.vh,route+' fits viewport');assert.ok(geometry.inset>=16&&geometry.titleTop>=16,route+' title clears rounded corners');assert.equal(geometry.overflow,false,route+' has no horizontal overflow');
   await fs.writeFile(`${out}/layout-${width}-${route}.png`,(await win.webContents.capturePage()).toPNG());results.push({width,height,route,...geometry});
   await js(`document.querySelector('dialog[open]').close()`);await wait(`!document.querySelector('dialog[open]')`);
  }
  for(const [button,selector] of [['settings','#settingsDialog'],['openWorkRecords','#workRecords'],['openAgentSidebar','#agentDialog']]){
   await js(`document.getElementById(${JSON.stringify(button)}).click()`);await settle();await js(`Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))`);
   const g=await js(`(()=>{const d=document.querySelector(${JSON.stringify(selector)}),r=d.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,vw:innerWidth,vh:innerHeight,overflow:d.scrollWidth>d.clientWidth+2}})()`);
   assert.ok(g.left>=0&&g.top>=0&&g.right<=g.vw+1&&g.bottom<=g.vh+1,button+' fits viewport');assert.equal(g.overflow,false,button+' no horizontal overflow');
   await fs.writeFile(`${out}/layout-${width}-${button}.png`,(await win.webContents.capturePage()).toPNG());results.push({width,height,route:button,...g});
   await js(selector==='#workRecords'?`document.getElementById('closeWorkRecords').click()`:`document.querySelector(${JSON.stringify(selector)}).close()`);await wait(`!document.querySelector('dialog[open]')`);
  }
 }
 await fs.writeFile(out+'/layout-geometry.json',JSON.stringify(results,null,2));win.setSize(1400,960);await js(`window.sparkitNavigate('home')`);await settle();
};
