const {layoutChanges}=require('./layout-learning-signals.cjs');
function regionsFor(source,substituted,final,width,height){
 const changed=layoutChanges(substituted,final),ids=new Set(changed.changedLayers.map(String)),cids=new Set(changed.changedContainers.map(String)),regions=[];
 const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
 function merge(a,b){return {bounds:[Math.min(a.bounds[0],b.bounds[0]),Math.min(a.bounds[1],b.bounds[1]),Math.max(a.bounds[2],b.bounds[2]),Math.max(a.bounds[3],b.bounds[3])],layers:new Set([...a.layers,...b.layers]),containers:new Set([...a.containers,...b.containers])};}
 function add(b,id,container){if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0)return;let r={bounds:[Math.max(0,b[0]-64),Math.max(0,b[1]-64),Math.min(width,b[0]+b[2]+64),Math.min(height,b[1]+b[3]+64)],layers:new Set(container?[]:[id]),containers:new Set(container?[id]:[])};if(r.bounds[2]<=r.bounds[0]||r.bounds[3]<=r.bounds[1])return;let again=true;while(again){again=false;for(let i=regions.length-1;i>=0;i--)if(overlap(r.bounds,regions[i].bounds)){r=merge(r,regions.splice(i,1)[0]);again=true;}}regions.push(r);}
 for(const stage of [source,substituted,final]){for(const l of stage?.layers||[])if(ids.has(String(l.id))){const b=l.layoutBox||l.box;if(b)add([l.position?.x??b[0],l.position?.y??b[1],Math.max(b[2],l.fit?.width||0),Math.max(b[3],l.fit?.height||0)],String(l.id),false);}for(const c of [...(stage?.containers||[]),...(stage?.containerEdits||[])])if(cids.has(String(c.layerId??c.id)))add(c.box,String(c.layerId??c.id),true);}
 // Preserve every changed area when a document has many disjoint regions.
 while(regions.length>24)regions.push(merge(regions.pop(),regions.pop()));
 return regions.map(r=>({crop:[r.bounds[0],r.bounds[1],r.bounds[2]-r.bounds[0],r.bounds[3]-r.bounds[1]],layerIds:[...r.layers],containerIds:[...r.containers]}));
}module.exports={regionsFor};
