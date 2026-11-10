const nativeContainers=String.raw`
function plainRectangle(p){
 if(!p.closed||p.clipping||p.guides||p.hidden||p.locked||p.pathPoints.length!==4||!p.filled||p.stroked)return false;
 if(p.fillColor.typename!=='RGBColor'&&p.fillColor.typename!=='CMYKColor'&&p.fillColor.typename!=='GrayColor')return false;
 var parent=p.parent;while(parent&&parent.typename!=='Document'){if(parent.hidden||parent.visible===false||parent.locked||parent.clipped||parent.typename==='CompoundPathItem')return false;parent=parent.parent;}
 var b=p.geometricBounds,corners={};for(var k=0;k<4;k++){var q=p.pathPoints[k],a=q.anchor;if(Math.abs(a[0]-q.leftDirection[0])>.01||Math.abs(a[1]-q.leftDirection[1])>.01||Math.abs(a[0]-q.rightDirection[0])>.01||Math.abs(a[1]-q.rightDirection[1])>.01)return false;var x=-1,y=-1;if(Math.abs(a[0]-b[0])<0.01)x=0;else if(Math.abs(a[0]-b[2])<0.01)x=1;if(Math.abs(a[1]-b[1])<0.01)y=0;else if(Math.abs(a[1]-b[3])<0.01)y=1;if(x<0||y<0||corners[x+':'+y])return false;corners[x+':'+y]=true;}return true;
}
function aiContainers(d,r){var out=[];for(var i=0;i<d.pathItems.length;i++){var p=d.pathItems[i];if(!plainRectangle(p))continue;var b=p.geometricBounds;out.push({id:1000000+i,name:p.name||'AI 矩形 '+(i+1),kind:'shape',shapeType:'rectangle',radii:[0,0,0,0],box:[b[0]-r[0],r[1]-b[1],b[2]-b[0],b[1]-b[3]],issues:[],supported:true,parentId:null,nativeKind:'ai-rectangle',boardNames:boardNames(d,b)});}return out;}
function applyAiContainers(d,r,edits){
 for(var i=0;i<(edits||[]).length;i++){var e=edits[i],p=d.pathItems[e.layerId-1000000];if(!p||!plainRectangle(p))throw Error('AI 容器已变化或不是独立纯色直角矩形：'+e.layerId);var b=p.geometricBounds,source=[b[0]-r[0],r[1]-b[1],b[2]-b[0],b[1]-b[3]];
  for(var k=0;k<4;k++){if(Math.abs(source[k]-e.sourceBox[k])>.01)throw Error('AI 容器原始范围已变化');if(e.radii&&e.radii[k]!==0)throw Error('AI 直角矩形暂不支持改变圆角');}
  var points=[];for(var k=0;k<4;k++){var a=p.pathPoints[k].anchor,x=Math.abs(a[0]-b[0])<.01?e.box[0]:e.box[0]+e.box[2],y=Math.abs(a[1]-b[1])<.01?e.box[1]:e.box[1]+e.box[3];points.push([r[0]+x,r[1]-y]);}p.setEntirePath(points);
  var actual=p.geometricBounds,expected=[r[0]+e.box[0],r[1]-e.box[1],r[0]+e.box[0]+e.box[2],r[1]-e.box[1]-e.box[3]];for(var k=0;k<4;k++)if(Math.abs(actual[k]-expected[k])>.02)throw Error('AI 容器结果不符合预览');
 }
}
`;
function assertContainerKinds(file){
 if(file.extractedContainers?.length)throw Error('AI 暂不支持 Photoshop 容器提取／拆分');
 for(const e of file.containerEdits||[]){if(!Number.isInteger(e.layerId)||e.layerId<1000000||e.radii?.some(n=>n!==0)||e.sourceRadii?.some(n=>n!==0))throw Error('AI 仅支持独立纯色直角矩形容器；保留其他配图');}
}
module.exports={nativeContainers,assertContainerKinds};
