'use strict';
// A match is always an editable object in a specific root-board instance.
const normalized=s=>String(s??'').replace(/\r\n?/g,'\n');
function textMatches(text,needle,{caseInsensitive=false}={}){
 text=normalized(text);needle=normalized(needle);if(!needle)return [];
 // Keep offsets in the original UTF-16 string; case folding can change length.
 const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),re=new RegExp(escaped,caseInsensitive?'giu':'gu'),out=[];let m;
 while((m=re.exec(text)))out.push([m.index,m.index+m[0].length]);return out;
}
function replacement(text,needle,target,{kind='fragment',caseInsensitive=false,occurrence='all'}={}){
 text=normalized(text);target=normalized(target);if(kind==='block')return target;
 const hits=textMatches(text,needle,{caseInsensitive});if(occurrence==='first')hits.splice(1);for(let i=hits.length-1;i>=0;i--)text=text.slice(0,hits[i][0])+target+text.slice(hits[i][1]);return text;
}
function relative(item){const [x,y,w,h]=item.board.box,b=item.box;return [(b[0]+b[2]/2-x)/w,(b[1]+b[3]/2-y)/h,b[2]/w,b[3]/h];}
function candidates(files,{sample,needle,target,mode='text',kind='fragment',tolerance=.055,caseInsensitive=false,scope='document',occurrence='all'}={}){
 if(!['text','position','both'].includes(mode)||!['fragment','block'].includes(kind))throw Error('请选择有效的查找与替换方式');
 if(mode!=='position'&&!normalized(needle))throw Error('请输入要查找的原文');
 if(mode!=='text'&&!sample)throw Error('请先在一级预览中选择一个文字块，再查找对应位置');
 if(typeof target!=='string'||target.length>100000)throw Error('替换文案过长');
 tolerance=Math.max(.005,Math.min(.2,Number(tolerance)||.055));const out=[];
 for(const f of files){if(scope==='document'&&sample&&f.path!==sample.filePath)continue;
  for(const item of f.items||[]){const before=normalized(item.original),hits=textMatches(before,needle,{caseInsensitive});
   const content=hits.length>0;let position=true;
   if(mode!=='text'){const a=relative(sample),b=relative(item),ar=sample.board.box[2]/sample.board.box[3],br=item.board.box[2]/item.board.box[3];position=Math.abs(ar-br)/Math.max(ar,br)<.2&&Math.abs(a[0]-b[0])<=tolerance&&Math.abs(a[1]-b[1])<=tolerance&&Math.abs(a[2]-b[2])<=Math.max(tolerance,a[2]*.6)&&Math.abs(a[3]-b[3])<=Math.max(tolerance,a[3]*.6);}
   if(!(mode==='text'?content:mode==='position'?position:content&&position))continue;
   const previous=(f.edits||[]).find(e=>e.key===item.key),after=replacement(before,needle,target,{kind,caseInsensitive,occurrence});
   const reason=item.issues?.join('；')||((kind==='fragment'&&!content)?'此位置没有要替换的原文':previous?previous.target===after?'已在当前预览中完成替换':'已有预览修改，请取消该项或先撤销旧修改':after===before?'文案相同，无需替换':'');
   out.push({...item,filePath:f.path,fileName:f.name,before:previous?.target??before,after,count:kind==='block'?1:occurrence==='first'?Math.min(1,hits.length):hits.length,reason,eligible:!reason,match:mode==='text'?'相同文字':mode==='position'?'对应位置':'文字与位置对应'});
  }
 }
 if(mode!=='text')for(const row of out){if(out.filter(r=>r.filePath===row.filePath&&r.board.id===row.board.id).length>1){row.reason='此画板有多个位置候选，请逐项查看后确认';row.ambiguous=true;}}
 return out;
}
function mergeEdits(edits,rows){const result=new Map((edits||[]).map(e=>[e.key,e]));for(const row of rows){if(!row.eligible)throw Error(row.reason||'该文字无法替换');result.set(row.key,{key:row.key,original:row.original,target:row.after});}return [...result.values()];}
module.exports={normalized,textMatches,replacement,relative,candidates,mergeEdits};
