// Conservative reconstruction of flat rectangles only. Never inpaint or infer
// hidden texture: a uniform surrounding backdrop is required for cleanup.
function detectRasterContainers({data,width,height,offsetX=0,offsetY=0,scale=1,exclude=[]}){
 const distance=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
 const hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>5000000||!data||data.length!==width*height*4||!(scale>0))throw Error('容器识别图像尺寸无效');
 const n=width*height,labels=new Int32Array(n),queue=new Uint32Array(n),shapes=[];let label=0,rejected=0;
 const rgb=p=>[data[p*4],data[p*4+1],data[p*4+2]];
 const bucket=p=>data[p*4+3]<250?-1:((data[p*4]>>3)<<10)|((data[p*4+1]>>3)<<5)|(data[p*4+2]>>3);
 for(let start=0;start<n;start++){
  if(labels[start])continue;const key=bucket(start),id=++label;let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=start;labels[start]=id;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(q>=0&&!labels[q]&&bucket(q)===key){labels[q]=id;queue[tail++]=q;}
  }
  const w=x1-x0+1,h=y1-y0+1;if(key<0||w<16||h<12||tail<120||tail/(w*h)<.65||x0<3||y0<3||x1>width-4||y1>height-4||w*h>n*.85)continue;
  if(x0<9||y0<9||x1>width-10||y1>height-10)continue;
  const box=[offsetX+x0/scale,offsetY+y0/scale,w/scale,h/scale];
  if(exclude.some(b=>b.every((v,i)=>Math.abs(v-box[i])<3/scale)))continue;
  const center=(Math.floor((y0+y1)/2)*width+Math.floor((x0+x1)/2));if(labels[center]!==id)continue;
  const fill=rgb(center),samples=[];for(const pad of [2,8]){for(let x=x0-pad;x<=x1+pad;x++)samples.push((y0-pad)*width+x,(y1+pad)*width+x);for(let y=y0;y<=y1;y++)samples.push(y*width+x0-pad,y*width+x1+pad);}
  const background=rgb(samples[0]);if(distance(fill,background)<20||samples.some(p=>data[p*4+3]<250||distance(rgb(p),background)>8)){rejected++;continue;}
  function cornerRadius(right,bottom){const rows=[0,1,2,4,7,11,17,25].filter(y=>y<h/2),cuts=rows.map(y=>{let x=0;const py=bottom?y1-y:y0+y;while(x<w/2&&labels[py*width+(right?x1-x:x0+x)]!==id)x++;return x;});let best=0,error=Infinity;const limit=Math.min(w,h)/2;
   for(let r=0;r<=limit;r+=Math.max(.5,limit/256)){let e=0;for(let i=0;i<rows.length;i++){const y=rows[i]+.5,cut=y<r?r-Math.sqrt(Math.max(0,r*r-(r-y)*(r-y))):0;e+=Math.abs(cuts[i]-cut);}if(e<error){error=e;best=r;}}
   return Math.round(best*2)/2;
  }
  const radii=[cornerRadius(false,false),cornerRadius(true,false),cornerRadius(true,true),cornerRadius(false,true)];if(Math.max(...radii)-Math.min(...radii)<2){const r=Math.round(radii.reduce((a,b)=>a+b)/4*2)/2;radii.fill(r);}
  let mismatch=0,total=0;const step=Math.max(1,Math.floor(Math.sqrt(w*h/200000)));
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const right=x+.5>w/2,bottom=y+.5>h/2,r=radii[bottom?(right?2:3):(right?1:0)],dx=right?w-x-.5:x+.5,dy=bottom?h-y-.5:y+.5,inside=dx>=r||dy>=r||(dx-r)**2+(dy-r)**2<=r*r,p=(y+y0)*width+x+x0;total++;if(distance(rgb(p),inside?fill:background)>10||data[p*4+3]<250)mismatch++;}
  if(mismatch/total>.009){rejected++;continue;}
  shapes.push({box,radii:radii.map(r=>r/scale),fill:hex(fill),background:hex(background),confidence:1-mismatch/total});
 }
 return {shapes,rejected};
}
const detectorWorkerSource='const detectRasterContainers='+detectRasterContainers.toString()+';onmessage=e=>{try{postMessage({result:detectRasterContainers(e.data)})}catch(error){postMessage({error:error.message})}};';
module.exports={detectRasterContainers,detectorWorkerSource};
