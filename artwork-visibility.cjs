// Visibility edits reference a bounded, native-read catalogue. No arbitrary
// paths, pixel erasure, arbitrary deletion or embedded scripting is accepted.
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0;
function validateArtworkHides(edits=[],{objects,jobs=[],textActions=[],format='AI'}={}){
 if(!Array.isArray(edits)||edits.length>100||edits.length&&format!=='AI')throw Error('仅 AI 支持受限对象隐藏');
 const seen=new Set();for(const e of edits){
  if(!e||Object.keys(e).some(k=>!['objectId','sourceIdentity','reason','mode'].includes(k))||e.mode!==undefined&&!['hidden','clear'].includes(e.mode)||!/^([tg]):\d+$/.test(e.objectId)||seen.has(e.objectId)||typeof e.sourceIdentity!=='string'||!e.sourceIdentity||e.sourceIdentity.length>300||typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>2000)throw Error('对象隐藏参数无效或重复');seen.add(e.objectId);
  const o=objects?.find(o=>o.objectId===e.objectId);if(objects&&(!o||o.sourceIdentity!==e.sourceIdentity||!['editable-text','outline-candidate'].includes(o.kind)||!validBox(o.box)||!validBox(o.boardBox)||o.boardNames?.length!==1))throw Error('隐藏对象来源已变化或不受支持，请重新检查对象');
  if(o?.layerId&&jobs.some(j=>j.layerId===o.layerId))throw Error('同一文字不能同时隐藏并替换');
  if(textActions.some(a=>e.objectId==='t:'+a.layerId||o?.layerId===a.layerId))throw Error('同一文字不能同时由文字与图案流程处理');
  if(o&&(edits.some(other=>other!==e&&o.ancestorIds?.includes(other.objectId))))throw Error('不能同时隐藏父子对象');
 }
 return edits;
}
const nativeArtwork=String.raw`
function artHash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return (h>>>0).toString(16);}
function artVisible(p){for(var q=p;q&&q.typename!=='Document';q=q.parent)if(q.hidden||q.visible===false||q.locked||q.clipped)return false;return true;}
function artVector(p,state){if(++state.nodes>600)return false;if(p.typename==='GroupItem'){if(p.clipped)return false;for(var j=0;j<p.pageItems.length;j++)if(p.pageItems[j].parent===p&&!artVector(p.pageItems[j],state))return false;return true;}
 if(p.typename==='CompoundPathItem'){for(var j=0;j<p.pathItems.length;j++)if(!artVector(p.pathItems[j],state))return false;return true;}
 if(p.typename!=='PathItem'||p.clipping||p.guides||p.hidden||p.locked||!p.closed||!p.filled||p.stroked)return false;
 state.paths++;state.points+=p.pathPoints.length;if(state.points>12000)return false;for(var j=0;j<p.pathPoints.length;j++){var q=p.pathPoints[j];state.parts.push(encode([q.anchor,q.leftDirection,q.rightDirection]));}return true;}
function aiArtwork(d,r){var a=[];function add(p,id,kind,extra){if(!artVisible(p))return;var b=p.geometricBounds,bb=boardBox(d,b,r),names=boardNames(d,b);if(!bb||names.length!==1)return;var box=[b[0]-r[0],r[1]-b[1],b[2]-b[0],b[1]-b[3]];if(box[2]<=0||box[3]<=0||box[2]>bb[2]*.9||box[3]>bb[3]*.2)return;var state={nodes:0,paths:0,points:0,parts:[]};if(kind==='outline-candidate'&&(!artVector(p,state)||state.paths<2))return;var uuid='';try{uuid=p.uuid||'';}catch(e){}var ancestors=[];for(var parent=p.parent;parent&&parent.typename!=='Document';parent=parent.parent)if(parent.typename==='GroupItem')for(var j=0;j<d.groupItems.length;j++)if(d.groupItems[j]===parent)ancestors.push('g:'+j);var identity=artHash(encode([id,p.typename,uuid,b,kind==='editable-text'?String(p.contents):state.parts]));a.push({objectId:id,sourceIdentity:identity,kind:kind,name:String(p.name||''),box:box,boardBox:bb,boardNames:names,layerId:extra||null,paths:state.paths,ancestorIds:ancestors});}
 for(var i=0;i<d.textFrames.length;i++)add(d.textFrames[i],'t:'+(i+1),'editable-text',i+1);
 for(var i=0;i<d.groupItems.length;i++)add(d.groupItems[i],'g:'+i,'outline-candidate',null);return a;}
function artworkItem(d,id){var parts=id.split(':'),n=Number(parts[1]);return parts[0]==='t'?d.textFrames[n-1]:d.groupItems[n];}
function applyAiArtwork(d,r,edits){if(!edits||!edits.length)return;var catalog=aiArtwork(d,r),items=[];for(var i=0;i<edits.length;i++){var e=edits[i],o=null;for(var j=0;j<catalog.length;j++)if(catalog[j].objectId===e.objectId)o=catalog[j];if(!o||o.sourceIdentity!==e.sourceIdentity)throw Error('隐藏对象身份变化：'+e.objectId);var p=artworkItem(d,e.objectId);for(var j=0;j<items.length;j++){var q=p;while(q&&q.typename!=='Document'){if(q===items[j])throw Error('不能同时隐藏父子对象');q=q.parent;}q=items[j];while(q&&q.typename!=='Document'){if(q===p)throw Error('不能同时隐藏父子对象');q=q.parent;}}items.push(p);}for(var i=0;i<items.length;i++)items[i].hidden=true;}
`;
module.exports={validateArtworkHides,nativeArtwork};
