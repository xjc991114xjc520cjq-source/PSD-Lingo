const path=require('node:path');
// Conservative on POSIX: case-sensitive APFS may contain two distinct files.
// Fingerprints remain the authority for restoring or writing any source.
function fileKey(value,platform=process.platform){
 const p=platform==='win32'?path.win32:path.posix;
 const resolved=p.resolve(value);return platform==='win32'?resolved.toLowerCase():resolved;
}
module.exports={fileKey};
