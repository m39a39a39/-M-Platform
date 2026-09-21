import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

let count=0;
async function walk(dir){
  for(const ent of await readdir(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())await walk(p);
    else if(/\.(mjs|js)$/.test(p)){
      const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
      if(r.status)throw Error(p+'\n'+r.stderr);
      count++;
    }
  }
}
for(const dir of ['backend','api','scripts'])await walk(dir);
console.log(`Checked ${count} server/build JavaScript modules.`);
