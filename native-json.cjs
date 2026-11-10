'use strict';
const jsonNative=String.raw`
function enc(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string'){var s='"',slash=String.fromCharCode(92);for(var i=0;i<v.length;i++){var c=v.charCodeAt(i);s+=(c<32||c===34||c===92||c===8232||c===8233)?slash+'u'+('0000'+c.toString(16)).slice(-4):v.charAt(i);}return s+'"';}if(typeof v==='number')return isFinite(v)?String(v):'null';if(typeof v==='boolean')return String(v);var a=[],k;if(Object.prototype.toString.call(v)==='[object Array]'){for(k=0;k<v.length;k++)a.push(enc(v[k]));return '['+a.join(',')+']';}for(k in v)if(v.hasOwnProperty(k)&&typeof v[k]!=='undefined')a.push(enc(k)+':'+enc(v[k]));return '{'+a.join(',')+'}';}
`;
module.exports={jsonNative};
