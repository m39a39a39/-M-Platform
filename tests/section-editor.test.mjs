import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sectionDefaults} from '../shared/section-layout.mjs';
const source=readFileSync(new URL('../mobile-app/public/studio/advanced.js',import.meta.url),'utf8');
function editor(){
 const context=vm.createContext({types:{categories:['تصنيفات','grid'],text:['نص','text'],banners:['إعلانات','image'],hero:['بنر رئيسي','image'],products:['منتجات','box']},document:{addEventListener(){}},window:{MStorefront:{sectionDefaults}},state:{draft:{categories:[],collections:[],products:[],sections:[{type:'catalog'}]}},esc:String,icon:()=>'',field:(label,name,value,type,attrs)=>`<input aria-label="${label}" ${attrs||''}>`,btn:()=>'',modal:(title,html)=>{context.dialog=html;}});
 vm.runInContext(source.slice(0,source.indexOf("document.addEventListener('change'")),context);return context;
}
test('image-only inspector has relevant controls without text, text color or ineffective spacing controls',()=>{
 const c=editor(),html=c.sectionSettings({id:'banner',type:'imageBanner',buttonTarget:'link',href:'/products'});
 assert.match(html,/وجهة النقر/);assert.match(html,/section-image/);assert.match(html,/data-section-field="href"/);
 for(const key of ['title','subtitle','button','textColor','gap','titleSize','align'])assert.ok(!html.includes(`data-section-field="${key}"`),key);
 assert.doesNotMatch(html,/اختيار المنتجات/);
});
test('list layouts omit column settings while grid layouts expose them',()=>{
 const c=editor();assert.doesNotMatch(c.sectionSettings({id:'p',type:'products',layout:'list'}),/data-section-field="columns"/);
 assert.match(c.sectionSettings({id:'p',type:'products',layout:'grid'}),/data-section-field="columns"/);
});
test('section library groups types and disables the existing singleton',()=>{
 const c=editor();c.addSection();assert.match(c.dialog,/الصور والعروض/);assert.match(c.dialog,/المنتجات والتصفح/);assert.match(c.dialog,/data-type="catalog" disabled/);
 assert.equal((c.dialog.match(/data-type="imageBanner"/g)||[]).length,1);
});
