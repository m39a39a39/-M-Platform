import { rm, cp } from 'node:fs/promises';
// Single web source of truth: production web is built from the same mobile-app UI.
import { spawn } from 'node:child_process';

const run=(command,args,cwd='.')=>new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
});

await run('npm',['ci'],'mobile-app');
await run('npm',['run','build'],'mobile-app');
await rm('dist',{recursive:true,force:true});
await cp('mobile-app/dist','dist',{recursive:true});
console.log('Built the unified M Platform interface from mobile-app into dist/.');
