import { mkdir, copyFile, readdir, appendFile, readFile } from 'node:fs/promises';
const groups = {'customer-web':['customer.html','register-customer.html'], 'supplier-web':['supplier.html','register-supplier.html'], 'admin-dashboard':['admin.html'], 'shared/pages':['index.html','offers.html','login.html']};
await mkdir('dist/assets/js', {recursive:true});
await mkdir('dist/assets/css', {recursive:true});
for (const [dir, files] of Object.entries(groups)) for (const f of files) await copyFile(`${dir}/${f}`,`dist/${f}`);
for (const dir of ['shared/js','customer-web','supplier-web','admin-dashboard']) for (const f of await readdir(dir)) if(f.endsWith('.js')) await copyFile(`${dir}/${f}`,`dist/assets/js/${f}`);
await copyFile('shared/css/styles.css','dist/assets/css/styles.css');
await appendFile('dist/assets/css/styles.css','\n'+await readFile('admin-dashboard/admin.css','utf8'));
console.log('Built three interfaces and shared assets. API stays server-side.');
