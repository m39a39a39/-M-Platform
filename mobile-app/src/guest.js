import {Capacitor} from '@capacitor/core';
import './public-shell.css';
import {mountSiteChrome} from './site-chrome.js';
import {formatStoreMoney,renderStorefront,bindStorefront,tierPrice,homeConfig,storeProductCard} from './storefront.js';
import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';
import { categoryRows, subcategoryRows, supplyCountryRows, taxonomyLabel } from './catalog-taxonomy.js';

const browserOrigin=typeof location!=='undefined'&&/^https?:$/.test(location.protocol)&&!['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname)?location.origin:'';
const API=String(import.meta.env?.VITE_API_ORIGIN||browserOrigin||'https://www.imsgsource.com').replace(/\/$/,'');
const storefrontStylesReady=import('./storefront-styles.js');
const $=id=>document.getElementById(id);
const mediaCache=new Map();
const GUEST_CART_KEY='imsg.my-list.v1';
const LEGACY_CART_KEY='m-platform.guest-cart.v1';
const POST_AUTH_KEY='m-platform.post-auth-action.v1';
const PAGE_SIZE=20;
const MEDIA_CONCURRENCY=6;
const mediaTasks=new Map();
const PUBLIC_STATE_CACHE_KEY='m-platform.public-state.v3';
const PUBLIC_STATE_CACHE_MAX_AGE=0;
function readCachedPublicState(){
  try{
    const raw=sessionStorage.getItem(PUBLIC_STATE_CACHE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed?.state||typeof parsed.state!=='object'||!Array.isArray(parsed.state.publicOffers))return null;
    if(!Number.isFinite(parsed.savedAt)||Date.now()-parsed.savedAt>PUBLIC_STATE_CACHE_MAX_AGE)return null;
    return parsed;
  }catch{return null;}
}
function writeCachedPublicState(value){
  try{sessionStorage.setItem(PUBLIC_STATE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),state:value}));}catch{}
}
const cachedPublicState=readCachedPublicState();

let lang='ar';
let state=cachedPublicState?.state||null;
let loadTask=null;
let guestUiStylesTask=null;
const ensureGuestUiStyles=()=>guestUiStylesTask||(guestUiStylesTask=import('./guest-ui.js').catch(error=>{guestUiStylesTask=null;throw error;}));
let lastLoadedAt=cachedPublicState?.savedAt||0;
let offersPage=1;
let category='all';
let subcategory='all';
let supplyCountry='all';
let searchText='';
let cartItems=[];

const text={
  ar:{
    tagline:'تصفح المنتجات واطلب عرض سعر.',eyebrow:'منصة شراء وتوريد موثوقة',title:'تصفح المنتجات واطلب عرض سعر.',
    subtitle:'منصة آمنة تربطك بموردين مؤهلين، بينما نتولى مراجعة العروض، التحقق من البضاعة، الترجمة، الشحن الموثوق، ومتابعة الضمان.',
    browse:'تصفح المنتجات',login:'تسجيل الدخول',customer:'إنشاء حساب عميل',supplier:'إنشاء حساب مورد',kicker:'تصفح دون حساب',offers:'المنتجات',
    reload:'تحديث',loading:'جارٍ تحميل المنتجات...',empty:'لا توجد منتجات منشورة حاليًا.',price:'السعر',unitPrice:'سعر الحبة',moq:'الحد الأدنى',
    production:'الإنتاج',days:'يوم',stock:'المخزون',details:'تفاصيل المنتج',back:'العودة للرئيسية',error:'تعذر تحميل المنتجات. تحقق من اتصال الإنترنت.',
    previous:'السابق',next:'التالي',page:'صفحة',companyDescription:'تصفح كتالوج IMSG وأرسل طلب عرض سعر بسهولة دون تسجيل.',
    contact:'تواصل معنا',copyright:'© 2026 IMSG — جميع الحقوق محفوظة',allCategories:'الكل',supplyCountry:'بلد التوريد',allCountries:'الكل',
    search:'ابحث عن منتج أو SKU',quantity:'الكمية',productTotal:'إجمالي هذا المنتج',addCart:'أضف إلى قائمتي',updateCart:'تحديث الكمية في قائمتي',
    added:'تمت إضافة المنتج إلى قائمتي.',cart:'قائمتي',products:'منتجات',total:'الإجمالي',grandTotal:'الإجمالي الكلي',remove:'حذف',
    clearCart:'إفراغ قائمتي',submitOrder:'طلب عرض سعر',emptyCart:'قائمتي فارغة. أضف منتجات من الصفحة الرئيسية.',
    requestTitle:'أرسل طلب جديد',requestDescription:'إذا لم تجد المنتج المناسب، سجّل الدخول وأرسل مواصفاتك.',requestButton:'+ أرسل طلب جديد',
    authCartTitle:'سجّل الدخول لإرسال الطلب',authCartText:'سجّل الدخول أو أنشئ حساب عميل لإرسال الطلب. ستبقى المنتجات والكميات الموجودة في السلة محفوظة.',
    authRequestTitle:'سجّل الدخول لإرسال طلب جديد',authRequestText:'لإرسال مواصفات منتج غير موجود، سجّل الدخول أو أنشئ حساب عميل.',
    createClient:'إنشاء حساب عميل',continueLogin:'تسجيل الدخول',sameCurrency:'يجب أن تكون جميع المنتجات في السلة بنفس العملة.',
    maxProducts:'الحد الأقصى 10 منتجات في الطلب الواحد.',invalidQty:'تحقق من الكمية والحد الأدنى والمخزون.'
  },
  en:{
    tagline:'Browse products and request a quote.',eyebrow:'Trusted sourcing platform',title:'Browse products and request a quote.',
    subtitle:'A secure platform that connects you with qualified suppliers while we handle offer review, product verification, translation, reliable shipping, and warranty follow-up.',
    browse:'Browse products',login:'Sign in',customer:'Create customer account',supplier:'Create supplier account',kicker:'Browse without an account',offers:'Products',
    reload:'Refresh',loading:'Loading products...',empty:'No products are currently published.',price:'Price',unitPrice:'Unit price',moq:'MOQ',
    production:'Production',days:'days',stock:'Stock',details:'Product details',back:'Back to home',error:'Could not load products. Check your internet connection.',
    previous:'Previous',next:'Next',page:'Page',companyDescription:'Browse the IMSG B2B catalog and request quotations without an account.',
    contact:'Contact us',copyright:'© 2026 IMSG — All rights reserved.',allCategories:'All',supplyCountry:'Supply country',allCountries:'All',
    search:'Search products or SKU',quantity:'Quantity',productTotal:'This product total',addCart:'Add to my list',updateCart:'Update quantity in my list',
    added:'Added to my list.',cart:'My list',products:'products',total:'Total',grandTotal:'Grand total',remove:'Remove',
    clearCart:'Clear my list',submitOrder:'Request a quote',emptyCart:'My list is empty. Add products from the home page.',
    requestTitle:'Send a new request',requestDescription:'If you cannot find the right product, sign in and send your specifications.',requestButton:'+ Send new request',
    authCartTitle:'Sign in to submit the order',authCartText:'Sign in or create a customer account to submit the order. Your cart products and quantities will be preserved.',
    authRequestTitle:'Sign in to send a new request',authRequestText:'To request a product that is not listed, sign in or create a customer account.',
    createClient:'Create customer account',continueLogin:'Sign in',sameCurrency:'All products in the cart must use the same currency.',
    maxProducts:'Maximum 10 products per cart order.',invalidQty:'Check quantity, MOQ, and stock.'
  }
};
const t=k=>text[lang][k]||k;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ref=o=>o?.displayNo||String(o?.id||'').slice(0,8)||'—';
const title=o=>{const x=o?.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||o?.product||o?.title||`#${ref(o)}`;};
const description=o=>{const x=o?.translation||{};return (lang==='ar'?(x.descriptionAr||x.descriptionEn):(x.descriptionEn||x.descriptionAr))||o?.specs||'';};
const money=(value,currency)=>formatStoreMoney(value,currency,lang);
const categories=()=>categoryRows(state?.settings);
const subcategories=(parentId='')=>subcategoryRows(state?.settings,{parentId});
const countries=()=>supplyCountryRows(state?.settings);
const publishedOffers=()=>Array.isArray(state?.publicOffers)?state.publicOffers.filter(o=>o.status==='published'):[];
const filteredOffers=()=>{
  let offers=publishedOffers();
  if(category!=='all')offers=offers.filter(o=>o.categoryId===category);
  if(subcategory!=='all')offers=offers.filter(o=>o.subcategoryId===subcategory);
  if(supplyCountry!=='all')offers=offers.filter(o=>o.country===supplyCountry);
  const q=searchText.trim().toLowerCase();
  if(q)offers=offers.filter(o=>[o.sku,title(o),description(o),o.country].filter(Boolean).join(' ').toLowerCase().includes(q));
  return offers;
};

function loadCart(){
  cartItems=[];
  try{
    const rows=JSON.parse(localStorage.getItem(GUEST_CART_KEY)||localStorage.getItem(LEGACY_CART_KEY)||'[]');
    if(Array.isArray(rows))cartItems=rows.filter(x=>x&&typeof x.offerId==='string'&&Number.isInteger(Number(x.quantity))&&Number(x.quantity)>0).slice(0,100).map(x=>({offerId:x.offerId,quantity:Number(x.quantity),snapshot:x.snapshot||null}));
  }catch{}
  updateCartBadge();
}
function saveCart(){
  try{localStorage.setItem(GUEST_CART_KEY,JSON.stringify(cartItems));}catch{}
  updateCartBadge();
}
function updateCartBadge(){
  const count=cartItems.length,badge=$('guestCartCount');
  document.querySelectorAll('#guest-storefront [data-store-cart-count], #site-header [data-store-cart-count]').forEach(el=>el.textContent=String(count));
  if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('hidden',!count);}
}
function cartRows(){
  return cartItems.map(item=>{
    const offer=publishedOffers().find(o=>o.id===item.offerId)||item.snapshot;
    if(!offer)return null;
    return {item,offer,quantity:Number(item.quantity)};
  }).filter(Boolean);
}
function setCartQuantity(offerId,quantity){
  const item=cartItems.find(x=>x.offerId===offerId);
  const offer=publishedOffers().find(o=>o.id===offerId)||item?.snapshot;
  if(!item||!offer)return false;
  const q=Number(quantity),moq=Math.max(1,Math.ceil(Number(offer.moq)||1));
  if(!Number.isSafeInteger(q)||q<moq||q>1000000000)return false;
  item.quantity=q;saveCart();return true;
}
function addToCart(offer,quantity){
  if(!offer||offer.status!=='published')throw new Error(t('empty'));
  const existing=cartItems.find(x=>x.offerId===offer.id);
  const q=quantity==null&&existing?existing.quantity:Number(quantity??offer.moq??1);
  const moq=Math.max(1,Math.ceil(Number(offer.moq)||1));
  if(!Number.isSafeInteger(q)||q<moq||q>1000000000)throw new Error(t('invalidQty'));
  if(!existing&&cartItems.length>=100)throw new Error(lang==='en'?'The limit is 100 products per quote.':'الحد الأقصى 100 منتج في طلب عرض السعر.');
  const snapshot={id:offer.id,status:'published',sku:offer.sku||'',product:offer.product||'',moq:offer.moq||1,translation:offer.translation||{},images:(offer.images||[]).slice(0,1)};
  if(existing){existing.quantity=q;existing.snapshot=snapshot;}
  else cartItems.push({offerId:offer.id,quantity:q,snapshot});
  saveCart();
  aiChatSignal('cart_add',{productId:offer.id,productSku:offer.sku||'',productTitle:title(offer),moq:Number(offer.moq)||0,quantity:q,cartCount:cartItems.length});
}

function renderCategories(){
  const rows=categories();
  if(category!=='all'&&!rows.some(cat=>cat.id===category))category='all';
  catalogNode('guestCategoryFilters').innerHTML=rows.length?`<button type="button" data-guest-category="all" class="${category==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(cat=>`<button type="button" data-guest-category="${esc(cat.id)}" class="${category===cat.id?'active':''}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</button>`).join('')}`:'';
  catalogNode('guestCategoryFilters').classList.toggle('hidden',!rows.length);
}
function renderSubcategories(){
  let el=catalogNode('guestSubcategoryFilters');if(!el)return;
  const available=new Set(publishedOffers().filter(o=>category==='all'||o.categoryId===category).map(o=>o.subcategoryId).filter(Boolean));
  const rows=category==='all'?[]:subcategories(category).filter(x=>available.has(x.id));
  if(subcategory!=='all'&&!rows.some(x=>x.id===subcategory))subcategory='all';
  el.innerHTML=rows.length?`<button type="button" data-guest-subcategory="all" class="${subcategory==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(x=>`<button type="button" data-guest-subcategory="${esc(x.id)}" class="${subcategory===x.id?'active':''}">${esc(taxonomyLabel(x,lang))}</button>`).join('')}`:'';
  el.classList.toggle('hidden',!rows.length);
}
function renderCountries(){
  const available=new Set(publishedOffers().map(o=>o.country)),rows=countries().filter(x=>available.has(x.id));
  if(supplyCountry!=='all'&&!rows.some(x=>x.id===supplyCountry))supplyCountry='all';
  catalogNode('guestSupplyCountryFilters').innerHTML=rows.length?`<span>${esc(t('supplyCountry'))}</span><button type="button" data-guest-country="all" class="${supplyCountry==='all'?'active':''}">${esc(t('allCountries'))}</button>${rows.map(x=>`<button type="button" data-guest-country="${esc(x.id)}" class="${supplyCountry===x.id?'active':''}">${esc(taxonomyLabel(x,lang))}</button>`).join('')}`:'';
  catalogNode('guestSupplyCountryFilters').classList.toggle('hidden',!rows.length);
}

function apply(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 if(state)renderOffers();else renderLoading();
 updateCartBadge();
}
const register=role=>window.dispatchEvent(new CustomEvent('mplatform:register',{detail:{role}}));
const catalog=document.createElement('section');catalog.id='guestOffersSection';
catalog.innerHTML=`<label class="product-search-bar guest-product-search"><input id="guestProductSearch" type="search"></label><div id="guestCategoryFilters" class="category-filter-bar"></div><div id="guestSubcategoryFilters" class="category-filter-bar"></div><div id="guestSupplyCountryFilters" class="supply-country-filter"></div><div id="guestOffers" class="sf-products"></div><nav id="guestOffersPagination" class="product-pagination"><button id="guestPrevPage"></button><span id="guestPageInfo"></span><button id="guestNextPage"></button></nav>`;
const catalogNode=id=>catalog.querySelector('#'+id);
function loadingSkeleton(){
  const cards=Array.from({length:6},()=>`<article class="catalog-skeleton-card"><span class="catalog-skeleton-piece catalog-skeleton-image"></span><span class="catalog-skeleton-piece catalog-skeleton-line"></span><span class="catalog-skeleton-piece catalog-skeleton-line short"></span></article>`).join('');
  return `<div class="sf-loading-shell" aria-busy="true"><span class="sr-only" role="status">${esc(t('loading'))}</span><div class="boot-skeleton boot-hero"></div><div class="catalog-skeleton-grid">${cards}</div></div>`;
}
function renderLoading(error=false){
  if(!error){$('guest-storefront').innerHTML=loadingSkeleton();return;}
  $('guest-storefront').innerHTML=`<div class="sf-loading" role="alert"><strong>IMSG</strong><p>${esc(t('error'))}</p><button id="guestRetry">${esc(t('reload'))}</button></div>`;
  document.getElementById('guestRetry')?.addEventListener('click',()=>void load());
}

async function api(path){
  const r=await fetch(API+path,{credentials:'omit',headers:{'X-M-Client':'native'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
}
async function aiSend(body){
  const r=await fetch(API+'/api/v1/ai-chat',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify(body)});
  let data={};try{data=await r.json();}catch{}
  if(!r.ok)throw new Error(data?.error||t('error'));
  return data;
}
async function aiConversation(params={}){
  const q=new URLSearchParams({conversationId:String(params.conversationId||''),guestKey:String(params.guestKey||''),language:String(params.language||lang)});
  const r=await fetch(API+'/api/v1/ai-conversation?'+q.toString(),{credentials:'omit',headers:{'X-M-Client':'native'}});
  let data={};try{data=await r.json();}catch{}
  if(!r.ok)throw new Error(data?.error||t('error'));
  return data;
}
async function aiLead(body){
  const r=await fetch(API+'/api/v1/ai-conversation',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify(body)});
  let data={};try{data=await r.json();}catch{}
  if(!r.ok)throw new Error(data?.error||t('error'));
  return data;
}
async function aiConversion(body){
  const r=await fetch(API+'/api/v1/ai-conversion',{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify(body)});
  let data={};try{data=await r.json();}catch{}
  if(!r.ok)throw new Error(data?.error||t('error'));
  return data;
}
let aiModule=null,aiTask=null,aiIdleHandle=null;
function loadAiModule(){
  if(aiModule)return Promise.resolve(aiModule);
  if(!aiTask)aiTask=import('./ai-chat.js').then(mod=>(aiModule=mod)).finally(()=>{aiTask=null;});
  return aiTask;
}
function aiChatSignal(...args){
  if(aiModule){aiModule.aiChatSignal(...args);return;}
  const type=String(args[0]||'');
  if(type==='cart_add'||type==='checkout_started')void loadAiModule().then(mod=>mod.aiChatSignal(...args)).catch(()=>{});
}
async function mountGuestAiChat(){
  const mod=await loadAiModule();
  if(!$('guestView').classList.contains('hidden'))mod.mountAiChat({mode:'guest',language:()=>lang,send:aiSend,fetchConversation:aiConversation,captureLead:aiLead,trackConversion:aiConversion});
}
function scheduleGuestAiChat(){
  if(aiIdleHandle)return;
  const start=()=>{aiIdleHandle=null;void mountGuestAiChat();};
  if('requestIdleCallback' in window)aiIdleHandle=requestIdleCallback(start,{timeout:2200});
  else aiIdleHandle=setTimeout(start,1400);
}
function unmountGuestAiChat(){
  if(aiIdleHandle){
    if('cancelIdleCallback' in window)cancelIdleCallback(aiIdleHandle);else clearTimeout(aiIdleHandle);
    aiIdleHandle=null;
  }
  aiModule?.unmountAiChat();
}
async function imageUrl(src){
  if(mediaCache.has(src))return mediaCache.get(src);
  if(mediaTasks.has(src))return mediaTasks.get(src);
  const task=(async()=>{
    const path=src.replace(/^\/api\/media\//,'/api/v1/media/');
    const r=await fetch(API+path,{credentials:'omit',headers:{'X-M-Client':'native'}});if(!r.ok)return '';
    const url=URL.createObjectURL(await r.blob());mediaCache.set(src,url);return url;
  })().catch(()=> '').finally(()=>mediaTasks.delete(src));
  mediaTasks.set(src,task);return task;
}
async function hydrateImages(root=catalogNode('guestOffers'),attribute='data-media'){
  const images=[...root.querySelectorAll(`img[${attribute}]:not([data-loaded])`)];
  if(!Capacitor.isNativePlatform()){
    for(const img of images)img.dataset.loaded='1';
    return;
  }
  let cursor=0;
  const worker=async()=>{while(cursor<images.length){const img=images[cursor++];img.dataset.loaded='1';const src=img.getAttribute(attribute),url=await imageUrl(src);if(url&&img.isConnected)img.src=url;}};
  await Promise.all(Array.from({length:Math.min(MEDIA_CONCURRENCY,images.length)},worker));
}
function offerCard(o){return storeProductCard(o,homeConfig(state?.settings),money);}
function renderOffers(){
  renderCategories();renderSubcategories();renderCountries();
  const offers=filteredOffers(),totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  offersPage=Math.min(Math.max(offersPage,1),totalPages);
  const pageOffers=offers.slice((offersPage-1)*PAGE_SIZE,offersPage*PAGE_SIZE);
  catalogNode('guestOffers').innerHTML=pageOffers.length?pageOffers.map(offerCard).join(''):`<div class="guest-empty">${esc(t('empty'))}</div>`;
  catalogNode('guestPageInfo').textContent=`${t('page')} ${offersPage} / ${totalPages}`;
  catalogNode('guestPrevPage').disabled=offersPage<=1;catalogNode('guestNextPage').disabled=offersPage>=totalPages;
  catalogNode('guestOffersPagination').classList.toggle('hidden',offers.length<=PAGE_SIZE);
  mountGuestStore();hydrateImages();
}
function mountGuestStore(){
 if(!state)return;const h=homeConfig(state.settings),host=$('guest-storefront');
 catalog.remove();host.innerHTML=renderStorefront(state,'web',{chrome:false,money,cartCount:cartItems.length});
 if($('appView').classList.contains('hidden'))mountSiteChrome(state,{cartCount:cartItems.length},{hydrate:hydrateImages,action:guestChromeAction});
 catalogNode('guestProductSearch').placeholder=t('search');catalogNode('guestProductSearch').setAttribute('aria-label',t('search'));catalogNode('guestPrevPage').textContent=t('previous');catalogNode('guestNextPage').textContent=t('next');
 catalog.querySelector('.guest-product-search').hidden=!h.showSearch;
 catalogNode('guestCategoryFilters').hidden=!h.showCategories;catalogNode('guestSubcategoryFilters').hidden=!h.showCategories;catalogNode('guestSupplyCountryFilters').hidden=!h.showCountries;
 bindStorefront(host,state,{chrome:false,observe:aiChatSignal,money,hydrate:hydrateImages,product:openOffer,add:(id,quantity)=>{try{const p=publishedOffers().find(p=>p.id===id);addToCart(p,quantity);showGuestToast(t('added'));}catch(e){showGuestToast(e.message);}},page:(title,html)=>{$('modalTitle').textContent=title;$('modalKicker').textContent='';$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');},category:id=>{category=id;renderOffers();},catalog:()=>catalog.isConnected&&catalog.scrollIntoView({behavior:'smooth'}),action:action=>{if(action==='cart')openGuestCart();if(action==='login')showLogin();if(action==='request')openGuestCart();if(action==='register-client')register('client');if(action==='register-supplier')register('supplier');if(action==='language')toggleLanguage();if(action==='home')host.scrollIntoView({behavior:'smooth'});}});
 hydrateImages(host);
}
async function load(){
  if(loadTask)return loadTask;
  if(!state)renderLoading();
  loadTask=(async()=>{
    try{
      const route=new URLSearchParams(location.search),query=new URLSearchParams();
      for(const key of ['product','page','category','q'])if(route.get(key))query.set(key,route.get(key));
      const next=await api('/api/v1/state'+(query.size?'?'+query.toString():''));
      await storefrontStylesReady;
      state=next;lastLoadedAt=Date.now();writeCachedPublicState(next);
      // Keep My List across route-scoped product fetches. Route changes are not deletions.
       for(const row of cartItems){const found=publishedOffers().find(x=>x.id===row.offerId);if(found)row.snapshot={id:found.id,status:'published',sku:found.sku||'',product:found.product||'',moq:found.moq||1,translation:found.translation||{},images:(found.images||[]).slice(0,1)};}saveCart();
      offersPage=1;renderOffers();
    }catch(error){
      console.error(error);
      if(!state)renderLoading(true);
    }finally{loadTask=null;}
  })();
  return loadTask;
}
function ensureLoaded(){
  if(loadTask)return;
  if(!state||Date.now()-lastLoadedAt>30000)void load();
}

function showGuest(){if(location.pathname!=='/'){location.assign('/?store=1');return;}showView('guestView');}
function showLogin(){if(Capacitor.isNativePlatform())showView('loginView');else location.assign('/customer.html?returnTo='+encodeURIComponent(location.pathname+location.search));}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';}
function openOffer(id){location.assign('/?product='+encodeURIComponent(id));}
function showGuestToast(message){
  const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.remove('hidden');clearTimeout(showGuestToast.t);showGuestToast.t=setTimeout(()=>toast.classList.add('hidden'),2200);
}
async function requireCustomerAuth(action){
  await ensureGuestUiStyles();
  const isCart=action==='open-cart';
  try{localStorage.setItem(POST_AUTH_KEY,action);}catch{}
  $('modalKicker').textContent='IMSG';$('modalTitle').textContent=isCart?t('authCartTitle'):t('authRequestTitle');
  $('modalBody').innerHTML=`<section class="guest-auth-required"><p>${esc(isCart?t('authCartText'):t('authRequestText'))}</p><div class="guest-auth-required-actions"><button class="secondary-btn" type="button" data-guest-auth-login>${esc(t('continueLogin'))}</button><button class="primary-btn" type="button" data-guest-auth-register>${esc(t('createClient'))}</button></div></section>`;
  $('modal').classList.remove('hidden');
}
let pendingRfqKey='';
function quoteButtonLabel(){return lang==='en'?'Request a quote':'طلب عرض سعر';}
async function openGuestCart(){
 await ensureGuestUiStyles();
 const rows=cartRows();
 $('modalKicker').textContent='IMSG';
 $('modalTitle').textContent=t('cart');
 if(!rows.length){$('modalBody').innerHTML='<div class="empty-state cart-empty"><p>'+esc(t('emptyCart'))+'</p></div>';$('modal').classList.remove('hidden');return;}
 $('modalBody').innerHTML='<div class="imsg-rfq-list">'+rows.map(row=>{
  const o=row.offer,image=o.images?.[0]||'',moq=Math.max(1,Math.ceil(Number(o.moq)||1));
  return '<article class="imsg-rfq-row"><a href="/?product='+encodeURIComponent(row.item.offerId)+'">'+(image?'<img alt="" src="'+esc(image)+'" loading="lazy">':'')+'</a><div class="imsg-rfq-product"><strong>'+esc(title(o))+'</strong><small>'+esc(o.sku||'')+' · MOQ '+moq+'</small><label>'+esc(t('quantity'))+' <button type="button" data-guest-cart-step="-1" data-guest-cart-item="'+esc(row.item.offerId)+'" aria-label="'+(lang==='en'?'Decrease quantity':'تقليل الكمية')+'">−</button><input type="number" data-guest-cart-qty="'+esc(row.item.offerId)+'" min="'+moq+'" value="'+row.quantity+'" step="1"><button type="button" data-guest-cart-step="1" data-guest-cart-item="'+esc(row.item.offerId)+'" aria-label="'+(lang==='en'?'Increase quantity':'زيادة الكمية')+'">+</button></label></div><button type="button" data-guest-cart-remove="'+esc(row.item.offerId)+'" class="danger-text">'+esc(t('remove'))+'</button></article>';
 }).join('')+'</div><div class="cart-actions"><button type="button" class="secondary-btn" data-guest-cart-clear>'+esc(t('clearCart'))+'</button><button type="button" class="primary-btn" data-rfq-continue>'+esc(quoteButtonLabel())+'</button></div>';
 $('modal').classList.remove('hidden');
 $('modalBody').querySelectorAll('[data-guest-cart-qty]').forEach(input=>input.addEventListener('change',()=>{
  if(!setCartQuantity(input.dataset.guestCartQty,Number(input.value))){showGuestToast(t('invalidQty'));}void openGuestCart();
 }));
 $('modalBody').querySelectorAll('[data-guest-cart-step]').forEach(button=>button.addEventListener('click',()=>{const item=cartItems.find(x=>x.offerId===button.dataset.guestCartItem);if(!item)return;const changed=setCartQuantity(item.offerId,item.quantity+Number(button.dataset.guestCartStep));if(!changed)showGuestToast(t('invalidQty'));void openGuestCart();}));
 $('modalBody').querySelectorAll('[data-guest-cart-remove]').forEach(button=>button.addEventListener('click',()=>{cartItems=cartItems.filter(x=>x.offerId!==button.dataset.guestCartRemove);saveCart();void openGuestCart();}));
 $('modalBody').querySelector('[data-guest-cart-clear]').addEventListener('click',()=>{cartItems=[];saveCart();void openGuestCart();});
 $('modalBody').querySelector('[data-rfq-continue]').addEventListener('click',openGuestRfqForm);
}
async function openGuestRfqForm(){
 await ensureGuestUiStyles();
 const rows=cartRows();if(!rows.length){void openGuestCart();return;}
 const ar=lang==='ar',label=(a,e)=>ar?a:e;
 $('modalKicker').textContent=t('cart');$('modalTitle').textContent=quoteButtonLabel();
 $('modalBody').innerHTML='<form id="imsg-rfq-form" class="form-stack imsg-rfq-form">'+
 '<div class="imsg-rfq-summary"><strong>'+label('المنتجات المختارة','Selected products')+' ('+rows.length+')</strong><div>'+rows.map(x=>'<div class="imsg-rfq-summary-line">'+(x.offer.images?.[0]?'<img alt="" src="'+esc(x.offer.images[0])+'" loading="lazy">':'')+'<span>'+esc(title(x.offer))+' · '+esc(x.offer.sku||'')+' — '+x.quantity+'</span></div>').join('')+'</div></div>'+
 '<label>'+label('الاسم *','Name *')+'<input name="name" autocomplete="name" maxlength="140" minlength="2" required></label>'+
 '<label>'+label('رقم واتساب *','WhatsApp number *')+'<div class="imsg-rfq-phone"><select name="dial" aria-label="'+label('مفتاح الدولة','Country code')+'"><option value="+966">+966</option><option value="+971">+971</option><option value="+967">+967</option><option value="+965">+965</option><option value="+974">+974</option><option value="+968">+968</option><option value="+973">+973</option><option value="+20">+20</option><option value="+86">+86</option><option value="+60">+60</option><option value="+1">+1</option><option value="+44">+44</option></select><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="5XXXXXXXX" required></div></label>'+
 '<label>'+label('الدولة *','Country *')+'<input name="country" maxlength="120" required value="'+label('السعودية','Saudi Arabia')+'"></label>'+
 '<label>'+label('اسم الشركة أو المتجر (اختياري)','Company or store (optional)')+'<input name="company" maxlength="200"></label>'+
 '<label>'+label('ملاحظات إضافية (اختياري)','Additional notes (optional)')+'<textarea name="notes" rows="3" maxlength="2000"></textarea></label>'+
 '<p class="imsg-rfq-error" data-rfq-message role="status" aria-live="polite"></p><button class="primary-btn" type="submit">'+label('إرسال طلب عرض السعر','Submit quote request')+'</button></form>';
 $('modal').classList.remove('hidden');
 $('imsg-rfq-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('[type="submit"]'),message=form.querySelector('[data-rfq-message]');
  if(button.disabled)return;
  const fd=new FormData(form);
  const national=String(fd.get('phone')||'').replace(/[\s()\-.]/g,'').replace(/^0+/,'');
  const whatsapp=String(fd.get('dial'))+national;
  if(!/^\+[1-9]\d{7,14}$/.test(whatsapp)){message.textContent=label('أدخل رقم واتساب صحيحًا','Enter a valid WhatsApp number');return;}
  if(!pendingRfqKey)pendingRfqKey=crypto.randomUUID();
  button.disabled=true;message.textContent=label('جارٍ إرسال الطلب...','Sending request...');
  try{
   const response=await fetch(API+'/api/v1/rfq',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    customer:{name:fd.get('name'),whatsapp,country:fd.get('country'),company:fd.get('company')},
    notes:fd.get('notes'),idempotencyKey:pendingRfqKey,source:'website',items:cartRows().map(x=>({offerId:x.item.offerId,quantity:x.quantity}))
   })});
   let result={};try{result=await response.json();}catch{}
   if(!response.ok||!result.number)throw new Error(result.error||label('تعذر حفظ الطلب، حاول مرة أخرى','Unable to save the request'));
   cartItems=[];saveCart();pendingRfqKey='';
   $('modalKicker').textContent='IMSG';$('modalTitle').textContent=label('تم الإرسال بنجاح','Request received');
   $('modalBody').innerHTML='<section class="imsg-rfq-success"><h3>'+esc(result.number)+'</h3><p>'+label('تم استلام طلب عرض السعر بنجاح. سيتواصل معك فريق IMSG عبر واتساب قريبًا.','Your quote request was received. The IMSG team will contact you via WhatsApp soon.')+'</p><button type="button" class="primary-btn" data-rfq-finish>'+label('إغلاق','Close')+'</button></section>';
   $('modalBody').querySelector('[data-rfq-finish]').addEventListener('click',closeModal);
  }catch(error){message.textContent=error.message||label('تعذر الإرسال','Submission failed');button.disabled=false;}
 });
}

$('backToGuestBtn').addEventListener('click',showGuest);
catalogNode('guestPrevPage').addEventListener('click',()=>{if(offersPage>1){offersPage--;renderOffers();catalog.scrollIntoView({behavior:'smooth',block:'start'});}});
catalogNode('guestNextPage').addEventListener('click',()=>{const total=Math.max(1,Math.ceil(filteredOffers().length/PAGE_SIZE));if(offersPage<total){offersPage++;renderOffers();catalog.scrollIntoView({behavior:'smooth',block:'start'});}});
catalogNode('guestProductSearch').addEventListener('input',e=>{searchText=e.target.value;offersPage=1;renderOffers();aiChatSignal('search',{query:searchText,results:filteredOffers().length});});
onLanguageChange(value=>{lang=value;apply();if(!$('guestView').classList.contains('hidden'))scheduleGuestAiChat();});
catalogNode('guestCategoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-guest-category]');if(!b)return;category=b.dataset.guestCategory;subcategory='all';offersPage=1;renderOffers();});
catalogNode('guestSubcategoryFilters')?.addEventListener('click',e=>{const b=e.target.closest('[data-guest-subcategory]');if(!b)return;subcategory=b.dataset.guestSubcategory;offersPage=1;renderOffers();});
catalogNode('guestSupplyCountryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-guest-country]');if(!b)return;supplyCountry=b.dataset.guestCountry;offersPage=1;renderOffers();});
catalogNode('guestOffers').addEventListener('click',e=>{const card=e.target.closest('[data-guest-offer]');if(card)openOffer(card.dataset.guestOffer);});
$('modal').addEventListener('click',e=>{
  if(e.target.closest('[data-close-modal]')){closeModal();return;}
  if(e.target.closest('[data-guest-auth-login]')){closeModal();showLogin();return;}
  if(e.target.closest('[data-guest-auth-register]')){closeModal();register('client');return;}
});
window.addEventListener('mplatform:view',e=>{
  const view=e.detail?.id;
  if(['guestView','loginView','registerView','resetView','sessionView'].includes(view)){
    loadCart();ensureLoaded();if(state)mountSiteChrome(state,{cartCount:cartItems.length},{hydrate:hydrateImages,action:guestChromeAction});
  }
  if(view==='guestView')scheduleGuestAiChat();
  else if(['loginView','registerView','resetView','sessionView'].includes(view))unmountGuestAiChat();
});

(async()=>{
  await languageReady;lang=getLanguage();loadCart();apply();
  let hasWebSession=false;
  for(const name of ['localStorage','sessionStorage']){
    if(hasWebSession)break;
    try{hasWebSession=!!globalThis[name]?.getItem('m-platform.session.v1');}catch{}
  }
  const publicWeb=!Capacitor.isNativePlatform()&&!['/admin','/admin.html','/studio.html','/customer','/customer.html','/supplier','/supplier.html','/login.html','/reset-password.html','/register-customer.html','/register-supplier.html'].includes(location.pathname);
  if(publicWeb)showView('guestView');
  if(!$('guestView').classList.contains('hidden')){ensureLoaded();scheduleGuestAiChat();}
})();

function guestChromeAction(action){if(action==='cart')openGuestCart();if(action==='login')showLogin();if(action==='register-supplier')register('supplier');if(action==='register-client')register('client');if(action==='language')toggleLanguage();}

