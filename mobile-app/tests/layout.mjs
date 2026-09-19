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
const trackingFlow=['received','reviewing','sourcing','quotes_available','quote_selected','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
const requests = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, displayNo: 10001+i, product: titleAr, translation, specs: titleEn, quantity: 1000, country: 'United Arab Emirates', createdAt: '2026-09-17', neededDate: '2026-10-17', images, customerId: 'client', supplierIds: ['supplier'], status: i%2 ? 'sent' : 'review', trackingStatus:trackingFlow[i%trackingFlow.length], trackingUpdatedAt:'2026-09-18', trackingNote:i===0?'المصنع يتوقع اكتمال الإنتاج قريبًا':'', version: 1 }));
const bankAccounts=[{id:'bank-usd',label:'MIG USD',beneficiary:'MIG COMPANY',bankName:'Fixture Bank',iban:'AE070331234567890123456',swift:'FIXTAEAD',accountNumber:'1234567890',country:'United Arab Emirates',currency:'USD',active:true,order:0},{id:'bank-aed',label:'حساب الإمارات',beneficiary:'MIG COMPANY',bankName:'Fixture Bank AED',iban:'AE090331234567890123457',swift:'FIXTAEAD',accountNumber:'9876543210',country:'United Arab Emirates',currency:'AED',active:true,order:1}];
requests[0]={...requests[0],status:'sent',trackingStatus:'payment_confirmation',trackingNote:'',selectedQuoteId:'q0',paymentStatus:'awaiting_receipt',paymentMessage:'يرجى تحويل الدفعة الأولى ثم إرفاق إيصال الدفع.',paymentBankAccountId:'bank-usd',paymentBankAccount:bankAccounts[0],paymentAmount:5250,paymentCurrency:'USD',paymentRequestedAt:'2026-09-18'};
requests[2]={...requests[2],status:'sent',trackingStatus:'quote_selected',selectedQuoteId:'q2'};
const categories=[{id:'mobile',nameAr:'إكسسوارات الجوال',nameEn:'Mobile accessories',active:true,order:0},{id:'electronics',nameAr:'إلكترونيات',nameEn:'Electronics',active:true,order:1},{id:'home',nameAr:'المنزل',nameEn:'Home',active:true,order:2}];
const publicOffers = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, displayNo: 10101+i, product: titleAr, translation, specs: titleEn, images: images.slice(0,(i%5)+1), status:'published', supplierId:'supplier', categoryId:categories[i%3].id, currency:'USD', unitPrice:12, moq:500, leadTime:30 }));
const quotes = requests.slice(0,4).map((r,i)=>({id:`q${i}`,requestId:r.id,supplierId:'supplier',status:i%2?'pending':'published',unitPrice:10,moq:500,leadTime:20,currency:'USD',images,translation,createdAt:'2026-09-17'}));
const accounts = ['client','supplier','admin'].map(role=>({id:role,role,name: role==='admin'?'مدير المنصة':titleAr,company:titleEn,email:`${role}@example.test`,isOwner:role==='admin'}));
const interests = [{id:'i1',offerId:'p0',status:'active',trackingStatus:'payment_confirmation',trackingUpdatedAt:'2026-09-18',trackingNote:'بانتظار تأكيد الدفع',paymentStatus:'receipt_submitted',paymentMessage:'يرجى دفع قيمة المنتج وإرسال الإيصال.',paymentReceipt:{src:images[0],mime:'image/jpeg',submittedAt:'2026-09-18'},createdAt:'2026-09-17',customerId:'client',version:1}];
const notes = Array.from({length:20},(_,i)=>({id:i+1,titleAr,titleEn,bodyAr:titleAr,bodyEn:titleEn,createdAt:'2026-09-17'}));
const clientPaymentNote={id:9001,event:'payment_required_request',entityId:'r0',titleAr:'بانتظار تأكيد الدفع',titleEn:'Awaiting payment confirmation',bodyAr:'يرجى تحويل الدفعة الأولى ثم إرفاق إيصال الدفع.',bodyEn:'Please upload the payment receipt.',action:'upload_receipt',target:{screen:'customerPayment',entityType:'request',entityId:'r0'},createdAt:'2026-09-19'};
const adminPaymentNote={id:9002,event:'payment_receipt_submitted_interest',entityId:'i1',titleAr:'إيصال دفع جديد',titleEn:'New payment receipt',bodyAr:'تم رفع إيصال دفع جديد لطلب منتج جاهز.',bodyEn:'A new receipt was uploaded.',target:{screen:'adminPayment',entityType:'interest',entityId:'i1'},createdAt:'2026-09-19'};
const results = [];
let failures = 0;

async function geometry(page, scope = '#appView', squares = true) {
  const data = await page.evaluate(({scope,squares}) => {
    const root=document.querySelector(scope), width=innerWidth;
    const visible=[root,...root.querySelectorAll('*')].filter(el=>el.getClientRects().length);
    const outside=visible.filter(el=>{if(el.closest?.('.category-filter-bar'))return false;const r=el.getBoundingClientRect();return r.left < -1 || r.right > width+1;}).map(el=>({tag:el.tagName,cls:el.className,x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width}));
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
  let publicOfferMutation=null;
  let interestMutation=null;
  let requestTrackingMutation=null;
  let paymentReceiptSubmission=null;
  let paymentReviewSubmission=null;
  const uploadedSources=[];
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
    else if(path.endsWith('/state')) { stateCalls++; body={user:accounts.find(a=>a.role===role),requests,quotes,publicOffers,accounts,interests,settings:{categories,...(role==='admin'?{bankAccounts}:{}),_version:1}}; }
    else if(path.endsWith('/notifications')) body=role==='client'?[clientPaymentNote,...notes.slice(1)]:role==='admin'?[adminPaymentNote,...notes.slice(1)]:notes;
    else if(path.endsWith('/notifications/read')) body={ok:true};
    else if(path.endsWith('/payment-receipts')) {paymentReceiptSubmission=route.request().postDataJSON();body={ok:true,paymentStatus:'receipt_submitted'};}
    else if(path.endsWith('/payment-review')) {paymentReviewSubmission=route.request().postDataJSON();body={ok:true,paymentStatus:paymentReviewSubmission.action==='confirm'?'confirmed':'reupload_requested'};}
    else if(path.endsWith('/app-config')) body={apiVersion:1};
    else if(path.endsWith('/uploads')) {
      const upload=route.request().postDataJSON();
      uploadedSources.push(upload.source);
      body={src:`/api/media/upload-${uploadedSources.length}`};
    }
    else if(path.endsWith('/mutations')) {
      const mutation=route.request().postDataJSON();
      if(mutation.collection==='publicOffers') publicOfferMutation=mutation;
      else if(mutation.collection==='interests') interestMutation=mutation;
      else if(mutation.collection==='requests'&&mutation.patch?.product) body={ok:true};
      else if(mutation.collection==='requests'&&('trackingStatus' in mutation.patch||'trackingNote' in mutation.patch)) requestTrackingMutation=mutation;
      else if(mutation.collection!=='requests' || Object.keys(mutation.patch).join()!=='lastSeenQuoteAt') errors.push('Unexpected fixture mutation');
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
    assert.equal(await page.locator('#guestCategoryFilters button').count(),4,'Guest must show All plus three category buttons');
    await page.locator('#guestCategoryFilters [data-guest-category="mobile"]').click();
    assert.equal(await page.locator('.guest-offer-card').count(),15,'Guest category filter must show only matching products');
    assert.equal(await page.locator('#guestOffersPagination:visible').count(),0,'Category with 15 products must not paginate');
    await page.locator('#guestCategoryFilters [data-guest-category="all"]').click();
    assert.equal(await page.locator('.guest-offer-card').count(),20,'Guest All category must restore first page');
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
    await page.locator('.guest-offer-card').first().locator('.guest-offer-body').click();
    await geometry(page,'#modal');
    await page.locator('#modal .guest-modal-images img').first().click();
    await page.locator('#imageViewer:not(.hidden)').waitFor();
    assert.equal(await page.locator('#imageViewerImage').count(),1,'Guest image must open in the full-screen viewer');
    await page.locator('[data-image-viewer-close]').click();
    await page.locator('#imageViewer').waitFor({state:'hidden'});
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
      assert.equal(await page.locator('#screen .category-filter-bar button').count(),4,'Client must show All plus three category buttons');
      await page.locator('#screen [data-category="mobile"]').click();
      assert.equal(await page.locator('#screen .public-offer-card').count(),15,'Client category filter must show matching products only');
      assert.equal(await page.locator('#screen .product-pagination:visible').count(),0,'Filtered 15 products must not paginate');
      await page.locator('#screen [data-category="all"]').click();
      assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Client All category must restore first page');
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
      if(label==='chromium-390-ar-client'){
        const largeSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="1800"><defs><linearGradient id="g"><stop stop-color="#1699db"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="2600" height="1800" fill="url(#g)"/><text x="100" y="900" font-size="220" fill="white">MIG</text><!--${'x'.repeat(1400000)}--></svg>`;
        assert.ok(Buffer.byteLength(largeSvg)>1048576,'Compression fixture must exceed the old 1 MB limit');
        await page.locator('#newRequestForm input[name="product"]').fill('Compression test');
        await page.locator('#newRequestForm textarea[name="specs"]').fill('Large image compression');
        await page.locator('#newRequestForm input[name="quantity"]').fill('100');
        await page.locator('#requestFiles').setInputFiles({name:'large.svg',mimeType:'image/svg+xml',buffer:Buffer.from(largeSvg)});
        await page.locator('#newRequestForm button[type="submit"]').click();
        await page.locator('#modal').waitFor({state:'hidden'});
        assert.equal(uploadedSources.length,1,'Large selected image must be uploaded after compression');
        assert.ok(uploadedSources[0].startsWith('data:image/jpeg;base64,'),'Large selected image must be converted to compressed JPEG');
        assert.ok(uploadedSources[0].length<1300000,'Compressed upload payload should remain below the normal API body limit');
        await page.locator('#bottomNav [data-screen="home"]').click();
        await page.locator('.special-request-card').waitFor();
      }else await page.locator('.modal-close').click();
      const firstOffer=page.locator('.public-offer-card').first();
      await firstOffer.locator('.public-offer-content').click();
      await page.locator('#modal').waitFor({state:'visible'});
      assert.ok((await page.locator('#modalBody').textContent()).includes('30'),'Production time must remain in ready-product details');
      assert.equal(await page.locator('#modal [data-interest]').count(),1,'Request-this-offer button must remain in ready-product details');
      assert.equal(await page.locator('#modal .tracking-timeline').count(),1,'Requested ready product must show the unified order timeline');
      assert.equal(await page.locator('#modal .tracking-step').count(),9,'Ready-product timeline must skip sourcing and quote stages');
      assert.equal(await page.locator('#modal .payment-card').count(),1,'Ready-product payment status must appear inside the order');
      assert.ok((await page.locator('#modal .payment-card').textContent()).includes(language==='ar'?'بانتظار المراجعة':'awaiting review'),'Submitted ready-product receipt must show as awaiting review');
      await page.locator('.modal-close').click();
    }
    if(role==='supplier'){
      assert.equal(await page.locator('#screen .supplier-public-cta [data-action="new-public"]').count(),1,'Supplier home must expose Add public offer prominently');
      assert.equal(await page.locator('#screen .supplier-public-preview').count(),3,'Supplier home must show only the three latest public offers');
      assert.equal(await page.locator('#screen .supplier-public-preview .status-pill').count(),3,'Recent supplier public offers must show review status');
      await page.locator('#screen .supplier-public-cta [data-action="new-public"]').click();
      await page.locator('#publicForm').waitFor();
      assert.equal(await page.locator('#publicForm input[name="product"]').count(),1,'Supplier home CTA must open the existing public-offer form');
      assert.equal(await page.locator('#publicForm input[name="unitPrice"]').count(),1,'Public-offer form must include price');
      assert.equal(await page.locator('#publicForm select[name="currency"]').count(),1,'Public-offer form must include currency');
      await page.locator('.modal-close').click();
      await page.locator('#screen [data-action="view-public-offers"]').click();
      await page.locator('#screen [data-sub="public"].active').waitFor();
      assert.equal(await page.locator('#screen [data-action="new-public"]').count(),1,'My public offers page must retain Add public offer action');
      assert.equal(await page.locator('#screen [data-own-public]').count(),45,'View all must open the complete My public offers list');
      await page.locator('#bottomNav [data-screen="home"]').click();
      await page.locator('#screen .supplier-public-cta').waitFor();
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
      if(screen==='notifications'&&role==='client'){
        assert.equal(await page.locator('[data-payment-notification="9001"]').count(),1,'Payment-required notification must include an upload receipt action');
        if(label==='chromium-390-ar-client'){
          await page.locator('[data-payment-notification="9001"]').click();
          await page.locator('#paymentReceiptForm').waitFor();
          const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
          await page.locator('#paymentReceiptFile').setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:pdf});
          await page.locator('#paymentReceiptForm button[type="submit"]').click();
          await page.locator('#modal').waitFor({state:'hidden'});
          assert.equal(paymentReceiptSubmission?.entityType,'request','Payment notification must upload receipt for the correct order type');
          assert.equal(paymentReceiptSubmission?.entityId,'r0','Payment notification must upload receipt for the correct order');
          assert.ok(paymentReceiptSubmission?.source?.startsWith('data:application/pdf;base64,'),'PDF receipt must be sent as a PDF data URL');
          paymentReceiptSubmission=null;
          await page.locator('#bottomNav [data-screen="notifications"]').click();
        }
      }
      if(screen==='offers'&&role==='admin'){
        await page.locator('[data-admin-offer-tab="all"]').click();
        await page.locator('[data-admin-open="public"]').first().click();
        await page.locator('#adminPublicOfferForm').waitFor();
        await geometry(page,'#modal');
        assert.equal(await page.locator('#adminPublicOfferForm input[name="product"]').count(),1,'Admin must be able to edit public offer product');
        assert.equal(await page.locator('#adminPublicOfferForm input[name="unitPrice"]').count(),1,'Admin must be able to edit public offer price');
        assert.equal(await page.locator('#adminPublicOfferForm select[name="categoryId"]').count(),1,'Admin must be able to edit public offer category');
        assert.equal(await page.locator('#adminPublicOfferForm select[name="status"]').count(),1,'Admin owner must be able to edit publication status');
        assert.equal(await page.locator('#adminPublicOfferForm #adminPublicFiles[accept="image/*"]').count(),1,'Admin public offer editor must accept large image selections for compression');
        await page.locator('#adminPublicOfferForm input[name="unitPrice"]').fill('19.75');
        await page.locator('#adminPublicOfferForm [data-admin-public-redaction]').check();
        await page.locator('#adminPublicOfferForm button[type="submit"]').click();
        await page.locator('#modal').waitFor({state:'hidden'});
        assert.equal(publicOfferMutation?.collection,'publicOffers','Admin public offer edit must submit a publicOffers mutation');
        assert.equal(publicOfferMutation?.patch?.unitPrice,'19.75','Admin public offer edit must submit edited price');
        assert.equal(publicOfferMutation?.patch?.images?.length,publicOffers[0].images.length,'Admin public offer edit must preserve selected images');
        assert.equal(publicOfferMutation?.redactionConfirmed,true,'Published public offer edits must confirm privacy review');
        publicOfferMutation=null;
        await page.locator('[data-admin-offer-tab="interests"]').click();
        await page.locator('[data-admin-interest="i1"] .list-card-title').click();
        await page.locator('[data-admin-interest-tracking-status]').waitFor();
        assert.equal(await page.locator('[data-admin-interest-status]').count(),0,'Legacy interest status selector must be removed');
        assert.equal(await page.locator('[data-admin-interest-tracking-status] option').count(),12,'Ready-product requests must use fulfillment tracking statuses and exceptions');
        assert.equal(await page.locator('#modal .admin-payment-review').count(),1,'Admin must see submitted payment receipt review controls');
        assert.equal(await page.locator('#modal [data-admin-payment-confirm]').count(),1,'Admin must be able to confirm payment');
        assert.equal(await page.locator('#modal [data-admin-payment-reupload]').count(),1,'Admin must be able to request a new receipt');
        if(label==='chromium-390-ar-admin'){
          await page.locator('#modal [data-admin-payment-confirm]').click();
          await page.locator('#modal').waitFor({state:'hidden'});
          assert.equal(paymentReviewSubmission?.entityType,'interest','Payment review must target the ready-product order');
          assert.equal(paymentReviewSubmission?.entityId,'i1','Payment review must target the correct ready-product order');
          assert.equal(paymentReviewSubmission?.action,'confirm','Admin confirm button must submit confirm action');
          paymentReviewSubmission=null;
          await page.locator('[data-admin-offer-tab="interests"]').click();
          await page.locator('[data-admin-interest="i1"] .list-card-title').click();
          await page.locator('[data-admin-interest-tracking-status]').waitFor();
        }
        await page.locator('[data-admin-interest-tracking-status]').selectOption('production');
        await page.locator('[data-admin-interest-tracking-note]').fill('بدأ الإنتاج');
        await page.locator('[data-admin-save-interest-tracking]').click();
        await page.locator('#modal').waitFor({state:'hidden'});
        assert.equal(interestMutation?.collection,'interests','Ready-product tracking must update the interest record');
        assert.equal(interestMutation?.patch?.trackingStatus,'production','Admin must save the selected ready-product tracking stage');
        assert.equal(interestMutation?.redactionConfirmed,false,'Tracking-only ready-product updates must not require redaction');
        interestMutation=null;
        await page.locator('[data-admin-offer-tab="categories"]').click();
        await page.locator('[data-admin-category-new]').waitFor();
        assert.equal(await page.locator('[data-admin-category-new]').count(),1,'Admin categories must allow adding a category');
        assert.equal(await page.locator('.admin-category-row').count(),3,'Admin categories must list configured categories');
      }
      if(screen==='requests'){
        assert.ok(await page.locator('#screen').evaluate(el=>el.scrollHeight>el.clientHeight),'Long list did not scroll');
        if(role==='admin')assert.equal(await page.locator('[data-admin-request-filter]').count(),1,'Admin requests must include status filter');
        if(role==='client'){
          assert.equal(await page.locator('#screen .client-request-stats').count(),1,'Request summary must appear inside Requests');
          assert.equal(await page.locator('[data-client-request-group="custom"] [data-request]').count(),100,'All custom requests must be inside Requests');
          assert.equal(await page.locator('[data-client-request-group="ready"] [data-public-offer]').count(),1,'Ready-product requests must be inside Requests');
        }
        await page.screenshot({path:`${output}/${label}-requests.png`});
        const card=role==='admin'?page.locator('[data-admin-open="request"][data-admin-id="r2"]'):page.locator(role==='supplier'?'[data-supplier-request]':'[data-request]').first();
        await card.locator('.list-card-title').click();
        await page.locator('#modal').waitFor({state:'visible'});
        await geometry(page,'#modal');
        if(role==='client'){
          assert.equal(await page.locator('#modal .tracking-timeline').count(),1,'Client request details must show a tracking timeline');
          assert.equal(await page.locator('#modal .tracking-step').count(),13,'Tracking timeline must include all normal stages');
          assert.equal(await page.locator('#modal .payment-card').count(),1,'Payment stage must show payment instructions to the customer');
          assert.equal(await page.locator('#modal [data-payment-upload]').count(),1,'Awaiting payment must allow the customer to upload a receipt');
          assert.equal(await page.locator('#modal .payment-bank-card').count(),1,'Payment stage must show the selected bank account to the customer');
          assert.ok((await page.locator('#modal .payment-bank-card').textContent()).includes('5250'),'Payment card must show the requested amount');
          assert.equal(await page.locator('#modal [data-repeat-request]').count(),1,'Customer request details must include Repeat request');
        }
        if(role==='admin'){assert.equal(await page.locator('#modal [data-admin-tracking-status]').count(),1,'Admin request details must include tracking status control');assert.equal(await page.locator('#modal .admin-selected-quote-card:not(.missing)').count(),1,'Admin request details must show the selected quote summary');}
        if(role==='supplier')assert.equal(await page.locator('#modal .payment-card,#modal .admin-payment-review').count(),0,'Supplier must never see payment receipt or payment instructions');
        const viewable=page.locator('#modal img[data-image-viewer]').first();
        if(await viewable.count()){
          await viewable.click();
          await page.locator('#imageViewer:not(.hidden)').waitFor();
          assert.ok((await page.locator('#imageViewerCounter').textContent()).includes('/'),'Request image must open in full-screen viewer');
          await page.locator('[data-image-viewer-close]').click();
        }
        if(role==='admin'){
          await page.locator('#modal [data-admin-tracking-status]').selectOption('payment_confirmation');
          assert.equal(await page.locator('#modal .admin-payment-message-field:not(.hidden)').count(),1,'Choosing payment stage must reveal the editable customer payment message');
          assert.equal(await page.locator('#modal [data-admin-payment-bank]').inputValue(),'bank-usd','Matching bank account should be selected automatically for the quote currency');
          assert.equal(await page.locator('#modal [data-admin-payment-amount]').inputValue(),'10000','Amount due must default to unit price × request quantity');
          assert.equal(await page.locator('#modal [data-admin-payment-currency]').inputValue(),'USD','Payment currency must come from the selected quote');
          assert.equal(await page.locator('#modal [data-admin-payment-currency]').isDisabled(),true,'RFQ payment currency must be locked to the selected quote currency');
          await page.locator('#modal [data-admin-payment-amount]').fill('3000');
          await page.locator('#modal [data-admin-payment-message]').fill('يرجى تحويل 30% وإرفاق إيصال الدفع.');
          await page.locator('#modal [data-admin-save-tracking]').click();
          await page.locator('#modal').waitFor({state:'hidden'});
          assert.equal(requestTrackingMutation?.collection,'requests','Admin request tracking must submit a requests mutation');
          assert.equal(requestTrackingMutation?.patch?.trackingStatus,'payment_confirmation','Admin must save the payment-confirmation stage');
          assert.equal(requestTrackingMutation?.patch?.paymentMessage,'يرجى تحويل 30% وإرفاق إيصال الدفع.','Admin payment message must be sent with the stage update');
          assert.equal(requestTrackingMutation?.patch?.paymentBankAccountId,'bank-usd','Admin must attach the selected bank account');
          assert.equal(requestTrackingMutation?.patch?.paymentAmount,'3000','Admin must be able to reduce the auto-calculated total for a partial payment');
          assert.equal(requestTrackingMutation?.patch?.paymentCurrency,'USD','Admin payment currency must match the selected quote');
          assert.equal(requestTrackingMutation?.redactionConfirmed,false,'Payment-stage updates must not require redaction');
          requestTrackingMutation=null;
        }else await page.locator('.modal-close').click();
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
