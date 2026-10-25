import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
for(const browserType of [chromium,webkit]){
 const browser=await browserType.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.sf-footer',{timeout:20000});
 assert.equal(await page.locator('.sf-header [data-store-action="login"]').count(),0);
 assert.equal(await page.locator('.sf-footer [data-store-action="register-supplier"]').count(),0);
 assert.equal(await page.locator('.sf-footer a[href="/admin.html"]').count(),1);
 assert.equal(await page.locator('#loginView,#registerView,#appView').count(),0);
 assert.deepEqual(errors,[]);
 await page.goto('http://127.0.0.1:4173/customer.html');
 await page.waitForURL(url=>url.pathname==='/',{timeout:10000});
 await page.goto('http://127.0.0.1:4173/supplier.html');
 await page.waitForURL(url=>url.pathname==='/',{timeout:10000});
 await browser.close();
}
console.log('Guest storefront has no old accounts and footer links to the admin login.');
