import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

const API='https://m-platform-tan.vercel.app';
let accessToken=null;
let refreshToken=null;
let currentUser=null;
let appConfig=null;
let platformState=null;
let notifications=[];
let lang='ar';
let activeScreen='home';
let activeSub='primary';
let busy=false;
const mediaCache=new Map();

const copy={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',secure:'دخول آمن',loginTitle:'تسجيل الدخول',loginSubtitle:'استخدم نفس حسابك الموجود على المنصة.',email:'البريد الإلكتروني',password:'كلمة المرور',login:'تسجيل الدخول',loading:'جارٍ تسجيل الدخول...',failed:'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',home:'الرئيسية',requests:'الطلبات',invites:'الدعوات',offers:'العروض',notifications:'الإشعارات',account:'الحساب',client:'عميل',supplier:'مورد',admin:'إدارة',refreshing:'جارٍ التحديث...',empty:'لا توجد بيانات حاليًا.',details:'التفاصيل',status:'الحالة',quantity:'الكمية',country:'الدولة',neededDate:'تاريخ الاحتياج',receivedQuotes:'العروض المستلمة',newRequest:'طلب جديد',publicOffers:'العروض العامة',requestedOffers:'العروض التي طلبتها',submittedOffers:'العروض المقدمة',myPublicOffers:'عروضي العامة',interestRequests:'طلبات الاهتمام',newPublicOffer:'عرض عام جديد',submitQuote:'تقديم عرض سعر',editQuote:'تعديل العرض',selectQuote:'اختيار العرض',selected:'تم اختيار العرض',requestOffer:'طلب هذا العرض',requested:'تم الطلب',price:'السعر',moq:'الحد الأدنى',leadTime:'مدة الإنتاج',sampleCost:'تكلفة العينة',stock:'المخزون',validUntil:'صالح حتى',specifications:'المواصفات',product:'المنتج',notes:'ملاحظات',currency:'العملة',images:'الصور',submit:'إرسال',save:'حفظ',logout:'تسجيل الخروج',profile:'بيانات الحساب',newQuotes:'عروض جديدة',underReview:'قيد المراجعة',activeRequests:'طلبات نشطة',published:'منشور',pending:'قيد المراجعة',completed:'مكتمل',sent:'تم الإرسال للموردين',review:'قيد المراجعة',coordinating:'قيد التنسيق',accepted:'مقبول',cancelled:'ملغي',markAllRead:'تحديد الكل كمقروء',noNotifications:'لا توجد إشعارات.',unread:'جديد',uploading:'جارٍ رفع الصور...',saving:'جارٍ الحفظ...',created:'تم الإرسال بنجاح.',chooseImages:'اختر حتى 5 صور، بحد أقصى 1 MB للصورة.',sessionNote:'هذه نسخة اختبار. جلسة الدخول تبقى أثناء تشغيل التطبيق فقط.',adminMobile:'واجهة الإدارة الكاملة ستضاف في مرحلة منفصلة. يمكنك حاليًا مشاهدة ملخص البيانات والإشعارات.'},
  en:{tagline:'Request what you need, and compare offers with confidence.',secure:'Secure access',loginTitle:'Sign in',loginSubtitle:'Use the same account you already have on the platform.',email:'Email address',password:'Password',login:'Sign in',loading:'Signing in...',failed:'Unable to sign in. Check your email and password.',home:'Home',requests:'Requests',invites:'Invites',offers:'Offers',notifications:'Notifications',account:'Account',client:'Customer',supplier:'Supplier',admin:'Admin',refreshing:'Refreshing...',empty:'No data available.',details:'Details',status:'Status',quantity:'Quantity',country:'Country',neededDate:'Needed date',receivedQuotes:'Received quotes',newRequest:'New request',publicOffers:'Public offers',requestedOffers:'Requested offers',submittedOffers:'Submitted offers',myPublicOffers:'My public offers',interestRequests:'Interest requests',newPublicOffer:'New public offer',submitQuote:'Submit quote',editQuote:'Edit offer',selectQuote:'Select offer',selected:'Selected',requestOffer:'Request this offer',requested:'Requested',price:'Price',moq:'MOQ',leadTime:'Production time',sampleCost:'Sample cost',stock:'Stock',validUntil:'Valid until',specifications:'Specifications',product:'Product',notes:'Notes',currency:'Currency',images:'Images',submit:'Submit',save:'Save',logout:'Sign out',profile:'Account details',newQuotes:'New offers',underReview:'Under review',activeRequests:'Active requests',published:'Published',pending:'Under review',completed:'Completed',sent:'Sent to suppliers',review:'Under review',coordinating:'Coordinating',accepted:'Accepted',cancelled:'Cancelled',markAllRead:'Mark all as read',noNotifications:'No notifications.',unread:'New',uploading:'Uploading images...',saving:'Saving...',created:'Submitted successfully.',chooseImages:'Choose up to 5 images, max 1 MB each.',sessionNote:'This is a test build. Your sign-in session lasts while the app is running.',adminMobile:'The full admin mobile interface will be added separately. For now you can view a data summary and notifications.'}
};

const $=id=>document.getElementById(id);
const t=key=>copy[lang][key]||key;
const tr=(ar,en)=>lang==='ar'?ar:en;
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ref=item=>item?.displayNo||String(item?.id||'').slice(0,8)||'—';
const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat(lang==='ar'?'ar':'en',{dateStyle:'medium'}).format(d);};
const money=(value,currency='')=>value===undefined||value===null||value===''?'—':`${esc(currency)} ${esc(value)}`.trim();
const setMessage=text=>{$('message').textContent=text||'';};

function statusLabel(status){return t(status)||status||'—';}
function titleOf(item){const x=item?.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||item?.product||item?.title||`#${ref(item)}`;}
function descriptionOf(item){const x=item?.translation||{};return (lang==='ar'?(x.descriptionAr||x.descriptionEn):(x.descriptionEn||x.descriptionAr))||item?.specs||item?.notes||'';}
function quoteTime(q){return Date.parse(q?.publishedAt||q?.updatedAt||q?.createdAt||0)||0;}
function newQuoteCount(request){const seen=Date.parse(request?.lastSeenQuoteAt||0)||0;return (platformState?.quotes||[]).filter(q=>q.requestId===request.id&&q.status==='published'&&quoteTime(q)>seen).length;}
function cardBadge(status,extra=''){return `<span class="status-pill status-${esc(status)}">${esc(statusLabel(status))}</span>${extra}`;}
function id(){return crypto.randomUUID();}

async function refreshSession(){
  if(!refreshToken)return false;
  const r=await fetch(API+'/api/v1/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify({refreshToken})});
  if(!r.ok)return false;
  const data=await r.json();accessToken=data.tokens?.accessToken||null;refreshToken=data.tokens?.refreshToken||refreshToken;return !!accessToken;
}
async function rawFetch(path,{method='GET',body,auth=false}={}){
  const headers={'X-M-Client':'native'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(auth&&accessToken)headers.Authorization=`Bearer ${accessToken}`;
  let response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401&&auth&&await refreshSession()){
    headers.Authorization=`Bearer ${accessToken}`;
    response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  }
  return response;
}
async function request(path,options={}){
  const response=await rawFetch(path,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
async function login(email,password){
  const data=await request('/api/v1/auth/login',{method:'POST',body:{email,password}});
  accessToken=data.tokens?.accessToken||null;refreshToken=data.tokens?.refreshToken||null;currentUser=data.user||null;
  if(!accessToken||!refreshToken||!currentUser)throw new Error('Missing native session');
}
async function mutate(collection,itemId,version,patch){return request('/api/v1/mutations',{method:'POST',auth:true,body:{collection,id:itemId,version:Number(version||0),patch}});}

async function loadData({render=true}={}){
  platformState=await request('/api/v1/state',{auth:true});
  currentUser=platformState.user||currentUser;
  notifications=await request('/api/v1/notifications',{auth:true}).catch(()=>[]);
  updateShell();
  if(render)renderScreen();
}

function updateShell(){
  const role=currentUser?.role||'client';
  $('headerRole').textContent=t(role);
  $('appLangBtn').textContent=lang==='ar'?'EN':'AR';
  const labels={home:t('home'),requests:role==='supplier'?t('invites'):t('requests'),offers:t('offers'),notifications:t('notifications'),account:t('account')};
  Object.entries(labels).forEach(([key,value])=>{const el=document.querySelector(`[data-nav="${key}"]`);if(el)el.textContent=value;});
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

function showToast(text){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.add('hidden'),2200);}
function openModal(title,kicker,html){$('modalTitle').textContent=title;$('modalKicker').textContent=kicker||'';$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');hydrateImages($('modalBody'));}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';}

function gallery(images=[]){if(!images.length)return '';return `<div class="media-grid">${images.map(src=>`<div class="media-placeholder"><img alt="" data-media="${esc(src)}" /></div>`).join('')}</div>`;}
async function hydrateImages(root=document){
  for(const img of root.querySelectorAll('img[data-media]:not([data-loaded])')){
    img.dataset.loaded='1';const src=img.dataset.media;if(mediaCache.has(src)){img.src=mediaCache.get(src);continue;}
    try{
      const path=src.replace(/^\/api\/media\//,'/api/v1/media/');const response=await rawFetch(path,{auth:true});if(!response.ok)continue;
      const url=URL.createObjectURL(await response.blob());mediaCache.set(src,url);img.src=url;
    }catch{}
  }
}

function statCard(value,label,action=''){return `<button class="stat-card" ${action?`data-action="${action}"`:''}><strong>${esc(value)}</strong><span>${esc(label)}</span></button>`;}
function pageHeader(title,subtitle='',action=''){return `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${action}</div>`;}
function empty(){return `<div class="empty-state"><span>◇</span><p>${esc(t('empty'))}</p></div>`;}
function itemCard(item,{subtitle='',meta='',badge='',action='',images=false}={}){return `<article class="list-card" ${action}><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(item))}</small><h3>${esc(titleOf(item))}</h3></div>${badge}</div>${subtitle?`<p>${esc(subtitle)}</p>`:''}${meta?`<div class="meta-line">${meta}</div>`:''}${images?gallery(item.images):''}<div class="chevron">›</div></article>`;}

function renderHome(){
  const role=currentUser.role;
  if(role==='client'){
    const req=platformState.requests||[],newQuotes=req.reduce((n,r)=>n+newQuoteCount(r),0),active=req.filter(r=>r.status==='sent'&&!r.selectedQuoteId).length;
    $('screen').innerHTML=pageHeader(`${tr('مرحبًا','Welcome')} ${esc(currentUser.name||currentUser.company||'')}`,tr('تابع طلباتك وعروضك من مكان واحد.','Track requests and offers in one place.'))+
      `<div class="stats-grid">${statCard(req.length,t('requests'),'requests')}${statCard(newQuotes,t('newQuotes'),'requests')}${statCard(active,t('activeRequests'),'requests')}${statCard((platformState.publicOffers||[]).length,t('publicOffers'),'offers')}</div>`+
      `<section class="section-block"><div class="section-title"><h2>${esc(t('requests'))}</h2><button data-action="new-request" class="text-btn">+ ${esc(t('newRequest'))}</button></div>${req.slice(0,4).map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${date(r.createdAt)}`,badge:cardBadge(r.status,newQuoteCount(r)?`<span class="new-pill">${newQuoteCount(r)} ${esc(t('newQuotes'))}</span>`:''),action:`data-request="${esc(r.id)}"`})).join('')||empty()}</section>`;
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
    $('screen').innerHTML=pageHeader(t('requests'),tr('طلباتك الحالية والعروض المرتبطة بها.','Your current requests and related offers.'),`<button class="primary-small" data-action="new-request">+ ${esc(t('newRequest'))}</button>`)+`<div class="list-stack">${rows.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${date(r.createdAt)}`,badge:cardBadge(r.status,newQuoteCount(r)?`<span class="new-pill">${newQuoteCount(r)}</span>`:''),action:`data-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div>`;
  }else if(currentUser.role==='supplier'){
    const answered=new Set((platformState.quotes||[]).map(q=>q.requestId)),rows=(platformState.requests||[]).filter(r=>!answered.has(r.id));
    $('screen').innerHTML=pageHeader(t('invites'),tr('طلبات أرسلتها الإدارة إليك لتقديم عرض.','Requests sent to you by admin for quotation.'))+`<div class="list-stack">${rows.map(r=>itemCard(r,{subtitle:descriptionOf(r),meta:`${t('quantity')}: ${r.quantity||'—'} · ${r.country||'—'} · ${t('neededDate')}: ${r.neededDate||'—'}`,badge:cardBadge(r.status),action:`data-supplier-request="${esc(r.id)}"`,images:true})).join('')||empty()}</div>`;
  }else renderAdminCollection('requests');
}

function segment(buttons){return `<div class="segmented">${buttons.map(([key,label])=>`<button data-sub="${key}" class="${activeSub===key?'active':''}">${esc(label)}</button>`).join('')}</div>`;}
function renderOffers(){
  if(currentUser.role==='client'){
    if(!['market','interests'].includes(activeSub))activeSub='market';
    const tabs=segment([['market',t('publicOffers')],['interests',t('requestedOffers')]]);
    if(activeSub==='market'){
      const offers=platformState.publicOffers||[];
      $('screen').innerHTML=pageHeader(t('offers'))+tabs+`<div class="list-stack">${offers.map(o=>itemCard(o,{subtitle:descriptionOf(o),meta:`${money(o.unitPrice,o.currency)} · MOQ ${o.moq||'—'} · ${t('leadTime')}: ${o.leadTime||'—'}`,badge:cardBadge(o.status),action:`data-public-offer="${esc(o.id)}"`,images:true})).join('')||empty()}</div>`;
    }else{
      const interests=platformState.interests||[];
      $('screen').innerHTML=pageHeader(t('requestedOffers'))+tabs+`<div class="list-stack">${interests.map(i=>{const offer=(platformState.publicOffers||[]).find(o=>o.id===i.offerId);return itemCard(offer||i,{subtitle:offer?descriptionOf(offer):tr('عرض غير متاح','Offer unavailable'),meta:date(i.createdAt),badge:cardBadge(i.status),action:offer?`data-public-offer="${esc(offer.id)}"`:''});}).join('')||empty()}</div>`;
    }
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
function renderScreen(){if(!currentUser||!platformState)return;updateShell();if(activeScreen==='home')renderHome();else if(activeScreen==='requests')renderRequests();else if(activeScreen==='offers')renderOffers();else if(activeScreen==='notifications')renderNotifications();else renderAccount();hydrateImages($('screen'));}

async function openClientRequest(requestId){
  let r=(platformState.requests||[]).find(x=>x.id===requestId);if(!r)return;
  const quotes=(platformState.quotes||[]).filter(q=>q.requestId===r.id&&q.status==='published');
  if(newQuoteCount(r)>0){try{await mutate('requests',r.id,r.version,{lastSeenQuoteAt:new Date().toISOString()});r.lastSeenQuoteAt=new Date(Math.max(...quotes.map(quoteTime))).toISOString();}catch{}updateShell();}
  const selected=r.selectedQuoteId;
  const quoteHtml=quotes.length?quotes.map(q=>`<article class="quote-card">${gallery(q.images)}<div class="quote-price">${money(q.unitPrice,q.currency)}</div><div class="facts"><span>MOQ ${esc(q.moq||'—')}</span><span>${esc(t('leadTime'))}: ${esc(q.leadTime||'—')}</span><span>${esc(t('sampleCost'))}: ${esc(q.sampleCost||'—')}</span></div><p>${esc(descriptionOf(q))}</p><button class="${selected===q.id?'secondary-btn':'primary-btn'}" data-select-quote="${esc(q.id)}" data-request-id="${esc(r.id)}" ${selected?'disabled':''}>${esc(selected===q.id?t('selected'):t('selectQuote'))}</button></article>`).join(''):empty();
  openModal(titleOf(r),`#${ref(r)}`,`${gallery(r.images)}<div class="facts"><span>${esc(t('quantity'))}: ${esc(r.quantity||'—')}</span><span>${esc(r.country||'—')}</span><span>${esc(t('neededDate'))}: ${esc(r.neededDate||'—')}</span></div><h3>${esc(t('specifications'))}</h3><p class="long-copy">${esc(descriptionOf(r)||'—')}</p><h3>${esc(t('receivedQuotes'))}</h3><div class="quote-list">${quoteHtml}</div>`);
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
function fileField(idValue){return `<label><span>${esc(t('images'))}</span><input id="${idValue}" type="file" accept="image/jpeg,image/png,image/webp" multiple /><small>${esc(t('chooseImages'))}</small></label>`;}
function openNewRequest(){openModal(t('newRequest'),'M Platform',`<form id="newRequestForm" class="form-stack"><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" /></label><label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000"></textarea></label><div class="form-two"><label><span>${esc(t('quantity'))}</span><input name="quantity" type="number" min="1" required /></label><label><span>${esc(t('country'))}</span><input name="country" maxlength="100" /></label></div><label><span>${esc(t('neededDate'))}</span><input name="neededDate" type="date" /></label>${fileField('requestFiles')}<p class="form-message" id="requestFormMessage"></p><button class="primary-btn" type="submit">${esc(t('submit'))}</button></form>`);$('newRequestForm').addEventListener('submit',submitNewRequest);}
function quoteFormHtml(q=null,requestId=''){return `<form id="quoteForm" class="form-stack" data-id="${esc(q?.id||'')}" data-request="${esc(requestId||q?.requestId||'')}"><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" value="${esc(q?.unitPrice||'')}" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option ${q?.currency===c?'selected':''}>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" value="${esc(q?.moq||'')}" required /></label><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" value="${esc(q?.leadTime||'')}" required /></label></div><label><span>${esc(t('sampleCost'))}</span><input name="sampleCost" value="${esc(q?.sampleCost||'')}" maxlength="10000" /></label><label><span>${esc(t('notes'))}</span><textarea name="notes" maxlength="10000">${esc(q?.notes||'')}</textarea></label>${fileField('quoteFiles')}<p class="form-message" id="quoteFormMessage"></p><button class="primary-btn" type="submit">${esc(q?t('save'):t('submit'))}</button></form>`;}
function openQuoteForm(requestId,q=null){openModal(q?t('editQuote'):t('submitQuote'),q?`#${ref(q)}`:`#${ref((platformState.requests||[]).find(r=>r.id===requestId))}`,quoteFormHtml(q,requestId));$('quoteForm').addEventListener('submit',submitQuote);}
function openNewPublic(){openModal(t('newPublicOffer'),'M Platform',`<form id="publicForm" class="form-stack"><label><span>${esc(t('product'))}</span><input name="product" required maxlength="300" /></label><label><span>${esc(t('specifications'))}</span><textarea name="specs" required maxlength="10000"></textarea></label><div class="form-two"><label><span>${esc(t('price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" required /></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(c=>`<option>${c}</option>`).join('')}</select></label></div><div class="form-two"><label><span>${esc(t('moq'))}</span><input name="moq" type="number" min="1" required /></label><label><span>${esc(t('stock'))}</span><input name="stock" maxlength="100" /></label></div><div class="form-two"><label><span>${esc(t('leadTime'))}</span><input name="leadTime" type="number" min="1" required /></label><label><span>${esc(t('country'))}</span><input name="country" maxlength="100" /></label></div><label><span>${esc(t('validUntil'))}</span><input name="validUntil" type="date" /></label>${fileField('publicFiles')}<p class="form-message" id="publicFormMessage"></p><button class="primary-btn" type="submit">${esc(t('submit'))}</button></form>`);$('publicForm').addEventListener('submit',submitPublic);}

async function filesToSources(input){
  const files=[...(input?.files||[])];if(files.length>5)throw new Error(tr('الحد الأقصى 5 صور.','Maximum 5 images.'));
  const sources=[];for(const file of files){if(file.size>1048576)throw new Error(tr('إحدى الصور أكبر من 1 MB.','An image exceeds 1 MB.'));if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error(tr('صيغة صورة غير مدعومة.','Unsupported image format.'));sources.push(await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);}));}return sources;
}
async function uploadSources(sources){const out=[];for(const source of sources){const result=await request('/api/v1/uploads',{method:'POST',auth:true,body:{source}});out.push(result.src);}return out;}
async function submitNewRequest(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('requestFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('requestFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('requests',id(),0,{product:f.product.value.trim(),specs:f.specs.value.trim(),quantity:f.quantity.value,country:f.country.value.trim(),neededDate:f.neededDate.value,images});await loadData({render:false});closeModal();activeScreen='requests';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitQuote(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('quoteFormMessage'),quoteId=f.dataset.id,requestId=f.dataset.request;try{const sources=await filesToSources($('quoteFiles'));const images=sources.length?await uploadSources(sources):null;const patch={unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,leadTime:f.leadTime.value,sampleCost:f.sampleCost.value.trim(),notes:f.notes.value.trim()};if(images)patch.images=images;if(quoteId){const q=(platformState.quotes||[]).find(x=>x.id===quoteId);await mutate('quotes',q.id,q.version,patch);}else{patch.requestId=requestId;patch.images=images||[];await mutate('quotes',id(),0,patch);}await loadData({render:false});closeModal();activeScreen='offers';activeSub='submitted';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}
async function submitPublic(e){e.preventDefault();if(busy)return;busy=true;const f=e.currentTarget,m=$('publicFormMessage');try{m.textContent=t('uploading');const images=await uploadSources(await filesToSources($('publicFiles')));if(!images.length)throw new Error(tr('أضف صورة واحدة على الأقل.','Add at least one image.'));m.textContent=t('saving');await mutate('publicOffers',id(),0,{product:f.product.value.trim(),specs:f.specs.value.trim(),country:f.country.value.trim(),unitPrice:f.unitPrice.value,currency:f.currency.value,moq:f.moq.value,stock:f.stock.value.trim(),leadTime:f.leadTime.value,validUntil:f.validUntil.value,images});await loadData({render:false});closeModal();activeScreen='offers';activeSub='public';renderScreen();showToast(t('created'));}catch(error){m.textContent=error.message;}finally{busy=false;}}

async function handleAction(target){
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

async function logout(){try{if(accessToken)await request('/api/v1/auth/logout',{method:'POST',auth:true,body:{}});}catch{}accessToken=null;refreshToken=null;currentUser=null;platformState=null;notifications=[];$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');$('loginForm').reset();setMessage('');}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;setMessage(t('loading'));$('loginBtn').disabled=true;try{await login($('email').value.trim(),$('password').value);await loadData({render:false});$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');activeScreen='home';activeSub='primary';setMessage('');renderScreen();}catch(error){console.error(error);setMessage(t('failed'));}finally{busy=false;$('loginBtn').disabled=false;}});
$('langBtn').addEventListener('click',async()=>{lang=lang==='ar'?'en':'ar';await Preferences.set({key:'language',value:lang});applyLanguage();});
$('appLangBtn').addEventListener('click',async()=>{lang=lang==='ar'?'en':'ar';await Preferences.set({key:'language',value:lang});applyLanguage();});
$('refreshBtn').addEventListener('click',async()=>{if(busy)return;busy=true;$('refreshBtn').classList.add('spin');try{await loadData();showToast(t('refreshing'));}catch(e){showToast(e.message);}finally{busy=false;$('refreshBtn').classList.remove('spin');}});
$('bottomNav').addEventListener('click',e=>{const b=e.target.closest('button[data-screen]');if(!b)return;activeScreen=b.dataset.screen;if(activeScreen==='offers')activeSub='primary';renderScreen();});
$('screen').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub){activeSub=sub.dataset.sub;renderScreen();return;}const target=e.target.closest('[data-action],[data-request],[data-supplier-request],[data-public-offer],[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest],[data-notification]');if(target)handleAction(target);});
$('modal').addEventListener('click',e=>{if(e.target.closest('[data-close-modal]')){closeModal();return;}const target=e.target.closest('[data-edit-quote],[data-quote-request],[data-select-quote],[data-interest]');if(target)handleAction(target);});

App.addListener('appUrlOpen',async event=>{const url=event.url||'';if(!currentUser)return;if(url.includes('/notifications')){activeScreen='notifications';renderScreen();return;}const m=url.match(/\/requests\/([^?]+)/);if(m){if(currentUser.role==='supplier')openSupplierRequest(decodeURIComponent(m[1]));else openClientRequest(decodeURIComponent(m[1]));}});

(async function boot(){const saved=await Preferences.get({key:'language'});lang=saved.value==='en'?'en':'ar';applyLanguage();try{appConfig=await request('/api/v1/app-config');console.info('App config loaded',appConfig.apiVersion);}catch(error){console.error('App config',error);}})();
