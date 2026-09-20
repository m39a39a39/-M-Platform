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
const trackingFlow=['received','reviewing','sourcing','quotes_available','quote_selected','supplier_confirmation','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed'];
const requests = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, displayNo: 10001+i, product: titleAr, translation, specs: titleEn, quantity: 1000, country: 'United Arab Emirates', createdAt: '2026-09-17', neededDate: '2026-10-17', images, customerId: 'client', supplierIds: ['supplier'], status: i%2 ? 'sent' : 'review', trackingStatus:trackingFlow[i%trackingFlow.length], trackingUpdatedAt:'2026-09-18', trackingNote:i===0?'المصنع يتوقع اكتمال الإنتاج قريبًا':'', version: 1 }));
const bankAccounts=[{id:'bank-usd',label:'MIG USD',beneficiary:'MIG COMPANY',bankName:'Fixture Bank',iban:'AE070331234567890123456',swift:'FIXTAEAD',accountNumber:'1234567890',country:'United Arab Emirates',currency:'USD',active:true,order:0},{id:'bank-aed',label:'حساب الإمارات',beneficiary:'MIG COMPANY',bankName:'Fixture Bank AED',iban:'AE090331234567890123457',swift:'FIXTAEAD',accountNumber:'9876543210',country:'United Arab Emirates',currency:'AED',active:true,order:1}];
requests[0]={...requests[0],status:'sent',trackingStatus:'payment_confirmation',trackingNote:'',selectedQuoteId:'q0',paymentStatus:'awaiting_receipt',paymentMessage:'يرجى تحويل الدفعة الأولى ثم إرفاق إيصال الدفع.',paymentBankAccountId:'bank-usd',paymentBankAccount:bankAccounts[0],paymentAmount:5250,paymentCurrency:'USD',paymentRequestedAt:'2026-09-18'};
requests[2]={...requests[2],status:'sent',trackingStatus:'supplier_confirmation',selectedQuoteId:'q2',selectedForSupplier:true};
const categories=[{id:'mobile',nameAr:'إكسسوارات الجوال',nameEn:'Mobile accessories',active:true,order:0},{id:'electronics',nameAr:'إلكترونيات',nameEn:'Electronics',active:true,order:1},{id:'home',nameAr:'المنزل',nameEn:'Home',active:true,order:2}];
const supplyCountries=[{id:'cn-stock',nameAr:'الصين',nameEn:'China',active:true,order:0},{id:'uae-stock',nameAr:'الإمارات',nameEn:'UAE',active:true,order:1}];
const publicOffers = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, displayNo: 10101+i, product: titleAr, translation, specs: titleEn, images: images.slice(0,(i%5)+1), status:'published', supplierId:'supplier', sku:`SKU-${i}`, categoryId:categories[i%3].id, country:supplyCountries[i%2].id, currency:'USD', unitPrice:12, moq:500, stock:'2000', leadTime:30 }));
const quotes = requests.slice(0,4).map((r,i)=>({id:`q${i}`,requestId:r.id,supplierId:'supplier',status:i%2?'pending':'published',unitPrice:10,moq:500,leadTime:20,currency:'USD',images,translation,createdAt:'2026-09-17'}));
const accounts = ['client','supplier','admin'].map(role=>({id:role,role,name: role==='admin'?'مدير المنصة':titleAr,company:titleEn,email:`${role}@example.test`,isOwner:role==='admin'}));
const interests = [{id:'i1',displayNo:11001,offerId:'p0',status:'active',trackingStatus:'payment_confirmation',trackingUpdatedAt:'2026-09-18',trackingNote:'بانتظار تأكيد الدفع',quantity:600,unitPrice:12,currency:'USD',moq:500,total:7200,supplierOrderStatus:'confirmed',supplierOrderNote:'',paymentStatus:'receipt_submitted',paymentMessage:'يرجى دفع قيمة المنتج وإرسال الإيصال.',paymentReceipt:{src:images[0],mime:'image/jpeg',submittedAt:'2026-09-18'},createdAt:'2026-09-17',customerId:'client',version:1}];
const adminPendingInterest={id:'i2',displayNo:11002,offerId:'p1',status:'active',trackingStatus:'received',quantity:700,unitPrice:12,currency:'USD',moq:500,total:8400,supplierOrderStatus:'pending_confirmation',supplierOrderNote:'',createdAt:'2026-09-19',customerId:'client',version:1};
const cartRequest={id:'cart1',displayNo:12001,orderType:'cart',product:'Product order',translation:{titleAr:'طلب منتجات',titleEn:'Product order'},status:'review',trackingStatus:'received',cartItemCount:2,cartTotal:15000,currency:'USD',createdAt:'2026-09-19',updatedAt:'2026-09-19',customerId:'client',version:1,cartItems:[
  {line:1,interestId:'ci1',offerId:'p1',sku:'SKU-1',product:'Cart product 1',translation:{titleAr:'منتج سلة 1',titleEn:'Cart product 1'},images:[images[0]],quantity:750,unitPrice:12,currency:'USD',total:9000},
  {line:2,interestId:'ci2',offerId:'p2',sku:'SKU-2',product:'Cart product 2',translation:{titleAr:'منتج سلة 2',titleEn:'Cart product 2'},images:[images[1]],quantity:500,unitPrice:12,currency:'USD',total:6000}
]};
const cartInterests=[
  {id:'ci1',offerId:'p1',cartOrderId:'cart1',cartLine:1,status:'active',trackingStatus:'received',quantity:750,unitPrice:12,currency:'USD',moq:500,total:9000,supplierOrderStatus:'pending_confirmation',createdAt:'2026-09-19',customerId:'client',version:1},
  {id:'ci2',offerId:'p2',cartOrderId:'cart1',cartLine:2,status:'active',trackingStatus:'received',quantity:500,unitPrice:12,currency:'USD',moq:500,total:6000,supplierOrderStatus:'pending_confirmation',createdAt:'2026-09-19',customerId:'client',version:1}
];
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
  let bulkPublicOfferSubmission=null;
  let interestMutation=null;
  let requestTrackingMutation=null;
  let paymentReceiptSubmission=null;
  let paymentReviewSubmission=null;
  let supplierOrderMutation=null;
   let cartOrderSubmission=null;
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
    else if(path.endsWith('/state')) { stateCalls++; const roleQuotes=role==='admin'?quotes.map(q=>q.id==='q2'?{...q,supplierOrderStatus:'confirmed'}:q):quotes;const roleRequests=role==='supplier'?requests:[...requests,cartRequest];const roleInterests=role==='admin'?[...interests,adminPendingInterest,...cartInterests]:role==='client'?[...interests,...cartInterests]:interests;body={user:accounts.find(a=>a.role===role),requests:roleRequests,quotes:roleQuotes,publicOffers,accounts,interests:roleInterests,settings:{categories,supplyCountries,...(role==='admin'?{bankAccounts}:{}),_version:1}}; }
    else if(path.endsWith('/notifications')) body=role==='client'?[clientPaymentNote,...notes.slice(1)]:role==='admin'?[adminPaymentNote,...notes.slice(1)]:notes;
    else if(path.endsWith('/notifications/read')) body={ok:true};
    else if(path.endsWith('/payment-receipts')) {paymentReceiptSubmission=route.request().postDataJSON();body={ok:true,paymentStatus:'receipt_submitted'};}
    else if(path.endsWith('/payment-review')) {paymentReviewSubmission=route.request().postDataJSON();body={ok:true,paymentStatus:paymentReviewSubmission.action==='confirm'?'confirmed':'reupload_requested'};}
    else if(path.endsWith('/cart-orders')) {cartOrderSubmission=route.request().postDataJSON();body={ok:true,orderId:'cart-new',displayNo:12002,currency:'USD',cartTotal:15000,itemCount:2};}
    else if(path.endsWith('/app-config')) body={apiVersion:1};
    else if(path.endsWith('/uploads')) {
      const upload=route.request().postDataJSON();
      uploadedSources.push(upload.source);
      body={src:`/api/media/upload-${uploadedSources.length}`};
    }
    else if(path.endsWith('/bulk-public-offers')) {bulkPublicOfferSubmission=route.request().postDataJSON();body={ok:true,count:bulkPublicOfferSubmission.items?.length||0};}
    else if(path.endsWith('/mutations')) {
      const mutation=route.request().postDataJSON();
      if(mutation.collection==='publicOffers') publicOfferMutation=mutation;
      else if(['quotes','interests'].includes(mutation.collection)&&mutation.patch?.supplierOrderStatus) supplierOrderMutation=mutation;
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
    assert.equal(await page.locator('#guestProductSearch').count(),1,'Guest must be able to search products before sign in');
    assert.ok(parseFloat(await page.locator('#guestProductSearch').evaluate(el=>getComputedStyle(el).fontSize))>=16,'Guest search must not trigger iPhone focus zoom');
    assert.ok(await page.locator('#guestSupplyCountryFilters button').count()>=2,'Guest must be able to filter by supply country');
    assert.equal(await page.locator('#guestCartBtn').count(),1,'Guest header must expose the cart');
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
    await page.locator('.guest-offer-card').first().locator('.guest-offer-image').click();
    await page.locator('#modal').waitFor({state:'visible'});
    assert.equal(await page.locator('#imageViewer:not(.hidden)').count(),0,'Guest list image must open product details, not the full-screen image viewer');
    await geometry(page,'#modal');
    assert.equal(await page.locator('#guestProductCartForm').count(),1,'Guest product details must allow quantity selection and Add to cart');
    await page.locator('#modal .guest-modal-images img').first().click();
    await page.locator('#imageViewer:not(.hidden)').waitFor();
    assert.equal(await page.locator('#imageViewerImage').count(),1,'Only a product-detail image should open the full-screen viewer');
    await page.locator('[data-image-viewer-close]').click();
    await page.locator('#imageViewer').waitFor({state:'hidden'});
    if(label==='chromium-390-ar-client'){
      await page.locator('#guestProductCartForm button[type="submit"]').click();
      await page.locator('#modal').waitFor({state:'hidden'});
      assert.equal(await page.locator('#guestCartCount:not(.hidden)').textContent(),'1','Guest can add a product before signing in');
      await page.locator('#guestCartBtn').click();
      await page.locator('#guestCartForm').waitFor();
      assert.equal(await page.locator('#guestCartForm .cart-line').count(),1,'Guest cart must preserve the selected product');
      await page.locator('#guestCartForm button[type="submit"]').click();
      await page.locator('.guest-auth-required').waitFor();
      assert.ok((await page.locator('.guest-auth-required').textContent()).includes('تسجيل'),'Guest checkout must ask for authentication only at submit');
      await page.locator('[data-guest-auth-login]').click();
    }else{
      await page.locator('.modal-close').click();
      await page.locator('#guestLoginBtn').click();
    }
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
    if(label==='chromium-390-ar-client'){
      await page.locator('#cartCheckoutForm').waitFor();
      assert.equal(await page.locator('#cartCheckoutForm .cart-line').count(),1,'Guest cart must carry into the authenticated customer cart');
      assert.equal(await page.evaluate(()=>localStorage.getItem('m-platform.guest-cart.v1')),null,'Guest cart storage must be cleared after handoff');
      await page.locator('[data-cart-clear]').click();
      await page.locator('.cart-empty').waitFor();
      await page.locator('.modal-close').click();
    }
    if(role==='admin') await page.locator('[data-admin-root="home"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
    if(role==='client'){
      assert.equal(await page.locator('#bottomNav button:visible').count(),4,'Client navigation must contain four visible sections');
      assert.equal(await page.locator('#bottomNav [data-screen="offers"]:visible').count(),1,'Client navigation must include Quotes');
      assert.equal(await page.locator('#bottomNav [data-screen="notifications"]:visible').count(),0,'Client notifications must move to the header');
      assert.equal(await page.locator('#headerNotificationsBtn:not(.hidden)').count(),1,'Client notification bell must be visible in the header');
      assert.equal(await page.locator('#bottomNav').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4,'Client navigation must use four equal columns');
      assert.ok(await page.locator('#screen').evaluate(el=>el.firstElementChild?.classList.contains('special-request-card')),'New request card must be first on client home');
      assert.equal(await page.locator('#screen .client-action-needed').count(),0,'Client home must not duplicate order actions from My Orders');
      assert.equal(await page.locator('#screen .client-home-stats .stat-card').count(),0,'Client home must not duplicate order and quote statistics');
      assert.equal(await page.locator('#screen .client-action-card').count(),0,'Client home must leave order and quote updates to navigation badges');
      assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Client home must show at most 20 ready products');
       assert.equal(await page.locator('#screen [data-product-search]').count(),1,'Client home must include product search');
       assert.ok(parseFloat(await page.locator('#screen [data-product-search]').evaluate(el=>getComputedStyle(el).fontSize))>=16,'Product search input must stay at least 16px to prevent iPhone focus zoom');
       assert.equal(await page.locator('#headerCartBtn:not(.hidden)').count(),1,'Client header must include the cart');
      assert.equal(await page.locator('#navOrdersBadge:not(.hidden)').textContent(),'1','My Orders tab must show unresolved/new order badge');
      assert.equal(await page.locator('#navOffersBadge:not(.hidden)').textContent(),'2','Offers tab must show total unseen published quotes');
       await page.locator('#screen [data-product-search]').fill('SKU-44');
       assert.equal(await page.locator('#screen .public-offer-card').count(),1,'Product search must filter by SKU');
       await page.locator('#screen [data-product-search]').fill('');
       assert.equal(await page.locator('#screen .public-offer-card').count(),20,'Clearing product search must restore results');
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
        await page.locator('#screen .special-request-card').waitFor();
      }else await page.locator('.modal-close').click();
      const firstOffer=page.locator('.public-offer-card').first();
      await firstOffer.locator('.public-offer-media').click();
      await page.locator('#modal').waitFor({state:'visible'});
      assert.equal(await page.locator('#imageViewer:not(.hidden)').count(),0,'Customer catalog image must open product details, not image viewer');
      assert.ok((await page.locator('#modalBody').textContent()).includes('30'),'Production time must remain in ready-product details');
      assert.equal(await page.locator('#modal .client-order-summary').count(),0,'Catalog product page must never turn into a previous order');
      assert.equal(await page.locator('#modal .tracking-timeline').count(),0,'Catalog product page must not show order tracking');
      assert.equal(await page.locator('#modal .payment-card').count(),0,'Catalog product page must not show payment details');
      assert.equal(await page.locator('#publicInterestForm').count(),1,'Catalog product page must always allow adding the product again');
      assert.equal((await page.locator('#publicInterestForm button[type="submit"]').textContent()).trim(),language==='ar'?'إضافة إلى السلة':'Add to cart','Product CTA must say Add to cart');
      await page.locator('.modal-close').click();

      const secondOffer=page.locator('.public-offer-card').nth(1);
      await secondOffer.locator('.public-offer-content').click();
      await page.locator('#publicInterestForm').waitFor();
      assert.equal(await page.locator('#publicInterestQuantity').getAttribute('min'),'500','Product quantity must enforce supplier MOQ');
      assert.ok(parseFloat(await page.locator('#publicInterestQuantity').evaluate(el=>getComputedStyle(el).fontSize))>=16,'Product quantity input must stay at least 16px to prevent iPhone focus zoom');
      assert.equal(await page.locator('#publicInterestQuantity').getAttribute('max'),'2000','Product quantity must respect numeric stock');
      await page.locator('#publicInterestQuantity').fill('750');
      assert.ok((await page.locator('#publicInterestTotal').textContent()).includes('9,000')||(await page.locator('#publicInterestTotal').textContent()).includes('9000'),'Line total must update as unit price × quantity');
      await page.locator('#publicInterestForm button[type="submit"]').click();
      await page.locator('#modal').waitFor({state:'hidden'});
      assert.equal(await page.locator('#headerCartCount:not(.hidden)').textContent(),'1','Adding a product must update cart count');

      const thirdOffer=page.locator('.public-offer-card').nth(2);
      await thirdOffer.locator('.public-offer-content').click();
      await page.locator('#publicInterestForm').waitFor();
      await page.locator('#publicInterestForm button[type="submit"]').click();
      await page.locator('#modal').waitFor({state:'hidden'});
      assert.equal(await page.locator('#headerCartCount:not(.hidden)').textContent(),'2','Cart must combine multiple products');

      await page.locator('#headerCartBtn').click();
      await page.locator('#cartCheckoutForm').waitFor();
      assert.equal(await page.locator('#modal .cart-line').count(),2,'Cart must show both products in one order');
      assert.equal(await page.locator('#modal .cart-table-head span').count(),6,'Cart must use the approved six-column order');
      assert.equal(await page.locator('#modal .cart-line-price').count(),2,'Cart must show a clear unit-price column');
      assert.ok(parseFloat(await page.locator('#modal [data-cart-qty]').first().evaluate(el=>getComputedStyle(el).fontSize))>=16,'Cart quantity input must stay at least 16px to prevent iPhone focus zoom');
      assert.equal(await page.locator('#modal .cart-summary small').count(),0,'Cart summary must not show the removed explanatory sentence');
      const cartText=await page.locator('#modal .cart-summary').textContent();
      assert.ok(cartText.includes('15000')||cartText.includes('15,000'),'Cart must show one grand total');
      await page.locator('#cartCheckoutForm button[type="submit"]').click();
      await page.locator('#modal').waitFor({state:'hidden'});
      assert.equal(cartOrderSubmission?.items?.length,2,'Checkout must submit one order with two products');
      assert.equal(cartOrderSubmission?.items?.[0]?.quantity,750,'Checkout must preserve selected product quantity');
      assert.equal(await page.locator('#headerCartCount:not(.hidden)').count(),0,'Successful checkout must clear cart badge');
      cartOrderSubmission=null;
      await page.locator('#bottomNav [data-screen="home"]').click();
    }
    if(role==='supplier'){
      assert.equal(await page.locator('#screen .supplier-public-cta [data-action="new-public"]').count(),1,'Supplier home must expose Add public offer prominently');
      assert.equal(await page.locator('#screen .supplier-action-needed').count(),1,'Supplier home must prioritize items that need action');
      assert.equal(await page.locator('#screen .supplier-recent-orders').count(),1,'Supplier home must show recent executable orders');
      assert.equal((await page.locator('#screen').textContent()).includes(language==='ar'?'طلبات الاهتمام':'Interest requests'),false,'Supplier UI must not expose interest-request terminology');
      assert.equal(await page.locator('#bottomNav [data-screen="orders"]').count(),1,'Supplier bottom navigation must include Orders');
      assert.equal(await page.locator('#bottomNav [data-screen="notifications"]').count(),0,'Supplier notifications must move out of bottom navigation');
      assert.equal(await page.locator('#headerNotificationsBtn:not(.hidden)').count(),1,'Supplier notifications must be available from the header');
      assert.equal(await page.locator('#bottomNav [data-screen="requests"] [data-nav="requests"]').textContent(),language==='ar'?'طلبات الأسعار':'Quote requests','Supplier quote-request navigation must be distinct from executable orders');
      assert.equal(await page.locator('#bottomNav [data-screen="offers"] [data-nav="offers"]').textContent(),language==='ar'?'المنتجات':'Products','Supplier public catalog navigation must be Products');
      await page.locator('#screen .supplier-public-cta [data-action="new-public"]').click();
      await page.locator('#publicForm').waitFor();
      assert.equal(await page.locator('#publicForm input[name="product"]').count(),1,'Supplier home CTA must open the existing public-offer form');
      assert.equal(await page.locator('#publicForm input[name="unitPrice"]').count(),1,'Public-offer form must include price');
      await page.locator('.modal-close').click();

      await page.locator('#bottomNav [data-screen="orders"]').click();
      await page.locator('#screen .supplier-order-card').first().waitFor();
      assert.ok(await page.locator('#screen .supplier-order-card').count()>=2,'Supplier orders must combine selected quotes and approved public-offer orders');
      const selectedQuoteOrder=page.locator('#screen [data-supplier-order-type="quote"][data-supplier-order-id="q2"]');
      await selectedQuoteOrder.click();
      await page.locator('#modal').waitFor({state:'visible'});
      assert.equal(await page.locator('#modal .supplier-order-summary').count(),1,'Supplier order details must show price and order summary');
      assert.equal((await page.locator('#modal').textContent()).includes('10000'),true,'Selected quote order must show calculated total');
      assert.equal(await page.locator('#modal .payment-card,#modal .admin-payment-review').count(),0,'Supplier order must never expose customer payment data');
      await page.locator('#modal [data-supplier-order-status="confirmed"]').click();
      await page.locator('#modal').waitFor({state:'hidden'});
      assert.equal(supplierOrderMutation?.collection,'quotes','Selected quote fulfillment must update the supplier quote');
      assert.equal(supplierOrderMutation?.patch?.supplierOrderStatus,'confirmed','Supplier must be able to confirm fulfillment');
      supplierOrderMutation=null;
      const publicOrder=page.locator('#screen [data-supplier-order-type="public"][data-supplier-order-id="i1"]');
      await publicOrder.click();
      await page.locator('#modal').waitFor({state:'visible'});
      const publicSummary=await page.locator('#modal .supplier-order-summary').textContent();
      assert.ok(publicSummary.includes('600'),'Supplier public-offer order must show the customer requested quantity');
      assert.ok(publicSummary.includes('7200'),'Supplier public-offer order must show the frozen order total');
      await page.locator('.modal-close').click();

      await page.locator('#headerNotificationsBtn').click();
      await page.locator('#screen .notification-list').waitFor();
      await page.locator('#bottomNav [data-screen="home"]').click();
      await page.locator('#screen .supplier-public-cta').waitFor();
    }
    // Simulate a top notch, landscape side inset and home indicator.
    await page.addStyleTag({content:':root { --safe-top: 47px; --safe-bottom: 34px; --safe-left: 0px; --safe-right: 0px; }'});
    if(role==='client'){
      await page.locator('#headerNotificationsBtn').click();
      await page.locator('#screen .notification-list').waitFor();
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
      }
      await page.locator('#bottomNav [data-screen="home"]').click();
    }
    const screens=role==='client'?['home','requests','offers','account']:role==='supplier'?['home','orders','requests','offers','account']:['home','requests','offers','notifications','account'];
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
      if(screen==='offers'&&role==='client'){
        assert.equal(await page.locator('#screen .client-quote-groups .client-quote-group-card').count(),2,'Client Quotes must group only published quotes by request');
        assert.equal(await page.locator('#screen .client-offers-stats .stat-card').count(),3,'Client Quotes must show concise quote stats');
        const offersBadgeBefore=Number(await page.locator('#navOffersBadge:not(.hidden)').textContent());
        await page.locator('#screen .client-quote-group-card').first().click();
        await page.waitForFunction(expected=>Number(document.querySelector('#navOffersBadge')?.textContent||0)===expected,offersBadgeBefore-1);
        assert.equal(Number(await page.locator('#navOffersBadge:not(.hidden)').textContent()),offersBadgeBefore-1,'Opening a quote group must decrement Offers badge');
        await page.locator('#modal .client-compare-list').waitFor();
        assert.ok(await page.locator('#modal .client-compare-quote').count()>0,'Quote group must open comparison cards');
        assert.equal(await page.locator('#modal .client-quote-price-row').count()>0,true,'Quote comparison must show unit price and total');
        await page.locator('.modal-close').click();
      }
      if(screen==='account'&&role==='client'){
        assert.equal(await page.locator('#screen .account-setting-row [data-action="toggle-language"]').count(),1,'Customer account must include language setting');
      }
      if(screen==='account'&&role==='admin'){
        assert.equal(await page.locator('[data-admin-category-new]').count(),1,'Admin account must contain product category management');
        assert.equal(await page.locator('.admin-main-category-panel .admin-category-row').count(),3,'Admin account must list configured product categories');
        assert.equal(await page.locator('.admin-country-panel .admin-category-row').count(),2,'Admin account must list managed supply countries');
      }
      if(screen==='offers'&&role==='supplier'){
        assert.equal(await page.locator('#screen [data-sub]').count(),0,'Supplier Products must not contain quote tabs');
        assert.equal(await page.locator('#screen [data-public-offer]').count(),45,'Supplier Products must contain public products only');
        assert.equal(await page.locator('#screen [data-action="bulk-public-import"]').count(),1,'Supplier Products must preserve Excel import');
        assert.equal(await page.locator('#screen [data-action="new-public"]').count(),1,'Supplier Products must preserve add-product action');
        const supplierProduct=page.locator('#screen [data-public-offer]').first();
        await supplierProduct.locator('img[data-image-viewer]').first().click();
        await page.locator('#modal').waitFor({state:'visible'});
        assert.equal(await page.locator('#imageViewer:not(.hidden)').count(),0,'Supplier list image must open product details');
        await page.locator('#modal img[data-image-viewer]').first().click();
        await page.locator('#imageViewer:not(.hidden)').waitFor();
        await page.locator('[data-image-viewer-close]').click();
        await page.locator('.modal-close').click();
      }
      if(screen==='offers'&&role==='admin'){
        assert.equal(await page.locator('#bottomNav [data-screen="offers"] [data-nav="offers"]').textContent(),language==='ar'?'المنتجات':'Products','Admin catalog navigation must be Products');
        assert.equal(await page.locator('[data-admin-offer-tab]').count(),2,'Admin products must have only Pending review and All products tabs');
        assert.equal(await page.locator('[data-admin-offer-tab="interests"],[data-admin-offer-tab="categories"]').count(),0,'Product screen must not contain orders or categories tabs');
        await page.locator('[data-admin-offer-tab="all"]').click();
        await page.locator('[data-admin-product-select]').first().waitFor();
        assert.equal(await page.locator('[data-admin-product-select]').count(),45,'Admin must be able to select products for bulk editing');
        const adminProduct=page.locator('[data-admin-open="public"]').first();
        await adminProduct.locator('img[data-image-viewer]').first().click();
        await page.locator('#adminPublicOfferForm').waitFor();
        assert.equal(await page.locator('#imageViewer:not(.hidden)').count(),0,'Admin list image must open product details');
        await page.locator('#adminPublicOfferForm img[data-image-viewer]').first().click();
        await page.locator('#imageViewer:not(.hidden)').waitFor();
        await page.locator('[data-image-viewer-close]').click();
        await geometry(page,'#modal');
        assert.equal(await page.locator('#adminPublicOfferForm input[name="product"]').count(),1,'Admin must be able to edit product name');
        assert.equal(await page.locator('#adminPublicOfferForm input[name="unitPrice"]').count(),1,'Admin must be able to edit product price');
        assert.equal(await page.locator('#adminPublicOfferForm select[name="categoryId"]').count(),1,'Admin must be able to edit product category');
        assert.equal(await page.locator('#adminPublicOfferForm select[name="status"]').count(),1,'Admin owner must be able to edit product status');
        assert.equal(await page.locator('#adminPublicOfferForm #adminPublicFiles[accept="image/*"]').count(),1,'Admin product editor must accept large image selections for compression');
        await page.locator('#adminPublicOfferForm input[name="unitPrice"]').fill('19.75');
        await page.locator('#adminPublicOfferForm [data-admin-public-redaction]').check();
        await page.locator('#adminPublicOfferForm button[type="submit"]').click();
        await page.locator('#modal').waitFor({state:'hidden'});
        assert.equal(publicOfferMutation?.collection,'publicOffers','Admin product edit must submit a publicOffers mutation');
        assert.equal(publicOfferMutation?.patch?.unitPrice,'19.75','Admin product edit must submit edited price');
        assert.equal(publicOfferMutation?.patch?.images?.length,publicOffers[0].images.length,'Admin product edit must preserve selected images');
        assert.equal(publicOfferMutation?.redactionConfirmed,true,'Published product edits must confirm privacy review');
        publicOfferMutation=null;
        await page.locator('#screen [data-admin-product-select]').nth(0).check();
        await page.locator('#screen [data-admin-product-select]').nth(1).check();
        assert.equal(await page.locator('[data-admin-bulk-edit]').isDisabled(),false,'Bulk edit must activate after selecting products');
        await page.locator('[data-admin-bulk-edit]').click();
        await page.locator('#adminBulkProductsForm').waitFor();
        assert.equal(await page.locator('#adminBulkProductsForm [data-bulk-product-row]').count(),2,'Bulk editor must show the selected products in one table');
        await page.locator('#adminBulkProductsForm [data-bulk-product-row]').nth(0).locator('[data-bulk-edit="unitPrice"]').fill('21');
        await page.locator('#adminBulkProductsForm [data-bulk-product-row]').nth(1).locator('[data-bulk-edit="unitPrice"]').fill('22');
        await page.locator('#adminBulkProductsForm [name="reviewed"]').check();
        await page.locator('#adminBulkProductsForm button[type="submit"]').click();
        await page.locator('#modal').waitFor({state:'hidden'});
        assert.equal(bulkPublicOfferSubmission?.items?.length,2,'Bulk save must send all changed selected products in one request');
        assert.equal(bulkPublicOfferSubmission?.items?.[0]?.patch?.unitPrice,'21','Bulk editor must save edited price');
        assert.equal(bulkPublicOfferSubmission?.redactionConfirmed,true,'Bulk published edits must confirm content review');
        bulkPublicOfferSubmission=null;
      }
      if(screen==='requests'){
        assert.ok(await page.locator('#screen').evaluate(el=>el.scrollHeight>el.clientHeight),'Long list did not scroll');
        if(role==='supplier'){
          assert.equal(await page.locator('#screen [data-sub="pending"]').count(),1,'Quote Requests must include Awaiting quote tab');
          assert.equal(await page.locator('#screen [data-sub="submitted"]').count(),1,'Quote Requests must include Submitted quotes tab');
          assert.ok((await page.locator('#screen [data-sub="pending"]').textContent()).includes('96'),'Awaiting quote count must exclude requests already quoted');
          await page.locator('#screen [data-sub="submitted"]').click();
          assert.equal(await page.locator('#screen [data-edit-quote]').count(),3,'Selected quote must move out of Submitted quotes and into supplier Orders');
          await page.locator('#screen [data-sub="pending"]').click();
        }
        if(role==='admin'){
          assert.equal(await page.locator('[data-admin-request-filter]').count(),1,'Admin orders must include status filter');
          assert.equal(await page.locator('[data-admin-request-all]').count(),1,'Admin orders must include All orders quick filter');
          assert.equal(await page.locator('[data-admin-request-quotes]').count(),1,'Admin orders must preserve pending quote review access');
          assert.ok(await page.locator('[data-admin-interest]').count()>=2,'Admin orders must include ready-product orders');
           assert.equal(await page.locator('[data-admin-interest="ci1"],[data-admin-interest="ci2"]').count(),0,'Cart child items must not appear as separate admin orders');
           await page.locator('[data-admin-open="request"][data-admin-id="cart1"] .list-card-title').click();
           await page.locator('#modal .admin-cart-order-panel').waitFor();
           assert.equal(await page.locator('#modal .admin-cart-line').count(),2,'Admin cart order must show two child products inside one order');
           assert.equal(await page.locator('#modal [data-admin-send-cart-suppliers]').count(),1,'Admin must be able to approve and send all cart items to suppliers');
           await page.locator('#modal [data-admin-send-cart-suppliers]').click();
           await page.locator('#modal').waitFor({state:'hidden'});
           assert.equal(requestTrackingMutation?.patch?.trackingStatus,'supplier_confirmation','Cart approval must send product lines to suppliers');
           requestTrackingMutation=null;
          await page.locator('[data-admin-request-quotes]').click();
          assert.ok(await page.locator('[data-admin-open="request"]').count()>0,'Quotes-to-review filter must resolve to their RFQ orders');
          await page.locator('[data-admin-request-all]').click();

          await page.locator('[data-admin-interest="i2"] .list-card-title').click();
          await page.locator('[data-admin-interest-tracking-status]').waitFor();
          assert.equal(await page.locator('#modal .admin-supplier-confirmation.pending').count(),1,'New product order must show supplier confirmation pending');
          assert.equal(await page.locator('#modal [data-admin-interest-tracking-status] option[value="payment_confirmation"]').count(),0,'Payment must not be selectable before supplier confirmation');
          assert.equal(await page.locator('#modal [data-admin-send-interest-supplier]').count(),1,'Admin must have approve-and-send-to-supplier action for product orders');
          await page.locator('#modal [data-admin-send-interest-supplier]').click();
          await page.locator('#modal').waitFor({state:'hidden'});
          assert.equal(interestMutation?.patch?.trackingStatus,'supplier_confirmation','Admin approval must move product order to supplier confirmation');
          interestMutation=null;

          await page.locator('[data-admin-interest="i1"] .list-card-title').click();
          await page.locator('[data-admin-interest-tracking-status]').waitFor();
          assert.equal(await page.locator('[data-admin-interest-status]').count(),0,'Legacy interest status selector must remain removed');
          assert.equal(await page.locator('[data-admin-interest-tracking-status] option').count(),5,'Product order status selector must show only the current, next, and exception states');
          const publicOrderSummary=await page.locator('#modal .admin-selected-quote-card').textContent();
          assert.ok(publicOrderSummary.includes('600'),'Admin product order must show requested quantity');
          assert.equal(await page.locator('#modal [data-admin-payment-amount]').inputValue(),'7200','Product-order total must auto-fill payment amount');
          assert.equal(await page.locator('#modal [data-admin-payment-currency]').inputValue(),'USD','Product-order currency must remain frozen from product snapshot');
          assert.equal(await page.locator('#modal .admin-payment-review').count(),1,'Admin must see submitted product-order payment receipt review controls');
          if(label==='chromium-390-ar-admin'){
            await page.locator('#modal [data-admin-payment-confirm]').click();
            await page.locator('#modal').waitFor({state:'hidden'});
            assert.equal(paymentReviewSubmission?.entityType,'interest','Payment review must target the product order');
            assert.equal(paymentReviewSubmission?.entityId,'i1','Payment review must target the correct product order');
            assert.equal(paymentReviewSubmission?.action,'confirm','Admin confirm button must submit confirm action');
            paymentReviewSubmission=null;
            await page.locator('[data-admin-interest="i1"] .list-card-title').click();
            await page.locator('[data-admin-interest-tracking-status]').waitFor();
          }
          await page.locator('[data-admin-interest-tracking-status]').selectOption('production');
          await page.locator('[data-admin-interest-tracking-note]').fill('بدأ الإنتاج');
          await page.locator('[data-admin-save-interest-tracking]').click();
          await page.locator('#modal').waitFor({state:'hidden'});
          assert.equal(interestMutation?.collection,'interests','Product-order tracking must update the interest record');
          assert.equal(interestMutation?.patch?.trackingStatus,'production','Admin must save product-order tracking stage');
          assert.equal(interestMutation?.redactionConfirmed,false,'Tracking-only product-order updates must not require redaction');
          interestMutation=null;
        }
        if(role==='client'){
          assert.equal(await page.locator('#screen .client-order-filters button').count(),3,'My orders must include All, Active, and Completed filters');
          assert.equal(await page.locator('#navOrdersBadge:not(.hidden)').textContent(),'1','Action-required order badge must remain until the action is resolved');
          assert.equal(await page.locator('#screen .client-order-card').count(),102,'My orders must combine RFQs, one cart order, and legacy ready-product orders');
          assert.equal(await page.locator('#screen [data-request]').count(),100,'RFQ requests must remain accessible inside My orders');
           assert.equal(await page.locator('#screen [data-cart-order]').count(),1,'Cart products must appear as one customer order');
          assert.equal(await page.locator('#screen [data-ready-order]').count(),1,'Ready-product orders must open dedicated order details inside My orders');
          await page.locator('#screen [data-ready-order]').click();
          await page.locator('#modal .client-order-summary').waitFor();
          assert.equal(await page.locator('#modal .tracking-timeline').count(),1,'Ready-product order details must preserve tracking inside My orders');
          assert.equal(await page.locator('#modal .payment-card').count(),1,'Ready-product order details must preserve payment inside My orders');
          await page.locator('.modal-close').click();
          await page.locator('#screen [data-client-order-filter="active"]').click();
          assert.ok(await page.locator('#screen .client-order-card').count()>0,'Active filter must show active orders');
          await page.locator('#screen [data-client-order-filter="all"]').click();
        }
        await page.screenshot({path:`${output}/${label}-requests.png`});
        const card=role==='admin'?page.locator('[data-admin-open="request"][data-admin-id="r2"]'):role==='supplier'?page.locator('[data-supplier-request]').first():page.locator('[data-request]').first();
        if(role==='client')await card.click();else await card.locator('.list-card-title').click();
        await page.locator('#modal').waitFor({state:'visible'});
        await geometry(page,'#modal');
        if(role==='client'){
          assert.equal(await page.locator('#modal .client-order-summary').count(),1,'Client request details must start with order summary');
          assert.equal(await page.locator('#modal .client-current-status').count(),1,'Client request details must show current status before the timeline');
          assert.equal(await page.locator('#modal .client-selected-quote').count(),1,'Selected quote summary must be visible inside the order');
          assert.equal(await page.locator('#modal .tracking-timeline').count(),1,'Client request details must show a tracking timeline');
          assert.equal(await page.locator('#modal .tracking-step').count(),14,'Tracking timeline must include supplier confirmation in the normal stages');
          assert.equal(await page.locator('#modal .payment-card').count(),1,'Payment stage must show payment instructions to the customer');
          assert.equal(await page.locator('#modal [data-payment-upload]').count(),1,'Awaiting payment must allow the customer to upload a receipt');
          assert.equal(await page.locator('#modal .payment-bank-card').count(),1,'Payment stage must show the selected bank account to the customer');
          assert.ok((await page.locator('#modal .payment-bank-card').textContent()).includes('5250'),'Payment card must show the requested amount');
          await page.evaluate(()=>{document.execCommand=cmd=>cmd==='copy';});
          await page.locator('#modal .payment-bank-card .copy-btn').first().click();
          await page.locator('#toast:not(.hidden)').waitFor();
          assert.ok((await page.locator('#toast').textContent()).toLowerCase().includes(language==='ar'?'تم النسخ':'copied'),'Bank detail copy must work through the iOS-safe fallback');
          assert.equal(await page.locator('#modal [data-repeat-request]').count(),1,'Customer request details must include Repeat request');
        }
        if(role==='admin'){assert.equal(await page.locator('#modal [data-admin-tracking-status]').count(),1,'Admin request details must include tracking status control');assert.equal(await page.locator('#modal .admin-request-quotes').count(),1,'Admin request details must include all linked supplier quotes');assert.ok(await page.locator('#modal [data-admin-open="quote"]').count()>0,'Linked quotes must remain reviewable from the request');assert.equal(await page.locator('#modal .admin-selected-quote-card:not(.missing)').count(),1,'Admin request details must show the selected quote summary');assert.equal(await page.locator('#modal .admin-supplier-confirmation.confirmed').count(),1,'Admin request details must show supplier fulfillment confirmation before payment');}
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
