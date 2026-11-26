const fs=require('node:fs/promises');
async function main(){if(process.platform!=='darwin')throw Error('Mac update preparation requires macOS signature verification');if(!process.argv[2])throw Error('Specify an options JSON file; keep privateKeyPath outside the repository');const options=JSON.parse(await fs.readFile(process.argv[2],'utf8'));console.log(JSON.stringify(await require('../services/macos-release-publisher.cjs').prepareMacRelease(options)));}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
