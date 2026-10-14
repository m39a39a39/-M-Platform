import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultStore,selectSectionProducts} from '../shared/storefront-model.mjs';
import {normalizeStore} from '../backend/modules/studio.mjs';
import {upgradeStore} from '../backend/modules/storefront-upgrade.mjs';
import {renderStorefront} from '../mobile-app/src/storefront.js';
const products=[{id:'a',status:'published',categoryId:'c',createdAt:'2026-01-01',translation:{titleAr:'منتج',titleEn:'Product'},unitPrice:4},{id:'b',status:'published',categoryId:'d',createdAt:'2026-02-01',translation:{titleAr:'آخر',titleEn:'Other'},unitPrice:5},{id:'secret',status:'review'}];
test('section removal persists without reintroducing builtins, including an empty homepage',()=>{
 const input={...defaultStore(),sections:[]},output=normalizeStore(input);assert.deepEqual(output.sections.filter(s=>s.page==='home'),[]);assert.deepEqual(upgradeStore(output).sections,output.sections);
 const html=renderStorefront({settings:{storefront:output},publicOffers:products},'web',{language:'en'});assert.doesNotMatch(html,/store-catalog|sf-footer|sf-custom-hero/);
});
test('one renderer respects order, visibility, language and independent section content',()=>{
 const store=defaultStore();store.sections=[{id:'second',type:'text',title:'ثاني',titleEn:'Second',visible:true,channel:'both'},{id:'first',type:'text',title:'أول',titleEn:'First',visible:true,channel:'both'},{id:'hidden',type:'text',title:'SECRET',visible:false,channel:'both'}];
 const output=normalizeStore(store),state={settings:{storefront:output},publicOffers:products};
 for(const [language,dir,label] of [['en','ltr','Second'],['ar','rtl','ثاني']]){const html=renderStorefront(state,'web',{language});assert.match(html,new RegExp(`dir="${dir}"`));assert.ok(html.includes(label));assert.ok(html.indexOf('data-layout-section="second"')<html.indexOf('data-layout-section="first"'));assert.doesNotMatch(html,/SECRET|store-catalog/);}
});
test('product sources filter unpublished products and preserve manual order',()=>{
 const ids=s=>selectSectionProducts(products,s).map(p=>p.id);
 assert.deepEqual(ids({productSource:'latest'}),['b','a']);assert.deepEqual(ids({productSource:'category',categoryId:'c'}),['a']);assert.deepEqual(ids({productSource:'manual',productIds:['b','secret','a']}),['b','a']);assert.deepEqual(ids({productSource:'featured',productIds:['a']}),['a']);
});
test('main category includes its children, while a selected subcategory isolates its products and opens its route',()=>{
 const scoped=[{id:'a1',categoryId:'c',subcategoryId:'headphones',status:'published',product:'Wireless'},
               {id:'a2',categoryId:'c',subcategoryId:'microphones',status:'published',product:'Mic'},
               {id:'a3',categoryId:'c',status:'published',product:'General'},
               {id:'b1',categoryId:'d',subcategoryId:'headphones',status:'published',product:'Elsewhere'}];
 const ids=s=>selectSectionProducts(scoped,s).map(p=>p.id);
 assert.deepEqual(ids({productSource:'category',categoryId:'c',limit:20}),['a1','a2','a3']);
 assert.deepEqual(ids({productSource:'category',categoryId:'c',subcategoryId:'headphones',limit:20}),['a1']);
 assert.deepEqual(ids({productSource:'category',categoryId:'c',subcategoryId:'microphones',limit:20}),['a2']);
 const store=normalizeStore({...defaultStore(),sections:[{id:'selected',type:'products',title:'السماعات',visible:true,channel:'both',button:'استكشف المنتجات',buttonTarget:'products',productSource:'category',categoryId:'c',subcategoryId:'headphones',limit:10}]});
 assert.equal(store.sections[0].subcategoryId,'headphones');
 const state={settings:{storefront:store,categories:[{id:'c',nameAr:'الصوت والسماعات'}],subcategories:[{id:'headphones',parentId:'c',nameAr:'السماعات اللاسلكية'}]},publicOffers:scoped};
 const html=renderStorefront(state,'web',{language:'ar'});
 assert.match(html,/data-store-product="a1"/);
 assert.doesNotMatch(html,/data-store-product="a2"|data-store-product="a3"|data-store-product="b1"/);
 assert.match(html,/href="\/\?category=headphones"/);
 assert.doesNotMatch(html,/data-store-browse="selected"/);
 store.sections[0].subcategoryId='';
 assert.match(renderStorefront(state,'web',{language:'ar'}),/href="\/\?category=c"/);
});
test('new schema saves bilingual content and rejects executable links and unknown product sources',()=>{
 const base=defaultStore(),s={id:'x',type:'products',title:'مختارات',titleEn:'Picks',subtitleEn:'Description',buttonEn:'Shop',href:'https://example.test/catalog',visible:true,channel:'both',productSource:'manual',productIds:['a'],limit:4};
 const saved=normalizeStore({...base,sections:[s]});assert.equal(saved.sections[0].titleEn,'Picks');assert.equal(saved.sections[0].href,s.href);assert.deepEqual(saved.sections[0].productIds,['a']);assert.equal(saved.home,undefined);
 for(const href of ['javascript:alert(1)','//evil.test','/\\evil.test','https://bad.test/"onclick=bad'])assert.throws(()=>normalizeStore({...base,sections:[{...s,href}]}));assert.throws(()=>normalizeStore({...base,sections:[{...s,productSource:'untrusted'}]}));
});
test('root document and guest entry never mount or hide the retired homepage',async()=>{
 const html=await readFile(new URL('../mobile-app/index.html',import.meta.url),'utf8'),guest=await readFile(new URL('../mobile-app/src/guest.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/guest-hero|guestTitle|guestCompanyCard|guest-header/);assert.doesNotMatch(guest,/guest-hero|guestCompanyCard|guest-header/);assert.match(html,/id="guest-storefront"/);
});

test('clickable hero targets selected products; listing expands beyond homepage limit and all resets selection',async()=>{
 const {renderProductListing}=await import('../mobile-app/src/storefront.js');
 const store=defaultStore();store.sections=[{id:'banner',type:'hero',title:'مختارات',titleEn:'Picks',visible:true,channel:'both',clickable:true,showAllProducts:true,button:'استكشف المنتجات',buttonTarget:'products',productSource:'manual',productIds:['a','b','secret'],limit:1}];
 const state={settings:{storefront:normalizeStore(store)},publicOffers:products};
 const home=renderStorefront(state,'web',{language:'en'});assert.match(home,/sf-banner-hit[^>]*data-store-browse="banner"/);assert.match(home,/data-store-browse="all"/);
 const picked=renderProductListing(state,'banner',{language:'en'});assert.match(picked,/Product/);assert.match(picked,/Other/);assert.doesNotMatch(picked,/data-store-product="secret"/);assert.equal((picked.match(/class="sf-product"/g)||[]).length,2);
 state.settings.storefront.sections[0].productIds=['a'];assert.equal((renderProductListing(state,'banner',{language:'en'}).match(/class="sf-product"/g)||[]).length,1);assert.equal((renderProductListing(state,'all',{language:'en'}).match(/class="sf-product"/g)||[]).length,2);
 state.settings.storefront.sections[0].buttonTarget='link';state.settings.storefront.sections[0].href='https://example.test/sale';assert.match(renderStorefront(state,'web',{language:'en'}),/<a class="sf-banner-hit" href="https:\/\/example.test\/sale"/);
});

test('image-only banner saves and renders only an image with an accessible clickable destination',()=>{
 const store=normalizeStore({...defaultStore(),sections:[{id:'photo',type:'imageBanner',visible:true,channel:'both',image:'/api/media/00000000-0000-4000-8000-000000000001',title:'Hidden headline',subtitle:'Hidden description',button:'Hidden button',buttonTarget:'link',href:'/products'}]});
 for(const language of ['ar','en']){
  const html=renderStorefront({settings:{storefront:store}},'web',{language});
  const banner=html.match(/<section class="sf-image-only-banner[\s\S]*?<\/section>/)[0];
  assert.match(banner,/<img /);assert.match(banner,/<a class="sf-banner-hit" href="\/products"/);
  assert.doesNotMatch(banner,/<h[1-6]|<p|sf-primary|sf-all-products|<div/);
 }
});
