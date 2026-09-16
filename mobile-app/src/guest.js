import { Preferences } from '@capacitor/preferences';

const API='https://m-platform-tan.vercel.app';
const $=id=>document.getElementById(id);
const mediaCache=new Map();
let lang='ar';
let state=null;

const text={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',eyebrow:'منصة شراء وتوريد موثوقة',title:'اطلب ما تحتاجه، وقارن العروض بثقة.',subtitle:'منصة آمنة تربطك بموردين مؤهلين، بينما نتولى مراجعة العروض، التحقق من البضاعة، الترجمة، الشحن الموثوق، ومتابعة الضمان.',browse:'تصفح العروض',login:'تسجيل الدخول',customer:'إنشاء حساب عميل',supplier:'إنشاء حساب مورد',kicker:'تصفح دون حساب',offers:'العروض العامة',reload:'تحديث',loading:'جارٍ تحميل العروض...',empty:'لا توجد عروض عامة منشورة حاليًا.',price:'السعر',moq:'الحد الأدنى',production:'الإنتاج',days:'يوم',stock:'المخزون',details:'تفاصيل العرض',back:'العودة للرئيسية',error:'تعذر تحميل العروض. تحقق من اتصال الإنترنت.'},
  en:{tagline:'Request what you need, and compare offers with confidence.',eyebrow:'Trusted sourcing platform',title:'Request what you need, and compare offers with confidence.',subtitle:'A secure platform that connects you with qualified suppliers while we handle offer review, product verification, translation, reliable shipping, and warranty follow-up.',browse:'Browse offers',login:'Sign in',customer:'Create customer account',supplier:'Create supplier account',kicker:'Browse without an account',offers:'Public offers',reload:'Refresh',loading:'Loading offers...',empty:'No public offers are currently published.',price:'Price',moq:'MOQ',production:'Production',days:'days',stock:'Stock',details:'Offer details',back:'Back to home',error:'Could not load offers. Check your internet connection.'}
};
const t=k=>text[lang][k]||k;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ref=o=>o?.displayNo||String(o?.id||'').slice(0,8)||'—';
const title=o=>{const x=o?.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||o?.product||o?.title||`#${ref(o)}`;};
const description=o=>{const x=o?.translation||{};return (lang==='ar'?(x.descriptionAr||x.descriptionEn):(x.descriptionEn||x.descriptionAr))||o?.specs||'';};

function apply(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  $('guestTagline').textContent=t('tagline');$('guestEyebrow').textContent=t('eyebrow');$('guestTitle').textContent=t('title');$('guestSubtitle').textContent=t('subtitle');
  $('guestBrowseBtn').textContent=t('browse');$('guestLoginBtn').textContent=t('login');$('guestCustomerRegister').textContent=t('customer');$('guestSupplierRegister').textContent=t('supplier');
  $('guestOffersKicker').textContent=t('kicker');$('guestOffersTitle').textContent=t('offers');$('guestReloadBtn').textContent=t('reload');$('guestLangBtn').textContent=lang==='ar'?'EN':'AR';
  $('backToGuestBtn')?.querySelector('span')?.replaceChildren(document.createTextNode(t('back')));
  if(state)renderOffers();
}

async function api(path){
  const r=await fetch(API+path,{headers:{'X-M-Client':'native'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
}
async function imageUrl(src){
  if(mediaCache.has(src))return mediaCache.get(src);
  const path=src.replace(/^\/api\/media\//,'/api/v1/media/');
  const r=await fetch(API+path,{headers:{'X-M-Client':'native'}});if(!r.ok)return '';
  const url=URL.createObjectURL(await r.blob());mediaCache.set(src,url);return url;
}
async function hydrateImages(){
  for(const img of document.querySelectorAll('#guestOffers img[data-media]:not([data-loaded])')){
    img.dataset.loaded='1';try{const url=await imageUrl(img.dataset.media);if(url)img.src=url;}catch{}
  }
}
function offerCard(o){
  const first=o.images?.[0];
  return `<article class="guest-offer-card" data-guest-offer="${esc(o.id)}">${first?`<div class="guest-offer-image"><img alt="" data-media="${esc(first)}" /></div>`:'<div class="guest-offer-image guest-offer-placeholder">M</div>'}<div class="guest-offer-body"><small>#${esc(ref(o))}</small><h3>${esc(title(o))}</h3><p>${esc(description(o))}</p><div class="guest-facts"><span><b>${esc(t('price'))}</b>${esc(o.currency||'')} ${esc(o.unitPrice||'—')}</span><span><b>${esc(t('moq'))}</b>${esc(o.moq||'—')}</span><span><b>${esc(t('production'))}</b>${esc(o.leadTime||'—')} ${esc(t('days'))}</span></div></div></article>`;
}
function renderOffers(){
  const offers=(state?.publicOffers||[]).filter(o=>o.status==='published');
  $('guestOffers').innerHTML=offers.length?offers.map(offerCard).join(''):`<div class="guest-empty">${esc(t('empty'))}</div>`;
  hydrateImages();
}
async function load(){
  $('guestOffers').innerHTML=`<div class="guest-loading">${esc(t('loading'))}</div>`;
  try{state=await api('/api/v1/state');renderOffers();}catch(error){console.error(error);$('guestOffers').innerHTML=`<div class="guest-empty">${esc(t('error'))}</div>`;}
}
function showGuest(){
  $('loginView').classList.add('hidden');$('appView').classList.add('hidden');$('guestView').classList.remove('hidden');window.scrollTo({top:0,behavior:'instant'});
}
function showLogin(){
  $('guestView').classList.add('hidden');$('loginView').classList.remove('hidden');window.scrollTo({top:0,behavior:'instant'});
}
function openOffer(id){
  const o=(state?.publicOffers||[]).find(x=>x.id===id);if(!o)return;
  $('modalKicker').textContent=`#${ref(o)}`;$('modalTitle').textContent=title(o);
  $('modalBody').innerHTML=`${o.images?.length?`<div class="guest-modal-images">${o.images.map(src=>`<img alt="" data-guest-modal-media="${esc(src)}" />`).join('')}</div>`:''}<p class="guest-modal-description">${esc(description(o)||'—')}</p><div class="guest-modal-facts"><div><span>${esc(t('price'))}</span><strong>${esc(o.currency||'')} ${esc(o.unitPrice||'—')}</strong></div><div><span>${esc(t('moq'))}</span><strong>${esc(o.moq||'—')}</strong></div><div><span>${esc(t('production'))}</span><strong>${esc(o.leadTime||'—')} ${esc(t('days'))}</strong></div>${o.stock?`<div><span>${esc(t('stock'))}</span><strong>${esc(o.stock)}</strong></div>`:''}</div><button class="primary-btn guest-modal-login" type="button">${esc(t('login'))}</button>`;
  $('modal').classList.remove('hidden');
  document.querySelectorAll('[data-guest-modal-media]').forEach(async img=>{try{const url=await imageUrl(img.dataset.guestModalMedia);if(url)img.src=url;}catch{}});
}

$('guestLoginBtn').addEventListener('click',showLogin);
$('backToGuestBtn').addEventListener('click',showGuest);
$('guestBrowseBtn').addEventListener('click',()=>$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'}));
$('guestReloadBtn').addEventListener('click',load);
$('guestLangBtn').addEventListener('click',async()=>{lang=lang==='ar'?'en':'ar';await Preferences.set({key:'language',value:lang});apply();});
$('guestOffers').addEventListener('click',e=>{const card=e.target.closest('[data-guest-offer]');if(card)openOffer(card.dataset.guestOffer);});
$('modal').addEventListener('click',e=>{if(e.target.closest('.guest-modal-login')){$('modal').classList.add('hidden');showLogin();}});

const appObserver=new MutationObserver(()=>{
  if($('appView').classList.contains('hidden')&&!$('loginView').classList.contains('hidden')&&!$('guestView').classList.contains('hidden'))return;
  if($('appView').classList.contains('hidden')&&!$('loginView').classList.contains('hidden')&&$('guestView').classList.contains('hidden')&&document.activeElement?.id!=='email'&&document.activeElement?.id!=='password'){
    // Keep the login page visible after an explicit login attempt; logout is handled when the form is not active.
  }
});
appObserver.observe($('appView'),{attributes:true,attributeFilter:['class']});

(async()=>{const saved=await Preferences.get({key:'language'});lang=saved.value==='en'?'en':'ar';apply();await load();})();
