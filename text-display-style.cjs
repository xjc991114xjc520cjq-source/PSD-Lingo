// Display shaping must not mutate approved copy or its paragraph identity.
function displayText(text,capitalization){
 const value=String(text??'');
 return capitalization==='all-caps'?value.toUpperCase():value;
}
module.exports={displayText};
