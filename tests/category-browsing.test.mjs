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
 const sub=renderStoreRoute(data,{category:'audio'},{language:'ar'});assert.match(sub,/كل إلكترونيات/);assert.match(sub,/data-store-product="headphones"/);assert.doesNotMatch(sub,/data-store-product="charger"/);
 assert.equal(renderCategoryStrip(state,{parentId:'hidden'}),'');
});
const offers=[{id:'usd',unitPrice:10,currency:'USD'},{id:'sar',unitPrice:20,currency:'SAR'},{id:'cheap',unitPrice:5,currency:'SAR'}].map(p=>({...p,status:'published',product:p.id,categoryId:'electronics'}));
test('price ordering compares equivalent currency values and sorts the full result before pagination',()=>{
 assert.deepEqual(catalogProducts(offers,{sort:'price-asc'},settings).map(p=>p.id),['cheap','sar','usd']);
 assert.deepEqual(catalogProducts(offers,{sort:'price-desc'},settings).map(p=>p.id),['usd','sar','cheap']);
 const html=renderCatalog({...state,publicOffers:offers},{language:'ar',catalogConfig:{pageSize:1}},{sort:'price-desc',page:1});assert.match(html,/data-store-product="usd"/);assert.doesNotMatch(html,/data-store-product="sar"/);assert.match(html,/value="price-desc" selected/);
 const second=renderCatalog({...state,publicOffers:offers},{language:'en',catalogConfig:{pageSize:1}},{sort:'price-desc',page:2});assert.match(second,/data-store-product="sar"/);assert.match(second,/Price: low to high/);
});
test('category/search routes honor requested sort and render all four sorting choices',()=>{
 const html=renderStoreRoute({...state,publicOffers:offers},{category:'electronics',sort:'price-desc'},{language:'ar'});
 assert.ok(html.indexOf('data-store-product="usd"')<html.indexOf('data-store-product="cheap"'));
 for(const key of ['newest','price-asc','price-desc','name'])assert.match(html,new RegExp('value="'+key+'"'));
 const hidden=renderCatalog(state,{language:'ar',catalogConfig:{showSort:false}});assert.doesNotMatch(hidden,/data-catalog-filter="sort"/);
});
