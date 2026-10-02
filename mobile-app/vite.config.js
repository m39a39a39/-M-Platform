import {defineConfig} from 'vite';
import {resolve} from 'node:path';
const portalPages={name:'portal-pages',enforce:'post',generateBundle(_,bundle){
 const main=bundle['index.html'],studio=bundle['studio.html'];
 for(const [file,title,source] of [['customer.html','M Platform | بوابة العميل',main],['supplier.html','M Platform | بوابة المورد',main],['admin.html','M Platform | الإدارة',studio]]){
  this.emitFile({type:'asset',fileName:file,source:String(source.source).replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>')});
 }
}};
export default defineConfig({plugins:[portalPages],build:{rollupOptions:{input:{main:resolve(import.meta.dirname,'index.html'),studio:resolve(import.meta.dirname,'studio.html')}}}});
