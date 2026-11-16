const {app,nativeImage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out='D:/PSD-Lingo/work/large-reference-'+Date.now();
app.whenReady().then(async()=>{let code=0;try{
 await fs.mkdir(out,{recursive:true});const png=nativeImage.createFromBitmap(Buffer.from([80,100,120,255]),{width:1,height:1}).toPNG(),large=Buffer.concat([png,Buffer.alloc(33*1024**2)]),file=path.join(out,'赠品.png');await fs.writeFile(file,large);
 const helper=require('../services/reference-image.cjs'),fromBytes=helper.referenceImage(large,'png'),fromPath=await helper.readReferenceImage(file,'png');for(const r of [fromBytes,fromPath]){assert.equal(r.previewResized,true);assert.equal(r.sourceBytes,large.length);assert.ok(r.previewBytes<1024**2);assert.ok(!nativeImage.createFromDataURL(r.images[0]).isEmpty());}
 const catalog=await require('../sku-gifts.cjs').scanGiftAssets(out);assert.equal(catalog.assets.length,1);assert.deepEqual(catalog.assets[0].inkBox,[0,0,1,1]);assert.equal((await fs.stat(file)).size,large.length);
 await fs.writeFile(path.join(out,'verified.json'),JSON.stringify({passed:true,referenceAbove8MiB:true,giftAbove32MiB:true,originalUntouched:true,compactModelPreview:true,adobeUsed:false},null,2));console.log('PASS large image and gift source with compact model preview; '+out);
 }catch(e){console.error(e.stack);code=1;}finally{app.exit(code);}});
