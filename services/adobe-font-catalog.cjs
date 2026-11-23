// Cache only successful catalogs, independently for each Adobe engine.
function groupFontFamilies(fonts){
 const suffix=/[\s_-]*(?:extra[ -]?light|ultra[ -]?light|semi[ -]?bold|demi[ -]?bold|extra[ -]?bold|ultra[ -]?bold|thin|light|regular|normal|medium|bold|heavy|black|细体|常规|中等|粗体)$/i;
 const stem=v=>v.replace(suffix,'').trim(),compact=v=>v.replace(/[\s_-]/g,'').toLowerCase();
 const groups=new Map();for(const f of fonts){const id=compact(stem(f.family))+'|'+compact(stem(f.name));groups.set(id,(groups.get(id)||0)+1);}
 return fonts.map(f=>{const family=stem(f.family),id=compact(family)+'|'+compact(stem(f.name));return family!==f.family&&groups.get(id)>1?{...f,nativeFamily:f.family,family}:f;});
}
function createAdobeFontCatalog({load}){const cache=new Map(),pending=new Map();return async request=>{const value=typeof request==='object'&&request!==null?request:{format:request},format=value.format==='AI'?'AI':'PSD';if(!value.refresh&&cache.has(format))return structuredClone(cache.get(format));if(pending.has(format))return structuredClone(await pending.get(format));const work=Promise.resolve().then(()=>load(format)).then(fonts=>{if(!Array.isArray(fonts)||!fonts.length||fonts.some(f=>typeof f?.name!=='string'||!f.name||typeof f.family!=='string'||!f.family))throw Error('Adobe 没有返回可用字体，请确认软件已启动后重新读取');const result=groupFontFamilies(fonts.map(f=>({name:f.name,family:f.family,style:f.style||'Regular'})));cache.set(format,result);return result;});pending.set(format,work);try{return structuredClone(await work);}finally{if(pending.get(format)===work)pending.delete(format);}};}
module.exports={createAdobeFontCatalog,groupFontFamilies};
