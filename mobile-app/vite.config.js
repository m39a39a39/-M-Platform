import {defineConfig} from 'vite';
import {resolve} from 'node:path';
const adminAlias={name:'admin-alias',enforce:'post',generateBundle(_,bundle){
 const studio=bundle['studio.html'];
 if(!studio)throw new Error('Admin studio HTML not generated');
 this.emitFile({type:'asset',fileName:'admin.html',source:String(studio.source).replace(/<title>[^<]*<\/title>/,'<title>IMSG | الإدارة</title>')});
}};
export default defineConfig({plugins:[adminAlias],build:{rollupOptions:{input:{
 main:resolve(import.meta.dirname,'index.html'),
 studio:resolve(import.meta.dirname,'studio.html'),
 reset:resolve(import.meta.dirname,'reset-password.html')
}}}});
