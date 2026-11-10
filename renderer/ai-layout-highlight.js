import {activeContainerEdits} from '../container-fit.cjs';
// Visual feedback only: no selected flags, project mutations or history entries.
export function installAiLayoutHighlight({$,file,layer,record,fitText}){
 const overlay=document.createElement('div');overlay.id='aiLayoutHighlights';overlay.className='ai-layout-highlights';overlay.hidden=true;overlay.setAttribute('aria-hidden','true');$('replacementStage').append(overlay);
 let source=null,textIds=new Set(),shapeIds=new Set();
 const key=id=>String(id),valid=box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0;
 function clearCards(){for(const card of document.querySelectorAll('.layer-card.ai-layout-changed')){card.classList.remove('ai-layout-changed');card.querySelector('.ai-layout-change-label')?.remove();}}
 function clear(){source=null;textIds.clear();shapeIds.clear();overlay.replaceChildren();overlay.hidden=true;clearCards();}
 function frame(id,box,type,scale){if(!valid(box))return;const el=document.createElement('div');el.className='ai-layout-highlight '+(type==='container'?'ai-layout-highlight-container':'ai-layout-highlight-text');el.dataset.layerId=key(id);el.dataset.kind=type;Object.assign(el.style,{left:box[0]*scale+'px',top:box[1]*scale+'px',width:box[2]*scale+'px',height:box[3]*scale+'px'});const badge=document.createElement('span');badge.className='ai-layout-highlight-label';badge.textContent=type==='container'?'AI 已调整容器':'AI 已修改';el.append(badge);overlay.append(el);}
 function draw(){const f=file();if(!source||f!==source){clear();return;}const scale=Number($('replacementStage').dataset.scale);overlay.replaceChildren();clearCards();if(!(scale>0)){overlay.hidden=true;return;}
  const cards=document.querySelectorAll('#layers .layer-card');
  for(const [index,l] of (f.layers||[]).entries()){if(!textIds.has(key(l.id)))continue;const card=cards[index];if(card){card.classList.add('ai-layout-changed');const badge=document.createElement('span');badge.className='ai-layout-change-label';badge.textContent='AI 已修改';card.querySelector('.layer-body')?.append(badge);}
   if(!l.recordId||l.skipExport)continue;const r=record(l.recordId);if(!r)continue;let fit;try{fit=fitText(l,r);}catch{continue;}const box=l.box;if(!valid(box)||!(fit?.width>0)||!(fit?.height>0))continue;const left=l.position?.x??box[0],top=l.position?.y??box[1],x=left+(l.alignment==='center'?(box[2]-fit.width)/2:l.alignment==='right'?box[2]-fit.width:0);frame(l.id,[x,top,fit.width,fit.height],'text',scale);
  }
  const edits=activeContainerEdits(f);for(const shape of f.containers||[]){if(!shapeIds.has(key(shape.id)))continue;const box=edits.find(e=>key(e.layerId)===key(shape.id))?.box||shape.box;frame(shape.id,box,'container',scale);}
  overlay.hidden=!overlay.children.length;
 }
 function show(applied={}){clear();source=file();if(!source)return;textIds=new Set((applied.changedLayerIds||[]).map(key));shapeIds=new Set((applied.changedContainerIds||[]).map(key));draw();}
 return {show,draw,clear,element:overlay};
}
