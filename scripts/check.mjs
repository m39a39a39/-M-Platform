import {readdir,readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
let count=0;
async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await walk(p);else if(/\.(mjs|js)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status)throw Error(p+'\n'+r.stderr);count++;}}}
for(const dir of ['backend','api','shared','customer-web','supplier-web','admin-dashboard','scripts'])await walk(dir);
for(const f of await readdir('dist'))if(f.endsWith('.html')){
 const text=await readFile('dist/'+f,'utf8');
 for(const m of text.matchAll(/(?:src|href)="([^"#?:]+)(?:[?#][^"]*)?"/g))if(!m[1].startsWith('http'))await access(path.resolve('dist',m[1]));
 if(/data-demo-login|admin123|admin@m.demo/.test(text))throw Error('Demo login leaked');
}
console.log(`Checked ${count} JavaScript modules and local page references.`);
