// Reusable learning targets are geometry and typography, never copy rewrites.
// Text remains contextual evidence for measuring language expansion.
const layoutLayer=l=>Object.fromEntries(['id','box','layoutBox','position','manual','font','size','alignment','containerId','minSize','smart'].filter(k=>l[k]!==undefined).map(k=>[k,l[k]]));
const canonical=v=>JSON.stringify(v);
function layoutChanges(before,after){
 const changedLayers=(after?.layers||[]).filter(l=>{const b=before?.layers?.find(x=>String(x.id)===String(l.id));if(!b)return false;const sameCopy=String(b.target||'').replace(/[\r\n]/g,'')===String(l.target||'').replace(/[\r\n]/g,'');return canonical(layoutLayer(b))!==canonical(layoutLayer(l))||sameCopy&&b.target!==l.target;}).map(l=>String(l.id));
 const changedContainers=(after?.containerEdits||[]).filter(c=>canonical(c)!==canonical(before?.containerEdits?.find(b=>String(b.layerId)===String(c.layerId)))).map(c=>String(c.layerId));
 for(const c of before?.containerEdits||[])if(!(after?.containerEdits||[]).some(a=>String(a.layerId)===String(c.layerId)))changedContainers.push(String(c.layerId));
 for(const c of after?.containers||[]){const b=before?.containers?.find(b=>String(b.id)===String(c.id));if(b&&canonical([b.box,b.radii])!==canonical([c.box,c.radii]))changedContainers.push(String(c.id));}
 const uniqueContainers=[...new Set(changedContainers)];
 return {changedLayers,changedContainers:uniqueContainers,changed:changedLayers.length+uniqueContainers.length>0};
}
module.exports={layoutLayer,layoutChanges};
