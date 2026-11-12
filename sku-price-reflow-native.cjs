// Runs after text edits and removals. Uses current rendered layer bounds, never text-frame dimensions.
const priceReflowNative=String.raw`
function priceUnion(nodes){var x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(var i=0;i<nodes.length;i++){var v=bounds(nodes[i]);x=Math.min(x,v[0]);y=Math.min(y,v[1]);r=Math.max(r,v[0]+v[2]);b=Math.max(b,v[1]+v[3]);}return [x,y,r-x,b-y];}
function pricePrepare(d,a){var items=[],symbols=[];for(var i=0;i<a.items.length;i++){var ns=[];for(var j=0;j<a.items[i].paths.length;j++)ns.push(tplLocate(d,a.items[i].paths[j]));items.push({field:a.items[i].field,nodes:ns});}for(var i=0;i<a.separators.length;i++){var s=a.separators[i];symbols.push({layer:tplLocate(d,s.path),left:s.leftField,right:s.rightField});}return {items:items,symbols:symbols,axis:a.axis,envelope:a.envelope};}
function priceTranslate(nodes,dx,dy){for(var i=0;i<nodes.length;i++){var access=tplParents(nodes[i]),locks=unlock({layers:[nodes[i]]});try{if(dx!==0||dy!==0)nodes[i].translate(UnitValue(dx,'px'),UnitValue(dy,'px'));}finally{relock(locks);tplRestoreParents(access);}}}
function priceReflow(p){if(!p.items.length)return;var axis=p.axis==='vertical'?1:0,size=axis+2,env=p.envelope,items=p.items.slice(),total=0,boxes=[];
 items.sort(function(a,b){return priceUnion(a.nodes)[axis]-priceUnion(b.nodes)[axis];});for(var i=0;i<items.length;i++){var b=priceUnion(items[i].nodes);boxes.push(b);total+=b[size];}
 var gap=(env[size]-total)/(items.length+1);if(gap<0)throw Error('剩余价格阅读组超出原容器，请调整完整布局，不能压缩或拉伸字形');
 // Validate every relationship and gap before any position write.
 for(var i=0;i<p.symbols.length;i++){var s=p.symbols[i],left=-1,right=-1;for(var j=0;j<items.length;j++){if(items[j].field===s.left)left=j;if(items[j].field===s.right)right=j;}if(left<0||right!==left+1||bounds(s.layer)[size]>=gap)throw Error('有效运算符关系或间距不能安全重排，请明确布局');}
 var at=env[axis]+gap;for(var i=0;i<items.length;i++){var b=priceUnion(items[i].nodes),delta=at-b[axis];priceTranslate(items[i].nodes,axis===0?delta:0,axis===1?delta:0);items[i].box=priceUnion(items[i].nodes);at+=b[size]+gap;}
 for(var i=0;i<p.symbols.length;i++){var s=p.symbols[i],l=null,r=null;for(var j=0;j<items.length;j++){if(items[j].field===s.left)l=items[j].box;if(items[j].field===s.right)r=items[j].box;}var sb=bounds(s.layer),cross=axis===0?1:0,center=(l[axis]+l[size]+r[axis])/2,crossCenter=(l[cross]+l[cross+2]/2+r[cross]+r[cross+2]/2)/2,da=center-sb[axis]-sb[size]/2,dc=crossCenter-sb[cross]-sb[cross+2]/2;priceTranslate([s.layer],axis===0?da:dc,axis===1?da:dc);}
 for(var i=0;i<items.length;i++){var b=priceUnion(items[i].nodes);if(b[axis]<env[axis]-.5||b[axis]+b[size]>env[axis]+env[size]+.5)throw Error('价格重排越出阅读容器');}
}
`;
module.exports={priceReflowNative};
