const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function finite(v){return Number.isFinite(v)?Math.round(v*1000)/1000:null;}
function vector(v){return Array.isArray(v)?v.slice(0,4).map(finite):null;}
function layer(l){if(!l)return null;const m=l.manual||{},f=l.fit||{},t=String(l.target||'');return {id:String(l.id),box:vector(l.box),layoutBox:vector(l.layoutBox),position:l.position?[finite(l.position.x),finite(l.position.y)]:null,font:String(m.font||l.font||'').slice(0,80),size:finite(m.size||l.size),alignment:l.alignment||'left',style:[finite(m.tracking),finite(m.leading),finite(m.stretchX),finite(m.stretchY)],fit:[finite(f.width),finite(f.height),finite(f.size),finite(f.leading),finite(f.tracking)],text:[t.length,(f.lines||[]).length,/\p{Script=Han}/u.test(t)?'han':/\p{Script=Arabic}/u.test(t)?'arabic':/\p{Script=Cyrillic}/u.test(t)?'cyrillic':'other']};}
function container(c){return c?{id:String(c.layerId??c.id),box:vector(c.box),radii:vector(c.radii||c.cornerRadii)}:null;}
function compactSamples(sample){
 if(!sample.stages?.source||!sample.stages?.substituted||!sample.after||!sample.layoutChanges?.changed)return [];
 const layers=sample.layoutChanges.changedLayers||[],containers=sample.layoutChanges.changedContainers||[];
 const changes=[...layers.map(id=>({kind:'layer',id:String(id)})),...containers.map(id=>({kind:'container',id:String(id)}))];
 return changes.map(change=>{const stage=s=>change.kind==='layer'?layer(s?.layers?.find(l=>String(l.id)===change.id)):container([...(s?.containerEdits||[]),...(s?.containers||[])].find(c=>String(c.layerId??c.id)===change.id));
 const value={version:1,projectId:sample.projectId,context:{width:sample.context.width,height:sample.context.height,language:/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(sample.context.batchLanguage||'')?sample.context.batchLanguage:'unspecified'},change,stages:{source:stage(sample.stages.source),substituted:stage(sample.stages.substituted),final:stage(sample.after)},operationCount:(sample.operations||[]).length,reason:sample.reason||'manual'};
 return {id:hash(value),value};});
}
module.exports={compactSamples};
