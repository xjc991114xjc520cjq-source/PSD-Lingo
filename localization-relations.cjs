// Geometry is expressed in Illustrator document coordinates: left, top, right, bottom.
const width=b=>b[2]-b[0],height=b=>b[1]-b[3],cx=b=>(b[0]+b[2])/2,cy=b=>(b[1]+b[3])/2;
function valid(b){return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&width(b)>0&&height(b)>0;}
function union(boxes){if(!boxes.length||boxes.some(b=>!valid(b)))throw Error('无法测量排版关系');return [Math.min(...boxes.map(b=>b[0])),Math.max(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.min(...boxes.map(b=>b[3]))];}
function centeredPair(container,label,value,{gap=6,padding=8}={}){
 if(!valid(container)||!valid(label)||!valid(value)||!Number.isFinite(gap)||gap<0)throw Error('价格排版范围无效');
 const available=width(container)-padding*2,combined=width(label)+width(value)+gap;
 const scale=Math.min(1,available/combined,(height(container)-padding*2)/Math.max(height(label),height(value)));
 if(scale<=0)throw Error('价格容器没有可用区域');const total=(width(label)+width(value))*scale+gap*scale,left=cx(container)-total/2,center=cy(container);
 return {scale,label:[left,center+height(label)*scale/2],value:[left+width(label)*scale+gap*scale,center+height(value)*scale/2],gap:gap*scale};
}
function separatorBetween(left,right,line){
 const a=union(left),b=union(right);if(!valid(line)||a[2]>=b[0])throw Error('分割线两侧文字发生重叠');
 return {center:[(a[2]+b[0])/2,(cy(a)+cy(b))/2],height:height(line)};
}
function markerBefore(firstLine,marker,gap){if(!valid(firstLine)||!valid(marker)||!Number.isFinite(gap)||gap<0)throw Error('圆点关系无效');return [firstLine[0]-gap-width(marker),cy(firstLine)+height(marker)/2];}
function minimumGap(upper,lower,gap){if(!valid(upper)||!valid(lower)||gap<0||!Number.isFinite(gap))throw Error('标识留白无效');return {dy:Math.min(0,upper[3]-gap-lower[1])};}
function relationChecks({priceGroups=[],separators=[],markers=[],clearances=[]},tolerance=.5){
 const issues=[];for(const p of priceGroups){const b=union(p.parts);if(Math.abs(cx(b)-cx(p.container))>tolerance||Math.abs(cy(b)-cy(p.container))>tolerance)issues.push({type:'price-center',id:p.id});if(p.label[2]>p.value[0]||p.value[0]-p.label[2]>Math.max(12,height(p.label)))issues.push({type:'price-gap',id:p.id});}
 for(const s of separators){const target=separatorBetween(s.left,s.right,s.line);if(Math.abs(cx(s.line)-target.center[0])>tolerance||Math.abs(cy(s.line)-target.center[1])>tolerance)issues.push({type:'separator-center',id:s.id});}
 for(const m of markers){if(m.marker[2]>m.firstLine[0]||(m.gap!==undefined&&Math.abs(m.firstLine[0]-m.marker[2]-m.gap)>tolerance)||Math.abs(cy(m.marker)-cy(m.firstLine))>tolerance)issues.push({type:'marker-anchor',id:m.id});}
 for(const c of clearances)if(c.upper[3]-c.lower[1]<c.gap-tolerance||(c.bottom!==undefined&&c.lower[3]<c.bottom-tolerance))issues.push({type:'logo-clearance',id:c.id});return issues;
}
module.exports={width,height,cx,cy,valid,union,centeredPair,separatorBetween,markerBefore,minimumGap,relationChecks};
