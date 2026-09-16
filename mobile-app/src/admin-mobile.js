const ADMIN_API='https://m-platform-tan.vercel.app';
const baseFetch=window.fetch.bind(window);
let adminAccessToken='';
let adminRefreshToken='';
let adminState=null;
let renderTimer=null;
let adminRequestTab='pending';
let adminOfferTab='pending';
let adminSearch='';
const adminMediaCache=new Map();

const A=()=>document.documentElement.lang==='en'?'en':'ar';
const atr=(ar,en)=>A()==='ar'?ar:en;
const aesc=value=>String(value??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const aref=item=>item?.displayNo||String(item?.id||'').slice(0,8)||'—';
const adate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat(A()==='ar'?'ar':'en',{dateStyle:'medium'}).format(d);};
const user=()=>adminState?.user||null;
const isAdmin=()=>user()?.role==='admin';
const can=permission=>!!(user()&&(user().isOwner||user().permissions?.includes(permission)));
const account=id=>(adminState?.accounts||[]).find(a=>a.id===id);
const ownerOf=item=>account(item?.customerId||item?.supplierId);
const titleOf=item=>{const t=item?.translation||{};return (A()==='ar'?(t.titleAr||t.titleEn):(t.titleEn||t.titleAr))||item?.product||item?.title||`#${aref(item)}`;};
const descriptionOf=item=>{const t=item?.translation||{};return (A()==='ar'?(t.descriptionAr||t.descriptionEn):(t.descriptionEn||t.descriptionAr))||item?.specs||item?.notes||'';};

function headersObject(input){try{return new Headers(input||{});}catch{return new Headers();}}
async function captureResponse(input,init,response){
  try{
    const url=typeof input==='string'?input:input?.url||'';
    const h=headersObject(init?.headers);
    const bearer=h.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(bearer)adminAccessToken=bearer;
    if(!response.ok)return;
    if(url.includes('/api/v1/auth/login')||url.includes('/api/v1/auth/refresh')){
      const data=await response.clone().json();
      if(data?.tokens?.accessToken)adminAccessToken=data.tokens.accessToken;
      if(data?.tokens?.refreshToken)adminRefreshToken=data.tokens.refreshToken;
    }
    if(url.includes('/api/v1/state')){
      const data=await response.clone().json();
      if(data?.user?.role==='admin'){adminState=data;scheduleAdminRender();}
    }
  }catch{}
}
window.fetch=async function(input,init={}){
  const response=await baseFetch(input,init);
  await captureResponse(input,init,response);
  return response;
};

async function refreshAdminToken(){
  if(!adminRefreshToken)return false;
  const r=await baseFetch(ADMIN_API+'/api/v1/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify({refreshToken:adminRefreshToken})});
  if(!r.ok)return false;
  const data=await r.json().catch(()=>({}));
  adminAccessToken=data?.tokens?.accessToken||'';
  adminRefreshToken=data?.tokens?.refreshToken||adminRefreshToken;
  return !!adminAccessToken;
}
async function adminApi(path,{method='GET',body,auth=true}={}){
  const headers={'X-M-Client':'native'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(auth&&adminAccessToken)headers.Authorization=`Bearer ${adminAccessToken}`;
  let r=await baseFetch(ADMIN_API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(r.status===401&&auth&&await refreshAdminToken()){
    headers.Authorization=`Bearer ${adminAccessToken}`;
    r=await baseFetch(ADMIN_API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  }
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}
async function reloadAdminState(){
  const next=await adminApi('/api/v1/state');
  if(next?.user?.role==='admin')adminState=next;
  return adminState;
}
async function adminMutate(collection,item,patch,{redactionConfirmed=false}={}){
  if(!item)throw new Error(atr('العنصر غير موجود.','Item not found.'));
  await adminApi('/api/v1/mutations',{method:'POST',body:{collection,id:item.id,version:Number(item.version||0),patch,redactionConfirmed}});
  await reloadAdminState();
}

function toast(message){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=message;el.classList.remove('hidden');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),2400);
}
function closeAdminModal(){const m=document.getElementById('modal');if(m)m.classList.add('hidden');}
function openAdminModal(title,kicker,html){
  const m=document.getElementById('modal');if(!m)return;
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalKicker').textContent=kicker||'';
  document.getElementById('modalBody').innerHTML=html;
  m.classList.remove('hidden');
  hydrateAdminImages(document.getElementById('modalBody'));
}
async function adminImageUrl(src){
  if(adminMediaCache.has(src))return adminMediaCache.get(src);
  const path=String(src).replace(/^\/api\/media\//,'/api/v1/media/');
  const headers={'X-M-Client':'native'};if(adminAccessToken)headers.Authorization=`Bearer ${adminAccessToken}`;
  const r=await baseFetch(ADMIN_API+path,{headers});if(!r.ok)return '';
  const url=URL.createObjectURL(await r.blob());adminMediaCache.set(src,url);return url;
}
async function hydrateAdminImages(root=document){
  for(const img of root.querySelectorAll('img[data-admin-media]:not([data-loaded])')){
    img.dataset.loaded='1';try{const u=await adminImageUrl(img.dataset.adminMedia);if(u)img.src=u;}catch{}
  }
}
function adminGallery(images=[],selectable=false){
  if(!images.length)return '';
  return `<div class="admin-image-grid">${images.map((src,i)=>`<label class="admin-image-tile"><input ${selectable?'':'disabled'} checked type="checkbox" data-admin-image-index="${i}"><span><img alt="" data-admin-media="${aesc(src)}"></span>${selectable?`<small>${aesc(atr('إبقاء الصورة','Keep image'))}</small>`:''}</label>`).join('')}</div>`;
}
function statusText(status){const m={review:['قيد المراجعة','Under review'],sent:['تم الإرسال للموردين','Sent to suppliers'],completed:['مكتمل','Completed'],pending:['قيد المراجعة','Under review'],published:['منشور','Published'],coordinating:['قيد التنسيق','Coordinating'],accepted:['مقبول','Accepted'],cancelled:['ملغي','Cancelled']};return atr(...(m[status]||[status||'—',status||'—']));}
function badge(status){return `<span class="status-pill status-${aesc(status||'')}">${aesc(statusText(status))}</span>`;}
function activeNav(){return document.querySelector('#bottomNav button.active')?.dataset.screen||'home';}
function adminScreen(){return document.getElementById('screen');}
function matchesSearch(item,kind=''){
  if(!adminSearch.trim())return true;
  const q=adminSearch.trim().toLowerCase();
  const o=ownerOf(item);
  const linked=kind==='quote'?(adminState?.requests||[]).find(r=>r.id===item.requestId):null;
  const client=linked?account(linked.customerId):null;
  return [aref(item),item.product,item.specs,item.notes,item.country,o?.name,o?.company,linked?.displayNo,client?.name,client?.company].filter(Boolean).join(' ').toLowerCase().includes(q);
}
function searchBox(placeholder){return `<label class="admin-mobile-search"><span>⌕</span><input value="${aesc(adminSearch)}" data-admin-search placeholder="${aesc(placeholder)}"></label>`;}
function adminItemCard(item,kind){
  const o=ownerOf(item);const desc=descriptionOf(item);
  const linked=kind==='quote'?(adminState?.requests||[]).find(r=>r.id===item.requestId):null;
  return `<article class="list-card admin-record-card" data-admin-open="${aesc(kind)}" data-admin-id="${aesc(item.id)}"><div class="list-card-main"><div class="list-card-title"><small>#${aesc(aref(item))}</small><h3>${aesc(titleOf(item))}</h3></div>${badge(item.status)}</div>${desc?`<p>${aesc(desc)}</p>`:''}<div class="admin-record-meta">${o?`<span>${aesc(o.company||o.name||atr('صاحب المحتوى','Owner'))}</span>`:''}${linked?`<span>#${aesc(aref(linked))}</span>`:''}<span>${aesc(adate(item.createdAt))}</span></div>${adminGallery(item.images||[])}</article>`;
}
function adminPageHeader(title,subtitle=''){return `<div class="page-head admin-page-head"><div><h1>${aesc(title)}</h1>${subtitle?`<p>${aesc(subtitle)}</p>`:''}</div></div>`;}
function emptyState(){return `<div class="empty-state"><span>◇</span><p>${aesc(atr('لا توجد بيانات حاليًا.','No data available.'))}</p></div>`;}
function setAdminRoot(html,view){const s=adminScreen();if(!s)return;s.innerHTML=`<div data-admin-root="${view}">${html}</div>`;hydrateAdminImages(s);}

function renderAdminHome(){
  const req=adminState?.requests||[],quotes=adminState?.quotes||[],pub=adminState?.publicOffers||[],interests=adminState?.interests||[],accounts=adminState?.accounts||[];
  const pendingRequests=req.filter(x=>!x.deletedAt&&!x.suspendedAt&&x.status==='review');
  const pendingOffers=[...quotes.map(x=>({...x,__kind:'quote'})),...pub.map(x=>({...x,__kind:'public'}))].filter(x=>!x.deletedAt&&x.status==='pending');
  setAdminRoot(adminPageHeader(atr('لوحة الإدارة','Admin dashboard'),atr('اعتماد الطلبات والعروض ومتابعة المنصة من الجوال.','Approve requests and offers and monitor the platform from mobile.'))+
    `<div class="stats-grid admin-stats"><button class="stat-card" data-admin-go="requests"><strong>${pendingRequests.length}</strong><span>${aesc(atr('طلبات بانتظار الاعتماد','Requests pending approval'))}</span></button><button class="stat-card" data-admin-go="offers"><strong>${pendingOffers.length}</strong><span>${aesc(atr('عروض بانتظار الاعتماد','Offers pending approval'))}</span></button><button class="stat-card" data-admin-go="offers" data-admin-tab-target="interests"><strong>${interests.length}</strong><span>${aesc(atr('طلبات الاهتمام','Interest requests'))}</span></button><button class="stat-card" data-admin-go="account"><strong>${accounts.filter(a=>['client','supplier'].includes(a.role)&&!a.deletedAt).length}</strong><span>${aesc(atr('العملاء والموردون','Customers & suppliers'))}</span></button></div>`+
    `<section class="section-block"><div class="section-title"><h2>${aesc(atr('الأولوية الآن','Priority now'))}</h2></div><div class="list-stack">${pendingRequests.slice(0,3).map(x=>adminItemCard(x,'request')).join('')}${pendingOffers.slice(0,3).map(x=>adminItemCard(x,x.__kind)).join('')||emptyState()}</div></section>`,'home');
}
function renderAdminRequests(){
  let rows=(adminState?.requests||[]).filter(x=>!x.deletedAt&&!x.suspendedAt&&matchesSearch(x,'request'));
  rows.sort((a,b)=>(a.status==='review'?0:1)-(b.status==='review'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(adminRequestTab==='pending')rows=rows.filter(x=>x.status==='review');
  setAdminRoot(adminPageHeader(atr('الطلبات','Requests'),atr('راجع الطلب وحدد الموردين ثم اعتمده مباشرة.','Review the request, assign suppliers, then approve it directly.'))+
    searchBox(atr('ابحث برقم الطلب أو اسم العميل','Search request number or customer'))+
    `<div class="segmented admin-segmented"><button class="${adminRequestTab==='pending'?'active':''}" data-admin-request-tab="pending">${aesc(atr('بانتظار الاعتماد','Pending'))}</button><button class="${adminRequestTab==='all'?'active':''}" data-admin-request-tab="all">${aesc(atr('جميع الطلبات','All requests'))}</button></div><div class="list-stack">${rows.map(x=>adminItemCard(x,'request')).join('')||emptyState()}</div>`,'requests');
}
function renderAdminOffers(){
  const quotes=(adminState?.quotes||[]).filter(x=>!x.deletedAt).map(x=>({...x,__kind:'quote'}));
  const pub=(adminState?.publicOffers||[]).filter(x=>!x.deletedAt).map(x=>({...x,__kind:'public'}));
  const interests=adminState?.interests||[];
  let content='';
  if(adminOfferTab==='interests'){
    const rows=interests.filter(x=>matchesSearch(x,'interest'));
    content=rows.map(i=>{const offer=(adminState?.publicOffers||[]).find(o=>o.id===i.offerId),customer=account(i.customerId);return `<article class="list-card admin-interest-card"><div class="list-card-main"><div class="list-card-title"><small>#${aesc(aref(offer))}</small><h3>${aesc(offer?titleOf(offer):atr('طلب اهتمام','Interest request'))}</h3></div>${badge(i.status||'pending')}</div><div class="admin-record-meta">${customer?`<span>${aesc(customer.company||customer.name||'')}</span>`:''}<span>${aesc(adate(i.createdAt))}</span></div>${can('publish')?`<label class="admin-status-select"><span>${aesc(atr('الحالة','Status'))}</span><select data-admin-interest-status="${aesc(i.id)}">${['pending','coordinating','accepted','completed','cancelled'].map(v=>`<option value="${v}" ${(i.status||'pending')===v?'selected':''}>${aesc(statusText(v))}</option>`).join('')}</select></label>`:''}</article>`;}).join('')||emptyState();
  }else{
    let rows=[...quotes,...pub].filter(x=>matchesSearch(x,x.__kind));
    rows.sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    if(adminOfferTab==='pending')rows=rows.filter(x=>x.status==='pending');
    content=rows.map(x=>adminItemCard(x,x.__kind)).join('')||emptyState();
  }
  setAdminRoot(adminPageHeader(atr('العروض','Offers'),atr('مراجعة عروض الموردين والعروض العامة وإدارة طلبات الاهتمام.','Review supplier quotes, public offers, and interest requests.'))+
    searchBox(atr('ابحث برقم العرض أو اسم المورد','Search offer number or supplier'))+
    `<div class="segmented admin-segmented admin-segmented-3"><button class="${adminOfferTab==='pending'?'active':''}" data-admin-offer-tab="pending">${aesc(atr('بانتظار الاعتماد','Pending'))}</button><button class="${adminOfferTab==='all'?'active':''}" data-admin-offer-tab="all">${aesc(atr('كل العروض','All offers'))}</button><button class="${adminOfferTab==='interests'?'active':''}" data-admin-offer-tab="interests">${aesc(atr('الاهتمام','Interest'))}</button></div><div class="list-stack">${content}</div>`,'offers');
}
function renderAdminAccount(){
  const u=user(),accounts=(adminState?.accounts||[]).filter(a=>['client','supplier'].includes(a.role)&&!a.deletedAt&&matchesSearch(a,'account'));
  setAdminRoot(adminPageHeader(atr('الإدارة والحسابات','Admin & accounts'),atr('بيانات حسابك ودليل العملاء والموردين.','Your profile and customer/supplier directory.'))+
    `<section class="profile-card admin-profile"><div class="avatar">${aesc((u?.name||u?.email||'M').charAt(0).toUpperCase())}</div><h2>${aesc(u?.name||atr('الإدارة','Admin'))}</h2><p>${aesc(atr('حساب إدارة','Admin account'))}</p></section>`+
    `<section class="section-block admin-directory"><div class="section-title"><h2>${aesc(atr('العملاء والموردون','Customers & suppliers'))}</h2></div>${searchBox(atr('ابحث بالاسم أو الشركة','Search name or company'))}<div class="list-stack">${accounts.slice(0,100).map(a=>`<button class="admin-account-row" data-admin-account="${aesc(a.id)}"><div><strong>${aesc(a.company||a.name||'#'+String(a.id).slice(0,8))}</strong><small>${aesc(a.role==='client'?atr('عميل','Customer'):atr('مورد','Supplier'))}</small></div><span>›</span></button>`).join('')||emptyState()}</div></section>`,'account');
}
function renderAdminActive(){
  if(!isAdmin()||document.getElementById('appView')?.classList.contains('hidden'))return;
  const view=activeNav();
  if(view==='notifications')return;
  if(view==='home')renderAdminHome();
  else if(view==='requests')renderAdminRequests();
  else if(view==='offers')renderAdminOffers();
  else if(view==='account')renderAdminAccount();
}
function scheduleAdminRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{try{renderAdminActive();}catch(e){console.error('admin mobile render',e);}},20);}

function ownerDetails(item){
  const o=ownerOf(item);if(!o)return '';
  return `<section class="admin-owner-box"><strong>${aesc(atr('صاحب المحتوى','Content owner'))}</strong><p>${aesc(o.company||o.name||'#'+String(o.id).slice(0,8))}</p>${can('accounts.read')?`<small>${aesc(o.name||'')} ${o.phone?`· ${aesc(o.phone)}`:''} ${o.email?`· ${aesc(o.email)}`:''} ${o.country?`· ${aesc(o.country)}`:''}</small>`:''}</section>`;
}
function translationInputs(item,editable){
  const t=item.translation||{};
  const disabled=editable?'':'disabled';
  return `<div class="form-stack admin-translation"><label><span>${aesc(atr('العنوان بالعربية','Arabic title'))}</span><input ${disabled} data-admin-tr="titleAr" value="${aesc(t.titleAr||'')}"></label><label><span>${aesc(atr('العنوان بالإنجليزية','English title'))}</span><input ${disabled} data-admin-tr="titleEn" value="${aesc(t.titleEn||'')}"></label><label><span>${aesc(atr('الوصف بالعربية','Arabic description'))}</span><textarea ${disabled} data-admin-tr="descriptionAr">${aesc(t.descriptionAr||'')}</textarea></label><label><span>${aesc(atr('الوصف بالإنجليزية','English description'))}</span><textarea ${disabled} data-admin-tr="descriptionEn">${aesc(t.descriptionEn||'')}</textarea></label></div>`;
}
function supplierPicker(item){
  const suppliers=(adminState?.accounts||[]).filter(a=>a.role==='supplier'&&!a.deletedAt&&!a.blockedAt);
  return `<section class="admin-supplier-picker"><h3>${aesc(atr('الموردون المدعوون','Invited suppliers'))}</h3><div class="admin-check-list">${suppliers.map(s=>`<label><input type="checkbox" data-admin-supplier value="${aesc(s.id)}" ${(item.supplierIds||[]).includes(s.id)?'checked':''}><span>${aesc(s.company||s.name||'#'+String(s.id).slice(0,8))}</span></label>`).join('')}</div></section>`;
}
function openRecord(kind,id){
  const collection=kind==='request'?adminState?.requests:kind==='quote'?adminState?.quotes:adminState?.publicOffers;
  const item=(collection||[]).find(x=>x.id===id);if(!item)return;
  const pending=kind==='request'?item.status==='review':item.status==='pending';
  const editPermission=kind==='request'?'requests.edit':'offers.edit';
  const editImages=pending&&can(editPermission),editTranslation=pending&&can('translate'),canApprove=pending&&can('publish');
  const linked=kind==='quote'?(adminState?.requests||[]).find(r=>r.id===item.requestId):null;
  let html=ownerDetails(item)+`<section class="admin-source-box"><h3>${aesc(atr('المحتوى الأصلي','Original content'))}</h3><strong>${aesc(item.product||linked?.product||titleOf(item))}</strong><p>${aesc(item.specs||item.notes||'—')}</p>${kind==='request'?`<div class="facts"><span>${aesc(atr('الكمية','Quantity'))}: ${aesc(item.quantity||'—')}</span><span>${aesc(atr('الدولة','Country'))}: ${aesc(item.country||'—')}</span><span>${aesc(atr('تاريخ الاحتياج','Needed date'))}: ${aesc(item.neededDate||'—')}</span></div>`:''}${linked?`<div class="facts"><span>${aesc(atr('الطلب المرتبط','Linked request'))}: #${aesc(aref(linked))}</span></div>`:''}</section>`;
  html+=`<section><h3>${aesc(atr('الصور','Images'))}</h3>${adminGallery(item.images||[],editImages)||`<p class="muted">${aesc(atr('لا توجد صور.','No images.'))}</p>`}</section>`;
  html+=`<section><h3>${aesc(atr('الترجمة','Translation'))}</h3>${translationInputs(item,editTranslation)}</section>`;
  if(kind==='request'&&pending&&can('publish'))html+=supplierPicker(item);
  if(pending){
    html+=`<section class="admin-redaction"><h3>${aesc(atr('فحص الخصوصية','Privacy check'))}</h3><label><input type="checkbox" data-admin-redact="identity"><span>${aesc(atr('تمت مراجعة الصور والنصوص وإزالة الهوية.','Images and text were checked and identity removed.'))}</span></label><label><input type="checkbox" data-admin-redact="contact"><span>${aesc(atr('تمت إزالة بيانات التواصل المباشر.','Direct contact details were removed.'))}</span></label></section>`;
    html+=`<div class="admin-review-actions">${editTranslation?`<button class="secondary-btn" data-admin-save-review data-kind="${kind}" data-id="${aesc(item.id)}">${aesc(atr('حفظ دون نشر','Save without publishing'))}</button>`:''}${canApprove?`<button class="primary-btn" data-admin-approve data-kind="${kind}" data-id="${aesc(item.id)}">${aesc(atr('اعتماد ونشر','Approve & publish'))}</button>`:''}</div>`;
  }else if(kind==='request'&&item.status==='sent'&&can('publish')){
    html+=`<div class="admin-review-actions"><button class="secondary-btn" data-admin-reopen-request data-id="${aesc(item.id)}">${aesc(atr('إعادة للمراجعة','Return to review'))}</button><button class="primary-btn" data-admin-complete-request data-id="${aesc(item.id)}">${aesc(atr('تحديد كمكتمل','Mark completed'))}</button></div>`;
  }
  openAdminModal(`#${aref(item)} — ${titleOf(item)}`,statusText(item.status),html);
}
function openAccount(id){
  const a=account(id);if(!a)return;
  const req=(adminState?.requests||[]).filter(r=>r.customerId===id),quotes=(adminState?.quotes||[]).filter(q=>q.supplierId===id),pub=(adminState?.publicOffers||[]).filter(o=>o.supplierId===id);
  openAdminModal(a.company||a.name||'#'+String(a.id).slice(0,8),a.role==='client'?atr('عميل','Customer'):atr('مورد','Supplier'),`<dl class="admin-account-details"><div><dt>${aesc(atr('الاسم','Name'))}</dt><dd>${aesc(a.name||'—')}</dd></div><div><dt>${aesc(atr('الشركة','Company'))}</dt><dd>${aesc(a.company||'—')}</dd></div><div><dt>${aesc(atr('رقم التواصل','Phone'))}</dt><dd>${aesc(a.phone||'—')}</dd></div><div><dt>${aesc(atr('البريد','Email'))}</dt><dd>${aesc(a.email||'—')}</dd></div><div><dt>${aesc(atr('الدولة','Country'))}</dt><dd>${aesc(a.country||'—')}</dd></div></dl><h3>${aesc(atr('السجل','History'))}</h3><div class="facts"><span>${aesc(atr('الطلبات','Requests'))}: ${req.length}</span><span>${aesc(atr('العروض','Offers'))}: ${quotes.length+pub.length}</span></div>`);
}
function readReviewForm(kind,item){
  const translation={};document.querySelectorAll('[data-admin-tr]').forEach(el=>translation[el.dataset.adminTr]=el.value.trim());
  const selectedImages=[];(item.images||[]).forEach((src,i)=>{const box=document.querySelector(`[data-admin-image-index="${i}"]`);if(!box||box.checked)selectedImages.push(src);});
  const supplierIds=[...document.querySelectorAll('[data-admin-supplier]:checked')].map(x=>x.value);
  const identity=document.querySelector('[data-admin-redact="identity"]')?.checked;
  const contact=document.querySelector('[data-admin-redact="contact"]')?.checked;
  return {translation,selectedImages,supplierIds,identity,contact};
}
async function approveRecord(kind,id){
  const collectionArray=kind==='request'?adminState.requests:kind==='quote'?adminState.quotes:adminState.publicOffers;
  const item=collectionArray.find(x=>x.id===id);if(!item)return;
  const f=readReviewForm(kind,item);
  if(Object.values(f.translation).some(v=>!v)){toast(atr('أكمل العنوان والوصف بالعربية والإنجليزية.','Complete Arabic and English title and description.'));return;}
  if(!f.identity||!f.contact){toast(atr('أكمل فحص إزالة الهوية وبيانات التواصل.','Complete both privacy checks.'));return;}
  if(kind==='request'&&!f.supplierIds.length){toast(atr('اختر موردًا واحدًا على الأقل.','Select at least one supplier.'));return;}
  const patch={translation:f.translation,reviewedAt:new Date().toISOString(),status:kind==='request'?'sent':'published'};
  const editPermission=kind==='request'?'requests.edit':'offers.edit';if(can(editPermission))patch.images=f.selectedImages;
  if(kind==='request')patch.supplierIds=f.supplierIds;
  const collection=kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers';
  try{await adminMutate(collection,item,patch,{redactionConfirmed:true});closeAdminModal();scheduleAdminRender();toast(atr('تم الاعتماد بنجاح.','Approved successfully.'));}catch(e){toast(e.message);}
}
async function saveReview(kind,id){
  const array=kind==='request'?adminState.requests:kind==='quote'?adminState.quotes:adminState.publicOffers,item=array.find(x=>x.id===id);if(!item)return;
  const f=readReviewForm(kind,item);if(Object.values(f.translation).some(v=>!v)){toast(atr('أكمل الترجمة أولًا.','Complete the translation first.'));return;}
  const patch={translation:f.translation,reviewedAt:new Date().toISOString()};const editPermission=kind==='request'?'requests.edit':'offers.edit';if(can(editPermission))patch.images=f.selectedImages;
  try{await adminMutate(kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers',item,patch);closeAdminModal();scheduleAdminRender();toast(atr('تم حفظ المراجعة.','Review saved.'));}catch(e){toast(e.message);}
}
async function setRequestStatus(id,status){const item=(adminState?.requests||[]).find(x=>x.id===id);if(!item)return;try{await adminMutate('requests',item,{status});closeAdminModal();scheduleAdminRender();toast(atr('تم تحديث الحالة.','Status updated.'));}catch(e){toast(e.message);}}
async function setInterestStatus(id,status){const item=(adminState?.interests||[]).find(x=>x.id===id);if(!item)return;try{await adminMutate('interests',item,{status});scheduleAdminRender();toast(atr('تم تحديث الحالة.','Status updated.'));}catch(e){toast(e.message);}}

function goAdmin(view,tab){
  if(view==='offers'&&tab)adminOfferTab=tab;
  const btn=document.querySelector(`#bottomNav button[data-screen="${view}"]`);if(btn){btn.click();setTimeout(scheduleAdminRender,30);}
}

document.addEventListener('click',event=>{
  if(event.target.closest('#appLangBtn'))setTimeout(scheduleAdminRender,30);
  const nav=event.target.closest('#bottomNav button[data-screen]');if(nav)setTimeout(scheduleAdminRender,30);
  const go=event.target.closest('[data-admin-go]');if(go){goAdmin(go.dataset.adminGo,go.dataset.adminTabTarget);return;}
  const reqTab=event.target.closest('[data-admin-request-tab]');if(reqTab){adminRequestTab=reqTab.dataset.adminRequestTab;scheduleAdminRender();return;}
  const offerTab=event.target.closest('[data-admin-offer-tab]');if(offerTab){adminOfferTab=offerTab.dataset.adminOfferTab;scheduleAdminRender();return;}
  const open=event.target.closest('[data-admin-open]');if(open){openRecord(open.dataset.adminOpen,open.dataset.adminId);return;}
  const person=event.target.closest('[data-admin-account]');if(person){openAccount(person.dataset.adminAccount);return;}
  const approve=event.target.closest('[data-admin-approve]');if(approve){approveRecord(approve.dataset.kind,approve.dataset.id);return;}
  const save=event.target.closest('[data-admin-save-review]');if(save){saveReview(save.dataset.kind,save.dataset.id);return;}
  const reopen=event.target.closest('[data-admin-reopen-request]');if(reopen){setRequestStatus(reopen.dataset.id,'review');return;}
  const complete=event.target.closest('[data-admin-complete-request]');if(complete){setRequestStatus(complete.dataset.id,'completed');return;}
});
document.addEventListener('input',event=>{if(event.target.matches('[data-admin-search]')){adminSearch=event.target.value;scheduleAdminRender();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-admin-interest-status]'))setInterestStatus(event.target.dataset.adminInterestStatus,event.target.value);});

const observer=new MutationObserver(()=>scheduleAdminRender());
window.addEventListener('DOMContentLoaded',()=>{
  const app=document.getElementById('app');if(app)observer.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
});