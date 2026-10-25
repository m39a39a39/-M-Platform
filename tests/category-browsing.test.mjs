import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCategoryStrip,renderStoreRoute,renderCatalog} from '../mobile-app/src/storefront.js';
import {catalogProducts} from '../shared/catalog-controls.mjs';
import {defaultStore} from '../shared/storefront-model.mjs';
import {ensureThemePages} from '../shared/theme-pages.mjs';
const settings={storefront:ensureThemePages(defaultStore()),categories:[{id:'electronics',nameAr:'إلكترونيات',nameEn:'Electronics',active:true},{id:'bags',nameAr:'حقائب',nameEn:'Bags',active:true},{id:'hidden',nameAr:'مخفي',active:false}],subcategories:[{id:'audio',parentId:'electronics',nameAr:'صوتيات',nameEn:'Audio',active:true},{id:'cables',parentId:'electronics',nameAr:'كيابل',active:true},{id:'secret',parentId:'hidden',nameAr:'سري',active:true}],currencies:[{code:'SAR',rate:1},{code:'USD',rate:0.25}]};
const state={settings,publicOffers:[]};
test('homepage displays main categories, resolving prior child selections to their parents without duplicates',()=>{
 for(const language of ['ar','en']){
  const all=renderCategoryStrip(state,{language});assert.match(all,/category=electronics/);assert.match(all,/category=bags/);assert.doesNotMatch(all,/category=audio|category=cables|category=hidden|category=secret/);
  const selected=renderCategoryStrip(state,{ids:['audio','cables','bags'],language});assert.equal((selected.match(/data-store-category="electronics"/g)||[]).length,1);assert.doesNotMatch(selected,/category=audio|category=cables/);
 }
});
test('parent opens its children and subcategory retains parent navigation and fixed product filtering',()=>{
 const product=(id,subcategoryId)=>({id,categoryId:'electronics',subcategoryId,status:'published',product:id,unitPrice:10,currency:'SAR'});
 const data={...state,publicOffers:[product('headphones','audio'),product('charger','cables')]};
 const parent=renderStoreRoute(data,{category:'electronics'},{language:'ar'});assert.match(parent,/category=audio/);assert.match(parent,/category=cables/);assert.match(parent,/data-store-product="headphones"/);assert.match(parent,/data-store-product="charger"/);
 const sub=renderStoreRoute(data,{category:'audio'},{language:'ar'});assert.doesNotMatch(sub,/كل إلكترونيات|sf-category-back/);assert.match(sub,/class="sf-breadcrumb"/);assert.match(sub,/data-store-product="headphones"/);assert.doesNotMatch(sub,/data-store-product="charger"/);
 assert.equal(renderCategoryStrip(state,{parentId:'hidden'}),'');
});
const offers=[{id:'usd',unitPrice:10,currency:'USD'},{id:'sar',unitPrice:20,currency:'SAR'},{id:'cheap',unitPrice:5,currency:'SAR'}].map(p=>({...p,status:'published',product:p.id,categoryId:'electronics'}));
test('price ordering compares equivalent currency values and sorts the full result before pagination',()=>{
 assert.deepEqual(catalogProducts(offers,{sort:'price-asc'},settings).map(p=>p.id),['cheap','sar','usd']);
 assert.deepEqual(catalogProducts(offers,{sort:'price-desc'},settings).map(p=>p.id),['usd','sar','cheap']);
 const html=renderCatalog({...state,publicOffers:offers},{language:'ar',catalogConfig:{pageSize:1}},{sort:'price-desc',page:1});assert.match(html,/data-store-product="cheap"/);assert.doesNotMatch(html,/value="price-desc"/);
 const second=renderCatalog({...state,publicOffers:offers},{language:'en',catalogConfig:{pageSize:1}},{sort:'price-desc',page:2});assert.match(second,/data-store-product="sar"/);assert.doesNotMatch(second,/Price: low to high/);
});
test('category/search routes honor requested sort and render all four sorting choices',()=>{
 const html=renderStoreRoute({...state,publicOffers:offers},{category:'electronics',sort:'price-desc'},{language:'ar'});
 assert.ok(html.indexOf('data-store-product="cheap"')<html.indexOf('data-store-product="usd"'));
 for(const key of ['newest','name'])assert.match(html,new RegExp('value="'+key+'"'));
 assert.doesNotMatch(html,/price-asc|price-desc/);
 const hidden=renderCatalog(state,{language:'ar',catalogConfig:{showSort:false}});assert.doesNotMatch(hidden,/data-catalog-filter="sort"/);
});

test('category pages reuse the product breadcrumb below the tiles, without an extra back link',()=>{
 const product={id:'headphones',categoryId:'electronics',subcategoryId:'audio',status:'published',product:'Headphones',unitPrice:10,currency:'SAR'};
 const data={...state,publicOffers:[product]};
 for(const language of ['ar','en']){
  const main=renderStoreRoute(data,{category:'electronics'},{language});
  const sub=renderStoreRoute(data,{category:'audio'},{language});
  const detail=renderStoreRoute(data,{product:'headphones'},{language});
  for(const html of [main,sub,detail]){
   assert.equal((html.match(/class="sf-breadcrumb"/g)||[]).length,1);
   assert.doesNotMatch(html,/sf-category-back|>كل إلكترونيات<|>All Electronics</);
   assert.ok(html.indexOf('class="sf-category-strip"')<html.indexOf('class="sf-breadcrumb"'));
  }
  assert.ok(main.indexOf('class="sf-breadcrumb"')<main.indexOf('<h1>'));
  assert.ok(sub.indexOf('class="sf-breadcrumb"')<sub.indexOf('<h1>'));
  assert.match(main,new RegExp('<span aria-current="page">'+(language==='ar'?'إلكترونيات':'Electronics')+'</span>'));
  assert.match(sub,new RegExp('href="/\\?category=electronics">'+(language==='ar'?'إلكترونيات':'Electronics')+'</a>'));
  assert.match(detail,new RegExp('href="/\\?category=audio">'+(language==='ar'?'صوتيات':'Audio')+'</a>'));
 }
 const noNav=structuredClone(data);
 noNav.settings.storefront.sections.find(s=>s.page==='category'&&s.type==='categoryNav').visible=false;
 const fallback=renderStoreRoute(noNav,{category:'audio'},{language:'ar'});
 assert.equal((fallback.match(/class="sf-breadcrumb"/g)||[]).length,1);
 assert.ok(fallback.indexOf('class="sf-breadcrumb"')<fallback.indexOf('<h1>'));
});
