import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Exercise the real built application with synthetic API responses. No production writes.
const output = 'layout-results';
await mkdir(output, { recursive: true });
const titleAr = 'باور بنك وشاحن متنقل بسعة كبيرة مع كابلات متعددة وشاشة رقمية';
const titleEn = 'Power bank with multiple cables and a digital display ' + 'LongUnbrokenProductCode'.repeat(4);
const translation = { titleAr, titleEn, descriptionAr: titleAr.repeat(2), descriptionEn: titleEn };
const images = Array.from({ length: 5 }, (_, i) => `/api/media/test-${i}`);
const requests = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, displayNo: 10001+i, product: titleAr, translation, specs: titleEn, quantity: 1000, country: 'United Arab Emirates', createdAt: '2026-09-17', neededDate: '2026-10-17', images, customerId: 'client', supplierIds: ['supplier'], status: i%2 ? 'sent' : 'review', version: 1 }));
const publicOffers = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, displayNo: 10101+i, product: titleAr, translation, specs: titleEn, images: images.slice(0,(i%5)+1), status:'published', supplierId:'supplier', currency:'USD', unitPrice:12, moq:500, leadTime:30 }));
const quotes = requests.slice(0,4).map((r,i)=>({id:`q${i}`,requestId:r.id,supplierId:'supplier',status:i%2?'pending':'published',unitPrice:10,moq:500,leadTime:20,currency:'USD',images,translation,createdAt:'2026-09-17'}));
const accounts = ['client','supplier','admin'].map(role=>({id:role,role,name: role==='admin'?'مدير المنصة':titleAr,company:titleEn,email:`${role}@example.test`,isOwner:role==='admin'}));
const interests = [{id:'i1',offerId:'p0',status:'pending',createdAt:'2026-09-17'}];
const notes = Array.from({length:20},(_,i)=>({id:i+1,titleAr,titleEn,bodyAr:titleAr,bodyEn:titleEn,createdAt:'2026-09-17'}));
const results = [];
let failures = 0;

async function geometry(page, scope = '#appView', squares = true) {
  const data = await page.evaluate(({scope,squares}) => {
    const root=document.querySelector(scope), width=innerWidth;
    const visible=[root,...root.querySelectorAll('*')].filter(el=>el.getClientRects().length);
    const outside=visible.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > width+1;}).map(el=>({tag:el.tagName,cls:el.className,x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width}));
    const squareErrors=squares?[...root.querySelectorAll('.media-placeholder,.admin-image-tile>span,.guest-offer-image,.guest-modal-images img,.public-offer-media')].filter(el=>el.getClientRects().length && Math.abs(el.getBoundingClientRect().width-el.getBoundingClientRect().height)>1).map(el=>el.className):[];
    const screen=document.querySelector('#screen'),nav=document.querySelector('#bottomNav'),head=document.querySelector('.app-header');
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    return {width,documentWidth:document.documentElement.scrollWidth,outside,squareErrors,nav:rect(nav),head:rect(head),screenWidth:screen.scrollWidth,screenClient:screen.clientWidth};
  },{scope,squares});
  assert.deepEqual(data.outside,[],`Horizontal overflow: ${JSON.stringify(data.outside.slice(0,5))}`);
  assert.deepEqual(data.squareErrors,[],'Non-square images');
  assert.ok(data.documentWidth<=data.width+1,'Document is wider than viewport');
  if(scope==='#appView'){
    assert.ok(data.screenWidth<=data.screenClient+1,'Content has horizontal scrolling');
    assert.ok(Math.abs(data.nav.bottom-page.viewportSize().height)<1,'Bottom navigation is outside viewport');
    assert.ok(data.nav.height>=56,'Navigation is too small');
  }
  return data;
}

for (const [engine,type] of Object.entries({chromium,webkit})) {
 const browser=await type.launch({headless:true});
 for(const width of [390,430]) for(const language of ['ar','en']) for(const role of ['client','supplier','admin']) {
  const label=`${engine}-${width}-${language}-${role}`;
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  let stateCalls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>localStorage.setItem('CapacitorStorage.language',lang),language);
  await page.route('https://m-platform-tan.vercel.app/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes('/media/')) {
      const index=Number(path.match(/test-(\d)/)?.[1]||0);
      return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${index%2?120:640}" height="${index%2?600:160}"><rect width="100%" height="100%" fill="#1699db"/><text x="10" y="50" fill="white" font-size="30">${index+1}</text></svg>`});
    }
    let body={};
    if(path.endsWith('/auth/login')) body={user:accounts.find(a=>a.role===role),tokens:{accessToken:'fixture',refreshToken:'fixture'}};
    else if(path.endsWith('/state')) { stateCalls++; body={user:accounts.find(a=>a.role===role),requests,quotes,publicOffers,accounts,interests}; }
    else if(path.endsWith('/notifications')) body=notes;
    else if(path.endsWith('/app-config')) body={apiVersion:1};
    else if(path.endsWith('/mutations')) {
      const mutation=route.request().postDataJSON();
      if(mutation.collection!=='requests' || Object.keys(mutation.patch).join()!=='lastSeenQuoteAt') errors.push('Unexpected fixture mutation');
      body={ok:true}; // Opening a customer request marks its quotes as seen.
    }
    else { errors.push(`Unexpected API call ${path}`); return route.fulfill({status:500,json:{error:'Unexpected fixture endpoint'}}); }
    await route.fulfill({json:body});
  });
  try {
    await page.goto('http://127.0.0.1:4173');
    await page.locator('.guest-offer-card').first().waitFor();
    assert.equal(stateCalls,1,'Guest data must load once when the guest view is shown');
    await geometry(page,'#guestView');
    assert.equal(await page.locator('#guestOffers').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2,'Guest public offers must use two columns');
    assert.equal(await page.locator('.guest-offer-card').count(),20,'Guest page must show at most 20 products');
    assert.equal(await page.locator('#guestOffersPagination:visible').count(),1,'Guest pagination must appear when there are more than 20 products');
    assert.equal(await page.locator('#guestPrevPage').isDisabled(),true,'Guest previous must be disabled on first page');
    assert.equal(await page.locator('#guestNextPage').isDisabled(),false,'Guest next must be enabled on first page');
    assert.equal(await page.locator('#guestCompanyCard').count(),1,'Guest home must include MIG COMPANY footer card');
    assert.equal(await page.locator('#guestCompanyCard a[href="mailto:aljilany6@gmail.com"]').count(),1,'Guest footer email must be clickable');
    assert.equal(await page.locator('#guestCompanyCard a[href="https://wa.me/8618501770037"]').count(),1,'Guest footer WhatsApp must be clickable');
    await page.locator('#guestNextPage').click();
    assert.equal(await page.locator('.guest-offer-card').count(),20,'Guest second page must show at most 20 products');
    await page.locator('#guestNextPage').click();
    assert.equal(await page.locator('.guest-offer-card').count(),5,'Guest last page must show remaining products');
    assert.equal(await page.locator('#guestNextPage').isDisabled(),true,'Guest next must be disabled on last page');
    await page.locator('#guestPrevPage').click();
    await page.locator('#guestPrevPage').click();
    assert.equal(await page.locator('.guest-offer-card').count(),20,'Guest pagination must return to first page');
    assert.equal(await page.locator('.guest-offer-card').first().locator('.guest-facts span').count(),2,'Guest offer card must show only price and MOQ');
    assert.ok(await page.locator('.guest-offer-card').first().locator('h3').evaluate(el=>getComputedStyle(el).whiteSpace==='nowrap'),'Guest offer title must stay on one line');
    assert.ok(await page.locator('.guest-offer-card').first().locator('p').evaluate(el=>getComputedStyle(el).whiteSpace==='nowrap'),'Guest offer description must stay on one line');
    await page.locator('.guest-offer-card').first().click();
    await geometry(page,'#modal');
    await page.locator('.modal-close').click();
    await page.locator('#guestLoginBtn').click();
    await geometry(page,'#loginView');
    assert.equal(await page.locator('#loginCustomerRegister,#loginSupplierRegister').count(),2,'Login must expose separate customer and supplier registration buttons');
    await page.locator('#loginCustomerRegister').click();
    await page.locator('#registerView').waitFor({state:'visible'});
    await page.locator('#registerLoginBtn').click();
    await page.locator('#loginView').waitFor({state:'visible'});
    await page.locator('#email').fill('layout@example.test');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#loginBtn').click();
    await page.locator('#appView').waitFor({state:'visible'});
    if(role==='admin') await page.locator('[data-admin-root="home"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
    if(role==='client'){
      assert.equal(await page.locator('#bottomNav button:visible').count(),4,'Client navigation must contain four visible sections');
      assert.equal(await page.locator('#bottomNav [data-screen="offers"]:visible').count(),0,'Client Offers navigation must be removed');
      assert.equal(await page.locator('#bottomNav').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4,'Client navigation must use four equal columns');
      assert.ok(await page.locator('#screen').evaluate(el=>el.firstElementChild?.classList.contains('special-request-card')),'Custom request card must be first under the header');
      assert.equal(await page.locator('#screen .stats-grid').count(),0,'Request summary must not appear on the client home page');
      assert.equal(await page.locator('#screen [data-request]').count(),0,'Request list must not appear on the client home page');
      assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Client home must show at most 20 ready products');
      assert.equal(await page.locator('.public-offers-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2,'Ready products must use two columns');
      assert.equal(await page.locator('#screen .product-pagination:visible').count(),1,'Client pagination must appear when there are more than 20 ready products');
      assert.equal(await page.locator('#screen .company-footer-card').count(),1,'Client home must include MIG COMPANY footer card');
      assert.equal(await page.locator('#screen .company-footer-card a[href="mailto:aljilany6@gmail.com"]').count(),1,'Client footer email must be clickable');
      assert.equal(await page.locator('#screen .company-footer-card a[href="https://wa.me/8618501770037"]').count(),1,'Client footer WhatsApp must be clickable');
      await page.locator('#screen [data-action="ready-products-next"]').click();
      assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Client second page must show at most 20 products');
      await page.locator('#screen [data-action="ready-products-next"]').click();
      assert.equal(await page.locator('#screen .public-offer-card').count(),5,'Client last page must show remaining ready products');
      await page.locator('#screen [data-action="ready-products-prev"]').click();
      await page.locator('#screen [data-action="ready-products-prev"]').click();
      assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Client pagination must return to first page');
      await page.locator('.special-request-card [data-action="new-request"]').click();
      await page.locator('#modal').waitFor({state:'visible'});
      await page.locator('.modal-close').click();
      const firstOffer=page.locator('.public-offer-card').first();
      await firstOffer.click();
      await page.locator('#modal').waitFor({state:'visible'});
      assert.ok((await page.locator('#modalBody').textContent()).includes('30'),'Production time must remain in ready-product details');
      assert.equal(await page.locator('#modal [data-interest]').count(),1,'Request-this-offer button must remain in ready-product details');
      await page.locator('.modal-close').click();
    }
    // Simulate a top notch, landscape side inset and home indicator.
    await page.addStyleTag({content:':root { --safe-top: 47px; --safe-bottom: 34px; --safe-left: 0px; --safe-right: 0px; }'});
    const screens=role==='client'?['home','requests','notifications','account']:['home','requests','offers','notifications','account'];
    for(const screen of screens) {
      await page.locator(`#bottomNav [data-screen="${screen}"]`).click();
      if(role==='admin' && screen!=='notifications') await page.locator(`[data-admin-root="${screen}"]`).waitFor();
      const before=await geometry(page);
      await page.locator('#screen').evaluate(el=>el.scrollTop=el.scrollHeight);
      const after=await geometry(page);
      assert.deepEqual(after.nav,before.nav,'Navigation moved when content scrolled');
      assert.deepEqual(after.head,before.head,'Header moved when content scrolled');
      await page.locator('#screen').evaluate(el=>el.scrollTop=0);
      if(screen==='home'&&role==='client'){
        const firstOffer=page.locator('.public-offer-card').first();
        assert.equal(await firstOffer.locator('.public-offer-facts span').count(),2,'Ready-product card must show only price and MOQ');
        assert.ok(await firstOffer.locator('h3').evaluate(el=>getComputedStyle(el).whiteSpace==='nowrap'),'Ready-product title must stay on one line');
        assert.ok(await firstOffer.locator('p').evaluate(el=>getComputedStyle(el).whiteSpace==='nowrap'),'Ready-product description must stay on one line');
      }
      if(screen==='requests'){
        assert.ok(await page.locator('#screen').evaluate(el=>el.scrollHeight>el.clientHeight),'Long list did not scroll');
        if(role==='client'){
          assert.equal(await page.locator('#screen .client-request-stats').count(),1,'Request summary must appear inside Requests');
          assert.equal(await page.locator('[data-client-request-group="custom"] [data-request]').count(),100,'All custom requests must be inside Requests');
          assert.equal(await page.locator('[data-client-request-group="ready"] [data-public-offer]').count(),1,'Ready-product requests must be inside Requests');
        }
        await page.screenshot({path:`${output}/${label}-requests.png`});
        const card=page.locator(role==='admin'?'[data-admin-open="request"]':role==='supplier'?'[data-supplier-request]':'[data-request]').first();
        await card.click();
        await page.locator('#modal').waitFor({state:'visible'});
        await geometry(page,'#modal');
        await page.locator('.modal-close').click();
      }
      results.push({label,screen,pass:true,nav:after.nav,contentWidth:after.screenClient});
    }
    // Resize an existing session, then switch language without reloading it.
    await page.setViewportSize({width:844,height:390});
    await page.addStyleTag({content:':root { --safe-top: 0px; --safe-left: 47px; --safe-right: 47px; --safe-bottom: 21px; }'});
    await geometry(page);
    await page.setViewportSize({width,height:844});
    await page.locator('#appLangBtn').click();
    if(role==='admin') await page.waitForFunction(lang=>document.querySelector('[data-admin-key]')?.getAttribute('data-admin-key')?.includes('|'+lang+'|'),language==='ar'?'en':'ar');
    await geometry(page);
    assert.deepEqual(errors,[],'Runtime errors');
    console.log(`PASS ${label}: guest, login, 5 screens, long-list scroll, modal, image ratios, safe areas, rotation, language switch`);
  } catch(error) {
    failures++;
    results.push({label,pass:false,error:error.stack});
    console.error(`FAIL ${label}: ${error.stack}`);
    await page.screenshot({path:`${output}/${label}-failure.png`}).catch(()=>{});
  } finally {await context.close();}
 }
 await browser.close();
}
await writeFile(`${output}/report.json`,JSON.stringify(results,null,2));
assert.equal(failures,0,`${failures} mobile scenarios failed`);
