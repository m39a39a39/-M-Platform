import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';

const API=String(import.meta.env?.VITE_API_ORIGIN||'https://m-platform-tan.vercel.app').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const mediaCache=new Map();
const GUEST_CART_KEY='m-platform.guest-cart.v1';
const POST_AUTH_KEY='m-platform.post-auth-action.v1';
const PAGE_SIZE=20;
const MEDIA_CONCURRENCY=6;
const mediaTasks=new Map();
const SUPPLY_COUNTRIES=[
  ['China','الصين','China'],
  ['United Arab Emirates','الإمارات','UAE']
];

let lang='ar';
let state=null;
let loadTask=null;
let offersPage=1;
let category='all';
let supplyCountry='all';
let searchText='';
let cartItems=[];

const text={
  ar:{
    tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',eyebrow:'منصة شراء وتوريد موثوقة',title:'اطلب ما تحتاجه، وقارن العروض بثقة.',
    subtitle:'منصة آمنة تربطك بموردين مؤهلين، بينما نتولى مراجعة العروض، التحقق من البضاعة، الترجمة، الشحن الموثوق، ومتابعة الضمان.',
    browse:'تصفح المنتجات',login:'تسجيل الدخول',customer:'إنشاء حساب عميل',supplier:'إنشاء حساب مورد',kicker:'تصفح دون حساب',offers:'المنتجات',
    reload:'تحديث',loading:'جارٍ تحميل المنتجات...',empty:'لا توجد منتجات منشورة حاليًا.',price:'السعر',unitPrice:'سعر الحبة',moq:'الحد الأدنى',
    production:'الإنتاج',days:'يوم',stock:'المخزون',details:'تفاصيل المنتج',back:'العودة للرئيسية',error:'تعذر تحميل المنتجات. تحقق من اتصال الإنترنت.',
    previous:'السابق',next:'التالي',page:'صفحة',companyDescription:'منصة تساعدك في طلب المنتجات، مقارنة العروض، ومتابعة التوريد بسهولة.',
    contact:'تواصل معنا',copyright:'© 2026 MIG COMPANY — جميع الحقوق محفوظة',allCategories:'الكل',supplyCountry:'بلد التوريد',allCountries:'الكل',
    search:'ابحث عن منتج أو SKU',quantity:'الكمية',productTotal:'إجمالي هذا المنتج',addCart:'إضافة إلى السلة',updateCart:'تحديث الكمية في السلة',
    added:'تمت إضافة المنتج إلى السلة.',cart:'سلة الطلب',products:'منتجات',total:'الإجمالي',grandTotal:'الإجمالي الكلي',remove:'حذف',
    clearCart:'إفراغ السلة',submitOrder:'إرسال الطلب',emptyCart:'السلة فارغة. أضف منتجات من الصفحة الرئيسية.',
    requestTitle:'أرسل طلب جديد',requestDescription:'إذا لم تجد المنتج المناسب، سجّل الدخول وأرسل مواصفاتك.',requestButton:'+ أرسل طلب جديد',
    authCartTitle:'سجّل الدخول لإرسال الطلب',authCartText:'سجّل الدخول أو أنشئ حساب عميل لإرسال الطلب. ستبقى المنتجات والكميات الموجودة في السلة محفوظة.',
    authRequestTitle:'سجّل الدخول لإرسال طلب جديد',authRequestText:'لإرسال مواصفات منتج غير موجود، سجّل الدخول أو أنشئ حساب عميل.',
    createClient:'إنشاء حساب عميل',continueLogin:'تسجيل الدخول',sameCurrency:'يجب أن تكون جميع المنتجات في السلة بنفس العملة.',
    maxProducts:'الحد الأقصى 10 منتجات في الطلب الواحد.',invalidQty:'تحقق من الكمية والحد الأدنى والمخزون.'
  },
  en:{
    tagline:'Request what you need, and compare offers with confidence.',eyebrow:'Trusted sourcing platform',title:'Request what you need, and compare offers with confidence.',
    subtitle:'A secure platform that connects you with qualified suppliers while we handle offer review, product verification, translation, reliable shipping, and warranty follow-up.',
    browse:'Browse products',login:'Sign in',customer:'Create customer account',supplier:'Create supplier account',kicker:'Browse without an account',offers:'Products',
    reload:'Refresh',loading:'Loading products...',empty:'No products are currently published.',price:'Price',unitPrice:'Unit price',moq:'MOQ',
    production:'Production',days:'days',stock:'Stock',details:'Product details',back:'Back to home',error:'Could not load products. Check your internet connection.',
    previous:'Previous',next:'Next',page:'Page',companyDescription:'A platform that helps you request products, compare offers, and follow your sourcing process with ease.',
    contact:'Contact us',copyright:'© 2026 MIG COMPANY — All rights reserved.',allCategories:'All',supplyCountry:'Supply country',allCountries:'All',
    search:'Search products or SKU',quantity:'Quantity',productTotal:'This product total',addCart:'Add to cart',updateCart:'Update quantity in cart',
    added:'Product added to cart.',cart:'Order cart',products:'products',total:'Total',grandTotal:'Grand total',remove:'Remove',
    clearCart:'Clear cart',submitOrder:'Submit order',emptyCart:'Your cart is empty. Add products from the home page.',
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
const money=(value,currency)=>{const n=Number(value);if(!Number.isFinite(n))return `${currency||''} —`.trim();return `${String(currency||'').toUpperCase()} ${n.toLocaleString(lang==='ar'?'en-US':'en-US',{maximumFractionDigits:4})}`.trim();};
const categories=()=>{const rows=Array.isArray(state?.settings?.categories)?state.settings.categories:[];return rows.filter(cat=>cat.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));};
const countryLabel=value=>{const row=SUPPLY_COUNTRIES.find(x=>x[0]===value);return row?(lang==='ar'?row[1]:row[2]):value||'—';};
const publishedOffers=()=>Array.isArray(state?.publicOffers)?state.publicOffers.filter(o=>o.status==='published'):[];
const filteredOffers=()=>{
  let offers=publishedOffers();
  if(category!=='all')offers=offers.filter(o=>o.categoryId===category);
  if(supplyCountry!=='all')offers=offers.filter(o=>o.country===supplyCountry);
  const q=searchText.trim().toLowerCase();
  if(q)offers=offers.filter(o=>[o.sku,title(o),description(o),o.country].filter(Boolean).join(' ').toLowerCase().includes(q));
  return offers;
};

function loadCart(){
  cartItems=[];
  try{
    const rows=JSON.parse(localStorage.getItem(GUEST_CART_KEY)||'[]');
    if(Array.isArray(rows))cartItems=rows.filter(x=>x&&typeof x.offerId==='string'&&Number.isInteger(Number(x.quantity))&&Number(x.quantity)>0).slice(0,10).map(x=>({offerId:x.offerId,quantity:Number(x.quantity)}));
  }catch{}
  updateCartBadge();
}
function saveCart(){
  try{localStorage.setItem(GUEST_CART_KEY,JSON.stringify(cartItems));}catch{}
  updateCartBadge();
}
function updateCartBadge(){
  const count=cartItems.length,badge=$('guestCartCount');
  if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('hidden',!count);}
}
function cartRows(){
  return cartItems.map(item=>{
    const offer=publishedOffers().find(o=>o.id===item.offerId);if(!offer)return null;
    const quantity=Number(item.quantity),unitPrice=Number(offer.unitPrice);
    return {item,offer,quantity,unitPrice,total:quantity*unitPrice,currency:String(offer.currency||'').toUpperCase()};
  }).filter(Boolean);
}
function cartCurrency(){return cartRows()[0]?.currency||'';}
function setCartQuantity(offerId,quantity){
  const item=cartItems.find(x=>x.offerId===offerId),offer=publishedOffers().find(o=>o.id===offerId);if(!item||!offer)return false;
  const q=Number(quantity),moq=Math.max(1,Math.ceil(Number(offer.moq)||1)),stock=Number(offer.stock);
  if(!Number.isInteger(q)||q<moq||(Number.isFinite(stock)&&stock>0&&q>stock))return false;
  item.quantity=q;saveCart();return true;
}
function addToCart(offer,quantity){
  const q=Number(quantity),moq=Math.max(1,Math.ceil(Number(offer?.moq)||1)),stock=Number(offer?.stock);
  if(!offer||offer.status!=='published')throw new Error(t('empty'));
  if(!Number.isInteger(q)||q<moq||(Number.isFinite(stock)&&stock>0&&q>stock))throw new Error(t('invalidQty'));
  const current=cartCurrency(),currency=String(offer.currency||'').toUpperCase();
  if(current&&current!==currency)throw new Error(t('sameCurrency'));
  const existing=cartItems.find(x=>x.offerId===offer.id);
  if(!existing&&cartItems.length>=10)throw new Error(t('maxProducts'));
  if(existing)existing.quantity=q;else cartItems.push({offerId:offer.id,quantity:q});
  saveCart();
}

function renderCategories(){
  const rows=categories();
  if(category!=='all'&&!rows.some(cat=>cat.id===category))category='all';
  $('guestCategoryFilters').innerHTML=rows.length?`<button type="button" data-guest-category="all" class="${category==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(cat=>`<button type="button" data-guest-category="${esc(cat.id)}" class="${category===cat.id?'active':''}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</button>`).join('')}`:'';
  $('guestCategoryFilters').classList.toggle('hidden',!rows.length);
}
function renderCountries(){
  const available=new Set(publishedOffers().map(o=>o.country));
  const rows=SUPPLY_COUNTRIES.filter(x=>available.has(x[0]));
  if(supplyCountry!=='all'&&!rows.some(x=>x[0]===supplyCountry))supplyCountry='all';
  $('guestSupplyCountryFilters').innerHTML=rows.length?`<span>${esc(t('supplyCountry'))}</span><button type="button" data-guest-country="all" class="${supplyCountry==='all'?'active':''}">${esc(t('allCountries'))}</button>${rows.map(x=>`<button type="button" data-guest-country="${esc(x[0])}" class="${supplyCountry===x[0]?'active':''}">${esc(lang==='ar'?x[1]:x[2])}</button>`).join('')}`:'';
  $('guestSupplyCountryFilters').classList.toggle('hidden',!rows.length);
}

function apply(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  $('guestTagline').textContent=t('tagline');$('guestEyebrow').textContent=t('eyebrow');$('guestTitle').textContent=t('title');$('guestSubtitle').textContent=t('subtitle');
  $('guestBrowseBtn').textContent=t('browse');$('guestLoginBtn').textContent=t('login');$('guestCustomerRegister').textContent=t('customer');$('guestSupplierRegister').textContent=t('supplier');
  $('guestOffersKicker').textContent=t('kicker');$('guestOffersTitle').textContent=t('offers');$('guestReloadBtn').textContent=t('reload');$('guestLangBtn').textContent=lang==='ar'?'EN':'AR';
  $('guestPrevPage').textContent=t('previous');$('guestNextPage').textContent=t('next');
  $('guestProductSearch').placeholder=t('search');$('guestProductSearch').setAttribute('aria-label',t('search'));
  $('guestRequestTitle').textContent=t('requestTitle');$('guestRequestDescription').textContent=t('requestDescription');$('guestRequestBtn').textContent=t('requestButton');
  $('guestCompanyDescription').textContent=t('companyDescription');$('guestContactTitle').textContent=t('contact');$('guestCopyright').textContent=t('copyright');
  $('backToGuestBtn')?.querySelector('span')?.replaceChildren(document.createTextNode(t('back')));
  if(state)renderOffers();
  updateCartBadge();
}

async function api(path){
  const r=await fetch(API+path,{credentials:'omit',headers:{'X-M-Client':'native'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
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
async function hydrateImages(root=$('guestOffers'),attribute='data-media'){
  const images=[...root.querySelectorAll(`img[${attribute}]:not([data-loaded])`)];
  let cursor=0;
  const worker=async()=>{while(cursor<images.length){const img=images[cursor++];img.dataset.loaded='1';const src=img.getAttribute(attribute),url=await imageUrl(src);if(url&&img.isConnected)img.src=url;}};
  await Promise.all(Array.from({length:Math.min(MEDIA_CONCURRENCY,images.length)},worker));
}
function offerImages(o){
  const src=(o.images||[])[0];
  if(!src)return '<div class="guest-offer-images"><div class="guest-offer-image guest-offer-placeholder">M</div></div>';
  return `<div class="guest-offer-images"><div class="guest-offer-image"><img alt="" data-media="${esc(src)}" /></div></div>`;
}
function offerCard(o){
  return `<article class="guest-offer-card" data-guest-offer="${esc(o.id)}">${offerImages(o)}<div class="guest-offer-body"><div class="public-offer-origin">${esc(countryLabel(o.country))}</div><h3>${esc(title(o))}</h3><p>${esc(description(o)||'—')}</p><div class="guest-facts"><span><b>${esc(t('price'))}</b>${money(o.unitPrice,o.currency)}</span><span><b>${esc(t('moq'))}</b>${esc(o.moq||'—')}</span></div></div></article>`;
}
function renderOffers(){
  renderCategories();renderCountries();
  const offers=filteredOffers(),totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  offersPage=Math.min(Math.max(offersPage,1),totalPages);
  const pageOffers=offers.slice((offersPage-1)*PAGE_SIZE,offersPage*PAGE_SIZE);
  $('guestOffers').innerHTML=pageOffers.length?pageOffers.map(offerCard).join(''):`<div class="guest-empty">${esc(t('empty'))}</div>`;
  $('guestPageInfo').textContent=`${t('page')} ${offersPage} / ${totalPages}`;
  $('guestPrevPage').disabled=offersPage<=1;$('guestNextPage').disabled=offersPage>=totalPages;
  $('guestOffersPagination').classList.toggle('hidden',offers.length<=PAGE_SIZE);
  hydrateImages();
}
async function load(){
  if(loadTask)return loadTask;
  $('guestOffers').innerHTML=`<div class="guest-loading">${esc(t('loading'))}</div>`;$('guestOffersPagination').classList.add('hidden');
  loadTask=(async()=>{
    try{
      state=await api('/api/v1/state');
      const valid=new Set(publishedOffers().map(o=>o.id));cartItems=cartItems.filter(x=>valid.has(x.offerId));saveCart();
      offersPage=1;renderOffers();
    }catch(error){console.error(error);$('guestOffers').innerHTML=`<div class="guest-empty">${esc(t('error'))}</div>`;}
    finally{loadTask=null;}
  })();
  return loadTask;
}
function ensureLoaded(){if(!state&&!loadTask)void load();}

function showGuest(){showView('guestView');}
function showLogin(){showView('loginView');}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';}
function openOffer(id){
  const o=publishedOffers().find(x=>x.id===id);if(!o)return;
  const existing=cartItems.find(x=>x.offerId===o.id),moq=Math.max(1,Math.ceil(Number(o.moq)||1)),stock=Number(o.stock),initialQty=existing?.quantity||moq;
  const maxAttr=Number.isFinite(stock)&&stock>0?` max="${esc(Math.floor(stock))}"`:'';
  $('modalKicker').textContent=`#${ref(o)}`;$('modalTitle').textContent=title(o);
  $('modalBody').innerHTML=`${o.images?.length?`<div class="guest-modal-images" data-viewer-gallery>${o.images.map(src=>`<img alt="" data-guest-modal-media="${esc(src)}" data-image-viewer />`).join('')}</div>`:''}
    <div class="quote-price">${money(o.unitPrice,o.currency)}</div>
    <div class="facts"><span>MOQ ${esc(o.moq||'—')}</span>${o.stock!==undefined?`<span>${esc(t('stock'))}: ${esc(o.stock||'—')}</span>`:''}<span>${esc(t('production'))}: ${esc(o.leadTime||'—')} ${esc(t('days'))}</span><span>${esc(t('supplyCountry'))}: ${esc(countryLabel(o.country))}</span></div>
    <p class="guest-modal-description">${esc(description(o)||'—')}</p>
    <form id="guestProductCartForm" class="public-interest-form" data-offer-id="${esc(o.id)}">
      <div class="public-interest-head"><div><strong>${esc(t('quantity'))}</strong><small>MOQ: ${esc(o.moq||'—')}</small></div></div>
      <label><span>${esc(t('quantity'))}</span><input id="guestProductQuantity" name="quantity" type="number" min="${esc(moq)}" step="1" value="${esc(initialQty)}"${maxAttr} required></label>
      <div class="public-interest-total"><span>${esc(t('productTotal'))}</span><strong id="guestProductTotal">${money(initialQty*Number(o.unitPrice||0),o.currency)}</strong></div>
      <p class="form-message" id="guestProductMessage"></p>
      <button class="primary-btn full" type="submit">${esc(existing?t('updateCart'):t('addCart'))}</button>
    </form>`;
  $('modal').classList.remove('hidden');
  hydrateImages($('modalBody'),'data-guest-modal-media');
  const input=$('guestProductQuantity'),total=$('guestProductTotal');
  input?.addEventListener('input',()=>{const q=Number(input.value);total.textContent=money((Number.isFinite(q)?q:0)*Number(o.unitPrice||0),o.currency);});
  $('guestProductCartForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    try{addToCart(o,Number(e.currentTarget.quantity.value));closeModal();showGuestToast(t('added'));}
    catch(error){$('guestProductMessage').textContent=error.message;}
  });
}
function showGuestToast(message){
  const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.remove('hidden');clearTimeout(showGuestToast.t);showGuestToast.t=setTimeout(()=>toast.classList.add('hidden'),2200);
}
function requireCustomerAuth(action){
  const isCart=action==='open-cart';
  try{localStorage.setItem(POST_AUTH_KEY,action);}catch{}
  $('modalKicker').textContent='M Platform';$('modalTitle').textContent=isCart?t('authCartTitle'):t('authRequestTitle');
  $('modalBody').innerHTML=`<section class="guest-auth-required"><p>${esc(isCart?t('authCartText'):t('authRequestText'))}</p><div class="guest-auth-required-actions"><button class="secondary-btn" type="button" data-guest-auth-login>${esc(t('continueLogin'))}</button><button class="primary-btn" type="button" data-guest-auth-register>${esc(t('createClient'))}</button></div></section>`;
  $('modal').classList.remove('hidden');
}
function openGuestCart(){
  const rows=cartRows();
  $('modalKicker').textContent=rows.length?`${rows.length} ${t('products')} · ${rows[0].currency}`:'M Platform';$('modalTitle').textContent=t('cart');
  if(!rows.length){
    $('modalBody').innerHTML=`<div class="empty-state cart-empty"><span>🛒</span><p>${esc(t('emptyCart'))}</p></div>`;$('modal').classList.remove('hidden');return;
  }
  const currency=rows[0].currency,total=rows.reduce((sum,row)=>sum+row.total,0);
  $('modalBody').innerHTML=`<form id="guestCartForm" class="cart-checkout-form">
    <div class="cart-table"><div class="cart-table-head" aria-hidden="true"><span>${esc(lang==='ar'?'صورة المنتج':'Image')}</span><span>${esc(lang==='ar'?'اسم المنتج':'Product')}</span><span>${esc(t('unitPrice'))}</span><span>${esc(t('quantity'))}</span><span>${esc(t('total'))}</span><span>${esc(t('remove'))}</span></div>
    <div class="cart-lines">${rows.map(row=>{
      const o=row.offer,image=(o.images||[])[0],stock=Number(o.stock),maxAttr=Number.isFinite(stock)&&stock>0?` max="${esc(Math.floor(stock))}"`:'';
      return `<article class="cart-line" data-guest-cart-line="${esc(o.id)}">
        <div class="cart-line-image">${image?`<img alt="" data-guest-cart-media="${esc(image)}">`:'<div>M</div>'}</div>
        <div class="cart-line-product"><strong>${esc(title(o))}</strong><small>MOQ ${esc(o.moq||'—')}</small></div>
        <div class="cart-line-price"><span>${esc(t('unitPrice'))}</span><strong>${money(row.unitPrice,row.currency)}</strong></div>
        <label class="cart-line-qty"><span>${esc(t('quantity'))}</span><input type="number" data-guest-cart-qty="${esc(o.id)}" min="${esc(Math.max(1,Math.ceil(Number(o.moq)||1)))}" step="1" value="${esc(row.quantity)}"${maxAttr}></label>
        <div class="cart-line-total"><span>${esc(t('total'))}</span><strong>${money(row.total,row.currency)}</strong></div>
        <button type="button" class="danger-text cart-line-remove" data-guest-cart-remove="${esc(o.id)}">${esc(t('remove'))}</button>
      </article>`;
    }).join('')}</div></div>
    <section class="cart-summary"><div><span>${esc(lang==='ar'?'عدد المنتجات':'Products')}</span><strong>${rows.length}</strong></div><div class="cart-grand-total"><span>${esc(t('grandTotal'))}</span><strong>${money(total,currency)}</strong></div></section>
    <div class="cart-actions"><button type="button" class="secondary-btn" data-guest-cart-clear>${esc(t('clearCart'))}</button><button class="primary-btn" type="submit">${esc(t('submitOrder'))}</button></div>
  </form>`;
  $('modal').classList.remove('hidden');hydrateImages($('modalBody'),'data-guest-cart-media');
  $('modalBody').querySelectorAll('[data-guest-cart-qty]').forEach(input=>input.addEventListener('change',()=>{
    if(!setCartQuantity(input.dataset.guestCartQty,Number(input.value))){showGuestToast(t('invalidQty'));openGuestCart();return;}openGuestCart();
  }));
  $('modalBody').querySelectorAll('[data-guest-cart-remove]').forEach(button=>button.addEventListener('click',()=>{cartItems=cartItems.filter(x=>x.offerId!==button.dataset.guestCartRemove);saveCart();openGuestCart();}));
  $('modalBody').querySelector('[data-guest-cart-clear]')?.addEventListener('click',()=>{cartItems=[];saveCart();openGuestCart();});
  $('guestCartForm')?.addEventListener('submit',e=>{e.preventDefault();requireCustomerAuth('open-cart');});
}

$('guestLoginBtn').addEventListener('click',showLogin);
$('backToGuestBtn').addEventListener('click',showGuest);
$('guestBrowseBtn').addEventListener('click',()=>$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'}));
$('guestReloadBtn').addEventListener('click',()=>{state=null;void load();});
$('guestPrevPage').addEventListener('click',()=>{if(offersPage>1){offersPage--;renderOffers();$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'});}});
$('guestNextPage').addEventListener('click',()=>{const total=Math.max(1,Math.ceil(filteredOffers().length/PAGE_SIZE));if(offersPage<total){offersPage++;renderOffers();$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'});}});
$('guestLangBtn').addEventListener('click',toggleLanguage);
$('guestCartBtn').addEventListener('click',openGuestCart);
$('guestRequestBtn').addEventListener('click',()=>requireCustomerAuth('new-request'));
$('guestProductSearch').addEventListener('input',e=>{searchText=e.target.value;offersPage=1;renderOffers();});
onLanguageChange(value=>{lang=value;apply();});
$('guestCategoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-guest-category]');if(!b)return;category=b.dataset.guestCategory;offersPage=1;renderOffers();});
$('guestSupplyCountryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-guest-country]');if(!b)return;supplyCountry=b.dataset.guestCountry;offersPage=1;renderOffers();});
$('guestOffers').addEventListener('click',e=>{const card=e.target.closest('[data-guest-offer]');if(card)openOffer(card.dataset.guestOffer);});
$('modal').addEventListener('click',e=>{
  if(e.target.closest('[data-guest-auth-login]')){closeModal();showLogin();return;}
  if(e.target.closest('[data-guest-auth-register]')){closeModal();$('guestCustomerRegister')?.click();return;}
});
window.addEventListener('mplatform:view',e=>{if(e.detail?.id==='guestView'){loadCart();ensureLoaded();}});

(async()=>{
  await languageReady;lang=getLanguage();loadCart();apply();
  if(!$('guestView').classList.contains('hidden'))ensureLoaded();
})();
