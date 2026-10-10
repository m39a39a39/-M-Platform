import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('layout-results/ai-catalog',{recursive:true});
for(const [engine,type] of Object.entries({chromium,webkit}))for(const language of ['ar','en']){
 const browser=await type.launch(),page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__copy-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/studio/admin-ai.css"></head><body><main id="root"></main><script src="/studio/ai-catalog.js"></script></body></html>'}));
 await page.goto('http://127.0.0.1:4173/__copy-test');
 await page.evaluate(lang=>{
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  const original={titleAr:'اسم قديم',titleEn:'Old title',descriptionAr:'وصف قديم',descriptionEn:'Old description',shortDescription:'قديم'};
  const proposal={titleAr:'شاحن AMAYA AC25',titleEn:'AMAYA AC25 charger',descriptionAr:'شاحن بقدرة 20 واط',descriptionEn:'Charger rated at 20W',shortDescription:'AMAYA AC25'};
  const make=(id,status)=>({id,sku:id,status,original,proposal,visibleName:'AMAYA AC25 20W',evidence:['20W'],issues:status==='review'?['unclear model']:[],reasons:['short_title']});
  let job={id:'fixture',status:'queued',version:1,page:0,total:2,items:[make('p1','pending'),make('p2','pending')],counts:{pending:2}};
  const update=()=>{job.counts={};for(const x of job.items)job.counts[x.status]=(job.counts[x.status]||0)+1;job.version++;return structuredClone(job);};
  window.copyCalls=[];window.MStudioSession={request:async(path,{body})=>{
   window.copyCalls.push(body);
   if(body.action==='list')return {canPublish:true,jobs:[{id:job.id,created_at:'2026-10-10',status:job.status}]};
   if(body.action==='create'||body.action==='submit'||body.action==='get')return structuredClone(job);
   if(body.action==='refresh'){job.status='completed';job.items=[make('p1','ready'),make('p2','review')];return update();}
   if(body.action==='review'){job.items.find(x=>x.id===body.productId).proposal=body.proposal;job.items.find(x=>x.id===body.productId).status='ready';return update();}
   if(body.action==='apply'){for(const x of job.items)if(x.status==='ready')x.status='applied';return {...update(),result:{changed:2,conflicts:0}};}
   if(body.action==='revert'){for(const x of job.items)if(x.status==='applied')x.status='reverted';return {...update(),result:{changed:2,conflicts:0}};}
   throw Error('Unexpected action '+body.action);
  }};
  window.MCatalogAI.render(document.querySelector('#root'),{categories:[{id:'cat',nameAr:'شواحن',nameEn:'Chargers'}]});
 },language);
 await page.locator('[data-copy-create] button[type=submit]').waitFor();
 await page.locator('[name=categoryId]').selectOption('cat');await page.locator('[name=limit]').selectOption('500');await page.locator('[name=skus]').fill('AC25, AC26');
 await page.locator('[data-copy-create] button[type=submit]').click();await page.locator('[data-copy-action=refresh]').waitFor();
 assert.equal((await page.evaluate(()=>window.copyCalls.find(x=>x.action==='create'))).limit,500);
 await page.locator('[data-copy-action=refresh]').click();await page.locator('[data-copy-action=apply]').waitFor();
 await page.locator('[data-copy-item=p2] summary').click();await page.locator('[data-copy-review=p2] [name=titleEn]').fill('Reviewed AMAYA charger');
 await page.locator('[data-copy-review=p2] button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-copy-action=apply]')?.textContent.includes('(2)'));
 assert.equal(await page.locator('[name=skus]').inputValue(),'AC25, AC26');
 await page.locator('[data-copy-action=apply]').click();await page.locator('[data-copy-action=revert]').waitFor();
 page.on('dialog',dialog=>dialog.accept());await page.locator('[data-copy-action=revert]').click();await page.waitForFunction(()=>!document.querySelector('[data-copy-action=revert]'));
 await page.screenshot({path:`layout-results/ai-catalog/${engine}-${language}.png`,fullPage:true});
 const width=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth}));if(width.page>width.width+1)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,scroll:el.scrollWidth})).filter(x=>x.width>innerWidth||x.scroll>innerWidth).slice(0,20)));assert.ok(width.page<=width.width+1,JSON.stringify(width));
 assert.deepEqual(errors,[]);await page.screenshot({path:`layout-results/ai-catalog/${engine}-${language}.png`,fullPage:true});
 await browser.close();console.log(`PASS AI catalog ${engine} ${language}`);
}
