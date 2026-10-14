import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sectionDefaults} from '../shared/section-layout.mjs';
const source=readFileSync(new URL('../mobile-app/public/studio/advanced.js',import.meta.url),'utf8');
function editor(){
 const context=vm.createContext({types:{categories:['تصنيفات','grid'],text:['نص','text'],banners:['إعلانات','image'],hero:['بنر رئيسي','image'],products:['منتجات','box']},document:{addEventListener(){}},window:{MStorefront:{sectionDefaults}},state:{draft:{categories:[],collections:[],products:[],sections:[{type:'catalog'}]}},esc:String,icon:()=>'',field:(label,name,value,type,attrs)=>`<input aria-label="${label}" ${attrs||''}>`,btn:()=>'',modal:(title,html)=>{context.dialog=html;}});
 vm.runInContext(readFileSync(new URL('../mobile-app/public/studio/storefront-controls.js',import.meta.url),'utf8').split("document.addEventListener('change'")[0],context);
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
test('category source reveals main categories and then only their own subcategories',()=>{
 const c=editor();c.state.draft.categories=[
  {id:'audio',name:'الصوت والسماعات',active:true},
  {id:'power',name:'الشواحن',active:true},
  {id:'headsets',name:'السماعات اللاسلكية',parent:'audio',active:true},
  {id:'wired',name:'السماعات السلكية',parent:'audio',active:true},
  {id:'chargers',name:'شواحن الحائط',parent:'power',active:true}
 ];
 const empty=c.sectionSettings({id:'p',type:'products',productSource:'category'});
 assert.match(empty,/التصنيف الرئيسي/);
 assert.doesNotMatch(empty,/data-section-field="subcategoryId"|value="headsets"/);
 const chosen=c.sectionSettings({id:'p',type:'products',productSource:'category',categoryId:'audio',subcategoryId:'headsets'});
 assert.match(chosen,/data-section-field="subcategoryId"/);
 assert.match(chosen,/جميع المنتجات/);
 assert.match(chosen,/value="headsets"/);
 assert.match(chosen,/value="wired"/);
 assert.doesNotMatch(chosen,/value="chargers"/);
});
test('section library groups types and disables the existing singleton',()=>{
 const c=editor();c.addSection();assert.match(c.dialog,/الصور والعروض/);assert.match(c.dialog,/المنتجات والتصفح/);assert.match(c.dialog,/data-type="catalog" disabled/);
 assert.equal((c.dialog.match(/data-type="imageBanner"/g)||[]).length,1);
});
