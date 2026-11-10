// Shared contract for reversible workspace edits and native copy-only writes.
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0;
const inside=(b,a)=>validBox(b)&&validBox(a)&&b[0]>=a[0]-.01&&b[1]>=a[1]-.01&&b[0]+b[2]<=a[0]+a[2]+.01&&b[1]+b[3]<=a[1]+a[3]+.01;
function textActionsFor(file){return (file.layers||[]).filter(l=>!l.nativeCreation&&['hidden','clear'].includes(l.nativeDisposition)).map(l=>({layerId:l.id,mode:l.nativeDisposition,original:l.original,font:l.font,size:l.size,box:l.sourceBox||l.box,reason:l.presenceReason}));}
function validateTextActions(actions=[],{layers,jobs=[]}={}){
 if(!Array.isArray(actions)||actions.length>500)throw Error('文字对象处理列表无效');
 const seen=new Set();for(const a of actions){if(!a||!Number.isInteger(a.layerId)||a.layerId<=0||seen.has(a.layerId)||!['hidden','clear'].includes(a.mode)||typeof a.original!=='string'||typeof a.font!=='string'||!Number.isFinite(a.size)||!validBox(a.box)||typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>2000||jobs.some(j=>j.layerId===a.layerId))throw Error('文字对象处理参数无效或与改字冲突');seen.add(a.layerId);
  if(layers){const l=layers.find(l=>l.id===a.layerId);if(!l?.supported||l.original!==a.original||l.font!==a.font||l.size!==a.size||JSON.stringify(l.box)!==JSON.stringify(a.box))throw Error('文字对象来源已变化或不支持，请重新导入');}}
 return actions;
}
function validateCreation(job,{width,height,layers,artworkObjects=[],artboards}={}){
 const c=job.nativeCreation;if(!c)return;
 if(!Number.isInteger(job.layerId)||job.layerId>=0||job.original!==''||!c||Object.keys(c).some(k=>!['color','boardBox','boardName'].includes(k))||!/^#[\da-f]{6}$/i.test(c.color)||(typeof job.target==='string'&&!job.previewLayout)||!inside(job.box,c.boardBox)||typeof c.boardName!=='string'||!c.boardName)throw Error('新增文字身份、颜色或画板无效');
 if(width!==undefined&&(!inside(c.boardBox,[0,0,width,height])||!inside(job.previewLayout?.box||job.box,c.boardBox)))throw Error('新增文字超出指定画板');
 if(layers){const boards=[...layers,...artworkObjects];const known=boards.some(l=>l.boardNames?.length===1&&l.boardNames[0]===c.boardName&&JSON.stringify(l.boardBox)===JSON.stringify(c.boardBox));if(!known&&!(artboards===1&&JSON.stringify(c.boardBox)===JSON.stringify([0,0,width,height])))throw Error('新增文字的画板未经原稿验证');}
}
function createTextLayer(file,args,records){
 if(!['AI','PSD','PSB'].includes(file.format)||typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000)throw Error('新增文字需要真实原稿及依据');
 if(!Array.isArray(args.recordIds)||!args.recordIds.length||args.recordIds.length>100||new Set(args.recordIds).size!==args.recordIds.length||args.recordIds.some(id=>!records.some(r=>r.id===id)))throw Error('新增文字必须引用已导入的批准文案');
 if(!['\n',' ',''].includes(args.separator??'\n'))throw Error('文案分隔符无效');
 const style=args.style;if(!style||typeof style.font!=='string'||!style.font||style.font.length>200||!Number.isFinite(style.size)||style.size<1||style.size>2000||!['left','center','right'].includes(style.alignment)||!/^#[\da-f]{6}$/i.test(style.color||''))throw Error('请指定已安装字体、字号、颜色和对齐方式');
 const board=file.format==='AI'?[...(file.layers||[]),...(file.artworkObjects||[])].find(l=>l.boardNames?.length===1&&l.boardNames[0]===args.boardName&&validBox(l.boardBox)):null;
 const boardBox=board?.boardBox||[0,0,file.width,file.height],boardName=board?.boardNames[0]||(file.format!=='AI'?'画布':null);if(!boardName||!inside(args.box,boardBox))throw Error('新增文字缺少明确画板或超出画板');
 if(file.layers.filter(l=>l.nativeCreation).length>=100)throw Error('单个文件最多新增100个文字对象');
 const target=args.recordIds.map(id=>records.find(r=>r.id===id).target).join(args.separator??'\n'),id=Math.min(0,...file.layers.map(l=>l.id))-1;
 return {id,name:'新增文字 '+(-id),original:'',font:style.font,family:style.family||style.font,fontStyle:'Regular',size:style.size,minSize:style.size*.75,leading:style.size*1.2,tracking:0,aspectScale:1,color:style.color,alignment:style.alignment,box:[...args.box],boardBox:[...boardBox],boardNames:[boardName],recordId:args.recordIds[0],customText:target,copyAdjustment:{text:target,recordIds:[...args.recordIds],reason:args.reason},nativeCreation:{color:style.color,boardBox:[...boardBox],boardName},supported:true,visible:true,issues:[],group:'新增可编辑文字',nativeKind:'point',capitalization:'normal',stackIndex:-1,smart:{allowWrap:true,allowLeading:true,trackingLimit:30}};
}
const photoshopTextObjects=String.raw`
function nativeTextActions(doc,actions){var items=[];for(var i=0;i<actions.length;i++){var a=actions[i],l=findLayer(doc,a.layerId);if(!l||l.typename!=='ArtLayer'||l.kind!==LayerKind.TEXT||String(l.textItem.contents).replace(/\r\n?/g,'\n')!==a.original||l.textItem.font!==a.font)throw Error('文字对象来源已变化：'+a.layerId);items.push(l);}for(var i=0;i<actions.length;i++){if(actions[i].mode==='clear')items[i].remove();else items[i].visible=false;}}
function nativeNewText(doc,job){var l=doc.artLayers.add();doc.activeLayer=l;l.kind=LayerKind.TEXT;l.name=job.name;var t=l.textItem;t.kind=TextType.POINTTEXT;t.contents=job.target.replace(/\n/g,'\r');if(job.alignment==='center'){t.justification=Justification.CENTER;}else if(job.alignment==='right'){t.justification=Justification.RIGHT;}else{t.justification=Justification.LEFT;}var c=new SolidColor();c.rgb.hexValue=job.nativeCreation.color.substring(1);t.color=c;return l;}
`;
module.exports={textActionsFor,validateTextActions,validateCreation,createTextLayer,photoshopTextObjects};
