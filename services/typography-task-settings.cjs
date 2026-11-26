const key=p=>{const normalized=String(p).replace(/\\/g,'/');return /^([a-z]:\/|\/\/)/i.test(normalized)?normalized.toLowerCase():normalized;};
function normalizeSettings(value=[],files){
 if(!Array.isArray(value))throw Error('字体设置列表无效');
 const result=value.map(v=>{if(!v||typeof v.filePath!=='string'||!/^([a-z]:[\\/]|\\\\|\/)/i.test(v.filePath)||/[\r\n\0]/.test(v.filePath)||! /\.(ai|psd|psb)$/i.test(v.filePath)||typeof v.font!=='string'||!v.font.trim()||/[\r\n\0]/.test(v.font)||typeof v.family!=='string'||!v.family.trim())throw Error('请选择原稿与实际字体系列');
 for(const k of ['autoSize','autoTracking','autoWeight'])if(v[k]!==undefined&&typeof v[k]!=='boolean')throw Error('自动适配选项无效');
 if(v.tracking!==undefined&&(!Number.isInteger(v.tracking)||v.tracking< -1000||v.tracking>10000))throw Error('字间距无效');
 if(files&&!files.some(f=>key(f.path)===key(v.filePath)))throw Error('字体设置对应的原稿不在本次附件中');
 return {filePath:v.filePath,font:v.font,family:v.family,style:String(v.style||''),autoSize:!!v.autoSize,autoTracking:!!v.autoTracking,autoWeight:!!v.autoWeight,...(!v.autoTracking&&v.tracking!==undefined?{tracking:v.tracking}:{})};});
 if(new Set(result.map(v=>key(v.filePath))).size!==result.length)throw Error('同一原稿的字体设置重复');return result;
}
function summary(v){return v.family+' · '+(v.autoWeight?'AI 选择字重':v.style||v.font)+' · '+(v.autoTracking?'AI 调整字间距':v.tracking===undefined?'保持原字间距':'字间距 '+v.tracking)+(v.autoSize?' · AI 调整字号':' · 保持原字号');}
function restoreTypography(saved={}){let request=saved.request||'',settings=saved.typographySettings;
 if(!settings){settings=[];const prefix='仅修改全文字体，不修改文案。字体设置：',start=request.indexOf(prefix);if(start>=0){const jsonStart=start+prefix.length,end=request.indexOf('。先读取当前工作区；',jsonStart);if(end>jsonStart){try{const v=JSON.parse(request.slice(jsonStart,end));const final='无法读取的对象明确说明，不假称全文完成。',stop=request.indexOf(final,end);if(v.filePath&&v.font&&stop>=0){settings=normalizeSettings([{...v,family:v.family||v.font,style:v.style||''}]);request=(request.slice(0,start)+request.slice(stop+final.length)).trim();}}catch{}}}}
 return {request,typographySettings:normalizeSettings(settings)};
}
module.exports={normalizeSettings,summary,restoreTypography,key};
