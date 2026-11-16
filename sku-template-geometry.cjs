// Preserve the relationships of the supplied template; no model call or artwork resampling.
function priceAnchor(object, groups, objects, fallback) {
 const group=(groups||[]).flatMap(g=>g.items||[]).find(i=>i.objectIds.includes(object.id));
 if(!group)return fallback;
 const b=object.localBox||object.box;
 const labels=group.objectIds.filter(id=>id!==object.id).map(id=>objects.find(o=>o.id===id)).filter(o=>o?.kind==='text');
 for(const label of labels){const l=label.localBox||label.box;
  // Only an existing stacked, centered label/value pair establishes this axis.
  if(l[1]+l[3]<=b[1]+1&&Math.abs(l[0]+l[2]/2-b[0]-b[2]/2)<=Math.max(2,l[3]*.15))return 'center';
 }
 return fallback;
}
function footerPlacement(frame, placement, objects){
 const nativeFrame=frame.slice();
 const bottom=frame[1]+frame[3],tolerance=Math.max(2,Math.min(3,frame[3]*.002));
 // Close only a tiny existing bottom seam by translating the complete footer.
 // A large background bleed outside the canvas is not a panel edge.
 const edges=objects.filter(o=>o.visible!==false&&o.kind==='pixel'&&o.steps.length===1)
  .map(o=>o.localBox||o.box).filter(b=>b[2]>=frame[2]*.65&&b[1]>=frame[1]+frame[3]*.65&&bottom-b[1]-b[3]>0&&bottom-b[1]-b[3]<=tolerance);
 const seam=edges.length?Math.min(...edges.map(b=>bottom-b[1]-b[3])):0;
 nativeFrame[1]-=seam;
 return {frame:nativeFrame,placement,bottomSeam:seam};
}
function scaleMismatches(plan){
 const p=plan?.productTemplate;if(!p)return [];
 const entries=p.templates||[{template:p.template,scanId:p.scanId}];
 return p.requests.filter(r=>Math.abs(r.placement[2]/(r.templateCanvas?.[0]||r.frame[2])-1)>.000001).map(r=>({boardId:r.boardId,scanId:r.scanId||p.scanId,template:entries.find(t=>t.scanId===(r.scanId||p.scanId))?.template?.path,templateSize:r.templateCanvas||r.frame.slice(2),targetSize:r.placement.slice(2),scale:r.placement[2]/(r.templateCanvas?.[0]||r.frame[2])}));
}
function scaleKey(plan){return JSON.stringify(scaleMismatches(plan));}
module.exports={priceAnchor,footerPlacement,scaleMismatches,scaleKey};
