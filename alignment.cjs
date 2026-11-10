function union(boxes){if(!boxes.length)return [0,0,0,0];const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));return [x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x,Math.max(...boxes.map(b=>b[1]+b[3]))-y];}
function alignmentOffsets(boxes,mode,target){
 const axis=['left','centerX','right','gapX','distributeX'].includes(mode)?0:1,size=axis+2;
 const supported=['left','centerX','right','top','centerY','bottom','gapX','gapY','distributeX','distributeY'];if(!supported.includes(mode))throw new Error('未知对齐方式');
 if(mode.startsWith('gap')||mode.startsWith('distribute')){if(boxes.length<3)throw new Error('分布至少需要选择三个文字');const order=boxes.map((b,i)=>({b,i})).sort((a,b)=>mode.startsWith('gap')?a.b[axis]-b.b[axis]:a.b[axis]+a.b[size]/2-b.b[axis]-b.b[size]/2),result=boxes.map(()=>[0,0]);
 const first=order[0].b,last=order.at(-1).b;
 if(mode.startsWith('gap')){const gap=(last[axis]+last[size]-first[axis]-boxes.reduce((sum,b)=>sum+b[size],0))/(boxes.length-1);if(gap<0)throw new Error('可用距离不足以无重叠等间距排列');let cursor=first[axis];for(const {b,i} of order){result[i][axis]=cursor-b[axis];cursor+=b[size]+gap;}}
 else {const start=first[axis]+first[size]/2,end=last[axis]+last[size]/2;order.forEach(({b,i},n)=>{result[i][axis]=start+(end-start)*n/(boxes.length-1)-b[axis]-b[size]/2;});}return result;}
 const ref=target||union(boxes),factor=mode==='centerX'||mode==='centerY'?.5:mode==='right'||mode==='bottom'?1:0;
 return boxes.map(b=>{const d=[0,0];d[axis]=ref[axis]+ref[size]*factor-b[axis]-b[size]*factor;return d;});
}
function snapBox(box,refs,threshold,axes=[true,true]){const offsets=[0,0],guides=[];for(let axis=0;axis<2;axis++){if(!axes[axis])continue;const size=axis+2,points=[box[axis],box[axis]+box[size]/2,box[axis]+box[size]];let best=null;for(const ref of refs)for(const value of [ref[axis],ref[axis]+ref[size]/2,ref[axis]+ref[size]])for(const point of points){const delta=value-point;if(Math.abs(delta)<=threshold&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={axis,value,delta};}if(best){offsets[axis]=best.delta;guides.push(best);}}return {offsets,guides};}
module.exports={union,alignmentOffsets,snapBox};
