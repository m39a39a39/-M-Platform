import { session } from './session.js';
import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';
import { configureAdmin, updateAdminState, resetAdmin, renderAdminScreen, openAdminPayment } from './admin-mobile.js';
import { App } from '@capacitor/app';
import { filesToCompressedSources } from './image-upload.js';
import { parseBulkProductWorkbook, validateBulkProductRows, normalizeSupplyCountry, downloadBulkProductTemplate } from './bulk-excel.js';
import { categoryRows, subcategoryRows, supplyCountryRows, taxonomyLabel } from './catalog-taxonomy.js';
import './image-viewer.js';
import { downloadInvoicePdf } from './invoice-pdf.js';

let currentUser=null;
let platformState=null;
let notifications=[];
let lang='ar';
let activeScreen='home';
let activeSub='primary';
let readyProductsPage=1;
let readyCategory='all';
let readySubcategory='all';
let readyCountry='all';
let readySearch='';
const GUEST_CART_KEY='m-platform.guest-cart.v1';
const POST_AUTH_KEY='m-platform.post-auth-action.v1';
let cartItems=[];
let clientOrderSeen={};
let clientRequestFilter='all';
let bulkImportRows=[];
let bulkImportFileName='';
let busy=false;
let lastDataLoadedAt=0;
const PAGE_SIZE=20;
const MEDIA_CONCURRENCY=10;
const PUBLIC_MEDIA_CACHE='m-platform-public-media-v1';
const mediaCache=new Map();
const mediaTasks=new Map();
const publicMediaSources=new Set();

const copy={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',secure:'دخول آمن',loginTitle:'تسجيل الدخول',loginSubtitle:'استخدم نفس حسابك الموجود على المنصة.',email:'البريد الإلكتروني',password:'كلمة المرور',forgotPassword:'نسيت كلمة المرور؟',login:'تسجيل الدخول',loading:'جارٍ تسجيل الدخول...',failed:'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',home:'الرئيسية',requests:'الطلبات',invites:'الدعوات',offers:'العروض',notifications:'الإشعارات',account:'الحساب',client:'عميل',supplier:'مورد',admin:'إدارة',refreshing:'جارٍ التحديث...',empty:'لا توجد بيانات حاليًا.',details:'التفاصيل',status:'الحالة',quantity:'الكمية',country:'الدولة',neededDate:'تاريخ الاحتياج',receivedQuotes:'العروض المستلمة',newRequest:'طلب جديد',publicOffers:'العروض العامة',requestedOffers:'العروض التي طلبتها',submittedOffers:'العروض المقدمة',myPublicOffers:'منتجاتي',interestRequests:'طلبات الاهتمام',newPublicOffer:'منتج جديد',submitQuote:'تقديم عرض سعر',editQuote:'تعديل العرض',selectQuote:'اختيار العرض',selected:'تم اختيار العرض',requestOffer:'طلب هذا العرض',requested:'تم الطلب',price:'السعر',moq:'الحد الأدنى',leadTime:'مدة الإنتاج',sampleCost:'تكلفة العينة',stock:'المخزون',validUntil:'صالح حتى',specifications:'المواصفات',product:'المنتج',notes:'ملاحظات',currency:'العملة',images:'الصور',submit:'إرسال',save:'حفظ',logout:'تسجيل الخروج',profile:'بيانات الحساب',newQuotes:'عروض جديدة',underReview:'قيد المراجعة',activeRequests:'طلبات نشطة',published:'منشور',pending:'قيد المراجعة',completed:'مكتمل',sent:'تم الإرسال للموردين',review:'قيد المراجعة',coordinating:'قيد التنسيق',accepted:'مقبول',cancelled:'ملغي',markAllRead:'تحديد الكل كمقروء',noNotifications:'لا توجد إشعارات.',unread:'جديد',uploading:'جارٍ رفع الصور...',saving:'جارٍ الحفظ...',created:'تم الإرسال بنجاح.',chooseImages:'اختر حتى 5 صور. يمكن اختيار صور كبيرة وسيتم ضغطها تلقائيًا قبل الرفع.',sessionNote:'يمكنك تسجيل الخروج لإنهاء جلستك على هذا الجهاز.',readyProducts:'منتجات جاهزة للطلب',readyProductsSubtitle:'اختر من المنتجات المتاحة واطلب ما يناسبك مباشرة.',customRequestTitle:'لم تجد ما تحتاجه؟',customRequestDescription:'أرسل طلبًا خاصًا بالمواصفات والكمية، وسنبحث لك عن المورد المناسب.',sendCustomRequest:'إرسال طلب خاص',customRequests:'الطلبات الخاصة',readyProductRequests:'طلبات المنتجات الجاهزة',totalRequests:'إجمالي الطلبات',previous:'السابق',next:'التالي',page:'صفحة',companyDescription:'منصة تساعدك في طلب المنتجات، مقارنة العروض، ومتابعة التوريد بسهولة.',contactUs:'تواصل معنا',copyright:'© 2026 MIG COMPANY — جميع الحقوق محفوظة',allCategories:'الكل',category:'التصنيف',tracking:'متابعة الطلب',lastUpdate:'آخر تحديث',trackingNote:'ملاحظة',adminMobile:'واجهة الإدارة الكاملة ستضاف في مرحلة منفصلة. يمكنك حاليًا مشاهدة ملخص البيانات والإشعارات.'},
  en:{tagline:'Request what you need, and compare offers with confidence.',secure:'Secure access',loginTitle:'Sign in',loginSubtitle:'Use the same account you already have on the platform.',email:'Email address',password:'Password',forgotPassword:'Forgot password?',login:'Sign in',loading:'Signing in...',failed:'Unable to sign in. Check your email and password.',home:'Home',requests:'Requests',invites:'Invites',offers:'Offers',notifications:'Notifications',account:'Account',client:'Customer',supplier:'Supplier',admin:'Admin',refreshing:'Refreshing...',empty:'No data available.',details:'Details',status:'Status',quantity:'Quantity',country:'Country',neededDate:'Needed date',receivedQuotes:'Received quotes',newRequest:'New request',publicOffers:'Public offers',requestedOffers:'Requested offers',submittedOffers:'Submitted offers',myPublicOffers:'My products',interestRequests:'Interest requests',newPublicOffer:'New product',submitQuote:'Submit quote',editQuote:'Edit offer',selectQuote:'Select offer',selected:'Selected',requestOffer:'Request this offer',requested:'Requested',price:'Price',moq:'MOQ',leadTime:'Production time',sampleCost:'Sample cost',stock:'Stock',validUntil:'Valid until',specifications:'Specifications',product:'Product',notes:'Notes',currency:'Currency',images:'Images',submit:'Submit',save:'Save',logout:'Sign out',profile:'Account details',newQuotes:'New offers',underReview:'Under review',activeRequests:'Active requests',published:'Published',pending:'Under review',completed:'Completed',sent:'Sent to suppliers',review:'Under review',coordinating:'Coordinating',accepted:'Accepted',cancelled:'Cancelled',markAllRead:'Mark all as read',noNotifications:'No notifications.',unread:'New',uploading:'Uploading images...',saving:'Saving...',created:'Submitted successfully.',chooseImages:'Choose up to 5 images. Large images are compressed automatically before upload.',sessionNote:'Sign out to end your session on this device.',readyProducts:'Products ready to order',readyProductsSubtitle:'Choose from available products and request what suits you directly.',customRequestTitle:"Can't find what you need?",customRequestDescription:'Send a custom request with your specifications and quantity, and we will find a suitable supplier.',sendCustomRequest:'Send custom request',customRequests:'Custom requests',readyProductRequests:'Ready-product requests',totalRequests:'Total requests',previous:'Previous',next:'Next',page:'Page',companyDescription:'A platform that helps you request products, compare offers, and follow your sourcing process with ease.',contactUs:'Contact us',copyright:'© 2026 MIG COMPANY — All rights reserved.',allCategories:'All',category:'Category',tracking:'Order tracking',lastUpdate:'Last update',trackingNote:'Note',adminMobile:'The full admin mobile interface will be added separately. For now you can view a data summary and notifications.'}
};

const $=id=>document.getElementById(id);
const t=key=>copy[lang][key]||key;
const tr=(ar,en)=>lang==='ar'?ar:en;
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ref=item=>item?.displayNo||String(item?.id||'').slice(0,8)||'—';
const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat(lang==='ar'?'ar':'en',{dateStyle:'medium'}).format(d);};
const money=(value,currency='')=>value===undefined||value===null||value===''?'—':`${esc(currency)} ${esc(value)}`.trim();
const setMessage=(text,type='')=>{const el=$('message');el.textContent=text||'';el.classList.toggle('success',type==='success');};

const TRACKING_FLOW=[
  ['received','تم استلام الطلب','Request received'],
  ['reviewing','قيد المراجعة','Under review'],
  ['sourcing','البحث عن موردين','Finding suppliers'],
  ['quotes_available','العروض متاحة','Offers available'],
  ['quote_selected','تم اختيار العرض','Offer selected'],
  ['supplier_confirmation','بانتظار تأكيد المورد','Awaiting supplier confirmation'],
  ['payment_confirmation','تأكيد الطلب والدفع','Order & payment confirmation'],
  ['production','قيد الإنتاج','In production'],
  ['quality_check','الفحص والجودة','Quality inspection'],
  ['ready_to_ship','جاهز للشحن','Ready to ship'],
  ['shipped','تم الشحن','Shipped'],
  ['in_delivery','قيد التوصيل','In delivery'],
  ['delivered','تم التسليم','Delivered'],
  ['completed','مكتمل','Completed']
];
const READY_TRACKING_FLOW=[
  ['received','تم استلام الطلب','Request received'],
  ['supplier_confirmation','بانتظار تأكيد المورد','Awaiting supplier confirmation'],
  ['payment_confirmation','تأكيد الطلب والدفع','Order & payment confirmation'],
  ['production','قيد الإنتاج','In production'],
  ['quality_check','الفحص والجودة','Quality inspection'],
  ['ready_to_ship','جاهز للشحن','Ready to ship'],
  ['shipped','تم الشحن','Shipped'],
  ['in_delivery','قيد التوصيل','In delivery'],
  ['delivered','تم التسليم','Delivered'],
  ['completed','مكتمل','Completed']
];
const TRACKING_EXCEPTIONS={customer_action:['بانتظار إجراء من العميل','Waiting for customer action'],on_hold:['معلق','On hold'],cancelled:['ملغي','Cancelled']};
function statusLabel(status){return t(status)||status||'—';}
function trackingLabel(status){
  const row=TRACKING_FLOW.find(x=>x[0]===status),ex=TRACKING_EXCEPTIONS[status];
  return row?(lang==='ar'?row[1]:row[2]):ex?(lang==='ar'?ex[0]:ex[1]):statusLabel(status);
}
function requestTrackingStatus(item){
  return item?.trackingStatus||(item?.status==='completed'?'completed':item?.selectedQuoteId?'quote_selected':item?.status==='sent'?'sourcing':'received');
}
function readyTrackingStatus(item){
  if(item?.trackingStatus)return item.trackingStatus;
  return item?.status==='completed'?'completed':item?.status==='cancelled'?'cancelled':['coordinating','accepted'].includes(item?.status)?'payment_confirmation':'received';
}
function categories(activeOnly=true){return categoryRows(platformState?.settings,{activeOnly});}
function subcategories(activeOnly=true,parentId=''){return subcategoryRows(platformState?.settings,{activeOnly,parentId});}
function supplyCountries(activeOnly=true){return supplyCountryRows(platformState?.settings,{activeOnly});}
function supplyCountryLabel(value){return taxonomyLabel(supplyCountries(false).find(x=>x.id===value),lang)||value||'—';}
function filteredReadyOffers(){
  let offers=(platformState?.publicOffers||[]).filter(o=>o.status==='published');
  if(readyCategory!=='all')offers=offers.filter(o=>o.categoryId===readyCategory);
  if(readySubcategory!=='all')offers=offers.filter(o=>o.subcategoryId===readySubcategory);
  if(readyCountry!=='all')offers=offers.filter(o=>o.country===readyCountry);
  const q=readySearch.trim().toLowerCase();
  if(q)offers=offers.filter(o=>[o.sku,titleOf(o),descriptionOf(o),o.country].filter(Boolean).join(' ').toLowerCase().includes(q));
  return offers;
}
function categoryFilters(){
  const rows=categories();
  if(!rows.length)return '';
  return `<div class="category-filter-bar" role="tablist"><button type="button" data-category="all" class="${readyCategory==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(cat=>`<button type="button" data-category="${esc(cat.id)}" class="${readyCategory===cat.id?'active':''}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</button>`).join('')}</div>`;
}
function subcategoryFilters(){
  if(readyCategory==='all')return '';
  const available=new Set((platformState?.publicOffers||[]).filter(o=>o.status==='published'&&o.categoryId===readyCategory).map(o=>o.subcategoryId).filter(Boolean));
  const rows=subcategories(true,readyCategory).filter(x=>available.has(x.id));
  if(!rows.length)return '';
  return `<div class="category-filter-bar subcategory-filter-bar" role="tablist"><button type="button" data-subcategory="all" class="${readySubcategory==='all'?'active':''}">${esc(tr('الكل','All'))}</button>${rows.map(x=>`<button type="button" data-subcategory="${esc(x.id)}" class="${readySubcategory===x.id?'active':''}">${esc(taxonomyLabel(x,lang))}</button>`).join('')}</div>`;
}
function supplyCountryFilters(){
  const available=new Set((platformState?.publicOffers||[]).filter(o=>o.status==='published').map(o=>o.country));
  const rows=supplyCountries().filter(x=>available.has(x.id));
  if(!rows.length)return '';
  return `<div class="supply-country-filter" role="tablist"><span>${esc(tr('بلد التوريد','Supply country'))}</span><button type="button" data-supply-country="all" class="${readyCountry==='all'?'active':''}">${esc(tr('الكل','All'))}</button>${rows.map(x=>`<button type="button" data-supply-country="${esc(x.id)}" class="${readyCountry===x.id?'active':''}">${esc(taxonomyLabel(x,lang))}</button>`).join('')}</div>`;
}
function cartStorageKey(){return currentUser?.id?`m-platform.cart.v1.${currentUser.id}`:'';}
function readGuestCart(){
  try{
    const rows=JSON.parse(localStorage.getItem(GUEST_CART_KEY)||'[]');
    return Array.isArray(rows)?rows.filter(x=>x&&typeof x.offerId==='string'&&Number.isInteger(Number(x.quantity))&&Number(x.quantity)>0).slice(0,10).map(x=>({offerId:x.offerId,quantity:Number(x.quantity)})):[];
  }catch{return[];}
}
function mergeGuestCart(){
  if(currentUser?.role!=='client')return false;
  const guest=readGuestCart();if(!guest.length)return false;
  const offers=(platformState?.publicOffers||[]).filter(o=>o.status==='published');
  const validGuest=guest.filter(x=>offers.some(o=>o.id===x.offerId));
  if(!validGuest.length){try{localStorage.removeItem(GUEST_CART_KEY);}catch{}return false;}
  const guestCurrency=String(offers.find(o=>o.id===validGuest[0].offerId)?.currency||'').toUpperCase();
  const currentCurrency=cartCurrency();
  if(cartItems.length&&currentCurrency&&guestCurrency&&currentCurrency!==guestCurrency){
    cartItems=validGuest;
  }else{
    for(const row of validGuest){
      const existing=cartItems.find(x=>x.offerId===row.offerId);
      if(existing)existing.quantity=row.quantity;
      else if(cartItems.length<10)cartItems.push(row);
    }
  }
  try{localStorage.removeItem(GUEST_CART_KEY);}catch{}
  saveCart();return true;
}
function takePostAuthAction(){
  try{const action=localStorage.getItem(POST_AUTH_KEY)||'';if(action)localStorage.removeItem(POST_AUTH_KEY);return action;}catch{return'';}
}
function loadCart(){
  cartItems=[];
  const key=cartStorageKey();if(!key)return;
  try{
    const parsed=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(parsed))cartItems=parsed.filter(x=>x&&typeof x.offerId==='string'&&Number.isInteger(Number(x.quantity))&&Number(x.quantity)>0).slice(0,10).map(x=>({offerId:x.offerId,quantity:Number(x.quantity)}));
  }catch{}
  updateCartBadge();
}
function saveCart(){
  const key=cartStorageKey();if(key)try{localStorage.setItem(key,JSON.stringify(cartItems));}catch{}
  updateCartBadge();
}
function reconcileCart(){
  const valid=new Set((platformState?.publicOffers||[]).filter(o=>o.status==='published').map(o=>o.id)),before=cartItems.length;
  cartItems=cartItems.filter(x=>valid.has(x.offerId));
  if(cartItems.length!==before)saveCart();else updateCartBadge();
}
function updateCartBadge(){
  const btn=$('headerCartBtn'),badge=$('headerCartCount'),client=currentUser?.role==='client';
  if(btn)btn.classList.toggle('hidden',!client);
  const count=cartItems.length;
  if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('hidden',!client||!count);}
}
function clientOrderSeenKey(){return currentUser?.id?`m-platform.order-seen.v1.${currentUser.id}`:'';}
function clientOrderKey(order){return `${order?.type||'order'}:${order?.id||''}`;}
function clientOrderTime(order){return Date.parse(order?.updatedAt||order?.createdAt||0)||0;}
function saveClientOrderSeen(){
  const key=clientOrderSeenKey();if(!key)return;
  try{localStorage.setItem(key,JSON.stringify(clientOrderSeen));}catch{}
}
function loadClientOrderSeen(){
  clientOrderSeen={};
  const key=clientOrderSeenKey();if(!key)return;
  let existed=false;
  try{
    const raw=localStorage.getItem(key);existed=raw!==null;
    const parsed=raw?JSON.parse(raw):{};
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))clientOrderSeen=parsed;
  }catch{}
  const orders=clientOrders(),current=new Set(orders.map(clientOrderKey));
  for(const keyName of Object.keys(clientOrderSeen))if(!current.has(keyName))delete clientOrderSeen[keyName];
  if(!existed){
    for(const order of orders)clientOrderSeen[clientOrderKey(order)]=clientOrderTime(order);
  }
  saveClientOrderSeen();
}
function markClientOrdersSeen(orders){
  if(currentUser?.role!=='client')return;
  let changed=false;
  for(const order of orders||[]){
    const key=clientOrderKey(order),at=clientOrderTime(order);
    if(Number(clientOrderSeen[key]||0)<at){clientOrderSeen[key]=at;changed=true;}
  }
  if(changed)saveClientOrderSeen();
  updateClientNavBadges();
}
function clientNavBadgeCounts(){
  if(currentUser?.role!=='client')return {orders:0,offers:0};
  const orders=clientOrders(),orderKeys=new Set();
  for(const order of orders){
    const key=clientOrderKey(order),at=clientOrderTime(order);
    if(at>Number(clientOrderSeen[key]||0))orderKeys.add(key);
    const action=clientOrderNeedsAction(order);
    if(action&&!['new_quotes','choose_quote'].includes(action.key))orderKeys.add(key);
  }
  const offers=(platformState?.requests||[]).reduce((sum,r)=>sum+newQuoteCount(r),0);
  return {orders:orderKeys.size,offers};
}
function setBottomNavBadge(id,count,show){
  const el=$(id);if(!el)return;
  el.textContent=count>99?'99+':String(count||'');
  el.classList.toggle('hidden',!show||!count);
}
function updateClientNavBadges(){
  const client=currentUser?.role==='client',counts=clientNavBadgeCounts();
  setBottomNavBadge('navOrdersBadge',counts.orders,client);
  setBottomNavBadge('navOffersBadge',counts.offers,client);
}
function cartRows(){
  const offers=platformState?.publicOffers||[];
  return cartItems.map(item=>{
    const offer=offers.find(o=>o.id===item.offerId&&o.status==='published');
    if(!offer)return null;
    const quantity=Number(item.quantity),unitPrice=Number(offer.unitPrice),total=quantity*unitPrice;
    return {item,offer,quantity,unitPrice,total,currency:String(offer.currency||'').toUpperCase()};
  }).filter(Boolean);
}
function cartCurrency(){return cartRows()[0]?.currency||'';}
function cartTotal(){return cartRows().reduce((sum,row)=>sum+row.total,0);}
function setCartQuantity(offerId,quantity){
  const row=cartItems.find(x=>x.offerId===offerId),offer=(platformState?.publicOffers||[]).find(o=>o.id===offerId&&o.status==='published');if(!row||!offer)return false;
  const q=Number(quantity),moq=Math.max(1,Math.ceil(Number(offer.moq)||1)),stock=Number(offer.stock);
  if(!Number.isInteger(q)||q<moq||(Number.isFinite(stock)&&stock>0&&q>stock))return false;
  row.quantity=q;saveCart();return true;
}
function addToCart(offer,quantity){
  const q=Number(quantity),moq=Math.max(1,Math.ceil(Number(offer?.moq)||1)),stock=Number(offer?.stock);
  if(!offer||offer.status!=='published')throw new Error(tr('هذا المنتج غير متاح حاليًا.','This product is currently unavailable.'));
  if(!Number.isInteger(q)||q<moq)throw new Error(tr('الكمية يجب ألا تقل عن الحد الأدنى للطلب.','Quantity cannot be below the MOQ.'));
  if(Number.isFinite(stock)&&stock>0&&q>stock)throw new Error(tr('الكمية المطلوبة أكبر من المخزون المتاح.','Requested quantity exceeds available stock.'));
  const existing=cartItems.find(x=>x.offerId===offer.id);
  const currency=String(offer.currency||'').toUpperCase(),current=cartCurrency();
  if(current&&currency!==current)throw new Error(tr(`السلة الحالية بعملة ${current}. أرسلها أولًا أو أفرغها لإضافة منتج بعملة ${currency}.`,`Your cart uses ${current}. Submit or clear it before adding a ${currency} product.`));
  if(!existing&&cartItems.length>=10)throw new Error(tr('الحد الأقصى 10 منتجات في الطلب الواحد.','Maximum 10 products per cart order.'));
  if(existing)existing.quantity=q;else cartItems.push({offerId:offer.id,quantity:q});
  saveCart();
}
function productSearchBar(){
  return `<label class="product-search-bar"><span>⌕</span><input type="search" inputmode="search" enterkeyhint="search" data-product-search value="${esc(readySearch)}" placeholder="${esc(tr('ابحث عن منتج أو SKU','Search products or SKU'))}" aria-label="${esc(tr('البحث عن المنتجات','Search products'))}"></label>`;
}
function productResultsHtml(){
  const offers=filteredReadyOffers(),totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  readyProductsPage=Math.min(Math.max(readyProductsPage,1),totalPages);
  const pageOffers=offers.slice((readyProductsPage-1)*PAGE_SIZE,readyProductsPage*PAGE_SIZE);
  return {grid:pageOffers.map(publicOfferCard).join('')||empty(),pagination:productPagination(readyProductsPage,totalPages)};
}
function productFiltersHtml(){return categoryFilters()+subcategoryFilters()+supplyCountryFilters();}
function refreshProductResults({filters=false}={}){
  if(filters){const wrapper=$('readyProductFilters');if(wrapper)wrapper.innerHTML=productFiltersHtml();}
  const result=productResultsHtml(),grid=$('readyProductsGrid'),pager=$('readyProductsPagination');
  if(grid)grid.innerHTML=result.grid;if(pager)pager.innerHTML=result.pagination;
  if(grid)hydrateImages(grid);
}

function trackingTimeline(item,{flow=TRACKING_FLOW,statusResolver=requestTrackingStatus}={}){
  const current=statusResolver(item),exception=TRACKING_EXCEPTIONS[current];
  const history=Array.isArray(item.trackingHistory)?item.trackingHistory:[];
  const lastLinear=exception?[...history].reverse().find(h=>flow.some(x=>x[0]===h.status))?.status||flow[0][0]:current;
  const found=flow.findIndex(x=>x[0]===lastLinear),currentIndex=Math.max(0,found);
  return `<section class="tracking-card"><div class="tracking-head"><div><small>${esc(t('tracking'))}</small><strong>${esc(trackingLabel(current))}</strong></div>${item.trackingUpdatedAt?`<span>${esc(t('lastUpdate'))}: ${esc(date(item.trackingUpdatedAt))}</span>`:''}</div>${exception?`<div class="tracking-exception">${esc(trackingLabel(current))}</div>`:''}<div class="tracking-timeline">${flow.map((step,i)=>`<div class="tracking-step ${i<currentIndex?'done':i===currentIndex&&!exception?'current':''}"><span class="tracking-dot">${i<currentIndex?'✓':i+1}</span><b>${esc(lang==='ar'?step[1]:step[2])}</b></div>`).join('')}</div>${item.trackingNote?`<p class="tracking-note"><b>${esc(t('trackingNote'))}:</b> ${esc(item.trackingNote)}</p>`:''}</section>`;
}
const PAYMENT_LABELS={
  awaiting_receipt:['بانتظار إيصال الدفع','Waiting for payment receipt'],
  receipt_submitted:['تم إرسال الإيصال — بانتظار المراجعة','Receipt submitted — awaiting review'],
  confirmed:['تم تأكيد الدفع','Payment confirmed'],
  reupload_requested:['مطلوب إعادة رفع الإيصال','Receipt re-upload requested']
};
function paymentLabel(status){const row=PAYMENT_LABELS[status];return row?(lang==='ar'?row[0]:row[1]):status||'—';}
function paymentEntity(type,id){return type==='request'?(platformState?.requests||[]).find(x=>x.id===id):(platformState?.interests||[]).find(x=>x.id===id);}
function bankTransferCard(item){
  const a=item?.paymentBankAccount;if(!a?.id)return '';
  const rows=[
    [tr('اسم المستفيد','Beneficiary'),a.beneficiary],
    [tr('اسم البنك','Bank'),a.bankName],
    ['IBAN',a.iban],
    ['SWIFT / BIC',a.swift],
    [tr('رقم الحساب','Account number'),a.accountNumber],
    [tr('الدولة','Country'),a.country]
  ].filter(x=>x[1]);
  const reference='#'+ref(item);
  return `<section class="payment-bank-card"><div class="payment-bank-head"><div><small>${esc(tr('بيانات التحويل البنكي','Bank transfer details'))}</small><strong>${esc(a.label||a.bankName)}</strong></div><div class="payment-amount"><small>${esc(tr('المبلغ المطلوب','Amount due'))}</small><b>${money(item.paymentAmount,item.paymentCurrency||a.currency)}</b></div></div><div class="payment-bank-grid">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong><button type="button" class="copy-btn" data-copy-value="${esc(value)}">${esc(tr('نسخ','Copy'))}</button></div>`).join('')}<div><span>${esc(tr('مرجع التحويل','Transfer reference'))}</span><strong>${esc(reference)}</strong><button type="button" class="copy-btn" data-copy-value="${esc(reference)}">${esc(tr('نسخ','Copy'))}</button></div></div><button type="button" class="secondary-btn full" data-copy-value="${esc(rows.map(([label,value])=>label+': '+value).concat([tr('المبلغ','Amount')+': '+String(item.paymentAmount||'')+' '+String(item.paymentCurrency||a.currency||''),tr('مرجع التحويل','Transfer reference')+': '+reference]).join('\n'))}">${esc(tr('نسخ جميع بيانات التحويل','Copy all transfer details'))}</button></section>`;
}
function paymentPanel(item,entityType){
  const status=item?.paymentStatus;
  if(!status&&item?.trackingStatus!=='payment_confirmation')return '';
  const receipt=item?.paymentReceipt,canUpload=item?.trackingStatus==='payment_confirmation'&&['awaiting_receipt','reupload_requested'].includes(status);
  const message=item?.paymentMessage||tr('يرجى إتمام عملية الدفع وإرفاق إيصال الدفع لتأكيد طلبك.','Please complete payment and upload the receipt to confirm your order.');
  const receiptHtml=receipt?.src?(receipt.mime==='application/pdf'
    ?`<button type="button" class="secondary-btn full" data-payment-document="${esc(receipt.src)}">${esc(tr('عرض إيصال PDF','View PDF receipt'))}</button>`
    :`<div class="payment-receipt-preview" data-viewer-gallery><img alt="" data-media="${esc(receipt.src)}" data-image-viewer></div>`):'';
  const uploadText=status==='reupload_requested'?tr('إعادة رفع إيصال الدفع','Upload receipt again'):tr('إرفاق إيصال الدفع','Upload payment receipt');
  return `<section class="payment-card"><div class="payment-card-head"><div><small>${esc(tr('الدفع','Payment'))}</small><strong>${esc(paymentLabel(status||'awaiting_receipt'))}</strong></div></div><p>${esc(message)}</p>${bankTransferCard(item)}${item?.paymentReviewNote?`<p class="payment-review-note"><b>${esc(tr('ملاحظة الإدارة','Admin note'))}:</b> ${esc(item.paymentReviewNote)}</p>`:''}${receiptHtml}${canUpload?`<button class="primary-btn full" type="button" data-payment-upload data-entity-type="${entityType}" data-entity-id="${esc(item.id)}">${esc(uploadText)}</button>`:''}</section>`;
}
function invoicePanel(item,entityType){
  const proforma=item?.proformaInvoice,finalInvoice=item?.finalInvoice;
  if(!proforma&&!finalInvoice)return '';
  const button=(invoice,kind,label)=>invoice?.number?`<button type="button" class="invoice-document-btn ${kind==='final'?'paid':''}" data-invoice-pdf="${kind}" data-invoice-type="${entityType}" data-invoice-id="${esc(item.id)}"><span>${esc(label)}</span><strong>${esc(invoice.number)}</strong>${kind==='final'?'<b>PAID</b>':''}</button>`:'';
  return `<section class="invoice-documents-card"><div><small>${esc(tr('الفواتير والمستندات','Invoices & documents'))}</small><strong>${esc(tr('مستندات PDF الرسمية','Official PDF documents'))}</strong></div><div class="invoice-document-actions">${button(proforma,'proforma','Proforma Invoice')}${button(finalInvoice,'final',tr('الفاتورة النهائية','Final Invoice'))}</div></section>`;
}
async function openInvoicePdf(target){
  const entityType=target.dataset.invoiceType,id=target.dataset.invoiceId,kind=target.dataset.invoicePdf;
  const rows=entityType==='request'?(platformState?.requests||[]):(platformState?.interests||[]),item=rows.find(x=>x.id===id);
  const invoice=kind==='final'?item?.finalInvoice:item?.proformaInvoice;if(!invoice)return;
  target.disabled=true;
  try{await downloadInvoicePdf(invoice,{orderNo:ref(item)});}catch{showToast(tr('تعذر فتح ملف الفاتورة. حاول مجددًا.','Could not open the invoice PDF. Please try again.'));}
  finally{target.disabled=false;}
}

function titleOf(item){const x=item?.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||item?.product||item?.title||`#${ref(item)}`;}
function descriptionOf(item){const x=item?.translation||{};return (lang==='ar'?(x.descriptionAr||x.descriptionEn):(x.descriptionEn||x.descriptionAr))||item?.specs||item?.notes||'';}
function quoteTime(q){return Date.parse(q?.publishedAt||q?.updatedAt||q?.createdAt||0)||0;}
function newQuoteCount(request){const seen=Date.parse(request?.lastSeenQuoteAt||0)||0;return (platformState?.quotes||[]).filter(q=>q.requestId===request.id&&q.status==='published'&&quoteTime(q)>seen).length;}
function cardBadge(status,extra=''){const label=TRACKING_FLOW.some(x=>x[0]===status)||TRACKING_EXCEPTIONS[status]?trackingLabel(status):statusLabel(status);return `<span class="status-pill status-${esc(status)}">${esc(label)}</span>${extra}`;}
function id(){return crypto.randomUUID();}

const rawFetch=(path,options={})=>session.raw(path,options);
const request=(path,options={})=>session.request(path,options);
async function mutate(collection,itemId,version,patch){return request('/api/v1/mutations',{method:'POST',auth:true,body:{collection,id:itemId,version:Number(version||0),patch}});}

async function loadData({render=true}={}){
  const epoch=session.epoch;
  const [next,nextNotifications]=await Promise.all([
    session.state(),
    request('/api/v1/notifications').catch(error=>{if(error.code==='session_expired'||error.code==='session_changed')throw error;return [];})
  ]);
  if(epoch!==session.epoch)return;
  platformState=next;currentUser=next.user;notifications=nextNotifications;lastDataLoadedAt=Date.now();
  syncPublicMediaSources();setTimeout(()=>warmPublicMedia(),30);
  if(currentUser?.role==='client'){loadCart();mergeGuestCart();reconcileCart();loadClientOrderSeen();}else{cartItems=[];clientOrderSeen={};updateCartBadge();updateClientNavBadges();}
  updateAdminState(next);updateShell();
  if(render)renderScreen();
}
configureAdmin({reload:()=>loadData({render:false})});
session.onReset(reason=>{
  currentUser=null;platformState=null;notifications=[];activeScreen='home';activeSub='primary';readyProductsPage=1;readyCategory='all';readySubcategory='all';readyCountry='all';readySearch='';cartItems=[];clientOrderSeen={};clientRequestFilter='all';
  resetAdmin();closeModal();
  for(const url of mediaCache.values())URL.revokeObjectURL(url);
  mediaCache.clear();mediaTasks.clear();publicMediaSources.clear();lastDataLoadedAt=0;$('screen').replaceChildren();$('headerRole').textContent='';
  $('navUnread').classList.add('hidden');$('toast').classList.add('hidden');
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.screen==='home'));
  if(reason==='logout')showView('bootView');
  if(reason==='expired'){showView('loginView');setMessage(tr('انتهت جلسة الدخول. سجّل الدخول مجددًا.','Your session expired. Please sign in again.'));}
});

function updateShell(){
  const role=currentUser?.role||'client',bottom=$('bottomNav'),requestLabel=document.querySelector('#bottomNav [data-nav="requests"]'),offersLabel=document.querySelector('#bottomNav [data-nav="offers"]'),accountLabel=document.querySelector('#bottomNav [data-nav="account"]'),requestButton=requestLabel?.closest('button'),accountButton=accountLabel?.closest('button'),utilityNav=$('navUnread')?.closest('button');
  $('headerRole').textContent=t(role);
  $('appLangBtn').textContent=lang==='ar'?'EN':'AR';
  const homeLabel=document.querySelector('[data-nav="home"]');if(homeLabel)homeLabel.textContent=t('home');
  if(requestLabel)requestLabel.textContent=role==='supplier'?tr('طلبات الأسعار','Quote requests'):role==='client'?tr('طلباتي','My orders'):t('requests');
  if(offersLabel)offersLabel.textContent=['admin','supplier'].includes(role)?tr('المنتجات','Products'):t('offers');
  if(accountLabel)accountLabel.textContent=t('account');
  if(role==='supplier'){
    if(utilityNav){
      utilityNav.classList.remove('hidden');utilityNav.dataset.screen='orders';
      const label=utilityNav.querySelector('[data-nav="notifications"]'),icon=utilityNav.querySelector('span');if(label)label.textContent=tr('الطلبات','Orders');if(icon)icon.textContent='▣';
      if(requestButton)bottom.insertBefore(utilityNav,requestButton);
    }
    document.querySelector('#bottomNav [data-screen="offers"]')?.classList.remove('hidden');
    $('bottomNav').classList.remove('client-nav');
    $('headerNotificationsBtn')?.classList.remove('hidden');
  }else if(role==='client'){
    if(utilityNav){utilityNav.dataset.screen='notifications';utilityNav.classList.add('hidden');}
    document.querySelector('#bottomNav [data-screen="offers"]')?.classList.remove('hidden');
    $('bottomNav').classList.add('client-nav');
    $('headerNotificationsBtn')?.classList.remove('hidden');
    if(activeScreen==='orders')activeScreen='home';
  }else{
    if(utilityNav){
      utilityNav.classList.remove('hidden');utilityNav.dataset.screen='notifications';
      const label=utilityNav.querySelector('[data-nav="notifications"]'),icon=utilityNav.querySelector('span');if(label)label.textContent=t('notifications');if(icon)icon.textContent='♢';
      if(accountButton)bottom.insertBefore(utilityNav,accountButton);
    }
    document.querySelector('#bottomNav [data-screen="offers"]')?.classList.remove('hidden');
    $('bottomNav').classList.remove('client-nav');
    $('headerNotificationsBtn')?.classList.add('hidden');
    if(activeScreen==='orders')activeScreen='home';
  }
  updateCartBadge();
  updateClientNavBadges();
  const unread=notifications.filter(n=>!n.readAt).length,badge=unread>99?'99+':String(unread);
  $('navUnread').textContent=badge;$('headerUnread').textContent=badge;
  $('navUnread').classList.toggle('hidden',role!=='admin'||!unread);
  $('headerUnread').classList.toggle('hidden',!['supplier','client'].includes(role)||!unread);
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.screen===activeScreen));
}

function applyLanguage(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  $('langBtn').textContent=lang==='ar'?'EN':'AR';
  if(currentUser){updateShell();renderScreen();}
}

function showToast(text){if(!currentUser)return;const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.add('hidden'),2200);}
async function copyText(value){
  const text=String(value||'');if(!text)return;
  let copied=false;
  try{
    const el=document.createElement('textarea'),y=window.scrollY;
    el.value=text;el.setAttribute('readonly','');el.style.position='fixed';el.style.inset='0 auto auto 0';el.style.width='1px';el.style.height='1px';el.style.opacity='0.01';el.style.pointerEvents='none';
    document.body.appendChild(el);el.focus({preventScroll:true});el.select();el.setSelectionRange(0,text.length);
    copied=document.execCommand('copy')===true;el.remove();window.scrollTo(0,y);
  }catch{}
  if(!copied&&navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);copied=true;}catch{}}
  showToast(copied?tr('تم النسخ.','Copied.'):tr('تعذر النسخ.','Could not copy.'));
}
function openModal(title,kicker,html){$('modalTitle').textContent=title;$('modalKicker').textContent=kicker||'';$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');hydrateImages($('modalBody'));}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';}

function mediaImage(src,attrs=''){
  const cached=mediaCache.get(src);
  return `<img alt="" data-media="${esc(src)}"${cached?` src="${esc(cached)}" data-loaded="1"`:''} ${attrs} />`;
}
function gallery(images=[]){if(!images.length)return '';return `<div class="media-grid" data-viewer-gallery>${images.map(src=>`<div class="media-placeholder">${mediaImage(src,'data-image-viewer')}</div>`).join('')}</div>`;}
const cacheRequest=src=>new Request('https://m-platform-cache.invalid/media/'+encodeURIComponent(src));
async function cachedPublicBlob(src){
  if(!publicMediaSources.has(src)||!('caches' in globalThis))return null;
  try{const store=await caches.open(PUBLIC_MEDIA_CACHE),hit=await store.match(cacheRequest(src));return hit?await hit.blob():null;}catch{return null;}
}
async function persistPublicBlob(src,blob){
  if(!publicMediaSources.has(src)||!('caches' in globalThis))return;
  try{const store=await caches.open(PUBLIC_MEDIA_CACHE);await store.put(cacheRequest(src),new Response(blob,{headers:{'Content-Type':blob.type||'image/jpeg','Cache-Control':'public, max-age=604800'}}));}catch{}
}
function syncPublicMediaSources(){
  publicMediaSources.clear();
  for(const offer of platformState?.publicOffers||[])if(offer.status==='published')for(const src of offer.images||[])if(src)publicMediaSources.add(src);
}
async function mediaUrl(src){
  if(mediaCache.has(src))return mediaCache.get(src);
  if(mediaTasks.has(src))return mediaTasks.get(src);
  const epoch=session.epoch;
  const task=(async()=>{
    let blob=await cachedPublicBlob(src);
    if(!blob){
      const path=src.replace(/^\/api\/media\//,'/api/v1/media/');
      const response=await rawFetch(path,{auth:true});if(!response.ok)return '';
      blob=await response.blob();
      if(publicMediaSources.has(src))persistPublicBlob(src,blob);
    }
    if(epoch!==session.epoch)return '';
    const url=URL.createObjectURL(blob);mediaCache.set(src,url);return url;
  })().catch(()=> '').finally(()=>mediaTasks.delete(src));
  mediaTasks.set(src,task);
  return task;
}
async function hydrateImages(root=document){
  const images=[...root.querySelectorAll('img[data-media]:not([data-loaded])')];
  let cursor=0;
  const worker=async()=>{
    while(cursor<images.length){
      const img=images[cursor++];img.dataset.loaded='1';
      const url=await mediaUrl(img.dataset.media);
      if(url&&img.isConnected)img.src=url;
    }
  };
  await Promise.all(Array.from({length:Math.min(MEDIA_CONCURRENCY,images.length)},worker));
}
function warmPublicMedia(limit=48){
  const sources=[];
  for(const offer of platformState?.publicOffers||[]){const src=(offer.images||[])[0];if(offer.status==='published'&&src&&!sources.includes(src))sources.push(src);if(sources.length>=limit)break;}
  let cursor=0;const worker=async()=>{while(cursor<sources.length)await mediaUrl(sources[cursor++]);};
  Promise.all(Array.from({length:Math.min(4,sources.length)},worker)).catch(()=>{});
}

function statCard(value,label,action=''){return `<button class="stat-card" ${action?`data-action="${action}"`:''}><strong>${esc(value)}</strong><span>${esc(label)}</span></button>`;}
function pageHeader(title,subtitle='',action=''){return `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${action}</div>`;}
function empty(){return `<div class="empty-state"><span>◇</span><p>${esc(t('empty'))}</p></div>`;}
function itemCard(item,{subtitle='',meta='',badge='',action='',images=false}={}){return `<article class="list-card" ${action}><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(item))}</small><h3>${esc(titleOf(item))}</h3></div>${badge}</div>${subtitle?`<p>${esc(subtitle)}</p>`:''}${meta?`<div class="meta-line">${meta}</div>`:''}${images?gallery(item.images):''}<div class="chevron">›</div></article>`;}
function publicOfferCard(item){
  const image=(item.images||[])[0];
  return `<article class="public-offer-card" data-public-offer="${esc(item.id)}"><div class="public-offer-media" data-viewer-gallery>${image?mediaImage(image,'data-image-viewer'):'<div class="public-offer-placeholder">M</div>'}</div><div class="public-offer-content"><div class="public-offer-origin">${esc(supplyCountryLabel(item.country))}</div><h3>${esc(titleOf(item))}</h3><p>${esc(descriptionOf(item)||'—')}</p><div class="public-offer-facts"><span><b>${esc(t('price'))}</b><strong>${money(item.unitPrice,item.currency)}</strong></span><span><b>${esc(t('moq'))}</b><strong>${esc(item.moq||'—')}</strong></span></div></div></article>`;
}
function supplierPublicOfferPreview(item){
  const image=(item.images||[])[0];
  return `<article class="supplier-public-preview" data-public-offer="${esc(item.id)}">
    <div class="supplier-public-thumb">${image?`<img alt="" data-media="${esc(image)}" />`:'<div class="supplier-public-placeholder">M</div>'}</div>
    <div class="supplier-public-preview-body">
      <div class="supplier-public-preview-head"><div><small>#${esc(ref(item))}</small><h3>${esc(titleOf(item))}</h3></div>${cardBadge(item.status)}</div>
      <p>${money(item.unitPrice,item.currency)} · MOQ ${esc(item.moq||'—')}</p>
    </div>
    <span class="chevron">›</span>
  </article>`;
}
const SUPPLIER_ORDER_LABELS={
  pending_confirmation:['بانتظار تأكيد المورد','Awaiting supplier confirmation'],
  confirmed:['تم تأكيد الطلب','Order confirmed'],
  production:['قيد التجهيز/الإنتاج','In preparation / production'],
  ready_for_inspection:['جاهز للفحص','Ready for inspection'],
  cannot_fulfill:['تعذر التنفيذ','Unable to fulfill']
};
function supplierOrderLabel(status){const row=SUPPLIER_ORDER_LABELS[status]||SUPPLIER_ORDER_LABELS.pending_confirmation;return tr(row[0],row[1]);}
function supplierOrders(){
  if(currentUser?.role!=='supplier')return[];
  const requests=platformState?.requests||[],quotes=platformState?.quotes||[],offers=platformState?.publicOffers||[],interests=platformState?.interests||[];
  const custom=requests.filter(r=>r.selectedForSupplier).map(r=>{
    const q=quotes.find(x=>x.requestId===r.id);if(!q)return null;
    const quantity=Number(r.quantity),unitPrice=Number(q.unitPrice),total=Number.isFinite(quantity)&&Number.isFinite(unitPrice)?quantity*unitPrice:null;
    return {type:'quote',id:q.id,version:q.version,request:r,quote:q,item:r,title:titleOf(r),images:r.images||[],source:tr('عرض مقدم','Submitted quote'),status:q.supplierOrderStatus||'pending_confirmation',note:q.supplierOrderNote||'',paymentConfirmed:!!r.paymentConfirmed,updatedAt:q.supplierOrderUpdatedAt||q.updatedAt||q.createdAt||r.createdAt,quantity:r.quantity||'',unitPrice:q.unitPrice,currency:q.currency,total,country:r.country||''};
  }).filter(Boolean);
  const ready=interests.map(i=>{
    const o=offers.find(x=>x.id===i.offerId);if(!o)return null;
    const quantity=Number(i.quantity),unitPrice=Number(i.unitPrice||o.unitPrice),total=Number(i.total);
    return {type:'public',id:i.id,version:i.version,interest:i,offer:o,item:o,title:titleOf(o),images:o.images||[],source:tr('منتج عام','Public product'),status:i.supplierOrderStatus||'pending_confirmation',note:i.supplierOrderNote||'',paymentConfirmed:!!i.paymentConfirmed,updatedAt:i.supplierOrderUpdatedAt||i.createdAt,quantity:i.quantity||'',unitPrice:i.unitPrice||o.unitPrice,currency:i.currency||o.currency,total:Number.isFinite(total)&&total>0?total:(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)&&unitPrice>0?quantity*unitPrice:null),country:o.country||'',moq:i.moq||o.moq||''};
  }).filter(Boolean);
  return [...custom,...ready].sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0));
}
function supplierOrderStatusBadge(status){return `<span class="supplier-order-status supplier-order-status-${esc(status||'pending_confirmation')}">${esc(supplierOrderLabel(status))}</span>`;}
function supplierOrderCard(order){
  const image=(order.images||[])[0],refItem=order.type==='quote'?order.request:order.interest;
  const quantity=order.quantity?tr('الكمية','Quantity')+': '+esc(order.quantity):order.moq?'MOQ '+esc(order.moq):'';
  const price=money(order.unitPrice,order.currency),total=order.total!==null?tr('الإجمالي','Total')+': '+money(order.total,order.currency):'';
  return `<article class="supplier-order-card" data-supplier-order-type="${esc(order.type)}" data-supplier-order-id="${esc(order.id)}">
    <div class="supplier-order-thumb">${image?`<img alt="" data-media="${esc(image)}">`:'<div>M</div>'}</div>
    <div class="supplier-order-main">
      <div class="supplier-order-top"><div><small>#${esc(ref(refItem))} · ${esc(order.source)}</small><h3>${esc(order.title)}</h3></div>${supplierOrderStatusBadge(order.status)}</div>
      <div class="supplier-order-meta"><span>${price}</span>${quantity?`<span>${quantity}</span>`:''}${total?`<span>${total}</span>`:''}</div>
    </div><span class="chevron">›</span>
  </article>`;
}
function renderSupplierOrders(){
  if(currentUser?.role!=='supplier'){activeScreen='home';renderHome();return;}
  const rows=supplierOrders();
  $('screen').innerHTML=pageHeader(tr('الطلبات','Orders'),tr('الطلبات التي أصبحت جاهزة للتنفيذ بعد اختيار العميل واعتماد الإدارة.','Orders ready for fulfillment after customer selection and admin approval.'))+
    `<div class="supplier-orders-list">${rows.map(supplierOrderCard).join('')||empty()}</div>`;
}
function clientOrders(){
  if(currentUser?.role!=='client')return[];
  const requests=platformState?.requests||[],interests=platformState?.interests||[],offers=platformState?.publicOffers||[],quotes=platformState?.quotes||[];
  const custom=requests.filter(r=>r.orderType!=='cart').map(r=>{
    const selected=quotes.find(q=>q.id===r.selectedQuoteId),quantity=Number(r.quantity),unitPrice=Number(selected?.unitPrice),total=selected&&Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)?quantity*unitPrice:null;
    return {type:'custom',id:r.id,refItem:r,item:r,title:titleOf(r),images:r.images||[],status:requestTrackingStatus(r),quantity:r.quantity||'',unitPrice:selected?.unitPrice,currency:selected?.currency,total,updatedAt:r.trackingUpdatedAt||r.updatedAt||r.createdAt,createdAt:r.createdAt,selectedQuote:selected};
  });
  const cart=requests.filter(r=>r.orderType==='cart').map(r=>{
    const children=interests.filter(i=>i.cartOrderId===r.id),snapshots=Array.isArray(r.cartItems)?r.cartItems:[];
    const images=[...new Set(snapshots.flatMap(x=>Array.isArray(x.images)?x.images:[]))].slice(0,5);
    return {type:'cart',id:r.id,refItem:r,item:r,title:tr(`طلب منتجات (${r.cartItemCount||snapshots.length||children.length})`,`Product order (${r.cartItemCount||snapshots.length||children.length})`),images,status:requestTrackingStatus(r),quantity:r.cartItemCount||snapshots.length||children.length,currency:r.currency,total:Number(r.cartTotal)||children.reduce((sum,i)=>sum+Number(i.total||0),0),items:children,snapshots,updatedAt:r.trackingUpdatedAt||r.updatedAt||r.createdAt,createdAt:r.createdAt};
  });
  const ready=interests.filter(i=>!i.cartOrderId).map(i=>{
    const o=offers.find(x=>x.id===i.offerId),quantity=Number(i.quantity),unitPrice=Number(i.unitPrice||o?.unitPrice),storedTotal=Number(i.total);
    return {type:'ready',id:i.id,refItem:i,item:i,offer:o,title:o?titleOf(o):tr('منتج جاهز','Ready product'),images:o?.images||[],status:readyTrackingStatus(i),quantity:i.quantity||'',unitPrice:i.unitPrice||o?.unitPrice,currency:i.currency||o?.currency,total:Number.isFinite(storedTotal)&&storedTotal>0?storedTotal:(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)?quantity*unitPrice:null),updatedAt:i.trackingUpdatedAt||i.updatedAt||i.createdAt,createdAt:i.createdAt};
  });
  return [...custom,...cart,...ready].sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0));
}
function clientOrderNeedsAction(order){
  if(order.type==='custom'||order.type==='cart'){
    const r=order.item;
    if(r.paymentStatus==='reupload_requested')return {key:'reupload',label:tr('أعد رفع إيصال الدفع','Upload payment receipt again'),action:order.type==='cart'?`data-cart-order="${esc(r.id)}"`:`data-request="${esc(r.id)}"`,tone:'payment'};
    if(requestTrackingStatus(r)==='payment_confirmation'&&['awaiting_receipt','reupload_requested'].includes(r.paymentStatus))return {key:'payment',label:tr('الدفع مطلوب','Payment required'),action:order.type==='cart'?`data-cart-order="${esc(r.id)}"`:`data-request="${esc(r.id)}"`,tone:'payment'};
    if(order.type==='cart'){
      if(requestTrackingStatus(r)==='customer_action')return {key:'customer_action',label:tr('مطلوب إجراء منك','Action required'),action:`data-cart-order="${esc(r.id)}"`,tone:'action'};
      return null;
    }
    const quotes=(platformState?.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published'),newCount=newQuoteCount(r);
    if(newCount>0)return {key:'new_quotes',label:newCount===1?tr('وصل عرض جديد','New quote received'):tr(`وصلت ${newCount} عروض جديدة`,`${newCount} new quotes received`),action:`data-client-offers-request="${esc(r.id)}"`,tone:'quote'};
    if(!r.selectedQuoteId&&quotes.length)return {key:'choose_quote',label:tr('اختر عرضًا للمتابعة','Choose a quote to continue'),action:`data-client-offers-request="${esc(r.id)}"`,tone:'quote'};
    if(requestTrackingStatus(r)==='customer_action')return {key:'customer_action',label:tr('مطلوب إجراء منك','Action required'),action:`data-request="${esc(r.id)}"`,tone:'action'};
  }else{
    const i=order.item;
    if(i.paymentStatus==='reupload_requested')return {key:'reupload',label:tr('أعد رفع إيصال الدفع','Upload payment receipt again'),action:`data-ready-order="${esc(i.id)}"`,tone:'payment'};
    if(readyTrackingStatus(i)==='payment_confirmation'&&['awaiting_receipt','reupload_requested'].includes(i.paymentStatus))return {key:'payment',label:tr('الدفع مطلوب','Payment required'),action:`data-ready-order="${esc(i.id)}"`,tone:'payment'};
    if(readyTrackingStatus(i)==='customer_action')return {key:'customer_action',label:tr('مطلوب إجراء منك','Action required'),action:`data-ready-order="${esc(i.id)}"`,tone:'action'};
  }
  return null;
}
function clientOrderCard(order){
  const image=(order.images||[])[0],typeLabel=order.type==='custom'?tr('طلب عرض سعر','RFQ order'):order.type==='cart'?tr('طلب منتجات','Product order'):tr('منتج جاهز','Ready product');
  const action=order.type==='custom'?`data-request="${esc(order.id)}"`:order.type==='cart'?`data-cart-order="${esc(order.id)}"`:`data-ready-order="${esc(order.id)}"`;
  const total=order.total!==null&&order.total!==undefined?money(order.total,order.currency):'',countLabel=order.type==='cart'?tr('المنتجات','Products'):tr('الكمية','Quantity');
  return `<article class="client-order-card" ${action}>
    <div class="client-order-thumb">${image?`<img alt="" data-media="${esc(image)}">`:'<div>M</div>'}</div>
    <div class="client-order-main">
      <div class="client-order-head"><div><small>#${esc(ref(order.refItem))} · ${esc(typeLabel)}</small><h3>${esc(order.title)}</h3></div>${cardBadge(order.status)}</div>
      <div class="client-order-meta"><span>${esc(countLabel)}: ${esc(order.quantity||'—')}</span>${total?`<span>${esc(tr('الإجمالي','Total'))}: ${total}</span>`:''}<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(order.updatedAt))}</span></div>
    </div><span class="chevron">›</span>
  </article>`;
}
function clientActionCard(order,action){
  const image=(order.images||[])[0];
  return `<article class="client-action-card ${esc(action.tone||'action')}" ${action.action}>
    <div class="client-action-thumb">${image?`<img alt="" data-media="${esc(image)}">`:'<div>!</div>'}</div>
    <div><small>#${esc(ref(order.refItem))}</small><strong>${esc(action.label)}</strong><p>${esc(order.title)}</p></div><span class="chevron">›</span>
  </article>`;
}
function clientQuoteGroups(){
  const requests=(platformState?.requests||[]).filter(r=>r.orderType!=='cart'),quotes=platformState?.quotes||[];
  return requests.map(r=>{
    const rows=quotes.filter(q=>q.requestId===r.id&&q.status==='published').sort((a,b)=>quoteTime(b)-quoteTime(a));
    if(!rows.length)return null;
    return {request:r,quotes:rows,newCount:newQuoteCount(r),selected:rows.find(q=>q.id===r.selectedQuoteId),latest:rows[0]};
  }).filter(Boolean).sort((a,b)=>quoteTime(b.latest)-quoteTime(a.latest));
}
function clientQuoteGroupCard(group){
  const r=group.request,total=group.quotes.length,newText=group.newCount?tr(`${group.newCount} جديد`,`${group.newCount} new`):'',selected=group.selected?tr('تم اختيار عرض','Quote selected'):tr('بانتظار اختيارك','Waiting for your choice');
  return `<article class="client-quote-group-card" data-client-offers-request="${esc(r.id)}">
    <div class="client-quote-group-head"><div><small>#${esc(ref(r))}</small><h3>${esc(titleOf(r))}</h3></div><span class="client-quote-count">${esc(total)} ${esc(tr('عروض','quotes'))}</span></div>
    <div class="client-quote-group-meta"><span>${esc(selected)}</span>${newText?`<b>${esc(newText)}</b>`:''}<span>${esc(tr('آخر عرض','Latest quote'))}: ${esc(date(group.latest?.publishedAt||group.latest?.updatedAt||group.latest?.createdAt))}</span></div><span class="chevron">›</span>
  </article>`;
}
function productPagination(page,totalPages){
  if(totalPages<=1)return '';
  return `<nav class="product-pagination" aria-label="${esc(t('readyProducts'))}"><button class="pagination-btn" type="button" data-action="ready-products-prev" ${page<=1?'disabled':''}>${esc(t('previous'))}</button><span class="pagination-info">${esc(t('page'))} ${page} / ${totalPages}</span><button class="pagination-btn" type="button" data-action="ready-products-next" ${page>=totalPages?'disabled':''}>${esc(t('next'))}</button></nav>`;
}
function companyFooterCard(){
  return `<section class="company-footer-card"><div class="company-footer-brand"><span class="company-footer-mark">M</span><div><h2>MIG COMPANY</h2><p>${esc(t('companyDescription'))}</p></div></div><div class="company-contact"><strong>${esc(t('contactUs'))}</strong><a href="mailto:aljilany6@gmail.com">aljilany6@gmail.com</a><a href="https://wa.me/8618501770037" target="_blank" rel="noopener noreferrer">+86 185 0177 0037</a></div><small>${esc(t('copyright'))}</small></section>`;
}

function renderHome(){
  const role=currentUser.role;
  if(role==='client'){
    if(readyCategory!=='all'&&!categories().some(cat=>cat.id===readyCategory))readyCategory='all';
    const products=productResultsHtml();
    $('screen').innerHTML=
      `<section class="special-request-card client-new-request"><div class="special-request-copy"><div class="special-request-heading"><span class="special-request-icon">＋</span><h2>${esc(tr('أرسل طلب جديد','Send a new request'))}</h2></div><p>${esc(tr('إذا لم تجد المنتج المناسب، أرسل مواصفاتك وسنطلب عروضًا لك.','If you cannot find the right product, send your specifications and we will source quotes for you.'))}</p></div><button class="primary-btn" data-action="new-request">+ ${esc(tr('أرسل طلب جديد','Send new request'))}</button></section>`+
      `<section class="ready-products-section"><div class="section-title ready-products-title"><div><h2>${esc(tr('المنتجات','Products'))}</h2><p>${esc(tr('ابحث واختر الكمية، ثم اجمع المنتجات في طلب واحد.','Search, choose quantities, and combine products into one order.'))}</p></div></div>${productSearchBar()}<div id="readyProductFilters">${productFiltersHtml()}</div><div id="readyProductsGrid" class="public-offers-grid">${products.grid}</div><div id="readyProductsPagination">${products.pagination}</div></section>`+
      companyFooterCard();
  }else if(role==='supplier'){
    const quotes=platformState.quotes||[],answered=new Set(quotes.map(q=>q.requestId)),invites=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    const pub=platformState.publicOffers||[],orders=supplierOrders(),pendingOrders=orders.filter(o=>o.status==='pending_confirmation'),activeOrders=orders.filter(o=>!['ready_for_inspection','cannot_fulfill'].includes(o.status)),publishedPublic=pub.filter(o=>o.status==='published').length,recentOrders=orders.slice(0,3);
    const needed=[...pendingOrders.slice(0,3).map(supplierOrderCard),...invites.slice(0,Math.max(0,3-pendingOrders.length)).map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'}`,badge:`<span class="status-pill status-review">${esc(tr('تقديم عرض','Submit quote'))}</span>`,action:`data-supplier-request="${esc(r.id)}"`}))];
    $('screen').innerHTML=pageHeader(`${tr('مرحبًا','Welcome')} ${esc(currentUser.name||currentUser.company||'')}`,tr('ركز على الطلبات التي تحتاج إجراء منك أولًا.','Focus first on the items that need your action.'))+
      `<section class="supplier-public-cta"><div class="supplier-public-cta-copy"><span class="supplier-public-cta-icon">＋</span><div><h2>${esc(tr('إضافة المنتجات','Add products'))}</h2><p>${esc(tr('أضف منتجًا واحدًا أو استورد عدة منتجات من ملف Excel واحد مع الصور.','Add one product or import multiple products from one Excel file with embedded images.'))}</p></div></div><div class="supplier-public-cta-actions"><button class="secondary-btn" type="button" data-action="bulk-public-import">${esc(tr('استيراد من Excel','Import from Excel'))}</button><button class="primary-btn" type="button" data-action="new-public">+ ${esc(t('newPublicOffer'))}</button></div></section>`+
      `<section class="section-block supplier-action-needed"><div class="section-title"><div><h2>${esc(tr('يتطلب إجراء منك','Needs your action'))}</h2><p>${esc(tr('طلبات جديدة أو دعوات تحتاج ردك.','New orders or quote requests waiting for your response.'))}</p></div></div><div class="supplier-action-list">${needed.join('')||`<div class="supplier-clear-state">✓ ${esc(tr('لا يوجد إجراء مطلوب حاليًا','No action needed right now'))}</div>`}</div></section>`+
      `<div class="stats-grid supplier-home-stats supplier-three-stats">${statCard(activeOrders.length,tr('الطلبات النشطة','Active orders'),'orders')}${statCard(invites.length,tr('طلبات عروض الأسعار','Quote requests'),'requests')}${statCard(publishedPublic,tr('المنتجات المنشورة','Published products'),'view-public-offers')}</div>`+
      `<section class="section-block supplier-recent-orders"><div class="section-title"><div><h2>${esc(tr('آخر الطلبات','Recent orders'))}</h2><p>${esc(tr('آخر الطلبات التي أصبحت جاهزة للتنفيذ.','Latest orders ready for fulfillment.'))}</p></div><button class="text-btn" type="button" data-action="orders">${esc(tr('عرض الكل','View all'))}</button></div><div class="supplier-orders-list">${recentOrders.map(supplierOrderCard).join('')||empty()}</div></section>`;
  }else{
    $('screen').innerHTML=pageHeader(tr('لوحة الإدارة','Admin'),t('adminMobile'))+`<div class="stats-grid">${statCard(platformState.requests?.length||0,t('requests'))}${statCard(platformState.quotes?.length||0,t('submittedOffers'))}${statCard(platformState.publicOffers?.length||0,t('publicOffers'))}${statCard(notifications.filter(n=>!n.readAt).length,t('notifications'),'notifications')}</div>`;
  }
}

function renderRequests(){
  if(currentUser.role==='client'){
    const all=clientOrders();markClientOrdersSeen(all);
    const active=all.filter(o=>!['completed','cancelled'].includes(o.status)),completed=all.filter(o=>['completed','cancelled'].includes(o.status));
    if(!['all','active','completed'].includes(clientRequestFilter))clientRequestFilter='all';
    const rows=clientRequestFilter==='active'?active:clientRequestFilter==='completed'?completed:all;
    const tabs=`<div class="client-order-filters"><button class="${clientRequestFilter==='all'?'active':''}" data-client-order-filter="all">${esc(tr('الكل','All'))} <span>${all.length}</span></button><button class="${clientRequestFilter==='active'?'active':''}" data-client-order-filter="active">${esc(tr('النشطة','Active'))} <span>${active.length}</span></button><button class="${clientRequestFilter==='completed'?'active':''}" data-client-order-filter="completed">${esc(tr('المكتملة','Completed'))} <span>${completed.length}</span></button></div>`;
    $('screen').innerHTML=
      pageHeader(tr('طلباتي','My orders'),tr('كل طلباتك الخاصة وطلبات المنتجات الجاهزة في مكان واحد.','All custom and ready-product orders in one place.'),`<button class="primary-small" data-action="new-request">+ ${esc(tr('طلب جديد','New request'))}</button>`)+
      tabs+
      `<div class="client-orders-list">${rows.map(clientOrderCard).join('')||empty()}</div>`;
  }else if(currentUser.role==='supplier'){
    if(!['pending','submitted'].includes(activeSub))activeSub='pending';
    const quotes=(platformState.quotes||[]).slice().sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||0)||0)-(Date.parse(a.updatedAt||a.createdAt||0)||0));
    const selectedRequestIds=new Set((platformState.requests||[]).filter(r=>r.selectedForSupplier).map(r=>r.id));
    const submitted=quotes.filter(q=>!selectedRequestIds.has(q.requestId));
    const answered=new Set(quotes.map(q=>q.requestId));
    const pending=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    const tabs=segment([
      ['pending',tr(`بانتظار عرض (${pending.length})`,`Awaiting quote (${pending.length})`)],
      ['submitted',tr(`العروض المقدمة (${submitted.length})`,`Submitted quotes (${submitted.length})`)]
    ]);
    if(activeSub==='pending'){
      $('screen').innerHTML=pageHeader(tr('طلبات الأسعار','Quote requests'),tr('طلبات الأسعار التي أرسلتها الإدارة إليك. بعد تقديم السعر تنتقل تلقائيًا إلى العروض المقدمة.','Quote requests sent to you by admin. After you submit a quote, it moves automatically to Submitted quotes.'))+tabs+`<div class="list-stack">${pending.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${t('neededDate')}: ${r.neededDate||'—'}`,badge:`<span class="status-pill status-review">${esc(tr('بانتظار عرضك','Awaiting your quote'))}</span>`,action:`data-supplier-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div>`;
    }else{
      $('screen').innerHTML=pageHeader(tr('طلبات الأسعار','Quote requests'),tr('العروض التي قدمتها على طلبات العملاء، ويمكنك فتح العرض لمراجعته أو تعديله عندما يكون التعديل متاحًا.','Quotes you submitted for customer requests. Open a quote to review or edit it when editing is available.'))+tabs+`<div class="list-stack">${submitted.map(q=>{const r=(platformState.requests||[]).find(x=>x.id===q.requestId);return itemCard(q,{subtitle:q.notes||descriptionOf(r)||descriptionOf(q),meta:`${money(q.unitPrice,q.currency)} · MOQ ${q.moq||'—'} · ${date(q.updatedAt||q.createdAt)}`,badge:cardBadge(q.status),action:`data-edit-quote="${esc(q.id)}"`,images:true});}).join('')||empty()}</div>`;
    }
  }else renderAdminCollection('requests');
}

function segment(buttons){return `<div class="segmented">${buttons.map(([key,label])=>`<button data-sub="${key}" class="${activeSub===key?'active':''}">${esc(label)}</button>`).join('')}</div>`;}
function renderOffers(){
  if(currentUser.role==='client'){
    const groups=clientQuoteGroups(),newTotal=groups.reduce((n,g)=>n+g.newCount,0);
    $('screen').innerHTML=pageHeader(tr('العروض','Quotes'),tr('قارن العروض التي وصلت لطلباتك واختر الأنسب لك.','Compare quotes received for your requests and choose one.'))+
      `<div class="stats-grid client-offers-stats">${statCard(groups.length,tr('طلبات لديها عروض','Requests with quotes'))}${statCard(groups.reduce((n,g)=>n+g.quotes.length,0),tr('إجمالي العروض','Total quotes'))}${statCard(newTotal,tr('عروض جديدة','New quotes'))}</div>`+
      `<div class="client-quote-groups">${groups.map(clientQuoteGroupCard).join('')||empty()}</div>`;
  }else if(currentUser.role==='supplier'){
    const offers=(platformState.publicOffers||[]).slice().sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||0)||0)-(Date.parse(a.updatedAt||a.createdAt||0)||0));
    $('screen').innerHTML=pageHeader(tr('المنتجات','Products'),tr('إدارة منتجاتك العامة: الإضافة، الاستيراد من Excel، المراجعة والتعديل.','Manage your public products: add, import from Excel, review, and edit.'),`<div class="page-head-actions"><button class="secondary-btn compact" data-action="bulk-public-import">${esc(tr('استيراد Excel','Import Excel'))}</button><button class="primary-small" data-action="new-public">+ ${esc(tr('منتج جديد','New product'))}</button></div>`)+`<div class="list-stack">${offers.map(o=>itemCard(o,{subtitle:o.specs||'',meta:`${o.sku?`SKU ${esc(o.sku)} · `:''}${money(o.unitPrice,o.currency)} · MOQ ${o.moq||'—'} · ${date(o.updatedAt||o.createdAt)}`,badge:cardBadge(o.status),action:`data-public-offer="${esc(o.id)}"`,images:true})).join('')||empty()}</div>`;
  }else renderAdminCollection('offers');
}

function renderNotifications(){
  $('screen').innerHTML=pageHeader(t('notifications'),'',notifications.some(n=>!n.readAt)?`<button class="text-btn" data-action="mark-all">${esc(t('markAllRead'))}</button>`:'')+`<div class="list-stack notification-list">${notifications.map(n=>`<article class="notification-card ${n.readAt?'':'unread'}"><button type="button" class="notification-card-main" data-notification="${esc(n.id)}"><div><strong>${esc(lang==='ar'?n.titleAr:n.titleEn)}</strong><p>${esc(lang==='ar'?n.bodyAr:n.bodyEn)}</p><small>${date(n.createdAt)}</small></div>${n.readAt?'':`<span>${esc(t('unread'))}</span>`}</button>${n.action==='upload_receipt'?`<button type="button" class="primary-small notification-action" data-payment-notification="${esc(n.id)}">${esc(tr('إرفاق إيصال الدفع','Upload payment receipt'))}</button>`:''}</article>`).join('')||`<div class="empty-state"><p>${esc(t('noNotifications'))}</p></div>`}</div>`;
}
function renderAccount(){
  const u=currentUser,languageControl=u.role==='client'?`<div class="account-setting-row"><div><small>${esc(tr('اللغة','Language'))}</small><strong>${esc(lang==='ar'?tr('العربية','Arabic'):tr('الإنجليزية','English'))}</strong></div><button type="button" class="secondary-btn" data-action="toggle-language">${esc(lang==='ar'?'English':'العربية')}</button></div>`:'';
  $('screen').innerHTML=pageHeader(t('account'))+`<section class="profile-card"><div class="avatar">${esc((u.name||u.company||u.email||'M').charAt(0).toUpperCase())}</div><h2>${esc(u.name||u.company||'M Platform')}</h2><p>${esc(t(u.role))}</p><dl><div><dt>${esc(t('email'))}</dt><dd>${esc(u.email||'—')}</dd></div>${u.company?`<div><dt>${tr('الشركة','Company')}</dt><dd>${esc(u.company)}</dd></div>`:''}${u.country?`<div><dt>${esc(t('country'))}</dt><dd>${esc(u.country)}</dd></div>`:''}</dl>${languageControl}<p class="session-note">${esc(t('sessionNote'))}</p><button class="danger-btn" data-action="logout">${esc(t('logout'))}</button></section>`;
}
function renderAdminCollection(kind){const rows=kind==='requests'?(platformState.requests||[]):[...(platformState.quotes||[]),...(platformState.publicOffers||[])];$('screen').innerHTML=pageHeader(kind==='requests'?t('requests'):t('offers'),t('adminMobile'))+`<div class="list-stack">${rows.slice(0,50).map(x=>itemCard(x,{subtitle:descriptionOf(x),badge:cardBadge(x.status),meta:`#${ref(x)} · ${date(x.createdAt)}`})).join('')||empty()}</div>`;}
function renderScreen(){if(!currentUser||!platformState)return;updateShell();if(renderAdminScreen(activeScreen))return;if(activeScreen==='home')renderHome();else if(activeScreen==='orders')renderSupplierOrders();else if(activeScreen==='requests')renderRequests();else if(activeScreen==='offers')renderOffers();else if(activeScreen==='notifications')renderNotifications();else renderAccount();hydrateImages($('screen'));}

function quoteTotal(q,r){
  const unit=Number(q?.unitPrice),quantity=Number(r?.quantity);
  return Number.isFinite(unit)&&Number.isFinite(quantity)&&quantity>0?unit*quantity:null;
}
function clientQuoteCard(q,r){
  const total=quoteTotal(q,r),selected=r.selectedQuoteId===q.id;
  return `<article class="quote-card client-compare-quote ${selected?'selected':''}">
    ${gallery(q.images)}
    <div class="client-quote-price-row"><div><small>${esc(tr('سعر الوحدة','Unit price'))}</small><strong>${money(q.unitPrice,q.currency)}</strong></div>${total!==null?`<div><small>${esc(tr('الإجمالي','Total'))}</small><strong>${money(total,q.currency)}</strong></div>`:''}</div>
    <div class="facts"><span>MOQ ${esc(q.moq||'—')}</span><span>${esc(t('leadTime'))}: ${esc(q.leadTime||'—')}</span><span>${esc(t('sampleCost'))}: ${esc(q.sampleCost||'—')}</span></div>
    ${descriptionOf(q)?`<p>${esc(descriptionOf(q))}</p>`:''}
    <button class="${selected?'secondary-btn':'primary-btn'} full" data-select-quote="${esc(q.id)}" data-request-id="${esc(r.id)}" ${r.selectedQuoteId?'disabled':''}>${esc(selected?tr('العرض المختار','Selected quote'):r.selectedQuoteId?tr('تم اختيار عرض آخر','Another quote selected'):t('selectQuote'))}</button>
  </article>`;
}
async function markClientQuotesSeen(r,quotes){
  if(newQuoteCount(r)<=0||!quotes.length)return r;
  try{
    const latest=new Date(Math.max(...quotes.map(quoteTime))).toISOString();
    await mutate('requests',r.id,r.version,{lastSeenQuoteAt:new Date().toISOString()});
    r.version=Number(r.version||0)+1;r.lastSeenQuoteAt=latest;updateShell();
  }catch{}
  return r;
}
function selectedQuotePanel(r){
  const q=(platformState?.quotes||[]).find(x=>x.id===r.selectedQuoteId&&x.status==='published');
  if(!q)return '';
  const total=quoteTotal(q,r);
  return `<section class="client-selected-quote"><div class="client-detail-section-head"><div><small>${esc(tr('العرض المختار','Selected quote'))}</small><strong>#${esc(ref(q))}</strong></div><span class="status-pill status-published">${esc(tr('مختار','Selected'))}</span></div><div class="client-selected-values"><div><span>${esc(tr('سعر الوحدة','Unit price'))}</span><strong>${money(q.unitPrice,q.currency)}</strong></div><div><span>${esc(tr('الكمية','Quantity'))}</span><strong>${esc(r.quantity||'—')}</strong></div><div class="total"><span>${esc(tr('الإجمالي','Total'))}</span><strong>${total!==null?money(total,q.currency):'—'}</strong></div></div></section>`;
}
function clientRequestActionPanel(r){
  const order=clientOrders().find(o=>o.type==='custom'&&o.id===r.id),action=order?clientOrderNeedsAction(order):null;
  if(!action)return '';
  return `<section class="client-detail-action ${esc(action.tone||'action')}"><div><small>${esc(tr('الإجراء المطلوب','Action required'))}</small><strong>${esc(action.label)}</strong></div>${action.key==='new_quotes'||action.key==='choose_quote'?`<button type="button" class="primary-small" data-client-offers-request="${esc(r.id)}">${esc(tr('عرض العروض','View quotes'))}</button>`:''}</section>`;
}
async function openClientOffers(requestId){
  let r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const quotes=(platformState.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published').sort((a,b)=>quoteTime(b)-quoteTime(a));
  await markClientQuotesSeen(r,quotes);
  const summary=`<section class="client-order-summary"><div><small>#${esc(ref(r))}</small><strong>${esc(titleOf(r))}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(tr('عدد العروض','Quotes'))}: ${esc(quotes.length)}</span></div></section>`;
  openModal(tr('مقارنة العروض','Compare quotes'),`#${ref(r)}`,`${summary}<div class="client-compare-list">${quotes.map(q=>clientQuoteCard(q,r)).join('')||empty()}</div>`);
}
async function openClientRequest(requestId){
  let r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const seenOrder=clientOrders().find(o=>o.type==='custom'&&o.id===requestId);if(seenOrder)markClientOrdersSeen([seenOrder]);
  const quotes=(platformState.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published');
  const actionPanel=clientRequestActionPanel(r),status=requestTrackingStatus(r),selectedPanel=selectedQuotePanel(r);
  const compareButton=quotes.length?`<button type="button" class="secondary-btn full client-view-quotes" data-client-offers-request="${esc(r.id)}">${esc(r.selectedQuoteId?tr('عرض جميع العروض','View all quotes'):tr('عرض ومقارنة العروض','View & compare quotes'))}</button>`:'';
  const summary=`<section class="client-order-summary"><div class="client-order-summary-title"><small>#${esc(ref(r))} · ${esc(tr('طلب خاص','Custom request'))}</small><strong>${esc(titleOf(r))}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(tr('الدولة','Country'))}: ${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div></section>`;
  const statusCard=`<section class="client-current-status"><small>${esc(tr('الحالة الحالية','Current status'))}</small><strong>${esc(trackingLabel(status))}</strong>${r.trackingUpdatedAt?`<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(r.trackingUpdatedAt))}</span>`:''}</section>`;
  openModal(titleOf(r),`#${ref(r)}`,`${summary}${actionPanel}${statusCard}${selectedPanel}${compareButton}${paymentPanel(r,'request')}${invoicePanel(r,'request')}${trackingTimeline(r)}<section class="client-detail-content"><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(r)||'—')}</p>${gallery(r.images)}</section><button type="button" class="secondary-btn full repeat-request-btn" data-repeat-request="${esc(r.id)}">${esc(tr('تكرار الطلب','Repeat request'))}</button>`);
}
function clientReadyActionPanel(interest,offer){
  const order=clientOrders().find(o=>o.type==='ready'&&o.id===interest.id),action=order?clientOrderNeedsAction(order):null;
  if(!action)return '';
  return `<section class="client-detail-action ${esc(action.tone||'action')}"><div><small>${esc(tr('الإجراء المطلوب','Action required'))}</small><strong>${esc(action.label)}</strong></div></section>`;
}
function snapshotTitle(item={}){
  const x=item.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||item.product||tr('منتج','Product');
}
function openReadyOrder(interestId){
  const interest=(platformState.interests||[]).find(i=>i.id===interestId&&!i.cartOrderId);if(!interest)return;
  const o=(platformState.publicOffers||[]).find(x=>x.id===interest.offerId);
  const seenOrder=clientOrders().find(order=>order.type==='ready'&&order.id===interest.id);if(seenOrder)markClientOrdersSeen([seenOrder]);
  const status=readyTrackingStatus(interest),unitPrice=interest.unitPrice||o?.unitPrice,total=interest.total||Number(interest.quantity||0)*Number(unitPrice||0),currency=interest.currency||o?.currency;
  const title=o?titleOf(o):tr('منتج جاهز','Ready product');
  const summary=`<section class="client-order-summary"><div class="client-order-summary-title"><small>#${esc(ref(interest))} · ${esc(tr('منتج جاهز','Ready product'))}</small><strong>${esc(title)}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(interest.quantity||'—')}</span><span>${esc(tr('سعر الوحدة','Unit price'))}: ${money(unitPrice,currency)}</span><span>${esc(tr('الإجمالي','Total'))}: ${money(total,currency)}</span></div></section>`;
  const statusCard=`<section class="client-current-status"><small>${esc(tr('الحالة الحالية','Current status'))}</small><strong>${esc(trackingLabel(status))}</strong>${interest.trackingUpdatedAt?`<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(interest.trackingUpdatedAt))}</span>`:''}</section>`;
  const productInfo=o?`<section class="client-detail-content"><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(o)||'—')}</p><div class="facts"><span>MOQ ${esc(o.moq||'—')}</span><span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span><span>${esc(t('leadTime'))}: ${esc(o.leadTime||'—')}</span></div>${gallery(o.images)}</section>`:'';
  openModal(title,`#${ref(interest)}`,`${summary}${clientReadyActionPanel(interest,o)}${statusCard}${paymentPanel(interest,'interest')}${invoicePanel(interest,'interest')}${trackingTimeline(interest,{flow:READY_TRACKING_FLOW,statusResolver:readyTrackingStatus})}${productInfo}`);
}
function openPublicOffer(offerId){
  const o=(platformState.publicOffers||[]).find(x=>x.id===offerId);if(!o)return;
  const cartItem=cartItems.find(x=>x.offerId===o.id);
  const moq=Math.max(1,Math.ceil(Number(o.moq)||1)),stock=Number(o.stock),maxAttr=Number.isFinite(stock)&&stock>0?` max="${esc(Math.floor(stock))}"`:'';
  const initialQty=cartItem?.quantity||moq;
  const requestForm=currentUser.role==='client'?`<form id="publicInterestForm" class="public-interest-form" data-offer-id="${esc(o.id)}">
    <div class="public-interest-head"><div><strong>${esc(tr('حدد الكمية المطلوبة','Choose requested quantity'))}</strong><small>${esc(tr('الحد الأدنى للطلب','Minimum order'))}: ${esc(o.moq||'—')}</small></div></div>
    <label><span>${esc(tr('الكمية','Quantity'))}</span><input id="publicInterestQuantity" name="quantity" type="number" min="${esc(moq)}" step="1" value="${esc(initialQty)}"${maxAttr} required></label>
    <div class="public-interest-total"><span>${esc(tr('إجمالي هذا المنتج','This product total'))}</span><strong id="publicInterestTotal">${money(initialQty*Number(o.unitPrice||0),o.currency)}</strong></div>
    ${Number.isFinite(stock)&&stock>0?`<small>${esc(tr('المخزون المتاح','Available stock'))}: ${esc(stock)}</small>`:''}
    <p class="form-message" id="publicInterestMessage"></p>
    <button class="primary-btn full" type="submit">${esc(cartItem?tr('تحديث الكمية في السلة','Update quantity in cart'):tr('إضافة إلى السلة','Add to cart'))}</button>
  </form>`:'';
  openModal(titleOf(o),`#${ref(o)}`,`${gallery(o.images)}<div class="quote-price">${money(o.unitPrice,o.currency)}</div><div class="facts"><span>MOQ ${esc(o.moq||'—')}</span><span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span><span>${esc(t('leadTime'))}: ${esc(o.leadTime||'—')}</span><span>${esc(tr('بلد التوريد','Supply country'))}: ${esc(supplyCountryLabel(o.country))}</span><span>${esc(t('validUntil'))}: ${esc(o.validUntil||'—')}</span></div><p class="long-copy">${esc(descriptionOf(o)||'—')}</p>${requestForm}`);
  if(currentUser.role==='client'){
    const form=$('publicInterestForm'),input=$('publicInterestQuantity'),total=$('publicInterestTotal');
    input?.addEventListener('input',()=>{const q=Number(input.value);total.textContent=money((Number.isFinite(q)?q:0)*Number(o.unitPrice||0),o.currency);});
    form?.addEventListener('submit',submitPublicInterest);
  }
}
async function submitPublicInterest(e){
  e.preventDefault();if(busy)return;busy=true;
  const form=e.currentTarget,offerId=form.dataset.offerId,o=(platformState.publicOffers||[]).find(x=>x.id===offerId),message=$('publicInterestMessage');
  if(!o){busy=false;return;}
  try{
    addToCart(o,Number(form.quantity.value));
    closeModal();
    showToast(tr('تمت إضافة المنتج إلى السلة.','Product added to cart.'));
  }catch(error){if(message)message.textContent=error.message;else showToast(error.message);}
  finally{busy=false;}
}
function openCart(){
  if(currentUser?.role!=='client')return;
  const rows=cartRows();
  if(!rows.length){
    openModal(tr('سلة الطلب','Order cart'),tr('طلب متعدد المنتجات','Multi-product order'),`<div class="empty-state cart-empty"><span>🛒</span><p>${esc(tr('السلة فارغة. أضف منتجات من الصفحة الرئيسية.','Your cart is empty. Add products from the home page.'))}</p></div>`);
    return;
  }
  const currency=rows[0].currency,total=rows.reduce((sum,row)=>sum+row.total,0);
  const html=`<form id="cartCheckoutForm" class="cart-checkout-form">
    <div class="cart-table">
      <div class="cart-table-head" aria-hidden="true">
        <span>${esc(tr('صورة المنتج','Image'))}</span><span>${esc(tr('اسم المنتج','Product'))}</span><span>${esc(tr('سعر الحبة','Unit price'))}</span><span>${esc(tr('الكمية','Quantity'))}</span><span>${esc(tr('الإجمالي','Total'))}</span><span>${esc(tr('حذف','Remove'))}</span>
      </div>
      <div class="cart-lines">${rows.map(row=>{
        const o=row.offer,image=(o.images||[])[0],stock=Number(o.stock),maxAttr=Number.isFinite(stock)&&stock>0?` max="${esc(Math.floor(stock))}"`:'';
        return `<article class="cart-line" data-cart-line="${esc(o.id)}">
          <div class="cart-line-image">${image?`<img alt="" data-media="${esc(image)}">`:'<div>M</div>'}</div>
          <div class="cart-line-product"><strong>${esc(titleOf(o))}</strong><small>MOQ ${esc(o.moq||'—')}</small></div>
          <div class="cart-line-price"><span>${esc(tr('سعر الحبة','Unit price'))}</span><strong>${money(row.unitPrice,row.currency)}</strong></div>
          <label class="cart-line-qty"><span>${esc(tr('الكمية','Quantity'))}</span><input type="number" data-cart-qty="${esc(o.id)}" min="${esc(Math.max(1,Math.ceil(Number(o.moq)||1)))}" step="1" value="${esc(row.quantity)}"${maxAttr}></label>
          <div class="cart-line-total"><span>${esc(tr('الإجمالي','Total'))}</span><strong>${money(row.total,row.currency)}</strong></div>
          <button type="button" class="danger-text cart-line-remove" data-cart-remove="${esc(o.id)}">${esc(tr('حذف','Remove'))}</button>
        </article>`;
      }).join('')}</div>
    </div>
    <section class="cart-summary"><div><span>${esc(tr('عدد المنتجات','Products'))}</span><strong>${rows.length}</strong></div><div class="cart-grand-total"><span>${esc(tr('الإجمالي الكلي','Grand total'))}</span><strong>${money(total,currency)}</strong></div></section>
    <p class="form-message" id="cartMessage"></p>
    <div class="cart-actions"><button type="button" class="secondary-btn" data-cart-clear>${esc(tr('إفراغ السلة','Clear cart'))}</button><button class="primary-btn" type="submit">${esc(tr('إرسال الطلب','Submit order'))}</button></div>
  </form>`;
  openModal(tr('سلة الطلب','Order cart'),tr(`${rows.length} منتجات · ${currency}`,`${rows.length} products · ${currency}`),html);
  $('cartCheckoutForm')?.addEventListener('submit',submitCartOrder);
  $('modalBody').querySelectorAll('[data-cart-qty]').forEach(input=>input.addEventListener('change',()=>{
    if(!setCartQuantity(input.dataset.cartQty,Number(input.value))){showToast(tr('تحقق من الكمية والحد الأدنى والمخزون.','Check quantity, MOQ, and stock.'));openCart();return;}
    openCart();
  }));
  $('modalBody').querySelectorAll('[data-cart-remove]').forEach(button=>button.addEventListener('click',()=>{
    cartItems=cartItems.filter(x=>x.offerId!==button.dataset.cartRemove);saveCart();openCart();
  }));
  $('modalBody').querySelector('[data-cart-clear]')?.addEventListener('click',()=>{cartItems=[];saveCart();openCart();});
}
async function createCartOrderRequest(items){
  try{
    return await request('/api/v1/cart-orders',{method:'POST',auth:true,body:{items}});
  }catch(error){
    if(Number(error?.status)!==404)throw error;
    const token=session.accessToken;
    if(!token)throw error;
    const response=await fetch('https://retpewhbjpdgbfekynjt.supabase.co/functions/v1/cart-orders-dev',{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-M-Client':'native'},
      body:JSON.stringify({items})
    });
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok){
      const fallback=new Error(data?.error||tr('تعذر إنشاء الطلب.','Could not create order.'));
      fallback.status=response.status;throw fallback;
    }
    return data;
  }
}
async function submitCartOrder(e){
  e.preventDefault();if(busy)return;busy=true;
  const message=$('cartMessage'),button=e.currentTarget.querySelector('button[type="submit"]');
  try{
    const rows=cartRows();if(!rows.length)throw new Error(tr('السلة فارغة.','Cart is empty.'));
    button.disabled=true;if(message)message.textContent=tr('جارٍ إنشاء الطلب...','Creating order...');
    const items=rows.map(row=>({offerId:row.offer.id,quantity:row.quantity}));
    const result=await createCartOrderRequest(items);
    cartItems=[];saveCart();await loadData({render:false});closeModal();activeScreen='requests';renderScreen();
    showToast(tr(`تم إنشاء الطلب #${result.displayNo||''} بنجاح.`,`Order #${result.displayNo||''} created successfully.`));
  }catch(error){if(message)message.textContent=error.message||tr('تعذر إنشاء الطلب.','Could not create order.');if(button)button.disabled=false;}
  finally{busy=false;}
}
function openCartOrder(orderId){
  const r=(platformState.requests||[]).find(x=>x.id===orderId&&x.orderType==='cart');if(!r)return;
  const seenOrder=clientOrders().find(o=>o.type==='cart'&&o.id===orderId);if(seenOrder)markClientOrdersSeen([seenOrder]);
  const children=(platformState.interests||[]).filter(i=>i.cartOrderId===r.id),snapshots=Array.isArray(r.cartItems)?r.cartItems:[];
  const lines=snapshots.map(line=>{
    const child=children.find(i=>i.id===line.interestId),status=child?readyTrackingStatus(child):'received',image=(line.images||[])[0];
    return `<article class="cart-order-line"><div class="cart-order-line-image">${image?`<img alt="" data-media="${esc(image)}">`:'<div>M</div>'}</div><div><strong>${esc(snapshotTitle(line))}</strong><small>${esc(tr('الكمية','Quantity'))}: ${esc(line.quantity||'—')} · ${money(line.unitPrice,line.currency)}</small><b>${money(line.total,line.currency)}</b><span class="status-pill status-${esc(status)}">${esc(trackingLabel(status))}</span></div></article>`;
  }).join('');
  const summary=`<section class="client-order-summary cart-order-summary"><div class="client-order-summary-title"><small>#${esc(ref(r))} · ${esc(tr('طلب منتجات','Product order'))}</small><strong>${esc(tr(`${r.cartItemCount||snapshots.length} منتجات`,`${r.cartItemCount||snapshots.length} products`))}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الإجمالي','Total'))}: ${money(r.cartTotal,r.currency)}</span><span>${esc(tr('الحالة','Status'))}: ${esc(trackingLabel(requestTrackingStatus(r)))}</span></div></section>`;
  openModal(tr('تفاصيل طلب المنتجات','Product order details'),`#${ref(r)}`,`${summary}<section class="cart-order-items"><h3>${esc(tr('المنتجات','Products'))}</h3>${lines||empty()}</section>${paymentPanel(r,'request')}${invoicePanel(r,'request')}${trackingTimeline(r,{flow:READY_TRACKING_FLOW,statusResolver:requestTrackingStatus})}`);
}
function openSupplierRequest(requestId){
  const r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const existing=(platformState.quotes||[]).find(q=>q.requestId===r.id);
  openModal(titleOf(r),`#${ref(r)}`,`${gallery(r.images)}<div class="facts"><span>${esc(t('quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div><p class="long-copy">${esc(descriptionOf(r)||'—')}</p>${existing?`<button class="secondary-btn full" data-edit-quote="${esc(existing.id)}">${esc(t('editQuote'))}</button>`:`<button class="primary-btn full" data-quote-request="${esc(r.id)}">${esc(t('submitQuote'))}</button>`}`);
}
function supplierOrderActions(order){
  const base=`data-supplier-order-type="${esc(order.type)}" data-supplier-order-id="${esc(order.id)}"`;
  if(order.status==='pending_confirmation')return `<div class="supplier-order-actions"><button class="primary-btn" type="button" data-supplier-order-status="confirmed" ${base}>${esc(tr('تأكيد التنفيذ','Confirm fulfillment'))}</button><button class="secondary-btn" type="button" data-supplier-order-cannot ${base}>${esc(tr('تعذر التنفيذ','Unable to fulfill'))}</button></div>`;
  if(order.status==='confirmed')return `<div class="supplier-order-actions"><p class="supplier-order-payment-hint">${esc(tr('يمكن بدء التجهيز/الإنتاج بعد تأكيد الدفع من الإدارة. يتحقق النظام من ذلك تلقائيًا.','Preparation / production can start after admin confirms payment. The system checks this automatically.'))}</p><button class="primary-btn" type="button" data-supplier-order-status="production" ${base}>${esc(tr('بدء التجهيز / الإنتاج','Start preparation / production'))}</button></div>`;
  if(order.status==='production')return `<div class="supplier-order-actions"><button class="primary-btn" type="button" data-supplier-order-status="ready_for_inspection" ${base}>${esc(tr('جاهز للفحص','Ready for inspection'))}</button></div>`;
  if(order.status==='ready_for_inspection')return `<div class="supplier-order-complete">✓ ${esc(tr('تم إشعار الإدارة أن الطلب جاهز للفحص.','Admin has been notified that the order is ready for inspection.'))}</div>`;
  return `<div class="supplier-order-cannot-note"><strong>${esc(tr('تعذر التنفيذ','Unable to fulfill'))}</strong><p>${esc(order.note||'—')}</p></div>`;
}
function openSupplierOrder(type,id){
  const order=supplierOrders().find(o=>o.type===type&&o.id===id);if(!order)return;
  const refItem=order.type==='quote'?order.request:order.interest;
  const summary=`<div class="supplier-order-summary"><div><span>${esc(tr('سعر الوحدة','Unit price'))}</span><strong>${money(order.unitPrice,order.currency)}</strong></div><div><span>${esc(tr('الكمية','Quantity'))}</span><strong>${esc(order.quantity||'—')}</strong></div><div class="total"><span>${esc(tr('الإجمالي','Total'))}</span><strong>${order.total!==null?money(order.total,order.currency):'—'}</strong></div></div>`;
  openModal(order.title,`#${ref(refItem)} · ${order.source}`,`${gallery(order.images)}<section class="supplier-order-detail"><div class="supplier-order-detail-head"><div><small>${esc(tr('حالة التنفيذ','Fulfillment status'))}</small>${supplierOrderStatusBadge(order.status)}</div></div>${summary}<h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(order.item)||'—')}</p>${order.type==='quote'&&order.country?`<div class="facts"><span>${esc(tr('دولة التسليم','Delivery country'))}: ${esc(order.country)}</span></div>`:''}${supplierOrderActions(order)}</section>`);
}
async function updateSupplierOrderStatus(type,id,status,note=''){
  const order=supplierOrders().find(o=>o.type===type&&o.id===id);if(!order)return;
  const collection=type==='quote'?'quotes':'interests',item=type==='quote'?order.quote:order.interest;
  try{
    await mutate(collection,item.id,item.version,{supplierOrderStatus:status,supplierOrderNote:note});
    await loadData({render:false});closeModal();activeScreen='orders';renderScreen();
    showToast(status==='ready_for_inspection'?tr('تم تحديث الطلب إلى جاهز للفحص.','Order marked ready for inspection.'):tr('تم تحديث حالة الطلب.','Order status updated.'));
  }catch(error){showToast(error.message);}
}
function openSupplierCannotFulfill(type,id){
  const order=supplierOrders().find(o=>o.type===type&&o.id===id);if(!order)return;
  openModal(tr('تعذر تنفيذ الطلب','Unable to fulfill order'),`#${ref(order.type==='quote'?order.request:order.interest)}`,`<form id="supplierCannotForm" class="form-stack" data-order-type="${esc(type)}" data-order-id="${esc(id)}"><p>${esc(tr('اكتب السبب بوضوح ليظهر للإدارة فقط.','Add a clear reason. It will be visible to admin only.'))}</p><label><span>${esc(tr('سبب تعذر التنفيذ','Reason'))}</span><textarea name="reason" maxlength="1000" required></textarea></label><button class="danger-btn" type="submit">${esc(tr('تأكيد تعذر التنفيذ','Confirm unable to fulfill'))}</button></form>`);
  $('supplierCannotForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,reason=form.reason.value.trim();if(!reason)return;await updateSupplierOrderStatus(form.dataset.orderType,form.dataset.orderId,'cannot_fulfill',reason);});
}
async function paymentReceiptSource(input){
  const file=input?.files?.[0];if(!file)throw new Error(tr('اختر صورة أو ملف PDF للإيصال.','Choose an image or PDF receipt.'));
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name||'')){
    if(file.size>3*1024*1024)throw new Error(tr('الحد الأقصى لملف PDF هو 3 MB.','PDF receipt must be 3 MB or smaller.'));
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error(tr('تعذر قراءة ملف PDF.','Could not read the PDF.')));reader.readAsDataURL(file);});
  }
  const sources=await filesToCompressedSources(input,{maxFiles:1});
  if(!sources.length)throw new Error(tr('اختر صورة للإيصال.','Choose a receipt image.'));
  return sources[0];
}
function openPaymentReceiptForm(entityType,entityId){
  const item=paymentEntity(entityType,entityId);if(!item)return;
  const title=tr('إرفاق إيصال الدفع','Upload payment receipt');
  const kicker=entityType==='request'?'#'+ref(item):tr('طلب منتج جاهز','Ready-product request');
  const message=item.paymentMessage||tr('يرجى إتمام عملية الدفع وإرفاق إيصال الدفع لتأكيد طلبك.','Please complete payment and upload the receipt to confirm your order.');
  const adminNote=item.paymentReviewNote?'<p><b>'+esc(tr('ملاحظة الإدارة','Admin note'))+':</b> '+esc(item.paymentReviewNote)+'</p>':'';
  const html='<form id="paymentReceiptForm" class="form-stack" data-entity-type="'+esc(entityType)+'" data-entity-id="'+esc(entityId)+'">'+
    '<section class="payment-upload-note"><strong>'+esc(paymentLabel(item.paymentStatus||'awaiting_receipt'))+'</strong><p>'+esc(message)+'</p>'+adminNote+'</section>'+bankTransferCard(item)+
    '<label><span>'+esc(tr('إيصال الدفع','Payment receipt'))+'</span><input id="paymentReceiptFile" type="file" accept="image/*,application/pdf,.pdf" required><small>'+esc(tr('صورة أو PDF — ملف PDF بحد أقصى 3 MB، والصور تُضغط تلقائيًا.','Image or PDF — PDF maximum 3 MB; images are compressed automatically.'))+'</small></label>'+
    '<p class="form-message" id="paymentReceiptMessage"></p><button class="primary-btn" type="submit">'+esc(tr('إرسال الإيصال','Submit receipt'))+'</button></form>';
  openModal(title,kicker,html);
  $('paymentReceiptForm').addEventListener('submit',submitPaymentReceipt);
}
async function submitPaymentReceipt(e){
  e.preventDefault();if(busy)return;busy=true;
  const form=e.currentTarget,message=$('paymentReceiptMessage'),entityType=form.dataset.entityType,entityId=form.dataset.entityId,item=paymentEntity(entityType,entityId);
  try{
    message.textContent=tr('جارٍ تجهيز الإيصال...','Preparing receipt...');
    const source=await paymentReceiptSource($('paymentReceiptFile'));
    message.textContent=tr('جارٍ إرسال الإيصال...','Submitting receipt...');
    await request('/api/v1/payment-receipts',{method:'POST',auth:true,body:{entityType,entityId,version:Number(item?.version||0),source}});
    await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(tr('تم إرسال إيصال الدفع للمراجعة.','Payment receipt submitted for review.'));
  }catch(error){message.textContent=error.message||tr('تعذر إرسال الإيصال.','Could not submit receipt.');}
  finally{busy=false;}
}
async function openPaymentDocument(src){
  const url=await mediaUrl(src);
  if(!url){showToast(tr('تعذر فتح الإيصال.','Could not open receipt.'));return;}
  openModal(tr('إيصال الدفع','Payment receipt'),'PDF',`<div class="pdf-preview-wrap"><iframe class="pdf-preview-frame" title="${esc(tr('إيصال الدفع','Payment receipt'))}" src="${esc(url)}"></iframe><a class="secondary-btn full pdf-fallback-link" href="${esc(url)}" target="_self">${esc(tr('فتح الملف مباشرة','Open file directly'))}</a></div>`);
}
function fileField(idValue){return `<label><span>${esc(t('images'))}</span><input id="${idValue}" type="file" accept="image/*" multiple /><small>${esc(t('chooseImages'))}</small></label>`;}
function openNewRequest(source=null){
  const repeat=source&&currentUser?.role==='client';
  const existing=repeat&&source.images?.length?`<section class="repeat-images"><strong>${esc(tr('صور الطلب السابق','Previous request images'))}</strong><p>${esc(tr('أزل التحديد عن أي صورة لا تريد استخدامها.','Uncheck any image you do not want to reuse.'))}</p><div class="repeat-image-grid">${source.images.map(src=>`<label><input type="checkbox" data-repeat-image value="${esc(src)}" checked><img alt="" data-media="${esc(src)}"></label>`).join('')}</div></section>`:'';
  const title=repeat?tr('تكرار الطلب','Repeat request'):t('newRequest');
  const kicker=repeat?'#'+ref(source):'M Platform';
  openModal(title,kicker,`<form id="newRequestForm" class="form-stack" data-repeat-from="${esc(repeat?source.id:'')}"><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" value="${esc(repeat?source.product||'':'')}" /></label><label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000">${esc(repeat?source.specs||'':'')}</textarea></label><div class="form-two"><label><span>${esc(t('quantity'))}</span><input name="quantity" type="number" min="1" required value="${esc(repeat?source.quantity||'':'')}" /></label><label><span>${esc(t('country'))}</span><input name="country" maxlength="100" value="${esc(repeat?source.country||'':'')}" /></label></div><label><span>${esc(t('neededDate'))}</span><input name="neededDate" type="date" value="${esc(repeat?source.neededDate||'':'')}" /></label>${existing}${fileField('requestFiles')}<p class="form-message" id="requestFormMessage"></p><button class="primary-btn" type="submit">${esc(repeat?tr('إنشاء طلب جديد','Create new request'):t('submit'))}</button></form>`);
  $('newRequestForm').addEventListener('submit',submitNewRequest);
}
function quoteFormHtml(q=null,requestId=''){return `<form id="quoteForm" class="form-stack" data-id="${esc(q?.id||'')}" data-request="${esc(requestId||q?.requestId||'')}"><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" value="${esc(q?.unitPrice||'')}" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option ${q?.currency===c?'selected':''}>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" value="${esc(q?.moq||'')}" required /></label><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" value="${esc(q?.leadTime||'')}" required /></label></div><label><span>${esc(t('sampleCost'))}</span><input name="sampleCost" value="${esc(q?.sampleCost||'')}" maxlength="10000" /></label><label><span>${esc(t('notes'))}</span><textarea name="notes" maxlength="10000">${esc(q?.notes||'')}</textarea></label>${fileField('quoteFiles')}<p class="form-message" id="quoteFormMessage"></p><button class="primary-btn" type="submit">${esc(q?t('save'):t('submit'))}</button></form>`;}
function openQuoteForm(requestId,q=null){openModal(q?t('editQuote'):t('submitQuote'),q?`#${ref(q)}`:`#${ref((platformState.requests||[]).find(r=>r.id===requestId))}`,quoteFormHtml(q,requestId));$('quoteForm').addEventListener('submit',submitQuote);}
function openNewPublic(){
  const cats=categories(),subs=subcategories(),countries=supplyCountries();
  openModal(t('newPublicOffer'),'M Platform',`<form id="publicForm" class="form-stack"><label><span>SKU</span><input name="sku" required maxlength="80" pattern="[A-Za-z0-9._-]+" /></label><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" /></label>${cats.length?`<div class="form-two"><label><span>${esc(tr('التصنيف الرئيسي','Main category'))}</span><select name="categoryId" required><option value="">—</option>${cats.map(cat=>`<option value="${esc(cat.id)}">${esc(taxonomyLabel(cat,lang))}</option>`).join('')}</select></label><label><span>${esc(tr('التصنيف الفرعي','Subcategory'))}</span><select name="subcategoryId"><option value="">—</option>${subs.map(s=>`<option value="${esc(s.id)}" data-parent="${esc(s.parentId)}">${esc(taxonomyLabel(s,lang))}</option>`).join('')}</select></label></div>`:''}<label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000"></textarea></label><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" required /></label><label><span>${esc(t('stock'))}</span><input name="stock" type="number" min="0" step="1" /></label></div><div class="form-two"><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" required /></label><label><span>${esc(tr('بلد التوريد','Supply country'))}</span><select name="country" required><option value="">—</option>${countries.map(x=>`<option value="${esc(x.id)}">${esc(taxonomyLabel(x,lang))}</option>`).join('')}</select></label></div><label><span>${esc(t('validUntil'))}</span><input name="validUntil" type="date" /></label>${fileField('publicFiles')}<p class="form-message" id="publicFormMessage"></p><button class="primary-btn" type="submit">${esc(t('submit'))}</button></form>`);
  const form=$('publicForm'),cat=form.categoryId,sub=form.subcategoryId;
  const sync=()=>{if(!sub)return;[...sub.options].forEach(o=>{if(o.value)o.hidden=!!cat?.value&&o.dataset.parent!==cat.value;});if(sub.selectedOptions[0]?.hidden)sub.value='';};
  cat?.addEventListener('change',sync);sync();form.addEventListener('submit',submitPublic);
}


const BULK_ERROR_COPY={
  sku:['تحقق من SKU','Check SKU'],duplicate_sku:['SKU مكرر داخل الملف','Duplicate SKU in file'],
  product:['اسم المنتج مطلوب','Product name is required'],specs:['الوصف مطلوب','Description is required'],
  contact:['احذف بيانات التواصل من الاسم أو الوصف','Remove contact details from product text'],
  unitPrice:['السعر غير صحيح','Invalid price'],currency:['العملة غير مدعومة','Unsupported currency'],
  moq:['MOQ غير صحيح','Invalid MOQ'],stock:['المخزون غير صحيح','Invalid stock'],
  leadTime:['مدة الإنتاج غير صحيحة','Invalid production time'],category:['التصنيف غير موجود','Category not found'],
  country:['اختر الصين أو الإمارات','Choose China or UAE'],validUntil:['تاريخ الصلاحية غير صحيح','Invalid valid-until date'],
  images:['أضف صورة واحدة على الأقل','Add at least one image'],
  image_format:['هناك صورة غير مدعومة أو أكبر من 5 MB','An image is unsupported or larger than 5 MB'],
  server:['تعذر استيراد هذا المنتج','Could not import this product']
};
function bulkErrorLabel(key){const row=BULK_ERROR_COPY[key];return row?tr(row[0],row[1]):key;}
function bulkContext(){return {categories:categories(),subcategories:subcategories(),supplyCountries:supplyCountries(),existingOffers:platformState?.publicOffers||[]};}
function bulkRevalidate(){bulkImportRows=validateBulkProductRows(bulkImportRows,bulkContext());}
function bulkWorkbookError(error){
  const map={
    xlsx_only:tr('اختر ملف Excel بصيغة .xlsx فقط.','Choose an .xlsx Excel file.'),
    workbook_too_large:tr('حجم ملف Excel كبير جدًا. الحد الأقصى 30 MB.','Excel file is too large. Maximum 30 MB.'),
    invalid_xlsx:tr('تعذر قراءة ملف Excel. تأكد أنه ملف .xlsx سليم.','Could not read the Excel file. Make sure it is a valid .xlsx file.'),
    unsupported_xlsx_compression:tr('هذا الجهاز لا يدعم فك هذا النوع من ملفات Excel.','This device cannot unpack this Excel file.'),
    headers_not_found:tr('لم يتم العثور على أعمدة القالب المطلوبة. استخدم قالب المنصة.','Required template columns were not found. Use the platform template.'),
    too_many_rows:tr('الحد الأقصى 500 منتج في الملف الواحد.','Maximum 500 products per file.'),
    no_products:tr('لم يتم العثور على منتجات داخل الملف.','No products were found in the file.')
  };
  return map[error?.message]||error?.message||tr('تعذر قراءة الملف.','Could not read the file.');
}
function bulkCategoryOptions(selected){return categories().map(cat=>`<option value="${esc(cat.id)}" ${selected===cat.id?'selected':''}>${esc(taxonomyLabel(cat,lang))}</option>`).join('');}
function bulkSubcategoryOptions(selected,parentId){return subcategories(true,parentId).map(x=>`<option value="${esc(x.id)}" ${selected===x.id?'selected':''}>${esc(taxonomyLabel(x,lang))}</option>`).join('');}
function bulkCountryOptions(selected){return supplyCountries().map(x=>`<option value="${esc(x.id)}" ${selected===x.id?'selected':''}>${esc(taxonomyLabel(x,lang))}</option>`).join('');}
function bulkRowCard(row,index){
  const ready=!row.errors.length,duplicate=row.duplicateOfferId;
  const imageHtml=(row.images||[]).map((img,i)=>`<div class="bulk-image-item"><img src="${esc(img.source)}" alt=""><button type="button" data-bulk-remove-image="${index}:${i}" aria-label="${esc(tr('حذف الصورة','Remove image'))}">×</button><small>${i===0?esc(tr('رئيسية','Main')):i+1}</small></div>`).join('');
  const issues=[...row.errors.map(x=>`<span class="bulk-error">${esc(bulkErrorLabel(x))}</span>`),...(row.warnings||[]).map(x=>x==='existing_sku'?`<span class="bulk-warning">${esc(tr('يوجد منتج بنفس SKU','Existing product with same SKU'))}</span>`:'')].join('');
  const duplicateControl=duplicate?`<label><span>${esc(tr('المنتج موجود مسبقًا','Existing SKU'))}</span><select data-bulk-field="duplicateAction" data-bulk-row="${index}"><option value="skip" ${row.duplicateAction==='skip'?'selected':''}>${esc(tr('تجاهل','Skip'))}</option><option value="update" ${row.duplicateAction==='update'?'selected':''}>${esc(tr('تحديث وإرسال للمراجعة','Update & send for review'))}</option></select></label>`:'';
  return `<article class="bulk-preview-card ${ready?'ready':'invalid'}">
    <div class="bulk-preview-head"><div><small>${esc(tr('صف','Row'))} ${row.rowNumber}</small><strong>${esc(row.product||row.sku||'—')}</strong></div><span class="status-pill ${ready?'status-published':'status-review'}">${esc(ready?tr('جاهز','Ready'):tr('يحتاج تعديل','Needs fixing'))}</span></div>
    <div class="bulk-image-grid">${imageHtml||`<div class="bulk-no-image">${esc(tr('لا توجد صورة','No image'))}</div>`}</div>
    <div class="bulk-edit-grid">
      <label><span>SKU</span><input data-bulk-field="sku" data-bulk-row="${index}" value="${esc(row.sku)}" maxlength="80"></label>
      <label><span>${esc(t('product'))}</span><input data-bulk-field="product" data-bulk-row="${index}" value="${esc(row.product)}" maxlength="300"></label>
      <label class="bulk-wide"><span>${esc(t('specifications'))}</span><textarea data-bulk-field="specs" data-bulk-row="${index}" maxlength="10000">${esc(row.specs)}</textarea></label>
      <label><span>${esc(t('price'))}</span><input data-bulk-field="unitPrice" data-bulk-row="${index}" type="number" step="0.01" min="0.01" value="${esc(row.unitPrice)}"></label>
      <label><span>${esc(t('currency'))}</span><select data-bulk-field="currency" data-bulk-row="${index}">${['USD','SAR','AED','CNY','EUR'].map(x=>`<option ${row.currency===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label><span>${esc(t('moq'))}</span><input data-bulk-field="moq" data-bulk-row="${index}" type="number" min="1" step="1" value="${esc(row.moq)}"></label>
      <label><span>${esc(t('stock'))}</span><input data-bulk-field="stock" data-bulk-row="${index}" type="number" min="0" step="1" value="${esc(row.stock)}"></label>
      <label><span>${esc(t('leadTime'))}</span><input data-bulk-field="leadTime" data-bulk-row="${index}" type="number" min="1" value="${esc(row.leadTime)}"></label>
      <label><span>${esc(tr('التصنيف الرئيسي','Main category'))}</span><select data-bulk-field="category" data-bulk-row="${index}"><option value="">—</option>${bulkCategoryOptions(row.categoryId)}</select></label>
      <label><span>${esc(tr('التصنيف الفرعي','Subcategory'))}</span><select data-bulk-field="subcategory" data-bulk-row="${index}"><option value="">—</option>${bulkSubcategoryOptions(row.subcategoryId,row.categoryId)}</select></label>
      <label><span>${esc(tr('بلد التوريد','Supply country'))}</span><select data-bulk-field="country" data-bulk-row="${index}"><option value="">—</option>${bulkCountryOptions(normalizeSupplyCountry(row.country,supplyCountries()))}</select></label>
      <label><span>${esc(t('validUntil'))}</span><input data-bulk-field="validUntil" data-bulk-row="${index}" type="date" value="${esc(row.validUntil)}"></label>
      ${duplicateControl}
    </div>
    <div class="bulk-issues">${issues}</div>
  </article>`;
}
function renderBulkPreview(message=''){
  bulkRevalidate();
  const valid=bulkImportRows.filter(r=>!r.errors.length).length,invalid=bulkImportRows.length-valid,duplicates=bulkImportRows.filter(r=>r.duplicateOfferId).length;
  $('modalBody').innerHTML=`<section class="bulk-summary"><div><strong>${bulkImportRows.length}</strong><span>${esc(tr('منتج','Products'))}</span></div><div><strong>${valid}</strong><span>${esc(tr('جاهز','Ready'))}</span></div><div><strong>${invalid}</strong><span>${esc(tr('يحتاج تعديل','Needs fixing'))}</span></div><div><strong>${duplicates}</strong><span>${esc(tr('مكرر','Duplicates'))}</span></div></section>
    <div class="bulk-file-bar"><span>${esc(bulkImportFileName)}</span><button type="button" class="text-btn" id="bulkChooseAnother">${esc(tr('اختيار ملف آخر','Choose another file'))}</button></div>
    <p class="form-message" id="bulkImportMessage">${esc(message)}</p>
    <div class="bulk-preview-list">${bulkImportRows.map(bulkRowCard).join('')}</div>
    <div class="bulk-import-footer"><button type="button" class="secondary-btn" id="bulkRecheck">${esc(tr('إعادة التحقق','Recheck'))}</button><button type="button" class="primary-btn" id="bulkImportReady" ${valid?'':'disabled'}>${esc(tr(`استيراد الجاهزة (${valid})`,`Import ready (${valid})`))}</button></div>`;
  $('bulkChooseAnother')?.addEventListener('click',openBulkPublicImport);
  $('bulkRecheck')?.addEventListener('click',()=>renderBulkPreview());
  $('bulkImportReady')?.addEventListener('click',importBulkProducts);
  document.querySelectorAll('[data-bulk-field]').forEach(el=>el.addEventListener('change',()=>{
    const row=bulkImportRows[Number(el.dataset.bulkRow)];if(!row)return;
    row[el.dataset.bulkField]=el.value;
    renderBulkPreview();
  }));
  document.querySelectorAll('[data-bulk-remove-image]').forEach(btn=>btn.addEventListener('click',()=>{
    const [ri,ii]=btn.dataset.bulkRemoveImage.split(':').map(Number),row=bulkImportRows[ri];
    if(!row)return;row.images.splice(ii,1);renderBulkPreview();
  }));
}
async function handleBulkWorkbookFile(file){
  const message=$('bulkFileMessage');if(!file)return;
  try{
    message.textContent=tr('جارٍ قراءة Excel والصور...','Reading Excel and embedded images...');
    bulkImportFileName=file.name;
    bulkImportRows=await parseBulkProductWorkbook(file,bulkContext());
    renderBulkPreview();
  }catch(error){message.textContent=bulkWorkbookError(error);}
}
function openBulkPublicImport(){
  if(currentUser?.role!=='supplier')return;
  bulkImportRows=[];bulkImportFileName='';
  openModal(tr('استيراد المنتجات من Excel','Import products from Excel'),tr('Excel واحد مع الصور','One Excel file with embedded images'),`
    <section class="bulk-upload-intro">
      <h3>${esc(tr('ارفع ملف .xlsx واحد','Upload one .xlsx file'))}</h3>
      <p>${esc(tr('كل منتج في صف، والصور تكون داخل أعمدة Image 1 إلى Image 5 في نفس الصف. بعد الرفع يمكنك تعديل أي خطأ قبل الاستيراد.','Each product is one row, with images embedded in Image 1–5 columns. You can edit mistakes before importing.'))}</p>
      <button type="button" class="secondary-btn bulk-template-link" id="bulkDownloadTemplate">${esc(tr('تحميل قالب Excel','Download Excel template'))}</button>
      <label class="bulk-file-picker"><span>${esc(tr('اختيار ملف Excel','Choose Excel file'))}</span><input id="bulkExcelFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
      <small>${esc(tr('حتى 500 منتج، 5 صور لكل منتج، وحجم Excel حتى 30 MB.','Up to 500 products, 5 images per product, Excel file up to 30 MB.'))}</small>
      <p class="form-message" id="bulkFileMessage"></p>
    </section>`);
  $('bulkDownloadTemplate')?.addEventListener('click',async()=>{
    const button=$('bulkDownloadTemplate'),message=$('bulkFileMessage');
    button.disabled=true;
    try{
      const result=await downloadBulkProductTemplate();
      if(result?.method==='share')message.textContent=tr('تم فتح خيارات الحفظ. اختر «حفظ في الملفات».','Save options opened. Choose “Save to Files”.');
      else if(result?.method==='download')message.textContent=tr('تم تنزيل القالب.','Template downloaded.');
      else message.textContent='';
    }catch(error){
      message.textContent=tr('تعذر فتح القالب. حاول مرة أخرى.','Could not open the template. Please try again.');
    }finally{button.disabled=false;}
  });
  $('bulkExcelFile')?.addEventListener('change',e=>handleBulkWorkbookFile(e.target.files?.[0]));
}
async function importBulkProducts(){
  if(busy)return;
  bulkRevalidate();
  const ready=bulkImportRows.filter(r=>!r.errors.length&&r.duplicateAction!=='skip');
  if(!ready.length){$('bulkImportMessage').textContent=tr('لا توجد منتجات جاهزة للاستيراد.','No products are ready to import.');return;}
  busy=true;let done=0,failed=0;
  const imported=new Set();
  try{
    for(const row of ready){
      const msg=$('bulkImportMessage');if(msg)msg.textContent=tr(`جارٍ استيراد ${done+1} من ${ready.length}...`,`Importing ${done+1} of ${ready.length}...`);
      try{
        const images=await uploadSources(row.images.map(x=>x.source));
        const patch={sku:row.sku,product:row.product,specs:row.specs,country:normalizeSupplyCountry(row.country,supplyCountries()),unitPrice:String(row.unitPrice),currency:row.currency,moq:String(row.moq),stock:String(row.stock??''),leadTime:String(row.leadTime),validUntil:row.validUntil||'',categoryId:row.categoryId,subcategoryId:row.subcategoryId||'',images};
        if(row.duplicateOfferId&&row.duplicateAction==='update')await mutate('publicOffers',row.duplicateOfferId,row.duplicateOfferVersion,patch);
        else await mutate('publicOffers',id(),0,patch);
        imported.add(row.rowNumber);done++;
      }catch(error){
        row.errors=['server'];row.serverError=error.message;failed++;
      }
    }
    await loadData({render:false});
    bulkImportRows=bulkImportRows.filter(r=>!imported.has(r.rowNumber));
    if(!bulkImportRows.length||bulkImportRows.every(r=>r.duplicateAction==='skip'&&!r.errors.length)){
      closeModal();activeScreen='offers';activeSub='primary';renderScreen();
      showToast(tr(`تم استيراد ${done} منتج بنجاح.`,`${done} products imported successfully.`));
    }else renderBulkPreview(tr(`تم استيراد ${done}، وتعذر ${failed}. راجع المنتجات المتبقية.`,`Imported ${done}; ${failed} failed. Review the remaining products.`));
  }finally{busy=false;}
}

async function filesToSources(input){
  try{return await filesToCompressedSources(input);}
  catch(error){
    if(error?.message==='too_many')throw new Error(tr('الحد الأقصى 5 صور.','Maximum 5 images.'));
    if(error?.message==='too_large')throw new Error(tr('الصورة الأصلية كبيرة جدًا. اختر صورة أقل من 25 MB.','The original image is too large. Choose an image under 25 MB.'));
    if(error?.message==='unsupported'||error?.message==='decode_failed')throw new Error(tr('تعذر قراءة هذه الصورة. جرّب صورة أخرى.','This image could not be read. Try another image.'));
    throw new Error(tr('تعذر ضغط الصورة. جرّب صورة أخرى.','The image could not be compressed. Try another image.'));
  }
}
async function uploadSources(sources){const out=[];for(const source of sources){const result=await request('/api/v1/uploads',{method:'POST',auth:true,body:{source}});out.push(result.src);}return out;}
async function submitNewRequest(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('requestFormMessage');try{m.textContent=t('uploading');const kept=[...f.querySelectorAll('[data-repeat-image]:checked')].map(x=>x.value),uploaded=await uploadSources(await filesToSources($('requestFiles'))),images=[...kept,...uploaded];if(images.length>5)throw new Error(tr('الحد الأقصى 5 صور للطلب.','Maximum 5 request images.'));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');const patch={product:f.product.value.trim(),specs:f.specs.value.trim(),quantity:f.quantity.value,country:f.country.value.trim(),neededDate:f.neededDate.value,images};if(f.dataset.repeatFrom)patch.repeatedFromRequestId=f.dataset.repeatFrom;await mutate('requests',id(),0,patch);await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(f.dataset.repeatFrom?tr('تم إنشاء طلب جديد من الطلب السابق.','New request created from the previous request.'):t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitQuote(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('quoteFormMessage'),quoteId=f.dataset.id,requestId=f.dataset.request;try{const sources=await filesToSources($('quoteFiles'));const images=sources.length?await uploadSources(sources):null;const patch={unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,leadTime:f.leadTime.value,sampleCost:f.sampleCost.value.trim(),notes:f.notes.value.trim()};if(images)patch.images=images;if(quoteId){const q=(platformState.quotes||[]).find(x=>x.id===quoteId);await mutate('quotes',q.id,q.version,patch);}else{patch.requestId=requestId;patch.images=images||[];await mutate('quotes',id(),0,patch);}await loadData({render:false});closeModal();activeScreen='requests';activeSub='submitted';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitPublic(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('publicFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('publicFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('publicOffers',id(),0,{sku:f.sku.value.trim(),product:f.product.value.trim(),specs:f.specs.value.trim(),country:f.country.value,unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,stock:f.stock.value.trim(),leadTime:f.leadTime.value,validUntil:f.validUntil.value,categoryId:f.categoryId?.value||'',subcategoryId:f.subcategoryId?.value||'',images});await loadData({render:false});closeModal();activeScreen='offers';activeSub='primary';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}

async function handleAction(target){
  if(target.dataset.category){readyCategory=target.dataset.category;readySubcategory='all';readyProductsPage=1;refreshProductResults({filters:true});return;}
  if(target.dataset.subcategory){readySubcategory=target.dataset.subcategory;readyProductsPage=1;refreshProductResults({filters:true});return;}
  if(target.dataset.supplyCountry){readyCountry=target.dataset.supplyCountry;readyProductsPage=1;refreshProductResults({filters:true});return;}
  if(target.dataset.action==='ready-products-prev'){if(readyProductsPage>1){readyProductsPage--;refreshProductResults();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='ready-products-next'){const total=Math.max(1,Math.ceil(filteredReadyOffers().length/PAGE_SIZE));if(readyProductsPage<total){readyProductsPage++;refreshProductResults();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='new-request')return openNewRequest();
  if(target.dataset.repeatRequest){const source=(platformState.requests||[]).find(x=>x.id===target.dataset.repeatRequest);if(source)return openNewRequest(source);}
  if(target.dataset.action==='new-public')return openNewPublic();
  if(target.dataset.action==='bulk-public-import')return openBulkPublicImport();
  if(target.dataset.action==='view-public-offers'){activeScreen='offers';activeSub='primary';renderScreen();$('screen').scrollTop=0;return;}
  if(target.dataset.action==='toggle-language')return toggleLanguage();
  if(target.dataset.action==='logout')return logout();
  if(target.dataset.action==='mark-all'){await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{all:true}});await loadData();return;}
  if(['home','orders','requests','offers','notifications','account'].includes(target.dataset.action)){activeScreen=target.dataset.action;if(activeScreen==='offers')activeSub='primary';if(activeScreen==='requests'&&currentUser?.role==='supplier')activeSub='pending';renderScreen();return;}
  if(target.dataset.cartOrder)return openCartOrder(target.dataset.cartOrder);
  if(target.dataset.readyOrder)return openReadyOrder(target.dataset.readyOrder);
  if(target.dataset.clientOffersRequest)return openClientOffers(target.dataset.clientOffersRequest);
  if(target.dataset.clientOrderFilter){clientRequestFilter=target.dataset.clientOrderFilter;renderRequests();$('screen').scrollTop=0;return;}
  if(target.dataset.request)return openClientRequest(target.dataset.request);
  if(target.dataset.supplierRequest)return openSupplierRequest(target.dataset.supplierRequest);
  if(target.dataset.supplierOrderId&&target.dataset.supplierOrderType&&!target.dataset.supplierOrderStatus&&!target.hasAttribute('data-supplier-order-cannot'))return openSupplierOrder(target.dataset.supplierOrderType,target.dataset.supplierOrderId);
  if(target.dataset.publicOffer)return openPublicOffer(target.dataset.publicOffer);
  if(target.dataset.editQuote){const q=(platformState.quotes||[]).find(x=>x.id===target.dataset.editQuote);if(q)return openQuoteForm(q.requestId,q);}
  if(target.dataset.quoteRequest)return openQuoteForm(target.dataset.quoteRequest);
  if(target.dataset.supplierOrderStatus)return updateSupplierOrderStatus(target.dataset.supplierOrderType,target.dataset.supplierOrderId,target.dataset.supplierOrderStatus);
  if(target.hasAttribute('data-supplier-order-cannot'))return openSupplierCannotFulfill(target.dataset.supplierOrderType,target.dataset.supplierOrderId);
  if(target.dataset.selectQuote){const r=(platformState.requests||[]).find(x=>x.id===target.dataset.requestId);if(!r)return;target.disabled=true;try{await mutate('requests',r.id,r.version,{selectedQuoteId:target.dataset.selectQuote});await loadData({render:false});closeModal();renderScreen();showToast(t('selected'));}catch(error){showToast(error.message);}return;}
  if(target.dataset.copyValue!==undefined)return copyText(target.dataset.copyValue);
  if(target.dataset.paymentUpload)return openPaymentReceiptForm(target.dataset.entityType,target.dataset.entityId);
  if(target.dataset.paymentDocument)return openPaymentDocument(target.dataset.paymentDocument);
  if(target.dataset.invoicePdf)return openInvoicePdf(target);
  if(target.dataset.paymentNotification){
    const n=notifications.find(x=>String(x.id)===String(target.dataset.paymentNotification));if(!n)return;
    if(!n.readAt)await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{id:Number(n.id)}}).catch(()=>{});
    await loadData({render:false});
    if(n.target?.entityType&&n.target?.entityId)return openPaymentReceiptForm(n.target.entityType,n.target.entityId);
    return;
  }
  if(target.dataset.notification){const n=notifications.find(x=>String(x.id)===String(target.dataset.notification));if(!n)return;if(!n.readAt)await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{id:Number(n.id)}}).catch(()=>{});await loadData({render:false});if(n.target?.screen==='supplierRequest')return openSupplierRequest(n.target.requestId);if(n.target?.screen==='customerRequest')return openClientRequest(n.target.requestId);if(n.target?.screen==='customerPayment'){if(n.target.entityType==='request')return openClientRequest(n.target.entityId);const interest=(platformState.interests||[]).find(i=>i.id===n.target.entityId);if(interest)return openReadyOrder(interest.id);}if(n.target?.screen==='adminPayment')return openAdminPayment(n.target.entityType,n.target.entityId);renderScreen();return;}
}

function errorText(error,stage='data'){
  if(error.code==='network')return tr('تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.','Connection failed. Check your internet connection and try again.');
  if(error.code==='storage_failed')return tr('تعذر الوصول إلى التخزين الآمن للجلسة. أعد فتح التطبيق وحاول مجددًا.','Secure session storage is unavailable. Reopen the app and try again.');
  if(error.code==='session_expired')return tr('انتهت جلسة الدخول. سجّل الدخول مجددًا.','Your session expired. Please sign in again.');
  if(error.status===429)return tr('محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.','Too many attempts. Please wait before trying again.');
  if(error.status>=500||error.code==='server_error')return tr('الخدمة غير متاحة مؤقتًا. حاول مجددًا.','The service is temporarily unavailable. Please try again.');
  if(stage==='data')return tr('تم تسجيل الدخول، لكن تعذر تحميل بيانات الحساب. أعد المحاولة.','You are signed in, but account data could not be loaded. Please retry.');
  return error.code==='invalid_session'?tr('تعذر بدء جلسة التطبيق. حاول مجددًا.','Could not start the app session. Please try again.'):error.message||t('failed');
}
async function logout(){
  if(busy)return;busy=true;
  try{await session.logout();$('loginForm').reset();$('registerForm').reset();setMessage('');showView('guestView');}
  catch(error){showView('sessionView');$('sessionMessage').textContent=errorText(error);}
  finally{busy=false;}
}
async function enterWorkspace(){
  await loadData({render:false});
  if(!currentUser)return;
  const postAuth=takePostAuthAction();
  showView('appView');activeScreen='home';activeSub='primary';renderScreen();
  if(currentUser.role==='client'&&postAuth==='open-cart')setTimeout(()=>openCart(),0);
  else if(currentUser.role==='client'&&postAuth==='new-request')setTimeout(()=>openNewRequest(),0);
}
function recovery(error){showView('sessionView');$('sessionMessage').textContent=errorText(error);}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;setMessage(t('loading'));$('loginBtn').disabled=true;
  let stage='auth';
  try{
    await session.login({email:$('email').value.trim(),password:$('password').value});
    $('password').value='';stage='data';await enterWorkspace();setMessage('');
  }catch(error){if(error.code!=='session_changed'){if(stage==='data'&&session.active)recovery(error);else setMessage(errorText(error,stage));}}
  finally{busy=false;$('loginBtn').disabled=false;}
});
$('forgotPasswordBtn').addEventListener('click',async()=>{
  if(busy)return;
  const email=$('email').value.trim(),button=$('forgotPasswordBtn');
  if(!email){setMessage(tr('أدخل بريدك الإلكتروني أولًا.','Enter your email address first.'));$('email').focus();return;}
  busy=true;button.disabled=true;setMessage(tr('جارٍ إرسال رابط إعادة التعيين...','Sending password reset link...'));
  try{
    await request('/api/v1/auth/recover',{method:'POST',auth:false,body:{email}});
    setMessage(tr('إذا كان البريد مسجلًا لدينا، ستصلك رسالة لإعادة تعيين كلمة المرور.','If this email is registered, you will receive a password reset message.'),'success');
  }catch(error){setMessage(errorText(error,'auth'));}
  finally{busy=false;button.disabled=false;}
});
$('langBtn').addEventListener('click',toggleLanguage);
$('appLangBtn').addEventListener('click',toggleLanguage);
$('headerCartBtn')?.addEventListener('click',()=>{if(currentUser?.role==='client')openCart();});
$('headerNotificationsBtn').addEventListener('click',()=>{if(!currentUser)return;activeScreen='notifications';renderScreen();$('screen').scrollTop=0;});
onLanguageChange(value=>{lang=value;applyLanguage();applyRegistrationLanguage();});
$('refreshBtn').addEventListener('click',async()=>{if(busy)return;busy=true;$('refreshBtn').classList.add('spin');try{await loadData();showToast(t('refreshing'));}catch(e){showToast(errorText(e));}finally{busy=false;$('refreshBtn').classList.remove('spin');}});
$('bottomNav').addEventListener('click',e=>{const b=e.target.closest('button[data-screen]');if(!b)return;activeScreen=b.dataset.screen;if(activeScreen==='offers')activeSub='primary';if(activeScreen==='requests'&&currentUser?.role==='supplier')activeSub='pending';renderScreen();$('screen').scrollTop=0;});
$('screen').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub){activeSub=sub.dataset.sub;renderScreen();return;}const target=e.target.closest('[data-action],[data-category],[data-subcategory],[data-supply-country],[data-client-order-filter],[data-cart-order],[data-ready-order],[data-client-offers-request],[data-request],[data-supplier-request],[data-supplier-order-id],[data-public-offer],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-notification],[data-payment-notification],[data-payment-upload],[data-payment-document],[data-invoice-pdf],[data-copy-value]');if(target)handleAction(target);});
$('screen').addEventListener('input',e=>{const input=e.target.closest('[data-product-search]');if(!input)return;readySearch=input.value;readyProductsPage=1;refreshProductResults();});
$('modal').addEventListener('click',e=>{if(e.target.closest('[data-close-modal]')){closeModal();return;}const target=e.target.closest('[data-ready-order],[data-client-offers-request],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-supplier-order-status],[data-supplier-order-cannot],[data-payment-upload],[data-payment-document],[data-invoice-pdf],[data-copy-value]');if(target)handleAction(target);});

App.addListener('appUrlOpen',async event=>{const url=event.url||'';if(!currentUser)return;if(url.includes('/notifications')){activeScreen='notifications';renderScreen();return;}const m=url.match(/\/requests\/([^?]+)/);if(m){if(currentUser.role==='supplier'){activeScreen='requests';activeSub='pending';openSupplierRequest(decodeURIComponent(m[1]));}else openClientRequest(decodeURIComponent(m[1]));}});


const authCopy={
 ar:{register:'إنشاء الحساب',registerClient:'إنشاء حساب عميل',registerSupplier:'إنشاء حساب مورد',client:'عميل',supplier:'مورد',name:'الاسم',company:'اسم الشركة',email:'البريد الإلكتروني',phone:'رقم التواصل مع رمز الدولة (للإدارة فقط)',country:'الدولة',category:'فئة المنتجات',password:'كلمة المرور (8 أحرف على الأقل)',confirmPassword:'تأكيد كلمة المرور',already:'لدي حساب بالفعل',back:'العودة للرئيسية',retry:'إعادة المحاولة',logout:'تسجيل الخروج',loading:'جارٍ التحقق من الجلسة...',registerIntro:'أنشئ حسابك للمتابعة داخل التطبيق.'},
 en:{register:'Create account',registerClient:'Create customer account',registerSupplier:'Create supplier account',client:'Customer',supplier:'Supplier',name:'Name',company:'Company',email:'Email address',phone:'Phone with country code (admin only)',country:'Country',category:'Product category',password:'Password (at least 8 characters)',confirmPassword:'Confirm password',already:'I already have an account',back:'Back to home',retry:'Try again',logout:'Sign out',loading:'Checking your session...',registerIntro:'Create your account to continue in the app.'}
};
let registerRole='client';
function applyRegistrationLanguage(){
 document.querySelectorAll('[data-auth-copy]').forEach(el=>{el.textContent=authCopy[lang][el.dataset.authCopy]||'';});
 $('registerTitle').textContent=authCopy[lang][registerRole==='supplier'?'registerSupplier':'registerClient'];
 $('registerLangBtn').textContent=lang==='ar'?'EN':'AR';
}
function setRegisterRole(role){
 registerRole=role==='supplier'?'supplier':'client';
 document.querySelectorAll('[data-register-role]').forEach(b=>{const selected=b.dataset.registerRole===registerRole;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
 $('registerCategoryField').classList.toggle('hidden',registerRole!=='supplier');
 $('registerCategory').required=registerRole==='supplier';$('registerCompany').required=registerRole==='supplier';
 applyRegistrationLanguage();
}
function showRegistration(role){if(busy)return;setRegisterRole(role);$('registerMessage').textContent='';showView('registerView');}
$('guestCustomerRegister').addEventListener('click',()=>showRegistration('client'));
$('guestSupplierRegister').addEventListener('click',()=>showRegistration('supplier'));
$('loginCustomerRegister')?.addEventListener('click',()=>showRegistration('client'));
$('loginSupplierRegister')?.addEventListener('click',()=>showRegistration('supplier'));
$('registerLangBtn').addEventListener('click',toggleLanguage);
document.querySelectorAll('[data-register-role]').forEach(b=>b.addEventListener('click',()=>{if(!busy)setRegisterRole(b.dataset.registerRole);}));
$('registerBackBtn').addEventListener('click',()=>{if(!busy){$('registerPassword').value='';$('registerConfirm').value='';showView('guestView');}});
$('registerLoginBtn').addEventListener('click',()=>{if(!busy){$('registerPassword').value='';$('registerConfirm').value='';setMessage('');showView('loginView');}});
$('registerForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const f=e.currentTarget,message=$('registerMessage');
 if(f.password.value!==f.confirmPassword.value){message.textContent=tr('كلمتا المرور غير متطابقتين.','Passwords do not match.');return;}
 busy=true;$('registerBtn').disabled=true;message.textContent=tr('جارٍ إنشاء الحساب...','Creating your account...');let stage='auth';
 try{
   const body=Object.fromEntries(new FormData(f));delete body.confirmPassword;body.role=registerRole;
   for(const key of ['name','company','email','phone','country','category'])body[key]=(body[key]||'').trim();
   const result=await session.register(body);
   $('registerPassword').value='';$('registerConfirm').value='';
   if(result.confirmationRequired){showView('loginView');$('email').value=body.email;setMessage(tr('تم إرسال رابط التأكيد إن كان البريد متاحًا للتسجيل. تحقق من بريدك أو سجّل الدخول بحسابك الحالي.','Check your email for a confirmation link, or sign in if you already have an account.'));return;}
   stage='data';await enterWorkspace();f.reset();message.textContent='';
 }catch(error){if(error.code!=='session_changed'){if(stage==='data'&&session.active)recovery(error);else message.textContent=errorText(error,stage);}}
 finally{busy=false;$('registerBtn').disabled=false;}
});
async function resumeSession(){
 if(busy)return;busy=true;
 try{
   if(session.active||await session.restore())await enterWorkspace();else showView('guestView');
 }catch(error){if(error.code==='session_expired'){showView('loginView');setMessage(errorText(error));}else if(error.code!=='session_changed')recovery(error);}
 finally{busy=false;}
}
$('sessionRetryBtn').addEventListener('click',resumeSession);
$('sessionLogoutBtn').addEventListener('click',logout);
App.addListener('appStateChange',({isActive})=>{
  if(isActive&&session.active&&!busy&&Date.now()-lastDataLoadedAt>30000){
    loadData().catch(error=>{if(currentUser)showToast(errorText(error));});
  }
});
(async function boot(){await languageReady;lang=getLanguage();applyLanguage();setRegisterRole('client');await resumeSession();})();
