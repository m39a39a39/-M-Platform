import { session } from './session.js';
import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';
import { configureAdmin, updateAdminState, resetAdmin, renderAdminScreen, openAdminPayment } from './admin-mobile.js';
import { App } from '@capacitor/app';
import { filesToCompressedSources } from './image-upload.js';
import './image-viewer.js';

let currentUser=null;
let platformState=null;
let notifications=[];
let lang='ar';
let activeScreen='home';
let activeSub='primary';
let readyProductsPage=1;
let readyCategory='all';
let clientRequestFilter='all';
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
  currentUser=null;platformState=null;notifications=[];activeScreen='home';activeSub='primary';readyProductsPage=1;readyCategory='all';clientRequestFilter='all';
  resetAdmin();closeModal();
  for(const url of mediaCache.values())URL.revokeObjectURL(url);
  mediaCache.clear();mediaTasks.clear();lastDataLoadedAt=0;$('screen').replaceChildren();$('headerRole').textContent='';
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
  if(requestLabel)requestLabel.textContent=role==='supplier'?tr('طلبات عروض الأسعار','Quote requests'):role==='client'?tr('طلباتي','My orders'):t('requests');
  if(offersLabel)offersLabel.textContent=t('offers');
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

function gallery(images=[]){if(!images.length)return '';return `<div class="media-grid" data-viewer-gallery>${images.map(src=>`<div class="media-placeholder"><img alt="" data-media="${esc(src)}" data-image-viewer /></div>`).join('')}</div>`;}
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
  return `<article class="public-offer-card" data-public-offer="${esc(item.id)}"><div class="public-offer-media" data-viewer-gallery>${image?`<img alt="" data-media="${esc(image)}" data-image-viewer />`:'<div class="public-offer-placeholder">M</div>'}</div><div class="public-offer-content"><h3>${esc(titleOf(item))}</h3><p>${esc(descriptionOf(item)||'—')}</p><div class="public-offer-facts"><span><b>${esc(t('price'))}</b><strong>${money(item.unitPrice,item.currency)}</strong></span><span><b>${esc(t('moq'))}</b><strong>${esc(item.moq||'—')}</strong></span></div></div></article>`;
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
    return {type:'public',id:i.id,version:i.version,interest:i,offer:o,item:o,title:titleOf(o),images:o.images||[],source:tr('عرض عام','Public offer'),status:i.supplierOrderStatus||'pending_confirmation',note:i.supplierOrderNote||'',paymentConfirmed:!!i.paymentConfirmed,updatedAt:i.supplierOrderUpdatedAt||i.createdAt,quantity:i.quantity||'',unitPrice:i.unitPrice||o.unitPrice,currency:i.currency||o.currency,total:Number.isFinite(total)&&total>0?total:(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)&&unitPrice>0?quantity*unitPrice:null),country:o.country||'',moq:i.moq||o.moq||''};
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
  const custom=requests.map(r=>{
    const selected=quotes.find(q=>q.id===r.selectedQuoteId),quantity=Number(r.quantity),unitPrice=Number(selected?.unitPrice),total=selected&&Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)?quantity*unitPrice:null;
    return {type:'custom',id:r.id,refItem:r,item:r,title:titleOf(r),images:r.images||[],status:requestTrackingStatus(r),quantity:r.quantity||'',unitPrice:selected?.unitPrice,currency:selected?.currency,total,updatedAt:r.trackingUpdatedAt||r.updatedAt||r.createdAt,createdAt:r.createdAt,selectedQuote:selected};
  });
  const ready=interests.map(i=>{
    const o=offers.find(x=>x.id===i.offerId),quantity=Number(i.quantity),unitPrice=Number(i.unitPrice||o?.unitPrice),storedTotal=Number(i.total);
    return {type:'ready',id:i.id,refItem:i,item:i,offer:o,title:o?titleOf(o):tr('منتج جاهز','Ready product'),images:o?.images||[],status:readyTrackingStatus(i),quantity:i.quantity||'',unitPrice:i.unitPrice||o?.unitPrice,currency:i.currency||o?.currency,total:Number.isFinite(storedTotal)&&storedTotal>0?storedTotal:(Number.isFinite(quantity)&&quantity>0&&Number.isFinite(unitPrice)?quantity*unitPrice:null),updatedAt:i.trackingUpdatedAt||i.updatedAt||i.createdAt,createdAt:i.createdAt};
  });
  return [...custom,...ready].sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0));
}
function clientOrderNeedsAction(order){
  if(order.type==='custom'){
    const r=order.item,quotes=(platformState?.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published'),newCount=newQuoteCount(r);
    if(r.paymentStatus==='reupload_requested')return {key:'reupload',label:tr('أعد رفع إيصال الدفع','Upload payment receipt again'),action:`data-request="${esc(r.id)}"`,tone:'payment'};
    if(requestTrackingStatus(r)==='payment_confirmation'&&['awaiting_receipt','reupload_requested'].includes(r.paymentStatus))return {key:'payment',label:tr('الدفع مطلوب','Payment required'),action:`data-request="${esc(r.id)}"`,tone:'payment'};
    if(newCount>0)return {key:'new_quotes',label:newCount===1?tr('وصل عرض جديد','New quote received'):tr(`وصلت ${newCount} عروض جديدة`,`${newCount} new quotes received`),action:`data-client-offers-request="${esc(r.id)}"`,tone:'quote'};
    if(!r.selectedQuoteId&&quotes.length)return {key:'choose_quote',label:tr('اختر عرضًا للمتابعة','Choose a quote to continue'),action:`data-client-offers-request="${esc(r.id)}"`,tone:'quote'};
    if(requestTrackingStatus(r)==='customer_action')return {key:'customer_action',label:tr('مطلوب إجراء منك','Action required'),action:`data-request="${esc(r.id)}"`,tone:'action'};
  }else{
    const i=order.item;
    if(i.paymentStatus==='reupload_requested')return {key:'reupload',label:tr('أعد رفع إيصال الدفع','Upload payment receipt again'),action:order.offer?`data-public-offer="${esc(order.offer.id)}"`:'',tone:'payment'};
    if(readyTrackingStatus(i)==='payment_confirmation'&&['awaiting_receipt','reupload_requested'].includes(i.paymentStatus))return {key:'payment',label:tr('الدفع مطلوب','Payment required'),action:order.offer?`data-public-offer="${esc(order.offer.id)}"`:'',tone:'payment'};
    if(readyTrackingStatus(i)==='customer_action')return {key:'customer_action',label:tr('مطلوب إجراء منك','Action required'),action:order.offer?`data-public-offer="${esc(order.offer.id)}"`:'',tone:'action'};
  }
  return null;
}
function clientOrderCard(order){
  const image=(order.images||[])[0],typeLabel=order.type==='custom'?tr('طلب خاص','Custom request'):tr('منتج جاهز','Ready product'),action=order.type==='custom'?`data-request="${esc(order.id)}"`:order.offer?`data-public-offer="${esc(order.offer.id)}"`:'';
  const total=order.total!==null&&order.total!==undefined?money(order.total,order.currency):'';
  return `<article class="client-order-card" ${action}>
    <div class="client-order-thumb">${image?`<img alt="" data-media="${esc(image)}">`:'<div>M</div>'}</div>
    <div class="client-order-main">
      <div class="client-order-head"><div><small>#${esc(ref(order.refItem))} · ${esc(typeLabel)}</small><h3>${esc(order.title)}</h3></div>${cardBadge(order.status)}</div>
      <div class="client-order-meta"><span>${esc(tr('الكمية','Quantity'))}: ${esc(order.quantity||'—')}</span>${total?`<span>${esc(tr('الإجمالي','Total'))}: ${total}</span>`:''}<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(order.updatedAt))}</span></div>
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
  const requests=platformState?.requests||[],quotes=platformState?.quotes||[];
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
    const offers=filteredReadyOffers(),orders=clientOrders(),actions=orders.map(o=>({order:o,action:clientOrderNeedsAction(o)})).filter(x=>x.action),activeOrders=orders.filter(o=>!['completed','cancelled'].includes(o.status)).length,newQuotes=(platformState.requests||[]).reduce((n,r)=>n+newQuoteCount(r),0);
    const totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
    readyProductsPage=Math.min(Math.max(readyProductsPage,1),totalPages);
    const pageOffers=offers.slice((readyProductsPage-1)*PAGE_SIZE,readyProductsPage*PAGE_SIZE);
    $('screen').innerHTML=
      `<section class="special-request-card client-new-request"><div class="special-request-copy"><div class="special-request-heading"><span class="special-request-icon">＋</span><h2>${esc(tr('أرسل طلب جديد','Send a new request'))}</h2></div><p>${esc(tr('إذا لم تجد المنتج المناسب، أرسل مواصفاتك وسنطلب عروضًا لك.','If you cannot find the right product, send your specifications and we will source quotes for you.'))}</p></div><button class="primary-btn" data-action="new-request">+ ${esc(tr('أرسل طلب جديد','Send new request'))}</button></section>`+
      `<section class="section-block client-action-needed"><div class="section-title"><div><h2>${esc(tr('يتطلب إجراء منك','Needs your action'))}</h2><p>${esc(tr('اعرض ما يحتاج قرارك أو دفعتك أولًا.','Items waiting for your decision or payment.'))}</p></div></div><div class="client-action-list">${actions.slice(0,5).map(x=>clientActionCard(x.order,x.action)).join('')||`<div class="client-clear-state">✓ ${esc(tr('لا يوجد شيء مطلوب منك حاليًا','Nothing needs your action right now'))}</div>`}</div></section>`+
      `<div class="stats-grid client-home-stats client-three-stats">${statCard(activeOrders,tr('طلبات نشطة','Active orders'),'requests')}${statCard(newQuotes,tr('عروض جديدة','New quotes'),'offers')}${statCard(actions.length,tr('يحتاج إجراء','Needs action'),'requests')}</div>`+
      `<section class="ready-products-section"><div class="section-title ready-products-title"><div><h2>${esc(tr('العروض العامة','Public offers'))}</h2><p>${esc(tr('منتجات جاهزة يمكنك طلبها مباشرة بالكمية التي تحتاجها.','Ready products you can order directly in the quantity you need.'))}</p></div></div>${categoryFilters()}<div class="public-offers-grid">${pageOffers.map(publicOfferCard).join('')||empty()}</div>${productPagination(readyProductsPage,totalPages)}</section>`+
      companyFooterCard();
  }else if(role==='supplier'){
    const quotes=platformState.quotes||[],answered=new Set(quotes.map(q=>q.requestId)),invites=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    const pub=platformState.publicOffers||[],orders=supplierOrders(),pendingOrders=orders.filter(o=>o.status==='pending_confirmation'),activeOrders=orders.filter(o=>!['ready_for_inspection','cannot_fulfill'].includes(o.status)),publishedPublic=pub.filter(o=>o.status==='published').length,recentOrders=orders.slice(0,3);
    const needed=[...pendingOrders.slice(0,3).map(supplierOrderCard),...invites.slice(0,Math.max(0,3-pendingOrders.length)).map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'}`,badge:`<span class="status-pill status-review">${esc(tr('تقديم عرض','Submit quote'))}</span>`,action:`data-supplier-request="${esc(r.id)}"`}))];
    $('screen').innerHTML=pageHeader(`${tr('مرحبًا','Welcome')} ${esc(currentUser.name||currentUser.company||'')}`,tr('ركز على الطلبات التي تحتاج إجراء منك أولًا.','Focus first on the items that need your action.'))+
      `<section class="supplier-public-cta"><div class="supplier-public-cta-copy"><span class="supplier-public-cta-icon">＋</span><div><h2>${esc(tr('إضافة عرض عام جديد','Add a new public offer'))}</h2><p>${esc(tr('أضف منتجًا جاهزًا للبيع ليظهر للعملاء بعد مراجعة الإدارة.','Add a ready-to-sell product for customers to see after admin review.'))}</p></div></div><button class="primary-btn" type="button" data-action="new-public">+ ${esc(t('newPublicOffer'))}</button></section>`+
      `<section class="section-block supplier-action-needed"><div class="section-title"><div><h2>${esc(tr('يتطلب إجراء منك','Needs your action'))}</h2><p>${esc(tr('طلبات جديدة أو دعوات تحتاج ردك.','New orders or quote requests waiting for your response.'))}</p></div></div><div class="supplier-action-list">${needed.join('')||`<div class="supplier-clear-state">✓ ${esc(tr('لا يوجد إجراء مطلوب حاليًا','No action needed right now'))}</div>`}</div></section>`+
      `<div class="stats-grid supplier-home-stats supplier-three-stats">${statCard(activeOrders.length,tr('الطلبات النشطة','Active orders'),'orders')}${statCard(invites.length,tr('طلبات عروض الأسعار','Quote requests'),'requests')}${statCard(publishedPublic,tr('العروض العامة المنشورة','Published public offers'),'view-public-offers')}</div>`+
      `<section class="section-block supplier-recent-orders"><div class="section-title"><div><h2>${esc(tr('آخر الطلبات','Recent orders'))}</h2><p>${esc(tr('آخر الطلبات التي أصبحت جاهزة للتنفيذ.','Latest orders ready for fulfillment.'))}</p></div><button class="text-btn" type="button" data-action="orders">${esc(tr('عرض الكل','View all'))}</button></div><div class="supplier-orders-list">${recentOrders.map(supplierOrderCard).join('')||empty()}</div></section>`;
  }else{
    $('screen').innerHTML=pageHeader(tr('لوحة الإدارة','Admin'),t('adminMobile'))+`<div class="stats-grid">${statCard(platformState.requests?.length||0,t('requests'))}${statCard(platformState.quotes?.length||0,t('submittedOffers'))}${statCard(platformState.publicOffers?.length||0,t('publicOffers'))}${statCard(notifications.filter(n=>!n.readAt).length,t('notifications'),'notifications')}</div>`;
  }
}

function renderRequests(){
  if(currentUser.role==='client'){
    const all=clientOrders(),active=all.filter(o=>!['completed','cancelled'].includes(o.status)),completed=all.filter(o=>['completed','cancelled'].includes(o.status));
    if(!['all','active','completed'].includes(clientRequestFilter))clientRequestFilter='all';
    const rows=clientRequestFilter==='active'?active:clientRequestFilter==='completed'?completed:all;
    const tabs=`<div class="client-order-filters"><button class="${clientRequestFilter==='all'?'active':''}" data-client-order-filter="all">${esc(tr('الكل','All'))} <span>${all.length}</span></button><button class="${clientRequestFilter==='active'?'active':''}" data-client-order-filter="active">${esc(tr('النشطة','Active'))} <span>${active.length}</span></button><button class="${clientRequestFilter==='completed'?'active':''}" data-client-order-filter="completed">${esc(tr('المكتملة','Completed'))} <span>${completed.length}</span></button></div>`;
    $('screen').innerHTML=
      pageHeader(tr('طلباتي','My orders'),tr('كل طلباتك الخاصة وطلبات المنتجات الجاهزة في مكان واحد.','All custom and ready-product orders in one place.'),`<button class="primary-small" data-action="new-request">+ ${esc(tr('طلب جديد','New request'))}</button>`)+
      tabs+
      `<div class="client-orders-list">${rows.map(clientOrderCard).join('')||empty()}</div>`;
  }else if(currentUser.role==='supplier'){
    const answered=new Set((platformState.quotes||[]).map(q=>q.requestId)),rows=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    $('screen').innerHTML=pageHeader(tr('طلبات عروض الأسعار','Quote requests'),tr('الطلبات التي أرسلتها الإدارة إليك لتقديم سعر. تختفي بعد تقديم عرضك.','Requests sent by admin for quotation. They disappear after you submit an offer.'))+`<div class="list-stack">${rows.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${t('neededDate')}: ${r.neededDate||'—'}`,badge:`<span class="status-pill status-review">${esc(tr('بانتظار عرضك','Awaiting your quote'))}</span>`,action:`data-supplier-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div>`;
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
    if(!['submitted','public'].includes(activeSub))activeSub='submitted';
    const tabs=segment([['submitted',t('submittedOffers')],['public',t('myPublicOffers')]]);
    if(activeSub==='submitted'){
      const quotes=platformState.quotes||[];
      $('screen').innerHTML=pageHeader(t('submittedOffers'))+tabs+`<div class="list-stack">${quotes.map(q=>{const r=(platformState.requests||[]).find(x=>x.id===q.requestId);return itemCard(q,{subtitle:q.notes||descriptionOf(q),meta:`${money(q.unitPrice,q.currency)} · MOQ ${q.moq||'—'} · ${date(q.createdAt)}`,badge:cardBadge(q.status),action:`data-edit-quote="${esc(q.id)}"`,images:true});}).join('')||empty()}</div>`;
    }else{
      const offers=platformState.publicOffers||[];
      $('screen').innerHTML=pageHeader(t('myPublicOffers'),'',`<button class="primary-small" data-action="new-public">+ ${esc(t('newPublicOffer'))}</button>`)+tabs+`<div class="list-stack">${offers.map(o=>itemCard(o,{subtitle:o.specs||'',meta:`${money(o.unitPrice,o.currency)} · MOQ ${o.moq||'—'} · ${date(o.createdAt)}`,badge:cardBadge(o.status),action:`data-public-offer="${esc(o.id)}"`,images:true})).join('')||empty()}</div>`;
    }
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
  const quotes=(platformState.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published');
  const actionPanel=clientRequestActionPanel(r),status=requestTrackingStatus(r),selectedPanel=selectedQuotePanel(r);
  const compareButton=quotes.length?`<button type="button" class="secondary-btn full client-view-quotes" data-client-offers-request="${esc(r.id)}">${esc(r.selectedQuoteId?tr('عرض جميع العروض','View all quotes'):tr('عرض ومقارنة العروض','View & compare quotes'))}</button>`:'';
  const summary=`<section class="client-order-summary"><div class="client-order-summary-title"><small>#${esc(ref(r))} · ${esc(tr('طلب خاص','Custom request'))}</small><strong>${esc(titleOf(r))}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(tr('الدولة','Country'))}: ${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div></section>`;
  const statusCard=`<section class="client-current-status"><small>${esc(tr('الحالة الحالية','Current status'))}</small><strong>${esc(trackingLabel(status))}</strong>${r.trackingUpdatedAt?`<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(r.trackingUpdatedAt))}</span>`:''}</section>`;
  openModal(titleOf(r),`#${ref(r)}`,`${summary}${actionPanel}${statusCard}${selectedPanel}${compareButton}${paymentPanel(r,'request')}${trackingTimeline(r)}<section class="client-detail-content"><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(r)||'—')}</p>${gallery(r.images)}</section><button type="button" class="secondary-btn full repeat-request-btn" data-repeat-request="${esc(r.id)}">${esc(tr('تكرار الطلب','Repeat request'))}</button>`);
}
function clientReadyActionPanel(interest,offer){
  const order=clientOrders().find(o=>o.type==='ready'&&o.id===interest.id),action=order?clientOrderNeedsAction(order):null;
  if(!action)return '';
  return `<section class="client-detail-action ${esc(action.tone||'action')}"><div><small>${esc(tr('الإجراء المطلوب','Action required'))}</small><strong>${esc(action.label)}</strong></div></section>`;
}
async function openPublicOffer(offerId){
  const o=(platformState.publicOffers||[]).find(x=>x.id===offerId);if(!o)return;
  const interest=(platformState.interests||[]).find(i=>i.offerId===o.id);
  const moq=Math.max(1,Math.ceil(Number(o.moq)||1)),stock=Number(o.stock),maxAttr=Number.isFinite(stock)&&stock>0?` max="${esc(Math.floor(stock))}"`:'';
  if(currentUser.role==='client'&&interest){
    const order=clientOrders().find(x=>x.type==='ready'&&x.id===interest.id),status=readyTrackingStatus(interest),total=interest.total||Number(interest.quantity||0)*Number(interest.unitPrice||o.unitPrice||0);
    const summary=`<section class="client-order-summary"><div class="client-order-summary-title"><small>#${esc(ref(interest))} · ${esc(tr('منتج جاهز','Ready product'))}</small><strong>${esc(titleOf(o))}</strong></div><div class="client-order-summary-facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(interest.quantity||'—')}</span><span>${esc(tr('سعر الوحدة','Unit price'))}: ${money(interest.unitPrice||o.unitPrice,interest.currency||o.currency)}</span><span>${esc(tr('الإجمالي','Total'))}: ${money(total,interest.currency||o.currency)}</span></div></section>`;
    const statusCard=`<section class="client-current-status"><small>${esc(tr('الحالة الحالية','Current status'))}</small><strong>${esc(trackingLabel(status))}</strong>${interest.trackingUpdatedAt?`<span>${esc(tr('آخر تحديث','Last update'))}: ${esc(date(interest.trackingUpdatedAt))}</span>`:''}</section>`;
    openModal(titleOf(o),`#${ref(interest)}`,`${summary}${clientReadyActionPanel(interest,o)}${statusCard}${paymentPanel(interest,'interest')}${trackingTimeline(interest,{flow:READY_TRACKING_FLOW,statusResolver:readyTrackingStatus})}<section class="client-detail-content"><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(o)||'—')}</p><div class="facts"><span>MOQ ${esc(o.moq||'—')}</span><span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span><span>${esc(t('leadTime'))}: ${esc(o.leadTime||'—')}</span></div>${gallery(o.images)}</section>`);
    return;
  }
  const requestForm=currentUser.role==='client'?`<form id="publicInterestForm" class="public-interest-form" data-offer-id="${esc(o.id)}">
    <div class="public-interest-head"><div><strong>${esc(tr('حدد الكمية المطلوبة','Choose requested quantity'))}</strong><small>${esc(tr('الحد الأدنى للطلب','Minimum order'))}: ${esc(o.moq||'—')}</small></div></div>
    <label><span>${esc(tr('الكمية','Quantity'))}</span><input id="publicInterestQuantity" name="quantity" type="number" min="${esc(moq)}" step="1" value="${esc(moq)}"${maxAttr} required></label>
    <div class="public-interest-total"><span>${esc(tr('الإجمالي التقديري','Estimated total'))}</span><strong id="publicInterestTotal">${money(moq*Number(o.unitPrice||0),o.currency)}</strong></div>
    ${Number.isFinite(stock)&&stock>0?`<small>${esc(tr('المخزون المتاح','Available stock'))}: ${esc(stock)}</small>`:''}
    <p class="form-message" id="publicInterestMessage"></p>
    <button class="primary-btn full" type="submit">${esc(t('requestOffer'))}</button>
  </form>`:'';
  openModal(titleOf(o),`#${ref(o)}`,`${gallery(o.images)}<div class="quote-price">${money(o.unitPrice,o.currency)}</div><div class="facts"><span>MOQ ${esc(o.moq||'—')}</span><span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span><span>${esc(t('leadTime'))}: ${esc(o.leadTime||'—')}</span><span>${esc(t('validUntil'))}: ${esc(o.validUntil||'—')}</span></div><p class="long-copy">${esc(descriptionOf(o)||'—')}</p>${requestForm}`);
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
  const quantity=Number(form.quantity.value),moq=Number(o.moq)||1,stock=Number(o.stock);
  try{
    if(!Number.isFinite(quantity)||quantity<moq)throw new Error(tr('الكمية يجب ألا تقل عن الحد الأدنى للطلب.','Quantity cannot be below the minimum order.'));
    if(Number.isFinite(stock)&&stock>0&&quantity>stock)throw new Error(tr('الكمية المطلوبة أكبر من المخزون المتاح.','Requested quantity exceeds available stock.'));
    form.querySelector('button[type="submit"]').disabled=true;
    if(message)message.textContent=tr('جارٍ إرسال الطلب...','Submitting request...');
    await mutate('interests',id(),0,{offerId,quantity,status:'pending'});
    await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(t('requested'));
  }catch(error){if(message)message.textContent=error.message;else showToast(error.message);}
  finally{busy=false;}
}
function openSupplierRequest(requestId){
  const r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const existing=(platformState.quotes||[]).find(q=>q.requestId===r.id);
  openModal(titleOf(r),`#${ref(r)}`,`${gallery(r.images)}<div class="facts"><span>${esc(t('quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div><p class="long-copy">${esc(descriptionOf(r)||'—')}</p>${existing?`<button class="secondary-btn full" data-edit-quote="${esc(existing.id)}">${esc(t('editQuote'))}</button>`:`<button class="primary-btn full" data-quote-request="${esc(r.id)}">${esc(t('submitQuote'))}</button>`}`);
}
function supplierOrderActions(order){
  const base=`data-supplier-order-type="${esc(order.type)}" data-supplier-order-id="${esc(order.id)}"`;
  if(order.status==='pending_confirmation')return `<div class="supplier-order-actions"><button class="primary-btn" type="button" data-supplier-order-status="confirmed" ${base}>${esc(tr('تأكيد التنفيذ','Confirm fulfillment'))}</button><button class="secondary-btn" type="button" data-supplier-order-cannot ${base}>${esc(tr('تعذر التنفيذ','Unable to fulfill'))}</button></div>`;
  if(order.status==='confirmed'&&!order.paymentConfirmed)return `<div class="supplier-order-complete">⏳ ${esc(tr('تم تأكيد التنفيذ — بانتظار تأكيد الدفع من الإدارة.','Fulfillment confirmed — waiting for admin payment confirmation.'))}</div>`;
  if(order.status==='confirmed')return `<div class="supplier-order-actions"><button class="primary-btn" type="button" data-supplier-order-status="production" ${base}>${esc(tr('بدء التجهيز / الإنتاج','Start preparation / production'))}</button><button class="secondary-btn" type="button" data-supplier-order-cannot ${base}>${esc(tr('تعذر التنفيذ','Unable to fulfill'))}</button></div>`;
  if(order.status==='production')return `<div class="supplier-order-actions"><button class="primary-btn" type="button" data-supplier-order-status="ready_for_inspection" ${base}>${esc(tr('جاهز للفحص','Ready for inspection'))}</button><button class="secondary-btn" type="button" data-supplier-order-cannot ${base}>${esc(tr('تعذر التنفيذ','Unable to fulfill'))}</button></div>`;
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
async function submitNewRequest(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('requestFormMessage');try{m.textContent=t('uploading');const kept=[...f.querySelectorAll('[data-repeat-image]:checked')].map(x=>x.value),uploaded=await uploadSources(await filesToSources($('requestFiles'))),images=[...kept,...uploaded];if(images.length>5)throw new Error(tr('الحد الأقصى 5 صور للطلب.','Maximum 5 request images.'));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');const patch={product:f.product.value.trim(),specs:f.specs.value.trim(),quantity:f.quantity.value,country:f.country.value.trim(),neededDate:f.neededDate.value,images};if(f.dataset.repeatFrom)patch.repeatedFromRequestId=f.dataset.repeatFrom;await mutate('requests',id(),0,patch);await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(f.dataset.repeatFrom?tr('تم إنشاء طلب جديد من الطلب السابق.','New request created from the previous request.'):t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitQuote(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('quoteFormMessage'),quoteId=f.dataset.id,requestId=f.dataset.request;try{const sources=await filesToSources($('quoteFiles'));const images=sources.length?await uploadSources(sources):null;const patch={unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,leadTime:f.leadTime.value,sampleCost:f.sampleCost.value.trim(),notes:f.notes.value.trim()};if(images)patch.images=images;if(quoteId){const q=(platformState.quotes||[]).find(x=>x.id===quoteId);await mutate('quotes',q.id,q.version,patch);}else{patch.requestId=requestId;patch.images=images||[];await mutate('quotes',id(),0,patch);}await loadData({render:false});closeModal();activeScreen='offers';activeSub='submitted';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitPublic(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('publicFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('publicFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('publicOffers',id(),0,{product:f.product.value.trim(),specs:f.specs.value.trim(),country:f.country.value.trim(),unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,stock:f.stock.value.trim(),leadTime:f.leadTime.value,validUntil:f.validUntil.value,categoryId:f.categoryId?.value||'',images});await loadData({render:false});closeModal();activeScreen='offers';activeSub='public';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}

async function handleAction(target){
  if(target.dataset.category){readyCategory=target.dataset.category;readyProductsPage=1;renderHome();$('screen').scrollTop=0;return;}
  if(target.dataset.action==='ready-products-prev'){if(readyProductsPage>1){readyProductsPage--;renderHome();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='ready-products-next'){const total=Math.max(1,Math.ceil(filteredReadyOffers().length/PAGE_SIZE));if(readyProductsPage<total){readyProductsPage++;renderHome();$('screen').scrollTop=0;}return;}
  if(target.dataset.action==='new-request')return openNewRequest();
  if(target.dataset.repeatRequest){const source=(platformState.requests||[]).find(x=>x.id===target.dataset.repeatRequest);if(source)return openNewRequest(source);}
  if(target.dataset.action==='new-public')return openNewPublic();
  if(target.dataset.action==='view-public-offers'){activeScreen='offers';activeSub='public';renderScreen();$('screen').scrollTop=0;return;}
  if(target.dataset.action==='toggle-language')return toggleLanguage();
  if(target.dataset.action==='logout')return logout();
  if(target.dataset.action==='mark-all'){await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{all:true}});await loadData();return;}
  if(['home','orders','requests','offers','notifications','account'].includes(target.dataset.action)){activeScreen=target.dataset.action;if(activeScreen==='offers')activeSub='primary';renderScreen();return;}
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
  if(target.dataset.paymentNotification){
    const n=notifications.find(x=>String(x.id)===String(target.dataset.paymentNotification));if(!n)return;
    if(!n.readAt)await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{id:Number(n.id)}}).catch(()=>{});
    await loadData({render:false});
    if(n.target?.entityType&&n.target?.entityId)return openPaymentReceiptForm(n.target.entityType,n.target.entityId);
    return;
  }
  if(target.dataset.notification){const n=notifications.find(x=>String(x.id)===String(target.dataset.notification));if(!n)return;if(!n.readAt)await request('/api/v1/notifications/read',{method:'POST',auth:true,body:{id:Number(n.id)}}).catch(()=>{});await loadData({render:false});if(n.target?.screen==='supplierRequest')return openSupplierRequest(n.target.requestId);if(n.target?.screen==='customerRequest')return openClientRequest(n.target.requestId);if(n.target?.screen==='customerPayment'){if(n.target.entityType==='request')return openClientRequest(n.target.entityId);const interest=(platformState.interests||[]).find(i=>i.id===n.target.entityId);if(interest)return openPublicOffer(interest.offerId);}if(n.target?.screen==='adminPayment')return openAdminPayment(n.target.entityType,n.target.entityId);renderScreen();return;}
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
$('headerNotificationsBtn').addEventListener('click',()=>{if(!currentUser)return;activeScreen='notifications';renderScreen();$('screen').scrollTop=0;});
onLanguageChange(value=>{lang=value;applyLanguage();applyRegistrationLanguage();});
$('refreshBtn').addEventListener('click',async()=>{if(busy)return;busy=true;$('refreshBtn').classList.add('spin');try{await loadData();showToast(t('refreshing'));}catch(e){showToast(errorText(e));}finally{busy=false;$('refreshBtn').classList.remove('spin');}});
$('bottomNav').addEventListener('click',e=>{const b=e.target.closest('button[data-screen]');if(!b)return;activeScreen=b.dataset.screen;if(activeScreen==='offers')activeSub='primary';renderScreen();$('screen').scrollTop=0;});
$('screen').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub){activeSub=sub.dataset.sub;renderScreen();return;}const target=e.target.closest('[data-action],[data-category],[data-client-order-filter],[data-client-offers-request],[data-request],[data-supplier-request],[data-supplier-order-id],[data-public-offer],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-notification],[data-payment-notification],[data-payment-upload],[data-payment-document]');if(target)handleAction(target);});
$('modal').addEventListener('click',e=>{if(e.target.closest('[data-close-modal]')){closeModal();return;}const target=e.target.closest('[data-client-offers-request],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-supplier-order-status],[data-supplier-order-cannot],[data-payment-upload],[data-payment-document]');if(target)handleAction(target);});

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
