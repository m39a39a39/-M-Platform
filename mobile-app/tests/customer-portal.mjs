import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {defaultStore} from '../../shared/storefront-model.mjs';

// Current customer.html portal; synthetic API only. Legacy layout.mjs targets retired guest markup.
const output='layout-results/customer-portal';
await mkdir(output,{recursive:true});
const report=[];
const baseURL='http://127.0.0.1:4173';
for(const [engine,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch();
 for(const width of [375,1280])for(const language of ['ar','en']){
  const label=`${engine}-${width}-${language}`;
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(lang=>localStorage.setItem('CapacitorStorage.language',lang),language);
  const user={id:'client',role:'client',name:'Customer عميل',company:'Example company',email:'client@example.test',country:'UAE',preferredCurrency:'SAR'};
  const base={version:1,quantity:100,currency:'SAR',images:[],createdAt:'2026-10-01',updatedAt:'2026-10-05'};
  const product={id:'p1',sku:'SKU-1',status:'published',product:'دفتر',translation:{titleAr:'دفتر',titleEn:'Notebook'},unitPrice:10,currency:'SAR',moq:1,stock:1000,images:[]};
  const state={user,settings:{storefront:defaultStore(),currencies:[{code:'SAR',rate:1,nameAr:'ريال',nameEn:'Riyal',active:true},{code:'USD',rate:.2667,nameAr:'دولار',nameEn:'Dollar',active:true}]},publicOffers:[product],accounts:[user],supplySources:[],requests:[
   {...base,id:'pay',displayNo:12001,product:'سماعات',translation:{titleAr:'سماعات',titleEn:'Headphones'},trackingStatus:'payment_confirmation',paymentStatus:'awaiting_receipt',selectedQuoteId:'q1'},
   {...base,id:'done',displayNo:12002,product:'Completed',trackingStatus:'completed',paymentStatus:'reupload_requested'},
   {...base,id:'cancel',displayNo:12003,product:'Cancelled',status:'cancelled',paymentStatus:'reupload_requested'},
   {...base,id:'cart',displayNo:12004,orderType:'cart',trackingStatus:'shipped',cartItemCount:1,cartTotal:100,currency:'SAR',cartItems:[{offerId:'p1',interestId:'child',product:'Notebook',quantity:10,unitPrice:10,total:100,currency:'SAR'}]},
   {...base,id:'quote',displayNo:12005,product:'طلب تسعير',translation:{titleAr:'طلب تسعير',titleEn:'Quote request'},trackingStatus:'quotes_available'},
  ],quotes:[{...base,id:'q1',requestId:'pay',unitPrice:20,status:'published'},{...base,id:'q2',requestId:'quote',unitPrice:30,status:'published'}],interests:[{...base,id:'ready',displayNo:12006,offerId:'p1',trackingStatus:'production',total:1000},{...base,id:'child',offerId:'p1',cartOrderId:'cart',trackingStatus:'shipped',total:100}]};
  let empty=false,failCurrency=false,logins=0;
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let result={};
   if(path.endsWith('/auth/login')){logins++;result={user,tokens:{accessToken:'client',refreshToken:'fixture',userId:'client',expiresAt:Math.floor(Date.now()/1000)+3600}};}
   else if(path.endsWith('/auth/logout'))result={ok:true};
   else if(path.endsWith('/state'))result={...state,user:req.headers().authorization?user:null,...(empty?{requests:[],quotes:[],interests:[]}:{})};
   else if(path.endsWith('/notifications'))result=[];
   else if(path.endsWith('/profile/currency')){if(failCurrency)return route.fulfill({status:500,json:{error:'Test save failure'}});user.preferredCurrency=req.postDataJSON().currency;result={user,currency:user.preferredCurrency};}
   else if(path.endsWith('/mutations')){const m=req.postDataJSON();assert.equal(m.collection,'requests');assert.deepEqual(Object.keys(m.patch),['lastSeenQuoteAt']);Object.assign(state.requests.find(r=>r.id===m.id),m.patch);result={ok:true};}
   else if(path.endsWith('/app-config'))result={apiVersion:1};
   else return route.fulfill({status:404,json:{error:`Unexpected fixture endpoint ${path}`}});
   await route.fulfill({json:result});
  });
  const geometry=async()=>{const size=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,screen:document.querySelector('#screen')?.scrollWidth,client:document.querySelector('#screen')?.clientWidth}));assert.ok(size.page<=size.viewport+1,`Page overflow ${JSON.stringify(size)}`);assert.ok(size.screen<=size.client+1,`Screen overflow ${JSON.stringify(size)}`);};
  const close=async()=>{await page.locator('.modal-close').click();await page.locator('#modal').waitFor({state:'hidden'});};
  const filter=async key=>{await page.locator(`[data-client-order-filter="${key}"]`).click();};
  const cards=()=>page.locator('#clientOrderResults .client-order-card');
  try{
   await page.goto(baseURL+'/?page=products');
   await page.locator('.sf-product').first().waitFor();
   await page.locator('.sf-product-name').first().click();
   await page.locator('[data-product-purchase]').waitFor();
   await page.locator('[data-product-purchase] button[type="submit"]').click();
   await page.locator('.sf-header [data-store-action="cart"]').click();
   await page.locator('#guestCartForm .cart-line').waitFor();
   await page.locator('[data-guest-cart-clear]').click();
   await close();
   await page.goto(baseURL+'/customer.html?screen=account');
   await page.locator('#email').fill(user.email);await page.locator('#password').fill('fixture-password');await page.locator('#loginBtn').click();
   await page.locator('.client-account-overview').waitFor();
   assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
   assert.equal(await page.locator('.client-account-stats [data-client-order-filter="active"] strong').textContent(),'4');
   assert.equal(await page.locator('.client-account-stats [data-client-order-filter="action"] strong').textContent(),'2');
   assert.equal(await page.locator('.client-account-stats [data-client-order-filter="completed"] strong').textContent(),'1');
   await geometry();await page.screenshot({path:`${output}/${label}-account.png`,fullPage:true});
   await filter('action');assert.equal(await cards().count(),2);assert.ok(page.url().includes('screen=requests'));
   await filter('cancelled');assert.equal(await cards().count(),1);assert.equal(await cards().locator('.client-next-action').count(),0);
   await filter('completed');assert.equal(await cards().count(),1);assert.equal(await cards().locator('.client-next-action').count(),0);
   await filter('all');assert.equal(await cards().count(),6);
   await page.locator('#clientOrderSearch').fill('١٢٠٠١');assert.equal(await cards().count(),1);assert.equal(await cards().locator('.client-order-title').getAttribute('data-request'),'pay');
   assert.equal(await page.locator('#clientOrderSearch').evaluate(el=>el===document.activeElement),true,'Search must retain focus');
   await page.locator('#clientOrderSearch').fill('not-a-product');assert.equal(await cards().count(),0);await page.locator('[data-action="reset-order-filters"]').click();assert.equal(await cards().count(),6);
   await page.locator('.client-order-title[data-request="pay"]').press('Enter');await page.locator('#modal .payment-card').waitFor();assert.equal(await page.locator('#modal .tracking-timeline').count(),1);await close();
   await page.locator('.client-order-title[data-cart-order="cart"]').click();await page.locator('#modal .cart-order-line').waitFor();assert.equal(await page.locator('#modal .cart-order-line').count(),1);await close();
   await page.locator('.client-order-title[data-ready-order="ready"]').click();await page.locator('#modal .tracking-timeline').waitFor();await close();
   await page.locator('.client-next-action[data-client-offers-request="quote"]').click();await page.locator('#modal .client-compare-quote').waitFor();await close();
   await geometry();await page.screenshot({path:`${output}/${label}-orders.png`,fullPage:true});
   await page.locator('#bottomNav [data-screen="account"]').click();await page.locator('.client-account-overview').waitFor();
   await page.locator('[data-client-currency]').selectOption('USD');await page.locator('[data-save-client-currency]').click();await page.waitForFunction(()=>document.querySelector('.account-currency-setting strong')?.textContent.includes('USD'));assert.equal(user.preferredCurrency,'USD');
   failCurrency=true;await page.locator('[data-client-currency]').selectOption('SAR');await page.locator('[data-save-client-currency]').click();await page.waitForFunction(()=>!document.querySelector('[data-save-client-currency]').disabled);assert.equal(user.preferredCurrency,'USD');assert.ok((await page.locator('.account-currency-setting strong').innerText()).includes('USD'));failCurrency=false;
   await page.locator('[data-action="toggle-language"]').click();assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'ltr':'rtl');await geometry();await page.locator('[data-action="toggle-language"]').click();
   await page.locator('[data-action="new-request"]').click();await page.locator('#newRequestForm').waitFor();await close();
   empty=true;await page.reload();await page.locator('.client-account-overview .client-empty').waitFor();assert.equal(logins,1,'Refresh must preserve the session');await filter('all');await page.locator('#clientOrderResults .client-empty').waitFor();assert.equal(await cards().count(),0);
   await page.locator('#bottomNav [data-screen="account"]').click();await page.locator('[data-action="logout"]').click();await page.waitForFunction(()=>!sessionStorage.getItem('m-platform.session.v1'));
   assert.deepEqual(errors,[]);report.push({label,pass:true});console.log('PASS '+label);
  }catch(error){report.push({label,pass:false,error:error.stack});console.error('FAIL '+label+': '+error.stack);await page.screenshot({path:`${output}/${label}-failure.png`,fullPage:true});}
  await context.close();
 }
 await browser.close();
}
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
assert.equal(report.filter(r=>!r.pass).length,0,'Current customer portal scenarios must pass');
