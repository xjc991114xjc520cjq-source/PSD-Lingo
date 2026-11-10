// A live rectangle is identified by Photoshop origin metadata, never by its name
// or by visually similar Bezier control points. Order: TL, TR, BR, BL.
const cornerKeys=['topLeft','topRight','bottomRight','bottomLeft'];
function scalar(v){return typeof v==='number'?v:v&&typeof v.value==='number'?v.value:NaN;}
function normalizeRadii(radii,box){
 if(!Array.isArray(radii)||radii.length!==4||radii.some(v=>!Number.isFinite(v)||v<0||v>300000))throw new Error('矩形四角圆角参数无效');
 if(!Array.isArray(box)||box.length!==4||!Number.isFinite(box[2])||!Number.isFinite(box[3])||box[2]<=0||box[3]<=0)throw new Error('矩形尺寸无效');
 const [a,b,c,d]=radii,w=box[2],h=box[3],ratio=Math.min(1,w/(a+b||1),w/(d+c||1),h/(a+d||1),h/(b+c||1));
 return radii.map(r=>r*ratio);
}
function getRectangleGeometry(layer){
 const items=layer.vectorOrigination?.keyDescriptorList||layer.containerShape?.keyDescriptorList;
 if(!Array.isArray(items)||items.length!==1)return null;
 const item=items[0];if(scalar(item.keyOriginType)!==1||item.keyShapeInvalidated)return null;
 const b=item.keyOriginShapeBoundingBox||item.keyOriginShapeBBox;
 if(!b)return null;
 const left=scalar(b.left??b.Left),top=scalar(b.top??b['Top ']),right=scalar(b.right??b.Rght),bottom=scalar(b.bottom??b.Btom),box=[left,top,right-left,bottom-top];
 if(box.some(v=>!Number.isFinite(v))||box[2]<=0||box[3]<=0)return null;
 // Rotated/skewed rectangles cannot be edited with an axis-aligned box.
 const tr=item.transform||item.keyOriginTransform||item.Trnf;
 if(tr){const a=Array.isArray(tr)?tr:[tr.xx,tr.xy,tr.yx,tr.yy,tr.tx,tr.ty];if(a.length!==6||a.some(v=>!Number.isFinite(scalar(v)))||Math.abs(scalar(a[0])-1)>1e-7||Math.abs(scalar(a[3])-1)>1e-7||[1,2,4,5].some(i=>Math.abs(scalar(a[i]))>1e-7))return null;}
 const source=item.keyOriginRRectRadii;
 const radii=source?cornerKeys.map(k=>scalar(source[k])):[0,0,0,0];
 if(radii.some(v=>!Number.isFinite(v)||v<0))return null;
 return {shapeType:'rectangle',shapeBox:box,radii:normalizeRadii(radii,box)};
}
module.exports={normalizeRadii,getRectangleGeometry,cornerKeys};
