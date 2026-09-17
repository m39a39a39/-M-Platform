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
const publicOffers = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, displayNo: 10101+i, product: titleAr, translation, specs: titleEn, images: images.slice(0,i+1), status: i%2 ? 'pending' : 'published', supplierId:'supplier', currency:'USD', unitPrice:12, moq:500, leadTime:30 }));
const quotes = requests.slice(0,4).map((r,i)=>({id:`q${i}`,requestId:r.id,supplierId:'supplier',status:i%2?'pending':'published',unitPrice:10,moq:500,leadTime:20,currency:'USD',images,translation,createdAt:'2026-09-17'}));
const accounts = ['client','supplier','admin'].map(role=>({id:role,role,name: role==='admin'?'مدير المنصة':titleAr,company:titleEn,email:`${role}@example.test`,isOwner:role==='admin'}));
const notes = Array.from({length:20},(_,i)=>({id:i+1,titleAr,titleEn,bodyAr:titleAr,bodyEn:titleEn,createdAt:'2026-09-17'}));
const results = [];
let failures = 0;

async function geometry(page, scope = '#appView', squares = true) {
  const data = await page.evaluate(({scope,squares}) => {
    const root=document.querySelector(scope), width=innerWidth;
    const visible=[root,...root.querySelectorAll('*')].filter(el=>el.getClientRects().length);
    const outside=visible.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > width+1;}).map(el=>({tag:el.tagName,cls:el.className,x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width}));
    const squareErrors=squares?[...root.querySelectorAll('.media-placeholder,.admin-image-tile>span,.guest-offer-image,.guest-modal-images img')].filter(el=>el.getClientRects().length && Math.abs(el.getBoundingClientRect().width-el.getBoundingClientRect().height)>1).map(el=>el.className):[];
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
  const errors=[];
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
    else if(path.endsWith('/state')) body={user:accounts.find(a=>a.role===role),requests,quotes,publicOffers,accounts,interests:[]};
    else if(path.endsWith('/notifications')) body=notes;
    else if(path.endsWith('/app-config')) body={apiVersion:1};
    else throw new Error(`Unexpected API call ${path}`);
    await route.fulfill({json:body});
  });
  try {
    await page.goto('http://127.0.0.1:4173');
    await page.locator('.guest-offer-card').first().waitFor();
    await geometry(page,'#guestView');
    await page.locator('.guest-offer-card').first().click();
    await geometry(page,'#modal');
    await page.locator('.modal-close').click();
    await page.locator('#guestLoginBtn').click();
    await geometry(page,'#loginView');
    await page.locator('#email').fill('layout@example.test');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#loginBtn').click();
    await page.locator('#appView').waitFor({state:'visible'});
    if(role==='admin') await page.locator('[data-admin-root="home"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
    // Simulate a top notch, landscape side inset and home indicator.
    await page.addStyleTag({content:':root { --safe-top: 47px; --safe-bottom: 34px; --safe-left: 0px; --safe-right: 0px; }'});
    for(const screen of ['home','requests','offers','notifications','account']) {
      await page.locator(`#bottomNav [data-screen="${screen}"]`).click();
      if(role==='admin' && screen!=='notifications') await page.locator(`[data-admin-root="${screen}"]`).waitFor();
      const before=await geometry(page);
      await page.locator('#screen').evaluate(el=>el.scrollTop=el.scrollHeight);
      const after=await geometry(page);
      assert.deepEqual(after.nav,before.nav,'Navigation moved when content scrolled');
      assert.deepEqual(after.head,before.head,'Header moved when content scrolled');
      await page.locator('#screen').evaluate(el=>el.scrollTop=0);
      if(screen==='requests'){
        assert.ok(await page.locator('#screen').evaluate(el=>el.scrollHeight>el.clientHeight),'Long list did not scroll');
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
