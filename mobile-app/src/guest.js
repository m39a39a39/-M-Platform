import { languageReady, getLanguage, onLanguageChange, toggleLanguage } from './language.js';
import { showView } from './views.js';

const API=String(import.meta.env.VITE_API_ORIGIN||'https://m-platform-tan.vercel.app').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const mediaCache=new Map();
let lang='ar';
let state=null;
let loadTask=null;
let offersPage=1;
let category='all';
const PAGE_SIZE=20;
const MEDIA_CONCURRENCY=6;
const mediaTasks=new Map();

const text={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',eyebrow:'منصة شراء وتوريد موثوقة',title:'اطلب ما تحتاجه، وقارن العروض بثقة.',subtitle:'منصة آمنة تربطك بموردين مؤهلين، بينما نتولى مراجعة العروض، التحقق من البضاعة، الترجمة، الشحن الموثوق، ومتابعة الضمان.',browse:'تصفح العروض',login:'تسجيل الدخول',customer:'إنشاء حساب عميل',supplier:'إنشاء حساب مورد',kicker:'تصفح دون حساب',offers:'العروض العامة',reload:'تحديث',loading:'جارٍ تحميل العروض...',empty:'لا توجد عروض عامة منشورة حاليًا.',price:'السعر',moq:'الحد الأدنى',production:'الإنتاج',days:'يوم',stock:'المخزون',details:'تفاصيل العرض',back:'العودة للرئيسية',error:'تعذر تحميل العروض. تحقق من اتصال الإنترنت.',previous:'السابق',next:'التالي',page:'صفحة',companyDescription:'منصة تساعدك في طلب المنتجات، مقارنة العروض، ومتابعة التوريد بسهولة.',contact:'تواصل معنا',copyright:'© 2026 MIG COMPANY — جميع الحقوق محفوظة',allCategories:'الكل'},
  en:{tagline:'Request what you need, and compare offers with confidence.',eyebrow:'Trusted sourcing platform',title:'Request what you need, and compare offers with confidence.',subtitle:'A secure platform that connects you with qualified suppliers while we handle offer review, product verification, translation, reliable shipping, and warranty follow-up.',browse:'Browse offers',login:'Sign in',customer:'Create customer account',supplier:'Create supplier account',kicker:'Browse without an account',offers:'Public offers',reload:'Refresh',loading:'Loading offers...',empty:'No public offers are currently published.',price:'Price',moq:'MOQ',production:'Production',days:'days',stock:'Stock',details:'Offer details',back:'Back to home',error:'Could not load offers. Check your internet connection.',previous:'Previous',next:'Next',page:'Page',companyDescription:'A platform that helps you request products, compare offers, and follow your sourcing process with ease.',contact:'Contact us',copyright:'© 2026 MIG COMPANY — All rights reserved.',allCategories:'All'}
};
const t=k=>text[lang][k]||k;
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const ref=o=>o?.displayNo||String(o?.id||'').slice(0,8)||'—';
const title=o=>{const x=o?.translation||{};return (lang==='ar'?(x.titleAr||x.titleEn):(x.titleEn||x.titleAr))||o?.product||o?.title||`#${ref(o)}`;};
const description=o=>{const x=o?.translation||{};return (lang==='ar'?(x.descriptionAr||x.descriptionEn):(x.descriptionEn||x.descriptionAr))||o?.specs||'';};
const categories=()=>{const rows=Array.isArray(state?.settings?.categories)?state.settings.categories:[];return rows.filter(cat=>cat.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));};
const filteredOffers=()=>{const offers=(state?.publicOffers||[]).filter(o=>o.status==='published');return category==='all'?offers:offers.filter(o=>o.categoryId===category);};
function renderCategories(){
  const rows=categories();
  if(category!=='all'&&!rows.some(cat=>cat.id===category))category='all';
  $('guestCategoryFilters').innerHTML=rows.length?`<button type="button" data-guest-category="all" class="${category==='all'?'active':''}">${esc(t('allCategories'))}</button>${rows.map(cat=>`<button type="button" data-guest-category="${esc(cat.id)}" class="${category===cat.id?'active':''}">${esc(lang==='ar'?cat.nameAr:cat.nameEn)}</button>`).join('')}`:'';
  $('guestCategoryFilters').classList.toggle('hidden',!rows.length);
}

function apply(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  $('guestTagline').textContent=t('tagline');$('guestEyebrow').textContent=t('eyebrow');$('guestTitle').textContent=t('title');$('guestSubtitle').textContent=t('subtitle');
  $('guestBrowseBtn').textContent=t('browse');$('guestLoginBtn').textContent=t('login');$('guestCustomerRegister').textContent=t('customer');$('guestSupplierRegister').textContent=t('supplier');
  $('guestOffersKicker').textContent=t('kicker');$('guestOffersTitle').textContent=t('offers');$('guestReloadBtn').textContent=t('reload');$('guestLangBtn').textContent=lang==='ar'?'EN':'AR';
  $('guestPrevPage').textContent=t('previous');$('guestNextPage').textContent=t('next');
  $('guestCompanyDescription').textContent=t('companyDescription');$('guestContactTitle').textContent=t('contact');$('guestCopyright').textContent=t('copyright');
  $('backToGuestBtn')?.querySelector('span')?.replaceChildren(document.createTextNode(t('back')));
  if(state)renderOffers();
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
  mediaTasks.set(src,task);
  return task;
}
async function hydrateImages(){
  const images=[...document.querySelectorAll('#guestOffers img[data-media]:not([data-loaded])')];
  let cursor=0;
  const worker=async()=>{
    while(cursor<images.length){
      const img=images[cursor++];img.dataset.loaded='1';
      const url=await imageUrl(img.dataset.media);
      if(url&&img.isConnected)img.src=url;
    }
  };
  await Promise.all(Array.from({length:Math.min(MEDIA_CONCURRENCY,images.length)},worker));
}
function offerImages(o){
  const src=(o.images||[])[0];
  if(!src)return '<div class="guest-offer-images"><div class="guest-offer-image guest-offer-placeholder">M</div></div>';
  return `<div class="guest-offer-images" data-viewer-gallery><div class="guest-offer-image"><img alt="" data-media="${esc(src)}" data-image-viewer /></div></div>`;
}
function offerCard(o){
  return `<article class="guest-offer-card" data-guest-offer="${esc(o.id)}">${offerImages(o)}<div class="guest-offer-body"><h3>${esc(title(o))}</h3><p>${esc(description(o)||'—')}</p><div class="guest-facts"><span><b>${esc(t('price'))}</b>${esc(o.currency||'')} ${esc(o.unitPrice||'—')}</span><span><b>${esc(t('moq'))}</b>${esc(o.moq||'—')}</span></div></div></article>`;
}
function renderOffers(){
  renderCategories();
  const offers=filteredOffers();
  const totalPages=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  offersPage=Math.min(Math.max(offersPage,1),totalPages);
  const pageOffers=offers.slice((offersPage-1)*PAGE_SIZE,offersPage*PAGE_SIZE);
  $('guestOffers').innerHTML=pageOffers.length?pageOffers.map(offerCard).join(''):`<div class="guest-empty">${esc(t('empty'))}</div>`;
  $('guestPageInfo').textContent=`${t('page')} ${offersPage} / ${totalPages}`;
  $('guestPrevPage').disabled=offersPage<=1;
  $('guestNextPage').disabled=offersPage>=totalPages;
  $('guestOffersPagination').classList.toggle('hidden',offers.length<=PAGE_SIZE);
  hydrateImages();
}
async function load(){
  if(loadTask)return loadTask;
  $('guestOffers').innerHTML=`<div class="guest-loading">${esc(t('loading'))}</div>`;
  $('guestOffersPagination').classList.add('hidden');
  loadTask=(async()=>{
    try{state=await api('/api/v1/state');offersPage=1;renderOffers();}
    catch(error){console.error(error);$('guestOffers').innerHTML=`<div class="guest-empty">${esc(t('error'))}</div>`;}
    finally{loadTask=null;}
  })();
  return loadTask;
}
function ensureLoaded(){if(!state&&!loadTask)void load();}

function showGuest(){showView('guestView');}
function showLogin(){showView('loginView');}
function openOffer(id){
  const o=(state?.publicOffers||[]).find(x=>x.id===id);if(!o)return;
  $('modalKicker').textContent=`#${ref(o)}`;$('modalTitle').textContent=title(o);
  $('modalBody').innerHTML=`${o.images?.length?`<div class="guest-modal-images" data-viewer-gallery>${o.images.map(src=>`<img alt="" data-guest-modal-media="${esc(src)}" data-image-viewer />`).join('')}</div>`:''}<p class="guest-modal-description">${esc(description(o)||'—')}</p><div class="guest-modal-facts"><div><span>${esc(t('price'))}</span><strong>${esc(o.currency||'')} ${esc(o.unitPrice||'—')}</strong></div><div><span>${esc(t('moq'))}</span><strong>${esc(o.moq||'—')}</strong></div><div><span>${esc(t('production'))}</span><strong>${esc(o.leadTime||'—')} ${esc(t('days'))}</strong></div>${o.stock?`<div><span>${esc(t('stock'))}</span><strong>${esc(o.stock)}</strong></div>`:''}</div><button class="primary-btn guest-modal-login" type="button">${esc(t('login'))}</button>`;
  $('modal').classList.remove('hidden');
  document.querySelectorAll('[data-guest-modal-media]').forEach(async img=>{try{const url=await imageUrl(img.dataset.guestModalMedia);if(url)img.src=url;}catch{}});
}

$('guestLoginBtn').addEventListener('click',showLogin);
$('backToGuestBtn').addEventListener('click',showGuest);
$('guestBrowseBtn').addEventListener('click',()=>$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'}));
$('guestReloadBtn').addEventListener('click',()=>{state=null;void load();});
$('guestPrevPage').addEventListener('click',()=>{if(offersPage>1){offersPage--;renderOffers();$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'});}});
$('guestNextPage').addEventListener('click',()=>{const total=Math.max(1,Math.ceil(filteredOffers().length/PAGE_SIZE));if(offersPage<total){offersPage++;renderOffers();$('guestOffersSection').scrollIntoView({behavior:'smooth',block:'start'});}});
$('guestLangBtn').addEventListener('click',toggleLanguage);
onLanguageChange(value=>{lang=value;apply();});
$('guestCategoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-guest-category]');if(!b)return;category=b.dataset.guestCategory;offersPage=1;renderOffers();});
$('guestOffers').addEventListener('click',e=>{const card=e.target.closest('[data-guest-offer]');if(card)openOffer(card.dataset.guestOffer);});
$('modal').addEventListener('click',e=>{if(e.target.closest('.guest-modal-login')){$('modal').classList.add('hidden');showLogin();}});
window.addEventListener('mplatform:view',e=>{if(e.detail?.id==='guestView')ensureLoaded();});

(async()=>{
  await languageReady;lang=getLanguage();apply();
  if(!$('guestView').classList.contains('hidden'))ensureLoaded();
})();
