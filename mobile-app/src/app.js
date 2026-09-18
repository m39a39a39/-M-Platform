import { session } from './session.js';
import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';
import { configureAdmin, updateAdminState, resetAdmin, renderAdminScreen } from './admin-mobile.js';
import { App } from '@capacitor/app';
import { filesToCompressedSources } from './image-upload.js';

let currentUser=null;
let platformState=null;
let notifications=[];
let lang='ar';
let activeScreen='home';
let activeSub='primary';
let readyProductsPage=1;
let readyCategory='all';
let busy=false;
let lastDataLoadedAt=0;
const PAGE_SIZE=20;
const MEDIA_CONCURRENCY=6;
const mediaCache=new Map();
const mediaTasks=new Map();

const copy={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',secure:'دخول آمن',loginTitle:'تسجيل الدخول',loginSubtitle:'استخدم نفس حسابك الموجود على المنصة.',email:'البريد الإلكتروني',password:'كلمة المرور',login:'تسجيل الدخول',loading:'جارٍ تسجيل الدخول...',failed:'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',home:'الرئيسية',requests:'الطلبات',invites:'الدعوات',offers:'العروض',notifications:'الإشعارات',account:'الحساب',client:'عميل',supplier:'مورد',admin:'إدارة',refreshing:'جارٍ التحديث...',empty:'لا توجد بيانات حاليًا.',details:'التفاصيل',status:'الحالة',quantity:'الكمية',country:'الدولة',neededDate:'تاريخ الاحتياج',receivedQuotes:'العروض المستلمة',newRequest:'طلب جديد',publicOffers:'العروض العامة',requestedOffers:'العروض التي طلبتها',submittedOffers:'العروض المقدمة',myPublicOffers:'عروضي العامة',interestRequests:'طلبات الاهتمام',newPublicOffer:'عرض عام جديد',submitQuote:'تقديم عرض سعر',editQuote:'تعديل العرض',selectQuote:'اختيار العرض',selected:'تم اختيار العرض',requestOffer:'طلب هذا العرض',requested:'تم الطلب',price:'السعر',moq:'الحد الأدنى',leadTime:'مدة الإنتاج',sampleCost:'تكلفة العينة',stock:'المخزون',validUntil:'صالح حتى',specifications:'المواصفات',product:'المنتج',notes:'ملاحظات',currency:'العملة',images:'الصور',submit:'إرسال',save:'حفظ',logout:'تسجيل الخروج',profile:'بيانات الحساب',newQuotes:'عروض جديدة',underReview:'قيد المراجعة',activeRequests:'طلبات نشطة',published:'منشور',pending:'قيد المراجعة',completed:'مكتمل',sent:'تم الإرسال للموردين',review:'قيد المراجعة',coordinating:'قيد التنسيق',accepted:'مقبول',cancelled:'ملغي',markAllRead:'تحديد الكل كمقروء',noNotifications:'لا توجد إشعارات.',unread:'جديد',uploading:'جارٍ رفع الصور...',saving:'جارٍ الحفظ...',created:'تم الإرسال بنجاح.',chooseImages:'اختر حتى 5 صور. يمكن اختيار صور كبيرة وسيتم ضغطها تلقائيًا قبل الرفع.',sessionNote:'يمكنك تسجيل الخروج لإنهاء جلستك على هذا الجهاز.',readyProducts:'منتجات جاهزة للطلب',readyProductsSubtitle:'اختر من المنتجات المتاحة واطلب ما يناسبك مباشرة.',customRequestTitle:'لم تجد ما تحتاجه؟',customRequestDescription:'أرسل طلبًا خاصًا بالمواصفات والكمية، وسنبحث لك عن المورد المناسب.',sendCustomRequest:'إرسال طلب خاص',customRequests:'الطلبات الخاصة',readyProductRequests:'طلبات المنتجات الجاهزة',totalRequests:'إجمالي الطلبات',previous:'السابق',next:'التالي',page:'صفحة',companyDescription:'منصة تساعدك في طلب المنتجات، مقارنة العروض، ومتابعة التوريد بسهولة.',contactUs:'تواصل معنا',copyright:'© 2026 MIG COMPANY — جميع الحقوق محفوظة',allCategories:'الكل',category:'التصنيف',tracking:'متابعة الطلب',lastUpdate:'آخر تحديث',trackingNote:'ملاحظة',adminMobile:'واجهة الإدارة الكاملة ستضاف في مرحلة منفصلة. يمكنك حاليًا مشاهدة ملخص البيانات والإشعارات.'},
  en:{tagline:'Request what you need, and compare offers with confidence.',secure:'Secure access',loginTitle:'Sign in',loginSubtitle:'Use the same account you already have on the platform.',email:'Email address',password:'Password',login:'Sign in',loading:'Signing in...',failed:'Unable to sign in. Check your email and password.',home:'Home',requests:'Requests',invites:'Invites',offers:'Offers',notifications:'Notifications',account:'Account',client:'Customer',supplier:'Supplier',admin:'Admin',refreshing:'Refreshing...',empty:'No data available.',details:'Details',status:'Status',quantity:'Quantity',country:'Country',neededDate:'Needed date',receivedQuotes:'Received quotes',newRequest:'New request',publicOffers:'Public offers',requestedOffers:'Requested offers',submittedOffers:'Submitted offers',myPublicOffers:'My public offers',interestRequests:'Interest requests',newPublicOffer:'New public offer',submitQuote:'Submit quote',editQuote:'Edit offer',selectQuote:'Select offer',selected:'Selected',requestOffer:'Request this offer',requested:'Requested',price:'Price',moq:'MOQ',leadTime:'Production time',sampleCost:'Sample cost',stock:'Stock',validUntil:'Valid until',specifications:'Specifications',product:'Product',notes:'Notes',currency:'Currency',images:'Images',submit:'Submit',save:'Save',logout:'Sign out',profile:'Account details',newQuotes:'New offers',underReview:'Under review',activeRequests:'Active requests',published:'Published',pending:'Under review',completed:'Completed',sent:'Sent to suppliers',review:'Under review',coordinating:'Coordinating',accepted:'Accepted',cancelled:'Cancelled',markAllRead:'Mark all as read',noNotifications:'No notifications.',unread:'New',uploading:'Uploading images...',saving:'Saving...',created:'Submitted successfully.',chooseImages:'Choose up to 5 images. Large images are compressed automatically before upload.',sessionNote:'Sign out to end your session on this device.',readyProducts:'Products ready to order',readyProductsSubtitle:'Choose from available products and request what suits you directly.',customRequestTitle:"Can't find what you need?",customRequestDescription:'Send a custom request with your specifications and quantity, and we will find a suitable supplier.',sendCustomRequest:'Send custom request',customRequests:'Custom requests',readyProductRequests:'Ready-product requests',totalRequests:'Total requests',previous:'Previous',next:'Next',page:'Page',companyDescription:'A platform that helps you request products, compare offers, and follow your sourcing process with ease.',contactUs:'Contact us',copyright:'© 2026 MIG COMPANY — All rights reserved.',allCategories:'All',category:'Category',tracking:'Order tracking',lastUpdate:'Last update',trackingNote:'Note',adminMobile:'The full admin mobile interface will be added separately. For now you can view a data summary and notifications.'}
};

const $=id=>document.getElementById(id);
const t=key=>copy[lang][key]||key;
const tr=(ar,en)=>lang==='ar'?ar:en;
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ref=item=>item?.displayNo||String(item?.id||'').slice(0,8)||'—';
const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat(lang==='ar'?'ar':'en',{dateStyle:'medium'}).format(d);};
const money=(value,currency='')=>value===undefined||value===null||value===''?'—':`${esc(currency)} ${esc(value)}`.trim();
const setMessage=text=>{$('message').textContent=text||'';};

const TRACKING_FLOW=[
  ['received','تم استلام الطلب','Request received'],
  ['reviewing','قيد المراجعة','Under review'],
  ['sourcing','البحث عن موردين','Finding suppliers'],
  ['quotes_available','العروض متاحة','Offers available'],
  ['quote_selected','تم اختيار العرض','Offer selected'],
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
function categories(activeOnly=true){
  const rows=Array.isArray(platformState?.settings?.categories)?platformState.settings.categories:[];
  return rows.filter(c=>!activeOnly||c.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
}
function filteredReadyOffers(){
  const offers=(platformState?.publicOffers||[]).filter(o=>o.status==='published');
  return readyCategory==='all'?offers:offers.filter(o=>o.categoryId===readyCategory);
}
function categoryFilters(){
  const rows=categories();
  if(!rows.length)return '';
  return `<div class="category-filter-bar" role="tablist"><button type="button" data-category="all" class="${readyCategory==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(cat=>`<button type="button" data-category="${esc(cat.id)}" class="${readyCategory===cat.id?'active':''}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</button>`).join('')}</div>`;
}
function trackingTimeline(requestItem){
  const current=requestTrackingStatus(requestItem),exception=TRACKING_EXCEPTIONS[current];
  const history=Array.isArray(requestItem.trackingHistory)?requestItem.trackingHistory:[];
  const lastLinear=exception?[...history].reverse().find(h=>TRACKING_FLOW.some(x=>x[0]===h.status))?.status||'received':current;
  const currentIndex=Math.max(0,TRACKING_FLOW.findIndex(x=>x[0]===lastLinear));
  return `<section class="tracking-card"><div class="tracking-head"><div><small>${esc(t('tracking'))}</small><strong>${esc(trackingLabel(current))}</strong></div>${requestItem.trackingUpdatedAt?`<span>${esc(t('lastUpdate'))}: ${esc(date(requestItem.trackingUpdatedAt))}</span>`:''}</div>${exception?`<div class="tracking-exception">${esc(trackingLabel(current))}</div>`:''}<div class="tracking-timeline">${TRACKING_FLOW.map((step,i)=>`<div class="tracking-step ${i<currentIndex?'done':i===currentIndex&&!exception?'current':''}"><span class="tracking-dot">${i<currentIndex?'✓':i+1}</span><b>${esc(lang==='ar'?step[1]:step[2])}</b></div>`).join('')}</div>${requestItem.trackingNote?`<p class="tracking-note"><b>${esc(t('trackingNote'))}:</b> ${esc(requestItem.trackingNote)}</p>`:''}</section>`;
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
  updateAdminState(next);updateShell();
  if(render)renderScreen();
}
configureAdmin({reload:()=>loadData({render:false})});
session.onReset(reason=>{
  currentUser=null;platformState=null;notifications=[];activeScreen='home';activeSub='primary';readyProductsPage=1;readyCategory='all';
  resetAdmin();closeModal();
  for(const url of mediaCache.values())URL.revokeObjectURL(url);
  mediaCache.clear();mediaTasks.clear();lastDataLoadedAt=0;$('screen').replaceChildren();$('headerRole').textContent='';
  $('navUnread').classList.add('hidden');$('toast').classList.add('hidden');
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.screen==='home'));
  if(reason==='logout')showView('bootView');
  if(reason==='expired'){showView('loginView');setMessage(tr('انتهت جلسة الدخول. سجّل الدخول مجددًا.','Your session expired. Please sign in again.'));}
});

function updateShell(){
  const role=currentUser?.role||'client';
  $('headerRole').textContent=t(role);
  $('appLangBtn').textContent=lang==='ar'?'EN':'AR';
  const labels={home:t('home'),requests:role==='supplier'?t('invites'):t('requests'),offers:t('offers'),notifications:t('notifications'),account:t('account')};
  Object.entries(labels).forEach(([key,value])=>{const el=document.querySelector(`[data-nav="${key}"]`);if(el)el.textContent=value;});
  const offersNav=document.querySelector('#bottomNav [data-screen="offers"]');
  offersNav?.classList.toggle('hidden',role==='client');
  $('bottomNav').classList.toggle('client-nav',role==='client');
  if(role==='client'&&activeScreen==='offers')activeScreen='home';
  const unread=notifications.filter(n=>!n.readAt).length;
  $('navUnread').textContent=unread>99?'99+':unread;
  $('navUnread').classList.toggle('hidden',!unread);
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.screen===activeScreen));
}

function applyLanguage(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  $('langBtn').textContent=lang==='ar'?'EN':'AR';
  if(currentUser){updateShell();renderScreen();}
}

function showToast(text){if(!currentUser)return;const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.add('hidden'),2200);}
function openModal(title,kicker,html){$('modalTitle').textContent=title;$('modalKicker').textContent=kicker||'';$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');hydrateImages($('modalBody'));}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';}

function gallery(images=[]){if(!images.length)return '';return `<div class="media-grid">${images.map(src=>`<div class="media-placeholder"><img alt="" data-media="${esc(src)}" /></div>`).join('')}</div>`;}
async function mediaUrl(src){
  if(mediaCache.has(src))return mediaCache.get(src);
  if(mediaTasks.has(src))return mediaTasks.get(src);
  const epoch=session.epoch;
  const task=(async()=>{
    const path=src.replace(/^\/api\/media\//,'/api/v1/media/');
    const response=await rawFetch(path,{auth:true});if(!response.ok)return '';
    const blob=await response.blob();if(epoch!==session.epoch)return '';
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

function statCard(value,label,action=''){return `<button class="stat-card" ${action?`data-action="${action}"`:''}><strong>${esc(value)}</strong><span>${esc(label)}</span></button>`;}
function pageHeader(title,subtitle='',action=''){return `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${action}</div>`;}
function empty(){return `<div class="empty-state"><span>◇</span><p>${esc(t('empty'))}</p></div>`;}
function itemCard(item,{subtitle='',meta='',badge='',action='',images=false}={}){return `<article class="list-card" ${action}><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(item))}</small><h3>${esc(titleOf(item))}</h3></div>${badge}</div>${subtitle?`<p>${esc(subtitle)}</p>`:''}${meta?`<div class="meta-line">${meta}</div>`:''}${images?gallery(item.images):''}<div class="chevron">›</div></article>`;}
function publicOfferCard(item){
  const image=(item.images||[])[0];
  return `<article class="public-offer-card" data-public-offer="${esc(item.id)}"><div class="public-offer-media">${image?`<img alt="" data-media="${esc(image)}" />`:'<div class="public-offer-placeholder">M</div>'}</div><div class="public-offer-content"><h3>${esc(titleOf(item))}</h3><p>${esc(descriptionOf(item)||'—')}</p><div class="public-offer-facts"><span><b>${esc(t('price'))}</b><strong>${money(item.unitPrice,item.currency)}</strong></span><span><b>${esc(t('moq'))}</b><strong>${esc(item.moq||'—')}</strong></span></div></div></article>`;
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
    const offers=filteredReadyOffers();
    const totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
    readyProductsPage=Math.min(Math.max(readyProductsPage,1),totalPages);
    const pageOffers=offers.slice((readyProductsPage-1)*PAGE_SIZE,readyProductsPage*PAGE_SIZE);
    $('screen').innerHTML=
      `<section class="special-request-card"><div class="special-request-copy"><div class="special-request-heading"><span class="special-request-icon">＋</span><h2>${esc(t('customRequestTitle'))}</h2></div><p>${esc(t('customRequestDescription'))}</p></div><button class="primary-small" data-action="new-request">${esc(t('sendCustomRequest'))}</button></section>`+
      `<section class="ready-products-section"><div class="section-title ready-products-title"><div><h2>${esc(t('readyProducts'))}</h2><p>${esc(t('readyProductsSubtitle'))}</p></div></div>${categoryFilters()}<div class="public-offers-grid">${pageOffers.map(publicOfferCard).join('')||empty()}</div>${productPagination(readyProductsPage,totalPages)}</section>`+
      companyFooterCard();
  }else if(role==='supplier'){
    const quotes=platformState.quotes||[],answered=new Set(quotes.map(q=>q.requestId)),invites=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    const pub=platformState.publicOffers||[],interest=(platformState.interests||[]).length;
    $('screen').innerHTML=pageHeader(`${tr('مرحبًا','Welcome')} ${esc(currentUser.name||currentUser.company||'')}`,tr('الدعوات والعروض وحالة المراجعة.','Invitations, offers and review status.'))+
      `<div class="stats-grid">${statCard(invites.length,t('invites'),'requests')}${statCard(quotes.length,t('submittedOffers'),'offers')}${statCard(pub.length,t('myPublicOffers'),'offers')}${statCard(interest,t('interestRequests'),'offers')}</div>`+
      `<section class="section-block"><div class="section-title"><h2>${esc(t('invites'))}</h2></div>${invites.slice(0,4).map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'}`,badge:cardBadge(r.status),action:`data-supplier-request="${esc(r.id)}"`})).join('')||empty()}</section>`;
  }else{
    $('screen').innerHTML=pageHeader(tr('لوحة الإدارة','Admin'),t('adminMobile'))+`<div class="stats-grid">${statCard(platformState.requests?.length||0,t('requests'))}${statCard(platformState.quotes?.length||0,t('submittedOffers'))}${statCard(platformState.publicOffers?.length||0,t('publicOffers'))}${statCard(notifications.filter(n=>!n.readAt).length,t('notifications'),'notifications')}</div>`;
  }
}

function renderRequests(){
  if(currentUser.role==='client'){
    const rows=platformState.requests||[];
    const interests=platformState.interests||[];
    const newQuotes=rows.reduce((n,r)=>n+newQuoteCount(r),0);
    const active=rows.filter(r=>!['completed','cancelled'].includes(requestTrackingStatus(r))).length+interests.filter(i=>!['accepted','cancelled','completed'].includes(i.status)).length;
    const readyRows=interests.map(i=>({interest:i,offer:(platformState.publicOffers||[]).find(o=>o.id===i.offerId)}));
    $('screen').innerHTML=
      pageHeader(t('requests'),tr('كل طلباتك ومتابعتها في مكان واحد.','All your requests and their progress in one place.'),`<button class="primary-small" data-action="new-request">+ ${esc(t('sendCustomRequest'))}</button>`)+
      `<div class="stats-grid client-request-stats">${statCard(rows.length+interests.length,t('totalRequests'))}${statCard(newQuotes,t('newQuotes'))}${statCard(active,t('activeRequests'))}${statCard(interests.length,t('readyProductRequests'))}</div>`+
      `<section class="request-group" data-client-request-group="custom"><div class="section-title"><h2>${esc(t('customRequests'))}</h2></div><div class="list-stack">${rows.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${date(r.createdAt)}`,badge:cardBadge(requestTrackingStatus(r),newQuoteCount(r)?`<span class="new-pill">${newQuoteCount(r)}</span>`:''),action:`data-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div></section>`+
      `<section class="request-group" data-client-request-group="ready"><div class="section-title"><h2>${esc(t('readyProductRequests'))}</h2></div><div class="list-stack">${readyRows.map(({interest,offer})=>itemCard(offer||interest,{subtitle:offer?descriptionOf(offer):tr('المنتج غير متاح حاليًا','Product currently unavailable'),meta:date(interest.createdAt),badge:cardBadge(interest.status),action:offer?`data-public-offer="${esc(offer.id)}"`:'',images:!!offer})).join('')||empty()}</div></section>`;
  }else if(currentUser.role==='supplier'){
    const answered=new Set((platformState.quotes||[]).map(q=>q.requestId)),rows=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    $('screen').innerHTML=pageHeader(t('invites'),tr('طلبات أرسلتها الإدارة إليك لتقديم عرض.','Requests sent to you by admin for quotation.'))+`<div class="list-stack">${rows.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${t('neededDate')}: ${r.neededDate||'—'}`,badge:cardBadge(r.status),action:`data-supplier-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div>`;
  }else renderAdminCollection('requests');
}

function segment(buttons){return `<div class="segmented">${buttons.map(([key,label])=>`<button data-sub="${key}" class="${activeSub===key?'active':''}">${esc(label)}</button>`).join('')}</div>`;}
function renderOffers(){
  if(currentUser.role==='client'){
    activeScreen='home';
    renderHome();
    return;
  }else if(currentUser.role==='supplier'){
    if(!['submitted','public'].includes(activeSub))activeSub='submitted';
    const tabs=segment([['submitted',t('submittedOffers')],['public',t('myPublicOffers')]]);
    if(activeSub==='submitted'){
      const quotes=platformState.quotes||[];
      $('screen').innerHTML=pageHeader(t('submittedOffers'))+tabs+`<div class="list-stack">${quotes.map(q=>{const r=(platformState.requests||[]).find(x=>x.id===q.requestId);return itemCard(q,{subtitle:q.notes||descriptionOf(q),meta:`${money(q.unitPrice,q.currency)} · MOQ ${q.moq||'—'} · ${date(q.createdAt)}`,badge:cardBadge(q.status),action:`data-edit-quote="${esc(q.id)}"`,images:true});}).join('')||empty()}</div>`;
    }else{
      const offers=platformState.publicOffers||[];
      $('screen').innerHTML=pageHeader(t('myPublicOffers'),'',`<button class="primary-small" data-action="new-public">+ ${esc(t('newPublicOffer'))}</button>`)+tabs+`<div class="list-stack">${offers.map(o=>{const count=(platformState.interests||[]).filter(i=>i.offerId===o.id).length;return itemCard(o,{subtitle:o.specs||'',meta:`${money(o.unitPrice,o.currency)} · MOQ ${o.moq||'—'} · ${t('interestRequests')}: ${count}`,badge:cardBadge(o.status),action:`data-own-public="${esc(o.id)}"`,images:true});}).join('')||empty()}</div>`;
    }
  }else renderAdminCollection('offers');
}

function renderNotifications(){
  $('screen').innerHTML=pageHeader(t('notifications'),'',notifications.some(n=>!n.readAt)?`<button class="text-btn" data-action="mark-all">${esc(t('markAllRead'))}</button>`:'')+`<div class="list-stack notification-list">${notifications.map(n=>`<button class="notification-card ${n.readAt?'':'unread'}" data-notification="${esc(n.id)}"><div><strong>${esc(lang==='ar'?n.titleAr:n.titleEn)}</strong><p>${esc(lang==='ar'?n.bodyAr:n.bodyEn)}</p><small>${date(n.createdAt)}</small></div>${n.readAt?'':`<span>${esc(t('unread'))}</span>`}</button>`).join('')||`<div class="empty-state"><p>${esc(t('noNotifications'))}</p></div>`}</div>`;
}
function renderAccount(){
  const u=currentUser;
  $('screen').innerHTML=pageHeader(t('account'))+`<section class="profile-card"><div class="avatar">${esc((u.name||u.company||u.email||'M').charAt(0).toUpperCase())}</div><h2>${esc(u.name||u.company||'M Platform')}</h2><p>${esc(t(u.role))}</p><dl><div><dt>${esc(t('email'))}</dt><dd>${esc(u.email||'—')}</dd></div>${u.company?`<div><dt>${tr('الشركة','Company')}</dt><dd>${esc(u.company)}</dd></div>`:''}${u.country?`<div><dt>${esc(t('country'))}</dt><dd>${esc(u.country)}</dd></div>`:''}</dl><p class="session-note">${esc(t('sessionNote'))}</p><button class="danger-btn" data-action="logout">${esc(t('logout'))}</button></section>`;
}
function renderAdminCollection(kind){const rows=kind==='requests'?(platformState.requests||[]):[...(platformState.quotes||[]),...(platformState.publicOffers||[])];$('screen').innerHTML=pageHeader(kind==='requests'?t('requests'):t('offers'),t('adminMobile'))+`<div class="list-stack">${rows.slice(0,50).map(x=>itemCard(x,{subtitle:descriptionOf(x),badge:cardBadge(x.status),meta:`#${ref(x)} · ${date(x.createdAt)}`})).join('')||empty()}</div>`;}
function renderScreen(){if(!currentUser||!platformState)return;updateShell();if(renderAdminScreen(activeScreen))return;if(activeScreen==='home')renderHome();else if(activeScreen==='requests')renderRequests();else if(activeScreen==='offers')renderOffers();else if(activeScreen==='notifications')renderNotifications();else renderAccount();hydrateImages($('screen'));}

async function openClientRequest(requestId){
  let r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const quotes=(platformState.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published');
  if(newQuoteCount(r)>0){try{await mutate('requests',r.id,r.version,{lastSeenQuoteAt:new Date().toISOString()});r.version=Number(r.version||0)+1;r.lastSeenQuoteAt=new Date(Math.max(...quotes.map(quoteTime))).toISOString();}catch{}updateShell();}
  const selected=r.selectedQuoteId;
  const quoteHtml=quotes.length?quotes.map(q=>`<article class="quote-card">${gallery(q.images)}<div class="quote-price">${money(q.unitPrice,q.currency)}</div><div class="facts"><span>MOQ ${esc(q.moq||'—')}</span><span>${esc(t('leadTime'))}: ${esc(q.leadTime||'—')}</span><span>${esc(t('sampleCost'))}: ${esc(q.sampleCost||'—')}</span></div><p>${esc(descriptionOf(q))}</p><button class="${selected===q.id?'secondary-btn':'primary-btn'}" data-select-quote="${esc(q.id)}" data-request-id="${esc(r.id)}" ${selected?'disabled':''}>${esc(selected===q.id?t('selected'):t('selectQuote'))}</button></article>`).join(''):empty();
  openModal(titleOf(r),`#${ref(r)}`,`${trackingTimeline(r)}${gallery(r.images)}<div class="facts"><span>${esc(t('quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(r)||'—')}</p><h3>${esc(t('receivedQuotes'))}</h3><div class="quote-list">${quoteHtml}</div>`);
}
async function openPublicOffer(offerId){
  const o=(platformState.publicOffers||[]).find(x=>x.id===offerId);if(!o)return;
  const interest=(platformState.interests||[]).find(i=>i.offerId===o.id);
  openModal(titleOf(o),`#${ref(o)}`,`${gallery(o.images)}<div class="quote-price">${money(o.unitPrice,o.currency)}</div><div class="facts"><span>MOQ ${esc(o.moq||'—')}</span><span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span><span>${esc(t('leadTime'))}: ${esc(o.leadTime||'—')}</span><span>${esc(t('validUntil'))}: ${esc(o.validUntil||'—')}</span></div><p class="long-copy">${esc(descriptionOf(o)||'—')}</p>${currentUser.role==='client'?`<button class="primary-btn full" data-interest="${esc(o.id)}" ${interest?'disabled':''}>${esc(interest?t('requested'):t('requestOffer'))}</button>`:''}`);
}
function openSupplierRequest(requestId){
  const r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const existing=(platformState.quotes||[]).find(q=>q.requestId===r.id);
  openModal(titleOf(r),`#${ref(r)}`,`${gallery(r.images)}<div class="facts"><span>${esc(t('quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div><p class="long-copy">${esc(descriptionOf(r)||'—')}</p>${existing?`<button class="secondary-btn full" data-edit-quote="${esc(existing.id)}">${esc(t('editQuote'))}</button>`:`<button class="primary-btn full" data-quote-request="${esc(r.id)}">${esc(t('submitQuote'))}</button>`}`);
}
function fileField(idValue){return `<label><span>${esc(t('images'))}</span><input id="${idValue}" type="file" accept="image/*" multiple /><small>${esc(t('chooseImages'))}</small></label>`;}
function openNewRequest(){openModal(t('newRequest'),'M Platform',`<form id="newRequestForm" class="form-stack"><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" /></label><label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000"></textarea></label><div class="form-two"><label><span>${esc(t('quantity'))}</span><input name="quantity" type="number" min="1" required /></label><label><span>${esc(t('country'))}</span><input name="country" maxlength="100" /></label></div><label><span>${esc(t('neededDate'))}</span><input name="neededDate" type="date" /></label>${fileField('requestFiles')}<p class="form-message" id="requestFormMessage"></p><button class="primary-btn" type="submit">${esc(t('submit'))}</button></form>`);$('newRequestForm').addEventListener('submit',submitNewRequest);}
function quoteFormHtml(q=null,requestId=''){return `<form id="quoteForm" class="form-stack" data-id="${esc(q?.id||'')}" data-request="${esc(requestId||q?.requestId||'')}"><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" value="${esc(q?.unitPrice||'')}" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option ${q?.currency===c?'selected':''}>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" value="${esc(q?.moq||'')}" required /></label><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" value="${esc(q?.leadTime||'')}" required /></label></div><label><span>${esc(t('sampleCost'))}</span><input name="sampleCost" value="${esc(q?.sampleCost||'')}" maxlength="10000" /></label><label><span>${esc(t('notes'))}</span><textarea name="notes" maxlength="10000">${esc(q?.notes||'')}</textarea></label>${fileField('quoteFiles')}<p class="form-message" id="quoteFormMessage"></p><button class="primary-btn" type="submit">${esc(q?t('save'):t('submit'))}</button></form>`;}
function openQuoteForm(requestId,q=null){openModal(q?t('editQuote'):t('submitQuote'),q?`#${ref(q)}`:`#${ref((platformState.requests||[]).find(r=>r.id===requestId))}`,quoteFormHtml(q,requestId));$('quoteForm').addEventListener('submit',submitQuote);}
function openNewPublic(){const cats=categories();openModal(t('newPublicOffer'),'M Platform',`<form id="publicForm" class="form-stack"><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" /></label>${cats.length?`<label><span>${esc(t('category'))}</span><select name="categoryId" required><option value="">—</option>${cats.map(cat=>`<option value="${esc(cat.id)}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</option>`).join('')}</select></label>`:''}<label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000"></textarea></label><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" required /></label><label><span>${esc(t('stock'))}</span><input name="stock" maxlength="100" /></label></div><div class="form-two"><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" required /></label><label><span>${esc(t('country'))}</span><input name="country" maxlength="100" /></label></div><label><span>${esc(t('validUntil'))}</span><input name="validUntil" type="date" /></label>${fileField('publicFiles')}<p class="form-message" id="publicFormMessage"></p><button class="primary-btn" type="submit">${esc(t('submit'))}</button></form>`);$('publicForm').addEventListener('submit',submitPublic);}

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
async function submitNewRequest(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('requestFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('requestFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('requests',id(),0,{product:f.product.value.trim(),specs:f.specs.value.trim(),quantity:f.quantity.value,country:f.country.value.trim(),neededDate:f.neededDate.value,images});await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitQuote(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('quoteFormMessage'),quoteId=f.dataset.id,requestId=f.dataset.request;try{const sources=await filesToSources($('quoteFiles'));const images=sources.length?await uploadSources(sources):null;const patch={unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,leadTime:f.leadTime.value,sampleCost:f.sampleCost.value.trim(),notes:f.notes.value.trim()};if(images)patch.images=images;if(quoteId){const q=(platformState.quotes||[]).find(x=>x.id===quoteId);await mutate('quotes',q.id,q.version,patch);}else{patch.requestId=requestId;patch.images=images||[];await mutate('quotes',id(),0,patch);}await loadData({render:false});closeModal();activeScreen='offers';activeSub='submitted';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitPublic(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('publicFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('publicFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('publicOffers',id(),0,{product:f.product.value.trim(),specs:f.specs.value.trim(),country:f.country.value.trim(),unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,stock:f.stock.value.trim(),leadTime:f.leadTime.value,validUntil:f.validUntil.value,categoryId:f.categoryId?.value||'',images});await loadData({render:false});closeModal();activeScreen='offers';activeSub='public';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}

async function handleAction(target){
  if(target.dataset.category){readyCategory=target.dataset.category;readyProductsPage=1;renderHome();$('screen').scrollTop=0;return;}
  if(target.dataset.action==='ready-products-prev'){if(readyProductsPage>1){readyProductsPage--;renderHome();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='ready-products-next'){const total=Math.max(1,Math.ceil(filteredReadyOffers().length/PAGE_SIZE));if(readyProductsPage<total){readyProductsPage++;renderHome();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='new-request')return openNewRequest();
  if(target.dataset.action==='new-public')return openNewPublic();
  if(target.dataset.action==='logout')return logout();
  if(target.dataset.action==='mark-all'){await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{all:true}});await loadData();return;}
  if(['home','requests','offers','notifications','account'].includes(target.dataset.action)){activeScreen=target.dataset.action;if(activeScreen==='offers')activeSub='primary';renderScreen();return;}
  if(target.dataset.request)return openClientRequest(target.dataset.request);
  if(target.dataset.supplierRequest)return openSupplierRequest(target.dataset.supplierRequest);
  if(target.dataset.publicOffer)return openPublicOffer(target.dataset.publicOffer);
  if(target.dataset.editQuote){const q=(platformState.quotes||[]).find(x=>x.id===target.dataset.editQuote);if(q)return openQuoteForm(q.requestId,q);}
  if(target.dataset.quoteRequest)return openQuoteForm(target.dataset.quoteRequest);
  if(target.dataset.selectQuote){const r=(platformState.requests||[]).find(x=>x.id===target.dataset.requestId);if(!r)return;target.disabled=true;try{await mutate('requests',r.id,r.version,{selectedQuoteId:target.dataset.selectQuote});await loadData({render:false});closeModal();renderScreen();showToast(t('selected'));}catch(error){showToast(error.message);}return;}
  if(target.dataset.interest){const existing=(platformState.interests||[]).find(i=>i.offerId===target.dataset.interest);if(existing)return;target.disabled=true;try{await mutate('interests',id(),0,{offerId:target.dataset.interest,status:'pending'});await loadData({render:false});closeModal();renderScreen();showToast(t('requested'));}catch(error){showToast(error.message);}return;}
  if(target.dataset.notification){const n=notifications.find(x=>String(x.id)===String(target.dataset.notification));if(!n)return;if(!n.readAt)await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{id:Number(n.id)}}).catch(()=>{});await loadData({render:false});if(n.target?.screen==='supplierRequest')return openSupplierRequest(n.target.requestId);if(n.target?.screen==='customerRequest')return openClientRequest(n.target.requestId);renderScreen();return;}
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
  showView('appView');activeScreen='home';activeSub='primary';renderScreen();
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
$('langBtn').addEventListener('click',toggleLanguage);
$('appLangBtn').addEventListener('click',toggleLanguage);
onLanguageChange(value=>{lang=value;applyLanguage();applyRegistrationLanguage();});
$('refreshBtn').addEventListener('click',async()=>{if(busy)return;busy=true;$('refreshBtn').classList.add('spin');try{await loadData();showToast(t('refreshing'));}catch(e){showToast(errorText(e));}finally{busy=false;$('refreshBtn').classList.remove('spin');}});
$('bottomNav').addEventListener('click',e=>{const b=e.target.closest('button[data-screen]');if(!b)return;activeScreen=b.dataset.screen;if(activeScreen==='offers')activeSub='primary';renderScreen();$('screen').scrollTop=0;});
$('screen').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub){activeSub=sub.dataset.sub;renderScreen();return;}const target=e.target.closest('[data-action],[data-category],[data-request],[data-supplier-request],[data-public-offer],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-notification]');if(target)handleAction(target);});
$('modal').addEventListener('click',e=>{if(e.target.closest('[data-close-modal]')){closeModal();return;}const target=e.target.closest('[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest]');if(target)handleAction(target);});

App.addListener('appUrlOpen',async event=>{const url=event.url||'';if(!currentUser)return;if(url.includes('/notifications')){activeScreen='notifications';renderScreen();return;}const m=url.match(/\/requests\/([^?]+)/);if(m){if(currentUser.role==='supplier')openSupplierRequest(decodeURIComponent(m[1]));else openClientRequest(decodeURIComponent(m[1]));}});


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
