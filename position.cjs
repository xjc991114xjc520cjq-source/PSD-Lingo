function targetBox(box, position) {
  return position ? [position.x,position.y,box[2],box[3]] : [...box];
}
function clampPosition(box, position, width, height) {
  return {x:Math.round(Math.max(0,Math.min(Math.max(0,width-box[2]),position.x))*10)/10,
    y:Math.round(Math.max(0,Math.min(Math.max(0,height-box[3]),position.y))*10)/10};
}
module.exports={targetBox,clampPosition};
