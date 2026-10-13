import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryIcon} from '../shared/category-icons.mjs';
import {renderCategoryStrip,renderStoreRoute,renderStorefront} from '../mobile-app/src/storefront.js';
import {ensureThemePages} from '../shared/theme-pages.mjs';
import {defaultStore} from '../shared/storefront-model.mjs';

const parent={id:'cat-audio',nameAr:'الصوت والسماعات',nameEn:'Audio & Headphones',active:true};
const power={id:'cat-charging-power',nameAr:'الشحن والطاقة',nameEn:'Charging & Power',active:true};
const cable={id:'cat-cables-adapters',nameAr:'الكيابل والمحولات',nameEn:'Cables & Adapters',active:true};
const tws={id:'sub-tws-earbuds',parentId:parent.id,nameAr:'سماعات TWS',nameEn:'TWS Earbuds',active:true};
const wired={id:'sub-wired-earphones',parentId:parent.id,nameAr:'السماعات السلكية',nameEn:'Wired Earphones',active:true};
const speaker={id:'sub-bluetooth-speakers',parentId:parent.id,nameAr:'مكبرات الصوت Bluetooth',nameEn:'Bluetooth Speakers',active:true};
const settings={categories:[parent,power,cable],subcategories:[tws,wired,speaker],storefront:ensureThemePages(defaultStore())};
const product={id:'demo',status:'published',product:'Bluetooth Speaker',categoryId:parent.id,subcategoryId:speaker.id,unitPrice:10,currency:'SAR',images:['/api/media/00000000-0000-4000-8000-000000000001']};
const state={settings,publicOffers:[product]};

test('specific SVG category icons cover the live main and subcategories',()=>{
 const cases=[
  ['cat-audio','headphones'],['cat-charging-power','charging'],['cat-cables-adapters','cable'],
  ['cat-holders-mounts','stand'],['cat-car-electronics','car'],['cat-computer-tablet','laptop'],
  ['cat-cooling-lifestyle','fan'],['cat-photo-content','camera'],['cat-protection-bags','shield'],
  ['cat-smart-wearables','watch'],['sub-tws-earbuds','earbuds'],['sub-wired-earphones','wired'],
  ['sub-ows-neckband','neckband'],['sub-headphones-gaming','headset'],
  ['sub-bluetooth-speakers','speaker'],['sub-microphones','microphone'],
  ['sub-wall-chargers','plug'],['sub-power-banks','powerbank'],
  ['sub-charging-data-cables','cable'],['sub-carplay-dashcams','carcam'],
  ['sub-smart-rings','ring'],['sub-gimbals-tracking','gimbal']
 ];
 for(const [id,key] of cases){
  const svg=categoryIcon({id});
  assert.match(svg,new RegExp('data-category-icon="'+key+'"'),id);
  assert.match(svg,/<svg [^>]+aria-hidden="true"/);
  assert.doesNotMatch(svg,/<img|box-icon/);
 }
 assert.match(categoryIcon({nameAr:'مجففات الشعر'}),/data-category-icon="dryer"/);
 assert.match(categoryIcon({nameAr:'ماكينات حلاقة الشعر واللحية'}),/data-category-icon="trimmer"/);
 assert.match(categoryIcon({nameAr:'مكاوي فرد الشعر'}),/data-category-icon="straightener"/);
 assert.match(categoryIcon({nameAr:'أجهزة العناية الشخصية'}),/data-category-icon="dryer"/);
});

test('category tiles always show line icons instead of saved photos or generic boxes',()=>{
 const image='/api/media/00000000-0000-4000-8000-000000000002';
 const tiles=renderCategoryStrip(state,{ids:[parent.id,power.id,cable.id],images:{[parent.id]:image},language:'ar'});
 assert.equal((tiles.match(/class="sf-category-icon"/g)||[]).length,3);
 assert.match(tiles,/data-category-icon="headphones"/);
 assert.match(tiles,/data-category-icon="charging"/);
 assert.match(tiles,/data-category-icon="cable"/);
 assert.doesNotMatch(tiles,/<img|data-media=|data-category-icon="tag"/);
 const subs=renderCategoryStrip(state,{parentId:parent.id,language:'en'});
 for(const name of ['earbuds','wired','speaker'])assert.match(subs,new RegExp('data-category-icon="'+name+'"'));
 assert.equal((subs.match(/class="sf-category-icon"/g)||[]).length,3);
 assert.doesNotMatch(subs,/<img|data-media=/);
});

test('homepage, category and product pages share icons without replacing product pictures',()=>{
 const home=structuredClone(state);
 home.settings.storefront.sections.push({id:'category-icon-test',page:'home',type:'categories',title:'Shop categories',visible:true,channel:'both',categoryIds:[parent.id,power.id]});
 const homepage=renderStorefront(home,'web',{route:{},language:'ar'});
 assert.match(homepage,/data-category-icon="headphones"/);
 assert.match(homepage,/data-category-icon="charging"/);
 for(const html of [
  renderStoreRoute(state,{category:parent.id},{language:'ar'}),
  renderStoreRoute(state,{product:product.id},{language:'ar'})
 ]){
  assert.match(html,/data-category-icon="earbuds"/);
  assert.match(html,/data-category-icon="wired"/);
  assert.match(html,/class="sf-breadcrumb"/);
  assert.doesNotMatch(html,/data-category-icon="box"/);
 }
 const detail=renderStoreRoute(state,{product:product.id},{language:'ar'});
 assert.match(detail,/class="sf-gallery"/);
 assert.match(detail,/data-viewer-gallery/);
 assert.match(detail,/src="\/api\/media\/00000000-0000-4000-8000-000000000001/);
});
