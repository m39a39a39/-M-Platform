import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {defaultStore} from '../../shared/storefront-model.mjs';

const baseURL='http://127.0.0.1:4173';
const publicState={
 user:null,
 settings:{storefront:defaultStore(),categories:[],subcategories:[],supplyCountries:[],currencies:[{code:'SAR',rate:1,active:true}]},
 publicOffers:[],requests:[],quotes:[],interests:[]
};
for(const browserType of [chromium,webkit]){
 const browser=await browserType.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/state'))return route.fulfill({json:publicState});
  if(path.endsWith('/app-config'))return route.fulfill({json:{apiVersion:1}});
  return route.fulfill({json:{}});
 });
 await page.goto(baseURL+'/',{waitUntil:'domcontentloaded'});
 await page.locator('.sf-footer a[href="/admin.html"]').waitFor({timeout:15000});
 assert.equal(await page.locator('.sf-header [data-store-action="login"]').count(),0);
 assert.equal(await page.locator('.sf-footer [data-store-action="register-supplier"]').count(),0);
 assert.equal(await page.locator('.sf-footer a[href="/admin.html"]').count(),1);
 assert.equal(await page.locator('#loginView,#registerView,#appView').count(),0);
 assert.deepEqual(errors,[]);
 for(const route of ['/customer','/supplier','/register-customer.html','/register-supplier.html']){
  await page.goto(baseURL+route,{waitUntil:'domcontentloaded'});
  await page.waitForURL(url=>url.pathname==='/',{timeout:10000});
 }
 await browser.close();
}
console.log('Guest storefront has no obsolete account UI, old portals redirect, and admin footer link works.');
