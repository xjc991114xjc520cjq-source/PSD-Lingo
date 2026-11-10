const fs=require('node:fs/promises'),path=require('node:path');
const {prepareRelease}=require('../../services/release-publisher.cjs');
(async()=>{const input=process.argv[2];if(!input)throw new Error('用法：node server/tools/prepare-release.cjs 发布配置.json（字段见 release-options.example.json）');const options=JSON.parse(await fs.readFile(path.resolve(input),'utf8'));console.log(JSON.stringify(await prepareRelease(options),null,2));})().catch(e=>{console.error(e.message);process.exitCode=1;});
