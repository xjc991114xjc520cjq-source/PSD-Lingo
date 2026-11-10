// Select values are not durable: a custom option may have changed while a
// different language was open. Recreate the option before restoring its value.
export function restoreReplacementZoom(select,value,createOption=()=>document.createElement('option')){
  const number=Number(value),zoom=Number.isFinite(number)&&number>0?number:1,text=String(zoom);
  if(!Array.from(select.options).some(option=>option.value===text)){
    const option=createOption();option.value=text;option.textContent='恢复缩放';select.append(option);
  }
  select.value=text;return zoom;
}
export function replacementScale(width,viewportWidth,zoom){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(viewportWidth)||viewportWidth<=32)return null;
  const value=Number(zoom),multiplier=Number.isFinite(value)&&value>0?value:1;
  return Math.min((viewportWidth-32)/width,1)*multiplier;
}
