import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sectionDefaults} from '../shared/section-layout.mjs';
import {normalizeStore,storeImages} from '../backend/modules/studio.mjs';
import {defaultStore} from '../shared/storefront-model.mjs';
import {renderStorefront} from '../mobile-app/src/storefront.js';

const first='/api/media/00000000-0000-4000-8000-000000000001';
const second='/api/media/00000000-0000-4000-8000-000000000002';
const pair={...sectionDefaults('imagePair'),id:'square-categories',page:'home',type:'imagePair',visible:true,channel:'both',imageTiles:[{image:first,categoryId:'phones'},{image:second,categoryId:'audio'}]};

test('square pair persists both media paths and category IDs safely',()=>{
 const store=normalizeStore({...defaultStore(),sections:[pair]});
 const normalized=store.sections.find(s=>s.id===pair.id);
 assert.ok(normalized);
 assert.deepEqual(normalized.imageTiles,pair.imageTiles);
 assert.ok(storeImages(store).includes(first));assert.ok(storeImages(store).includes(second));
 assert.throws(()=>normalizeStore({...defaultStore(),sections:[{...pair,imageTiles:[{image:'https://invalid.test/image.jpg',categoryId:'phones'},{image:second,categoryId:'audio'}]}]}));
 assert.throws(()=>normalizeStore({...defaultStore(),sections:[{...pair,imageTiles:[{image:first,categoryId:'phones'}]}]}));
});

test('storefront renders two square tiles with independent category links',()=>{
 const state={settings:{storefront:{...defaultStore(),sections:[pair]},categories:[{id:'phones',nameAr:'الجوالات',active:true},{id:'audio',nameAr:'السماعات',active:true}],subcategories:[]},publicOffers:[]};
 const html=renderStorefront(state,'web',{language:'ar',chrome:false});
 assert.ok(html.includes('class="sf-square-pair"'));
 assert.ok(html.indexOf('/?category=phones')<html.indexOf('/?category=audio'));
 assert.equal((html.match(/class="sf-square-pair-tile" href=/g)||[]).length,2);
 const css=readFileSync(new URL('../mobile-app/src/storefront.css',import.meta.url),'utf8');
 assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 assert.ok(css.includes('aspect-ratio:1/1'));
 assert.ok(css.includes('@container(max-width:600px){.sf-square-pair'));
});

test('missing image or inactive category cannot produce an active link',()=>{
 const state={settings:{storefront:{...defaultStore(),sections:[{...pair,imageTiles:[{image:'',categoryId:'phones'},{image:second,categoryId:'audio'}]}]},categories:[{id:'phones',nameAr:'الجوالات',active:true},{id:'audio',nameAr:'السماعات',active:false}],subcategories:[]},publicOffers:[]};
 const html=renderStorefront(state,'web',{language:'ar',chrome:false});
 assert.ok(html.includes('sf-square-pair-placeholder'));
 assert.ok(html.includes('sf-square-pair-inert'));
 assert.equal((html.match(/class="sf-square-pair-tile" href=/g)||[]).length,0);
});
