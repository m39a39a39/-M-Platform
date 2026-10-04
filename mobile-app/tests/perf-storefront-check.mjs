import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';

const response=await fetch('https://m-platform-tan.vercel.app/api/v1/state');
assert.equal(response.ok,true);
const state=await response.json();
const first=(state.publicOffers||[]).find(p=>p.status==='published'&&!p.deletedAt&&!p.studioArchived&&p.images?.some(x=>String(x).startsWith('https://ueeshop.ly200-cdn.com/')));
assert.ok(first,'Need a published MOXOM product');
const categoryId=first.categoryId||'';
const sku=first.sku||first.product||'';

for(const [engine,launcher] of Object.entries({chromium,webkit})){
 const browser=await launcher.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[],imageRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://ueeshop.ly200-cdn.com/**',async route=>{imageRequests.push(route.request().url());await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"></svg>'});});
 await page.route('https://m-platform-tan.vercel.app/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/state'))return route.fulfill({json:state});
   if(path.endsWith('/app-config'))return route.fulfill({json:{apiVersion:1}});
   if(path.endsWith('/ai-conversation'))return route.fulfill({json:{messages:[]}});
   return route.fulfill({status:404,json:{error:'unused'}});
 });
 const home=async()=>{await page.goto('http://127.0.0.1:4173/');await page.locator('.published-storefront .sf-product').first().waitFor();};
 await home();
 assert.ok(await page.locator('#site-header [data-store-action="cart"]').count()>=1);
 const responsiveMarkup=await page.locator('.published-storefront .sf-product img[data-media^="https://ueeshop.ly200-cdn.com/"]').first().evaluate(img=>({src:img.getAttribute('src')||'',srcset:img.getAttribute('srcset')||''}));
 assert.ok((responsiveMarkup.src+' '+responsiveMarkup.srcset).includes('x-oss-process=image/resize'),'Responsive MOXOM image variant expected');
 const add=page.locator('.published-storefront [data-store-add]').first();await add.click();
 assert.equal((await page.locator('#site-header [data-store-cart-count]').first().textContent()).trim(),'1');
 await page.locator('#site-header [data-store-action="cart"]').first().click();await page.locator('#guestCartForm').waitFor();
 assert.equal(await page.locator('#guestCartForm .cart-line').count(),1);
 await page.locator('.modal-close').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('#site-header [data-store-action="cart"]').first().click();await page.locator('#guestCartForm').waitFor();
 await page.locator('[data-guest-cart-remove]').first().click();await page.locator('.cart-empty').waitFor();await page.locator('.modal-close').click();

 await page.goto('http://127.0.0.1:4173/?product='+encodeURIComponent(first.id));
 await page.locator('.sf-product-page h1').waitFor();
 assert.ok(await page.locator('.sf-product-page .sf-gallery').count()>=1);
 assert.ok(await page.locator('.sf-product-page [data-product-purchase]').count()>=1);

 await home();
 const search=page.locator('#site-header [data-store-search] input[type="search"]');await search.fill(sku);await search.press('Enter');
 await page.waitForURL(/page=search/);await page.locator('.sf-route .sf-product').first().waitFor();

 if(categoryId){await page.goto('http://127.0.0.1:4173/?category='+encodeURIComponent(categoryId));await page.locator('.sf-route .sf-product').first().waitFor();}

 await home();await page.locator('#site-header [data-store-action="login"]').first().click();await page.locator('#loginView').waitFor({state:'visible'});
 assert.deepEqual(errors,[],engine+' page errors: '+errors.join(' | '));
 await browser.close();
}
console.log('Current storefront performance smoke passed');
