import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {defaultStore} from '../../shared/storefront-model.mjs';
await mkdir('layout-results/product-copy',{recursive:true});
for(const [engine,type] of Object.entries({chromium,webkit}))for(const language of ['ar','en']){
 const browser=await type.launch(),page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__product-copy-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/studio/admin-ai.css"><style>body{margin:8px}dialog{box-sizing:border-box;max-width:calc(100vw - 16px);width:900px}input,textarea{box-sizing:border-box;max-width:100%}</style></head><body><dialog id="dialog"><form id="edit-form"><div class="form-grid"><label>Title<input name="name" value="AMAYA 20W"></label><input name="nameEn" value="Old English"><textarea name="description">Old description</textarea><textarea name="descriptionEn">English description</textarea><textarea name="technicalSpecs">20W</textarea><input name="options" value="White"><input name="shortDescription" value="Short"><input name="price" value="35"></div><button type="submit">Save</button></form></dialog><script src="/studio/product-copy.js"></script></body></html>`}));
 await page.goto('http://127.0.0.1:4173/__product-copy-test');
 await page.evaluate(lang=>{
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  window.calls=[];window.writes=[];window.submitCount=0;window.delay=0;
  window.MStudioSession={request:async(path,{body})=>{
   window.calls.push({path,body});if(window.delay)await new Promise(r=>setTimeout(r,window.delay));
   if(body.productId==='p2'&&!window.retry)throw Error('Temporary AI failure');
   const title={titleAr:'شاحن AMAYA 20W محسّن',titleEn:'Improved AMAYA 20W charger'},description={descriptionAr:'شاحن AMAYA بقدرة 20 واط.',descriptionEn:'AMAYA charger with 20W power.'};
   return {proposal:body.mode==='title'?title:['description','shorten'].includes(body.mode)?description:{...title,...description}};
  }};
  const form=document.querySelector('form');form.onsubmit=e=>{e.preventDefault();window.submitCount++;};document.querySelector('dialog').showModal();window.MProductCopy.mountEditor(form);
 },language);
 await page.locator('.product-copy-shortcut').first().click();
 assert.equal(await page.locator('[data-pc-mode]').inputValue(),'title');
 await page.locator('[data-pc-instruction]').fill('Wholesale, concise');await page.locator('[data-pc-generate]').click();await page.locator('[data-pc-use]').waitFor();
 assert.equal(await page.locator('[name=name]').inputValue(),'AMAYA 20W');assert.equal(await page.evaluate(()=>window.submitCount),0);
 await page.locator('[name=name]').fill('Manual edit while reviewing');await page.locator('[data-pc-use]').click();assert.equal(await page.locator('[name=name]').inputValue(),'Manual edit while reviewing');
 await page.locator('[data-pc-generate]').click();await page.locator('[data-pc-use]').waitFor();await page.locator('[data-pc-use]').click();
 assert.equal(await page.locator('[name=nameEn]').inputValue(),'Improved AMAYA 20W charger');assert.equal(await page.locator('[name=description]').inputValue(),'Old description');assert.equal(await page.locator('[name=price]').inputValue(),'35');
 await page.locator('[data-pc-mode]').selectOption('shorten');await page.locator('[data-pc-generate]').click();await page.locator('[data-pc-dismiss]').click();assert.equal(await page.locator('[name=description]').inputValue(),'Old description');
 await page.screenshot({path:`layout-results/product-copy/editor-${engine}-${language}.png`,fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Discard responses from a closed/replaced product editor.
 await page.evaluate(()=>window.delay=100);await page.locator('[data-pc-generate]').click();await page.evaluate(()=>document.querySelector('dialog').close());await page.waitForTimeout(150);assert.equal(await page.locator('[data-pc-use]').count(),0);
 await page.evaluate(()=>{
  window.delay=0;const d=document.querySelector('dialog');d.innerHTML='<div id="bulk"></div>';d.showModal();
  window.MProductCopy.mountBulk(document.querySelector('#bulk'),[{id:'p1',version:2,product:'AMAYA 20W',sku:'A20',translation:{descriptionAr:'قديم'}},{id:'p2',version:3,product:'AMAYA cable',sku:'C1'}],{
   save:async items=>{if(window.saveError)throw Error('Product version conflict');window.writes.push(items);},onSaved:async()=>{window.refreshed=true;}
  });
 });
 await page.locator('[data-pc-generate]').click();await page.waitForFunction(()=>!document.querySelector('[data-pc-generate]').disabled);
 assert.equal(await page.locator('[data-pc-row=p1] [data-pc-select]').isChecked(),true);assert.equal(await page.locator('[data-pc-row=p2] [data-pc-select]').isDisabled(),true);assert.equal(await page.evaluate(()=>window.writes.length),0);
 await page.locator('[data-pc-row=p1] summary').click();await page.locator('[data-pc-row=p1] [data-pc-field=titleEn]').fill('Reviewed charger');
 await page.evaluate(()=>window.saveError=true);await page.locator('[data-pc-save]').click();await page.waitForFunction(()=>document.querySelector('[data-pc-status]').textContent.includes('conflict'));assert.equal(await page.evaluate(()=>window.writes.length),0);
 await page.evaluate(()=>window.saveError=false);await page.locator('[data-pc-save]').click();await page.waitForFunction(()=>window.writes.length===1);
 assert.equal(await page.evaluate(()=>window.writes[0][0].patch.translation.titleEn),'Reviewed charger');assert.equal(await page.evaluate(()=>window.writes[0][0].version),2);assert.equal(await page.locator('[data-pc-row=p1] [data-pc-select]').isDisabled(),true);
 await page.evaluate(()=>window.retry=true);await page.locator('[data-pc-generate]').click();await page.waitForFunction(()=>!document.querySelector('[data-pc-generate]').disabled);assert.equal(await page.locator('[data-pc-row=p2] [data-pc-select]').isChecked(),true);
 await page.locator('[data-pc-row=p2] summary').click();await page.screenshot({path:`layout-results/product-copy/bulk-${engine}-${language}.png`,fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 // Exercise the real studio entry, product editor and selected-products toolbar.
 const actual=await browser.newPage({viewport:{width:390,height:844}});actual.setDefaultTimeout(15000);
 const studioErrors=[];actual.on('pageerror',e=>studioErrors.push(e.message));
 await actual.addInitScript(lang=>{localStorage.setItem('CapacitorStorage.language',lang);localStorage.setItem('m-platform.session.v1',JSON.stringify({accessToken:'fixture',refreshToken:'fixture',expiresAt:Math.floor(Date.now()/1000)+3600}));},language);
 const product={id:'c3b2d826-a640-4945-b3b4-b1cb204bef56',version:2,product:'AMAYA 20W',specs:'Original description',sku:'A20',status:'published',translation:{titleAr:'شاحن AMAYA',titleEn:'AMAYA charger',descriptionAr:'الوصف الأصلي',descriptionEn:'Original description'},categoryId:'cat',country:'China',unitPrice:35,currency:'SAR',moq:1,leadTime:3,images:[]};
 const admin={id:'admin',role:'admin',isOwner:true,name:'Admin'};
 const state={user:admin,settings:{_version:1,storefront:defaultStore(),categories:[{id:'cat',nameAr:'شواحن',nameEn:'Chargers',active:true}],subcategories:[],currencies:[{code:'SAR',rate:1,active:true}],supplyCountries:[{id:'China',nameAr:'الصين',nameEn:'China',active:true}]},publicOffers:[product],accounts:[admin],requests:[],quotes:[],interests:[],supplySources:[]};
 const writes=[];
 await actual.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;let result={};
  if(path.endsWith('/state'))result=state;
  else if(path.endsWith('/notifications'))result=[];
  else if(path.endsWith('/product-copy'))result={proposal:{titleAr:'شاحن AMAYA محسّن',titleEn:'Improved AMAYA charger'}};
  else if(path.endsWith('/studio-product')){const body=route.request().postDataJSON();writes.push(body);product.translation.titleAr=body.product.name;product.translation.titleEn=body.product.nameEn;product.version++;result={ok:true};}
  return route.fulfill({json:result});
 });
 await actual.goto('http://127.0.0.1:4173/admin.html?screen=products');
 await actual.locator('[data-action=edit-product]').first().click();await actual.locator('.product-copy-shortcut').first().click();await actual.locator('[data-pc-generate]').click();await actual.locator('[data-pc-use]').waitFor();assert.equal(writes.length,0);
 await actual.locator('[data-pc-use]').click();assert.equal(writes.length,0);assert.equal(await actual.locator('[name=price]').inputValue(),'35');
 await actual.screenshot({path:`layout-results/product-copy/studio-${engine}-${language}.png`,fullPage:true});
 await actual.locator('#edit-form button[type=submit]').click();await actual.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(writes.length,1);assert.equal(writes[0].product.nameEn,'Improved AMAYA charger');
 await actual.locator('[data-catalog-select]').first().check();await actual.locator('[data-action=catalog-ai]').click();await actual.locator('[data-product-copy-bulk] [data-pc-generate]').waitFor();
 assert.deepEqual(studioErrors,[]);assert.ok(await actual.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await browser.close();console.log(`PASS product copy ${engine} ${language}`);
}
