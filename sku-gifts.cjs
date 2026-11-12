const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s「」『』“”"']/g,'');
function parseGifts(value){
 const text=String(value??'').trim();if(!text||/^[/／—–-]$/.test(text))return [];
 // A valuation terminates a gift item. Do not split a '+' that is part of its name.
 const chunks=text.split(/(?<=元)\s*[+＋]\s*/u);
 return chunks.map(raw=>{const m=/^(.+?)\s*(?:价值|价值约)\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*元\s*$/.exec(raw.trim());if(!m)throw Error('赠品需明确名称与价值格式，无法安全分解：'+raw);return {name:m[1].trim(),value:m[2]};});
}
function matchGifts(value,catalog){return parseGifts(value).map(g=>{const candidates=catalog.assets.filter(a=>normalize(a.name)===normalize(g.name));if(candidates.length!==1)throw Error('赠品PNG缺失或重名，不能猜型号或颜色：'+g.name);return {...g,asset:candidates[0]};});}
async function scanGiftAssets(directory,{imageInfo}={}){
 if(!path.isAbsolute(directory||''))throw Error('请选择赠品PNG文件夹');const real=await fs.realpath(directory),assets=[];
 const entries=await fs.readdir(real,{withFileTypes:true});if(entries.length>2000)throw Error('赠品目录超过2000项，请缩小范围');
 for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(!/\.png$/i.test(e.name))continue;if(!e.isFile()||e.isSymbolicLink())throw Error('赠品必须是目录内普通PNG，不能使用链接');const file=path.join(real,e.name),st=await fs.stat(file);if(st.size>32*1024*1024)throw Error('单张赠品PNG超过32MiB');const b=await fs.readFile(file);if(b.length<33||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('无效PNG：'+e.name);
  const width=b.readUInt32BE(16),height=b.readUInt32BE(20);if(!width||!height||width*height>32*1024*1024)throw Error('赠品PNG像素过大或无效');
  let inkBox;if(imageInfo)inkBox=await imageInfo(b);else{const im=require('electron').nativeImage.createFromBuffer(b);if(im.isEmpty())throw Error('无法解码赠品PNG');const pixels=im.toBitmap();let x=width,y=height,r=-1,bottom=-1;for(let j=0;j<height;j++)for(let i=0;i<width;i++)if(pixels[(j*width+i)*4+3]>0){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);bottom=Math.max(bottom,j);}if(r<0)throw Error('赠品PNG完全透明：'+e.name);inkBox=[x,y,r-x+1,bottom-y+1];}
  const after=await fs.stat(file);if(st.size!==after.size||st.mtimeMs!==after.mtimeMs)throw Error('赠品PNG读取期间变化');assets.push({id:hash(Buffer.from(e.name+'\0'+hash(b))),name:path.basename(e.name,path.extname(e.name)),path:file,fingerprint:hash(b),width,height,inkBox});
 }
 if(!assets.length)throw Error('赠品文件夹没有PNG');return {version:1,directory:real,assets,digest:hash(Buffer.from(JSON.stringify(assets)))};
}
function giftAction({config,approved,catalog,objects,priceFields}){
 const fields=approved.fields.filter(f=>f.role==='gift');if(!fields.length){if(config)throw Error('产品批准记录没有role=gift字段，请先把赠品列纳入当前对应');return null;}
 if(fields.length!==1||!config||config.field!==fields[0].key||!catalog)throw Error('赠品字段需单独role=gift，并配置当前目录及模板赠品区域');
 const get=id=>{const o=objects.find(o=>o.id===id);if(!o)throw Error('赠品模板对象不属于选中模板块');return o;},container=get(config.containerId),prototype=get(config.textObjectId);
 const {contains}=require('./sku-price-structure.cjs');
 if(container.kind!=='group'||container.artboard||prototype.kind!=='text'||container.steps.length!==prototype.steps.length||container.steps.slice(0,-1).some((s,i)=>JSON.stringify(s.path)!==JSON.stringify(prototype.steps[i].path))||!contains(container,prototype)||priceFields.some(f=>f.objectIds.some(id=>contains(container,get(id))||contains(get(id),container))))throw Error('赠品区域必须是独立普通组，文字原型需在其内，不得覆盖价格或主图');
 const box=config.frame;if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0||!['horizontal','vertical'].includes(config.axis||'horizontal'))throw Error('赠品需明确局部区域及排列轴');
 const gifts=fields[0].state==='value'?matchGifts(fields[0].value,catalog):[];
 if(config.unitAlignment&&!['center','slots'].includes(config.unitAlignment))throw Error('赠品图文单元对齐方式无效');
 if(gifts.length>12)throw Error('单产品赠品超过12项，请明确拆分模板，不能执行后才遗漏审验');
 const parts=config.textParts;if(!Array.isArray(parts)||!parts.some(p=>p.token==='name')||parts.some(p=>!Number.isInteger(p.sourceStart)||p.sourceStart<0||p.sourceStart>=prototype.original.length||p.token&&!['name','value'].includes(p.token)||!p.token&&(typeof p.text!=='string'||prototype.original.slice(p.sourceStart,p.sourceStart+p.text.length)!==p.text)))throw Error('赠品文案需从模板字形声明name/value分段，不能凭空添加营销文案');
 if(gifts.some(g=>g.value)&&!parts.some(p=>p.token==='value'))throw Error('赠品有价值字段，模板必须落实该字段');
 const common=(config.emptyRemoveObjectIds||[]).map(get);if(common.some(o=>contains(o,container)||contains(container,o)||priceFields.some(f=>f.objectIds.some(id=>contains(o,get(id))))))throw Error('空赠品附属清理不能删除价格区域');
 const normalized=f=>Array.isArray(f)&&f.length===4&&f.every(Number.isFinite)&&f[0]>=0&&f[1]>=0&&f[2]>0&&f[3]>0&&f[0]+f[2]<=1&&f[1]+f[3]<=1;
 if(!normalized(config.imageFrame)||!normalized(config.textFrame)||!['left','center','right'].includes(config.textAnchor||'center'))throw Error('赠品单元需明确等比图片区域和文案区域（0至1），不能拉伸图片');
 if(config.imageFrame[0]<config.textFrame[0]+config.textFrame[2]&&config.imageFrame[0]+config.imageFrame[2]>config.textFrame[0]&&config.imageFrame[1]<config.textFrame[1]+config.textFrame[3]&&config.imageFrame[1]+config.imageFrame[3]>config.textFrame[1])throw Error('赠品图片与文案区域不能重叠');
 return {mode:'gift-replace',steps:container.steps,objectId:container.id,prototypePath:prototype.nativePath,original:prototype.original,prototypeStyles:prototype.styles,frame:box,axis:config.axis||'horizontal',imageFrame:config.imageFrame,textFrame:config.textFrame,textAnchor:config.textAnchor||'center',unitAlignment:config.unitAlignment||'center',gifts:gifts.map(g=>({...g,spans:parts.map(p=>({text:p.token?g[p.token]:p.text,sourceStart:p.sourceStart}))})),emptyRemoves:gifts.length?[]:common.map(o=>({mode:'remove',steps:o.steps,objectId:o.id,name:o.name,original:o.original})),reference:{field:fields[0].key,cell:fields[0].cell,original:fields[0].value,gifts:gifts.map(g=>({name:g.name,value:g.value,assetName:g.asset.name,fingerprint:g.asset.fingerprint}))}};
}
async function giftVisualReferences(reference,catalog){
 if(!reference)return [];const visuals=[];
 for(const g of reference.gifts){const asset=catalog.assets.find(a=>a.fingerprint===g.fingerprint&&a.name===g.assetName);if(!asset)throw Error('赠品审验参考不属于当前目录');const bytes=await fs.readFile(asset.path);if(hash(bytes)!==asset.fingerprint)throw Error('赠品审验前PNG已变化');let image=require('electron').nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('赠品审验参考无法解码');const b=asset.inkBox;image=image.crop({x:b[0],y:b[1],width:b[2],height:b[3]});const size=image.getSize();if(Math.max(size.width,size.height)>384){const scale=384/Math.max(size.width,size.height);image=image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale))});}visuals.push({name:g.name,value:g.value,fingerprint:g.fingerprint,dataURL:image.toDataURL()});
 }return visuals;
}
module.exports={normalize,parseGifts,matchGifts,scanGiftAssets,giftAction,giftVisualReferences};
