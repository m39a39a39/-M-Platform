import { session } from './session.js';
import { filesToCompressedSources } from './image-upload.js';
let state=null,revision=0;
let requestFilter='active',offerTab='quotes',offerFilter='pending',operationTab='payments',moreTab='customers',timer=null;
const searches=new Map(),mediaCache=new Map(),mediaTasks=new Map();
const MEDIA_CONCURRENCY=6;
let reloadWorkspace=async()=>{};
export function configureAdmin({reload}) { reloadWorkspace=reload; }
export function resetAdmin() {
  clearTimeout(timer); state=null; revision++;
  requestFilter='active'; offerTab='quotes'; offerFilter='pending'; operationTab='payments'; moreTab='customers'; searches.clear();
  for(const url of mediaCache.values()) URL.revokeObjectURL(url);
  mediaCache.clear();mediaTasks.clear();
}
export function updateAdminState(next) {
  if(next?.user?.role!=='admin') { resetAdmin(); return; }
  if(state?.user?.id!==next.user.id) resetAdmin();
  state=next; revision++;
}
const searchKey=()=>{const v=activeView();if(v==='offers')return `offers:${offerTab}:${offerFilter}`;if(v==='operations')return `operations:${operationTab}`;if(v==='more')return `more:${moreTab}`;return v;};
const searchText=()=>searches.get(searchKey())||'';
const api=(path,options={})=>session.request(path,{...options,auth:true});
const reload=()=>reloadWorkspace();
const lang=()=>document.documentElement.lang==='en'?'en':'ar';
const tr=(ar,en)=>lang()==='ar'?ar:en;
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const ref=x=>x?.displayNo||String(x?.id||'').slice(0,8)||'—';
const date=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat(lang()==='ar'?'ar':'en',{dateStyle:'medium'}).format(d);};
const me=()=>state?.user;
const isAdmin=()=>me()?.role==='admin';
const can=p=>!!(me()&&(me().isOwner||me().permissions?.includes(p)));
const account=id=>(state?.accounts||[]).find(a=>a.id===id);
const ownerOf=x=>account(x?.customerId||x?.supplierId);
const title=x=>{const t=x?.translation||{};return(lang()==='ar'?(t.titleAr||t.titleEn):(t.titleEn||t.titleAr))||x?.product||x?.title||`#${ref(x)}`;};
const desc=x=>{const t=x?.translation||{};return(lang()==='ar'?(t.descriptionAr||t.descriptionEn):(t.descriptionEn||t.descriptionAr))||x?.specs||x?.notes||'';};
const TRACKING=[
 ['received','تم استلام الطلب','Request received'],['reviewing','قيد المراجعة','Under review'],['sourcing','البحث عن موردين','Finding suppliers'],['quotes_available','العروض متاحة','Offers available'],['quote_selected','تم اختيار العرض','Offer selected'],['supplier_confirmation','بانتظار تأكيد المورد','Awaiting supplier confirmation'],['payment_confirmation','تأكيد الطلب والدفع','Order & payment confirmation'],['production','قيد الإنتاج','In production'],['quality_check','الفحص والجودة','Quality inspection'],['ready_to_ship','جاهز للشحن','Ready to ship'],['shipped','تم الشحن','Shipped'],['in_delivery','قيد التوصيل','In delivery'],['delivered','تم التسليم','Delivered'],['completed','مكتمل','Completed'],['customer_action','بانتظار إجراء من العميل','Waiting for customer action'],['on_hold','معلق','On hold'],['cancelled','ملغي','Cancelled']
];
const READY_TRACKING=[
 ['received','تم استلام الطلب','Request received'],['supplier_confirmation','بانتظار تأكيد المورد','Awaiting supplier confirmation'],['payment_confirmation','تأكيد الطلب والدفع','Order & payment confirmation'],['production','قيد الإنتاج','In production'],['quality_check','الفحص والجودة','Quality inspection'],['ready_to_ship','جاهز للشحن','Ready to ship'],['shipped','تم الشحن','Shipped'],['in_delivery','قيد التوصيل','In delivery'],['delivered','تم التسليم','Delivered'],['completed','مكتمل','Completed'],['customer_action','بانتظار إجراء من العميل','Waiting for customer action'],['on_hold','معلق','On hold'],['cancelled','ملغي','Cancelled']
];
const status=s=>({review:tr('قيد المراجعة','Under review'),sent:tr('تم الإرسال للموردين','Sent to suppliers'),completed:tr('مكتمل','Completed'),pending:tr('قيد المراجعة','Under review'),published:tr('منشور','Published'),coordinating:tr('قيد التنسيق','Coordinating'),accepted:tr('مقبول','Accepted'),cancelled:tr('ملغي','Cancelled'),pending_confirmation:tr('بانتظار تأكيد المورد','Awaiting supplier confirmation'),confirmed:tr('أكد المورد التنفيذ','Supplier confirmed'),ready_for_inspection:tr('جاهز للفحص','Ready for inspection'),cannot_fulfill:tr('تعذر التنفيذ','Unable to fulfill'),awaiting_receipt:tr('بانتظار الإيصال','Awaiting receipt'),receipt_submitted:tr('إيصال بانتظار المراجعة','Receipt awaiting review'),reupload_requested:tr('إعادة رفع الإيصال مطلوبة','Receipt re-upload requested'),...Object.fromEntries(TRACKING.map(x=>[x[0],tr(x[1],x[2])]))})[s]||s||'—';
const requestTracking=x=>x?.trackingStatus||(x?.status==='completed'?'completed':x?.selectedQuoteId?'quote_selected':x?.status==='sent'?'sourcing':'received');
const interestTracking=x=>x?.trackingStatus||(x?.status==='completed'?'completed':x?.status==='cancelled'?'cancelled':['coordinating','accepted'].includes(x?.status)?'payment_confirmation':'received');
const categories=()=>{const rows=Array.isArray(state?.settings?.categories)?state.settings.categories:[];return [...rows].sort((a,b)=>(a.order||0)-(b.order||0));};
const activeCategories=()=>categories().filter(cat=>cat.active!==false);
const bankAccounts=()=>{const rows=Array.isArray(state?.settings?.bankAccounts)?state.settings.bankAccounts:[];return [...rows].sort((a,b)=>(a.order||0)-(b.order||0));};
const activeBankAccounts=()=>bankAccounts().filter(x=>x.active!==false);
const selectedQuoteForRequest=x=>x?.selectedQuoteId?(state?.quotes||[]).find(q=>q.id===x.selectedQuoteId&&q.requestId===x.id):null;
function requestPricing(x){
  const quote=selectedQuoteForRequest(x),unitPrice=Number(quote?.unitPrice),quantity=Number(x?.quantity);
  if(!quote||!Number.isFinite(unitPrice)||unitPrice<=0||!Number.isFinite(quantity)||quantity<=0)return null;
  return {quote,unitPrice,quantity,total:unitPrice*quantity,currency:String(quote.currency||'').toUpperCase()};
}
function interestPricing(x){
  const offer=(state?.publicOffers||[]).find(o=>o.id===x?.offerId),unitPrice=Number(x?.unitPrice||offer?.unitPrice),quantity=Number(x?.quantity),total=Number(x?.total),currency=String(x?.currency||offer?.currency||'').toUpperCase();
  if(!Number.isFinite(unitPrice)||unitPrice<=0||!Number.isFinite(quantity)||quantity<=0||!currency)return null;
  return {offer,unitPrice,quantity,total:Number.isFinite(total)&&total>0?total:unitPrice*quantity,currency,moq:Number(x?.moq||offer?.moq)||0};
}
function formatMoney(value,currency){
  const amount=Number(value);if(!Number.isFinite(amount))return '—';
  try{return new Intl.NumberFormat(lang()==='ar'?'ar':'en',{style:'currency',currency:currency||'USD',minimumFractionDigits:0,maximumFractionDigits:4}).format(amount);}
  catch{return amount.toLocaleString()+' '+String(currency||'');}
}
function selectedQuoteCard(x){
  const pricing=requestPricing(x);
  if(!pricing)return '<section class="admin-selected-quote-card missing"><div><small>'+esc(tr('العرض المختار','Selected quote'))+'</small><strong>'+esc(tr('لم يختار العميل عرضًا بعد','The customer has not selected a quote yet'))+'</strong></div><p>'+esc(tr('لا يمكن الانتقال إلى تأكيد الطلب والدفع قبل اختيار عرض.','The order cannot move to payment confirmation before a quote is selected.'))+'</p></section>';
  const {quote,unitPrice,quantity,total,currency}=pricing,supplier=account(quote.supplierId);
  return '<section class="admin-selected-quote-card"><div class="admin-selected-quote-head"><div><small>'+esc(tr('العرض المختار','Selected quote'))+'</small><strong>#'+esc(ref(quote))+'</strong>'+(supplier?'<small>'+esc(tr('المورد','Supplier'))+': '+esc(supplier.company||supplier.name||supplier.email||'—')+'</small>':'')+'</div><span class="status-pill status-published">'+esc(tr('مختار','Selected'))+'</span></div><div class="admin-selected-quote-values"><div><span>'+esc(tr('سعر الوحدة','Unit price'))+'</span><strong>'+esc(formatMoney(unitPrice,currency))+'</strong></div><div><span>'+esc(tr('الكمية','Quantity'))+'</span><strong>'+esc(Number(quantity).toLocaleString())+'</strong></div><div class="total"><span>'+esc(tr('الإجمالي','Total'))+'</span><strong>'+esc(formatMoney(total,currency))+'</strong></div></div><small>'+esc(tr('الإجمالي = سعر الوحدة × كمية الطلب، ويُستخدم تلقائيًا كمبلغ الدفع المطلوب.','Total = unit price × order quantity and is used automatically as the amount due.'))+'</small></section>';
}
function supplierExecutionInfo(x,kind){
  const source=kind==='request'?requestPricing(x)?.quote:x;
  const status=source?.supplierOrderStatus||'pending_confirmation',note=source?.supplierOrderNote||'';
  return {status,note,confirmed:['confirmed','production','ready_for_inspection'].includes(status)};
}
function supplierConfirmationCard(x,kind){
  if(kind==='request'&&!requestPricing(x))return '';
  const info=supplierExecutionInfo(x,kind),labels={
    pending_confirmation:[tr('بانتظار تأكيد المورد','Awaiting supplier confirmation'),'pending'],
    confirmed:[tr('المورد أكد التنفيذ','Supplier confirmed fulfillment'),'confirmed'],
    production:[tr('المورد أكد التنفيذ وبدأ الإنتاج','Supplier confirmed and started production'),'confirmed'],
    ready_for_inspection:[tr('المورد أكد التنفيذ والطلب جاهز للفحص','Supplier confirmed; order ready for inspection'),'confirmed'],
    cannot_fulfill:[tr('تعذر على المورد التنفيذ','Supplier cannot fulfill'),'blocked']
  },row=labels[info.status]||labels.pending_confirmation;
  return '<section class="admin-supplier-confirmation '+esc(row[1])+'"><div class="admin-supplier-confirmation-head"><div><small>'+esc(tr('تأكيد المورد','Supplier confirmation'))+'</small><strong>'+esc(row[0])+'</strong></div><span>'+esc(info.confirmed?'✓':info.status==='cannot_fulfill'?'✕':'…')+'</span></div>'+(info.note?'<p><b>'+esc(tr('ملاحظة المورد','Supplier note'))+':</b> '+esc(info.note)+'</p>':'')+'<small>'+esc(info.confirmed?tr('يمكن الآن الانتقال إلى تأكيد الطلب والدفع.','The order can now move to payment confirmation.'):info.status==='cannot_fulfill'?tr('لا يمكن الانتقال للدفع. راجع سبب تعذر التنفيذ.','Payment cannot start. Review the supplier reason.'):tr('تأكيد الطلب والدفع سيبقى غير متاح حتى يؤكد المورد التنفيذ.','Payment confirmation remains unavailable until the supplier confirms fulfillment.'))+'</small></section>';
}
function trackingOptions(rows,current,canPay){
  return rows.map(([key,ar,en])=>'<option value="'+key+'" '+(current===key?'selected':'')+' '+(key==='payment_confirmation'&&!canPay&&current!=='payment_confirmation'?'disabled':'')+'>'+esc(tr(ar,en))+'</option>').join('');
}


async function mutate(collection,item,patch,redactionConfirmed=false){await api('/api/v1/mutations',{method:'POST',body:{collection,id:item.id,version:Number(item.version||0),patch,redactionConfirmed}});await reload();}

function toast(msg){if(!isAdmin())return;const e=document.getElementById('toast');if(!e)return;e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2400);}
function activeView(){return document.querySelector('#bottomNav button.active')?.dataset.screen||'home';}
function rootKey(view){return [view,lang(),revision,searchText(),requestFilter,offerTab,offerFilter,operationTab,moreTab].join('|');}
function screen(){return document.getElementById('screen');}
function setRoot(view,html){
  const s=screen(),key=rootKey(view);if(!s)return;
  const current=s.querySelector('[data-admin-root]');
  if(current?.dataset.adminKey===key)return;
  const template=document.createElement('template');
  template.innerHTML=`<div data-admin-root="${view}" data-admin-key="${esc(key)}" data-admin-lang="${lang()}">${html}</div>`;
  const next=template.content.firstElementChild;
  if(current?.dataset.adminRoot===view && current.dataset.adminLang===lang() && current.querySelector('[data-admin-results]') && next.querySelector('[data-admin-results]') && current.querySelector('[data-admin-search]') && next.querySelector('[data-admin-search]')){
    // Keep the exact search input DOM node alive so iOS does not close the keyboard.
    current.querySelector('[data-admin-results]').replaceChildren(...next.querySelector('[data-admin-results]').childNodes);
    const input=current.querySelector('[data-admin-search]');
    if(input && input.value!==searchText())input.value=searchText();
    const tabs=current.querySelector('.segmented'),nextTabs=next.querySelector('.segmented');
    if(tabs&&nextTabs)tabs.replaceChildren(...nextTabs.childNodes);
    const filters=current.querySelector('.admin-request-filters'),nextFilters=next.querySelector('.admin-request-filters');
    if(filters&&nextFilters)filters.replaceWith(nextFilters);
    current.dataset.adminKey=key;
  }else s.replaceChildren(next);
  hydrate(s);
}
function schedule(){clearTimeout(timer);timer=setTimeout(render,120);}
function badge(s){return`<span class="status-pill status-${esc(s||'')}">${esc(status(s))}</span>`;}
function page(title,sub=''){return`<div class="page-head admin-page-head"><div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div></div>`;}
function empty(){return`<div class="empty-state"><span>◇</span><p>${esc(tr('لا توجد بيانات حاليًا.','No data available.'))}</p></div>`;}
function search(placeholder){return`<label class="admin-mobile-search"><span>⌕</span><input type="search" inputmode="search" enterkeyhint="search" data-admin-search value="${esc(searchText())}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>`;}
function gallery(images=[],select=false){
  if(!images.length)return'';
  return `<div class="admin-image-grid" data-viewer-gallery>${images.map((src,i)=>select
    ?`<label class="admin-image-tile"><input checked type="checkbox" data-admin-image-index="${i}"><span><img alt="" data-admin-media="${esc(src)}" data-image-viewer></span><small>${esc(tr('إبقاء الصورة','Keep image'))}</small></label>`
    :`<div class="admin-image-tile admin-image-view-only"><span><img alt="" data-admin-media="${esc(src)}" data-image-viewer></span></div>`
  ).join('')}</div>`;
}
async function imageUrl(src){
  if(mediaCache.has(src))return mediaCache.get(src);
  if(mediaTasks.has(src))return mediaTasks.get(src);
  const epoch=session.epoch,p=String(src).replace(/^\/api\/media\//,'/api/v1/media/');
  const task=(async()=>{
    const r=await session.raw(p);if(!r.ok)return'';
    const blob=await r.blob();if(epoch!==session.epoch||!isAdmin())return'';
    const u=URL.createObjectURL(blob);mediaCache.set(src,u);return u;
  })().catch(()=> '').finally(()=>mediaTasks.delete(src));
  mediaTasks.set(src,task);
  return task;
}
async function hydrate(root=document){
  const images=[...root.querySelectorAll('img[data-admin-media]:not([data-loaded])')];
  let cursor=0;
  const worker=async()=>{while(cursor<images.length){const img=images[cursor++];img.dataset.loaded='1';const u=await imageUrl(img.dataset.adminMedia);if(u&&img.isConnected)img.src=u;}};
  await Promise.all(Array.from({length:Math.min(MEDIA_CONCURRENCY,images.length)},worker));
}
function row(x,kind){const o=ownerOf(x),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null,currentStatus=kind==='request'?requestTracking(x):x.status;return`<article class="list-card admin-record-card" data-admin-open="${kind}" data-admin-id="${esc(x.id)}"><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(x))}</small><h3>${esc(title(x))}</h3></div>${badge(currentStatus)}</div>${desc(x)?`<p>${esc(desc(x))}</p>`:''}<div class="admin-record-meta">${o?`<span>${esc(o.company||o.name||tr('صاحب المحتوى','Owner'))}</span>`:''}${linked?`<span>#${esc(ref(linked))}</span>`:''}<span>${esc(date(x.createdAt))}</span></div>${gallery(x.images||[])}</article>`;}
function matches(x,kind=''){if(!searchText().trim())return true;const q=searchText().trim().toLowerCase(),o=ownerOf(x),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null,client=linked?account(linked.customerId):null;return[ref(x),x.name,x.company,x.email,x.phone,x.product,x.specs,x.notes,x.country,o?.name,o?.company,linked?.displayNo,client?.name,client?.company].filter(Boolean).join(' ').toLowerCase().includes(q);}

function adminOrderEntries(){
  const custom=(state?.requests||[]).filter(x=>!x.deletedAt&&!x.suspendedAt).map(x=>({kind:'request',entity:x,title:title(x),status:requestTracking(x),typeLabel:tr('طلب خاص','Custom request'),customer:account(x.customerId),createdAt:x.createdAt,updatedAt:x.trackingUpdatedAt||x.updatedAt||x.createdAt}));
  const ready=(state?.interests||[]).map(x=>{const offer=(state?.publicOffers||[]).find(o=>o.id===x.offerId);return{kind:'interest',entity:x,offer,title:offer?title(offer):tr('منتج جاهز','Ready product'),status:interestTracking(x),typeLabel:tr('عرض عام','Public offer'),customer:account(x.customerId),createdAt:x.createdAt,updatedAt:x.trackingUpdatedAt||x.updatedAt||x.createdAt};});
  return [...custom,...ready].sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0));
}
function adminOrderMatches(entry){
  if(!searchText().trim())return true;
  const q=searchText().trim().toLowerCase(),x=entry.entity,c=entry.customer,o=entry.offer;
  return [ref(x),entry.title,x.product,x.specs,x.country,c?.name,c?.company,c?.email,c?.phone,o?.displayNo,o?.product].filter(Boolean).join(' ').toLowerCase().includes(q);
}
function adminOrderCard(entry){
  const x=entry.entity,meta=[entry.typeLabel,entry.customer?.company||entry.customer?.name||'',x.quantity?tr('الكمية','Quantity')+': '+x.quantity:'',date(entry.updatedAt)].filter(Boolean);
  const action=entry.kind==='request'?'data-admin-open="request" data-admin-id="'+esc(x.id)+'"':'data-admin-interest="'+esc(x.id)+'"';
  return '<article class="list-card admin-order-card" '+action+'><div class="list-card-main"><div class="list-card-title"><small>#'+esc(ref(x))+' · '+esc(entry.typeLabel)+'</small><h3>'+esc(entry.title)+'</h3></div>'+badge(entry.status)+'</div><div class="admin-record-meta">'+meta.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div><div class="chevron">›</div></article>';
}
function selectedSupplierStatus(r){
  const q=selectedQuoteForRequest(r);return q?.supplierOrderStatus||'pending_confirmation';
}
function needsPaymentReview(x){return x?.paymentStatus==='receipt_submitted';}
function needsSupplierConfirmationEntry(entry){
  return entry.status==='supplier_confirmation'||(entry.kind==='request'&&entry.entity.selectedQuoteId&&selectedSupplierStatus(entry.entity)==='pending_confirmation')||(entry.kind==='interest'&&entry.entity.supplierOrderStatus==='pending_confirmation'&&entry.status!=='received');
}
function isInspectionReady(entry){
  return entry.kind==='request'?selectedSupplierStatus(entry.entity)==='ready_for_inspection':entry.entity.supplierOrderStatus==='ready_for_inspection';
}
function isExecutionProblem(entry){
  const supplierStatus=entry.kind==='request'?selectedSupplierStatus(entry.entity):entry.entity.supplierOrderStatus;
  return supplierStatus==='cannot_fulfill'||['customer_action','on_hold'].includes(entry.status);
}
function operationalCard(entry,context=''){
  const x=entry.entity,customer=entry.customer?.company||entry.customer?.name||'',payment=x.paymentStatus?status(x.paymentStatus):'',supplierStatus=entry.kind==='request'?selectedSupplierStatus(x):x.supplierOrderStatus;
  const details=[entry.typeLabel,customer,context==='payment'&&payment?payment:'',context==='execution'&&supplierStatus?status(supplierStatus):'',date(entry.updatedAt)].filter(Boolean);
  const action=entry.kind==='request'?'data-admin-open="request" data-admin-id="'+esc(x.id)+'"':'data-admin-interest="'+esc(x.id)+'"';
  return '<article class="admin-operation-card" '+action+'><div><small>#'+esc(ref(x))+'</small><strong>'+esc(entry.title)+'</strong><div class="admin-operation-meta">'+details.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div></div><span class="chevron">›</span></article>';
}
function goCard(value,label,view,tab=''){
  return '<button class="admin-queue-card" data-admin-go="'+esc(view)+'" '+(tab?'data-admin-tab-target="'+esc(tab)+'"':'')+'><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span><b>›</b></button>';
}

function home(){
  const entries=adminOrderEntries(),req=state?.requests||[],qs=state?.quotes||[],po=state?.publicOffers||[],acc=state?.accounts||[];
  const pendingRequests=req.filter(x=>!x.deletedAt&&!x.suspendedAt&&x.status==='review');
  const pendingOffers=[...qs,...po].filter(x=>!x.deletedAt&&x.status==='pending');
  const supplierWait=entries.filter(needsSupplierConfirmationEntry);
  const paymentReview=entries.filter(e=>needsPaymentReview(e.entity));
  const inspection=entries.filter(isInspectionReady);
  const problems=entries.filter(isExecutionProblem);
  const active=entries.filter(e=>!['completed','cancelled'].includes(e.status));
  const priority=[...paymentReview,...problems,...supplierWait,...inspection].filter((e,i,a)=>a.findIndex(x=>x.kind===e.kind&&x.entity.id===e.entity.id)===i).slice(0,8);
  const queues='<div class="admin-queue-grid">'+
    goCard(pendingRequests.length,tr('طلبات جديدة','New requests'),'requests')+
    goCard(pendingOffers.length,tr('عروض تحتاج اعتماد','Offers to review'),'offers')+
    goCard(supplierWait.length,tr('بانتظار تأكيد المورد','Awaiting supplier'),'operations','execution')+
    goCard(paymentReview.length,tr('دفعات تحتاج مراجعة','Payments to review'),'operations','payments')+
    goCard(inspection.length,tr('جاهز للفحص','Ready for inspection'),'operations','execution')+
    goCard(problems.length,tr('مشاكل تحتاج تدخل','Issues needing action'),'operations','execution')+
  '</div>';
  const stats='<div class="stats-grid admin-overview-stats">'+
    '<div class="stat-card"><strong>'+esc(active.length)+'</strong><span>'+esc(tr('طلبات نشطة','Active orders'))+'</span></div>'+
    '<div class="stat-card"><strong>'+esc(acc.filter(a=>a.role==='client'&&!a.deletedAt).length)+'</strong><span>'+esc(tr('العملاء','Customers'))+'</span></div>'+
    '<div class="stat-card"><strong>'+esc(acc.filter(a=>a.role==='supplier'&&!a.deletedAt).length)+'</strong><span>'+esc(tr('الموردون','Suppliers'))+'</span></div>'+
    '<div class="stat-card"><strong>'+esc(entries.filter(e=>e.status==='completed').length)+'</strong><span>'+esc(tr('مكتملة','Completed'))+'</span></div>'+
  '</div>';
  setRoot('home',page(tr('لوحة التحكم','Dashboard'),tr('ابدأ بما يحتاج إجراء الآن، ثم انتقل إلى بقية الأقسام.','Start with items needing action, then move to the relevant workspace.'))+
    '<section class="section-block admin-now"><div class="section-title"><div><h2>'+esc(tr('يتطلب إجراء الآن','Needs action now'))+'</h2><p>'+esc(tr('أهم قوائم العمل اليومية للإدارة.','Your main daily admin queues.'))+'</p></div></div>'+queues+'</section>'+
    stats+
    '<section class="section-block"><div class="section-title"><div><h2>'+esc(tr('الأولوية الآن','Priority now'))+'</h2><p>'+esc(tr('أعلى الطلبات التي تحتاج مراجعة أو قرارًا.','Highest-priority orders requiring review or a decision.'))+'</p></div></div><div class="list-stack">'+(priority.map(e=>operationalCard(e,isInspectionReady(e)||needsSupplierConfirmationEntry(e)?'execution':'payment')).join('')||empty())+'</div></section>');
}
function requestFilterControls(allRows){
  const count=s=>allRows.filter(x=>x.status===s).length;
  const active=allRows.filter(x=>!['completed','cancelled'].includes(x.status)).length;
  const completed=allRows.filter(x=>x.status==='completed').length;
  const options=['<option value="all" '+(requestFilter==='all'?'selected':'')+'>'+esc(tr('كل الحالات','All statuses'))+' ('+allRows.length+')</option>',
    ...TRACKING.map(([key,ar,en])=>'<option value="'+key+'" '+(requestFilter===key?'selected':'')+'>'+esc(tr(ar,en))+' ('+count(key)+')</option>')].join('');
  return '<div class="admin-request-filters"><div class="admin-filter-pills">'+
    '<button type="button" data-admin-request-active class="'+(requestFilter==='active'?'active':'')+'">'+esc(tr('النشطة','Active'))+' ('+active+')</button>'+
    '<button type="button" data-admin-request-completed class="'+(requestFilter==='completed'?'active':'')+'">'+esc(tr('المكتملة','Completed'))+' ('+completed+')</button>'+
    '</div><label class="admin-filter-select"><span>'+esc(tr('تصفية حسب الحالة','Filter by status'))+'</span><select data-admin-request-filter>'+options+'</select></label></div>';
}
function requests(){
  const allRows=adminOrderEntries().filter(adminOrderMatches);
  let rows=[...allRows];
  if(requestFilter==='active')rows=rows.filter(x=>!['completed','cancelled'].includes(x.status));
  else if(requestFilter==='completed')rows=rows.filter(x=>x.status==='completed');
  else if(requestFilter!=='all')rows=rows.filter(x=>x.status===requestFilter);
  const custom=allRows.filter(x=>x.kind==='request').length,ready=allRows.filter(x=>x.kind==='interest').length;
  const summary='<div class="admin-order-type-summary"><span>'+esc(tr('طلبات خاصة','Custom requests'))+' <b>'+custom+'</b></span><span>'+esc(tr('طلبات عروض عامة','Public-offer orders'))+' <b>'+ready+'</b></span></div>';
  setRoot('requests',page(tr('الطلبات','Orders'),tr('كل الطلبات الخاصة وطلبات العروض العامة في مكان واحد.','All custom requests and public-offer orders in one place.'))+
    search(tr('ابحث برقم الطلب أو اسم العميل','Search order number or customer'))+summary+requestFilterControls(allRows)+
    '<div class="list-stack" data-admin-results>'+(rows.map(adminOrderCard).join('')||empty())+'</div>');
}
function categoryPanel(){
  const rows=categories();
  return `<section class="admin-category-panel"><div class="section-title"><div><h2>${esc(tr('التصنيفات','Categories'))}</h2><p>${esc(tr('تظهر للعميل كأزرار نصية فوق المنتجات الجاهزة.','Shown to customers as text buttons above ready products.'))}</p></div><button class="primary-small" type="button" data-admin-category-new>+ ${esc(tr('إضافة تصنيف','Add category'))}</button></div><div class="admin-category-list" data-admin-results>${rows.map((cat,i)=>`<article class="admin-category-row"><div><strong>${esc(tr(cat.nameAr,cat.nameEn))}</strong><small>${esc(cat.nameAr)} · ${esc(cat.nameEn)}</small><span class="status-pill ${cat.active!==false?'status-published':'status-cancelled'}">${esc(cat.active!==false?tr('ظاهر','Visible'):tr('مخفي','Hidden'))}</span></div><div class="admin-category-actions"><button type="button" data-admin-category-move="${esc(cat.id)}" data-direction="-1" ${i===0?'disabled':''}>↑</button><button type="button" data-admin-category-move="${esc(cat.id)}" data-direction="1" ${i===rows.length-1?'disabled':''}>↓</button><button type="button" data-admin-category-edit="${esc(cat.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-category-toggle="${esc(cat.id)}">${esc(cat.active!==false?tr('إخفاء','Hide'):tr('إظهار','Show'))}</button><button class="danger-text" type="button" data-admin-category-delete="${esc(cat.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
function offerTabs(){
  return '<div class="segmented admin-segmented admin-segmented-2">'+
    '<button class="'+(offerTab==='quotes'?'active':'')+'" data-admin-offer-tab="quotes">'+esc(tr('العروض المقدمة','Submitted quotes'))+'</button>'+
    '<button class="'+(offerTab==='public'?'active':'')+'" data-admin-offer-tab="public">'+esc(tr('العروض العامة','Public offers'))+'</button>'+
  '</div>';
}
function offerFilterControls(rows){
  const pending=rows.filter(x=>x.status==='pending').length;
  return '<div class="admin-filter-pills admin-offer-filter">'+
    '<button type="button" class="'+(offerFilter==='pending'?'active':'')+'" data-admin-offer-filter="pending">'+esc(tr('بانتظار الاعتماد','Pending'))+' ('+pending+')</button>'+
    '<button type="button" class="'+(offerFilter==='all'?'active':'')+'" data-admin-offer-filter="all">'+esc(tr('الكل','All'))+' ('+rows.length+')</button>'+
  '</div>';
}
function offers(){
  const source=offerTab==='public'
    ?(state?.publicOffers||[]).filter(x=>!x.deletedAt).map(x=>({...x,__kind:'public'}))
    :(state?.quotes||[]).filter(x=>!x.deletedAt).map(x=>({...x,__kind:'quote'}));
  let rows=source.filter(x=>matches(x,x.__kind));
  rows.sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(offerFilter==='pending')rows=rows.filter(x=>x.status==='pending');
  const heading=offerTab==='public'?tr('العروض العامة','Public offers'):tr('العروض المقدمة','Submitted quotes');
  const subtitle=offerTab==='public'?tr('راجع العروض العامة التي يضيفها الموردون قبل نشرها.','Review supplier public offers before publishing.'):tr('راجع العروض التي قدمها الموردون على طلبات العملاء.','Review supplier quotes submitted for customer requests.');
  setRoot('offers',page(tr('العروض','Offers'),tr('مراجعة واعتماد عروض الموردين من مكان واحد.','Review and approve supplier offers in one place.'))+
    offerTabs()+search(tr('ابحث برقم العرض أو اسم المورد','Search offer number or supplier'))+
    '<section class="section-block admin-offer-section"><div class="section-title"><div><h2>'+esc(heading)+'</h2><p>'+esc(subtitle)+'</p></div></div>'+offerFilterControls(source)+
    '<div class="list-stack" data-admin-results>'+(rows.map(x=>row(x,x.__kind)).join('')||empty())+'</div></section>');
}
function bankAccountPanel(){
  if(!can('settings'))return '';
  const rows=bankAccounts();
  return `<section class="section-block admin-bank-panel"><div class="section-title"><div><h2>${esc(tr('حسابات استلام المدفوعات','Payment receiving accounts'))}</h2><p>${esc(tr('تظهر بيانات الحساب للعميل فقط بعد اختيارها داخل طلب في مرحلة الدفع.','Account details are shown to a customer only after the account is selected for an order at the payment stage.'))}</p></div><button class="primary-small" type="button" data-admin-bank-new>+ ${esc(tr('إضافة حساب','Add account'))}</button></div><div class="admin-bank-list">${rows.map(a=>`<article class="admin-bank-row"><div><strong>${esc(a.label||a.bankName)}</strong><small>${esc(a.bankName)} · ${esc(a.currency||'')}</small><span class="status-pill ${a.active!==false?'status-published':'status-cancelled'}">${esc(a.active!==false?tr('نشط','Active'):tr('متوقف','Inactive'))}</span></div><div class="admin-category-actions"><button type="button" data-admin-bank-edit="${esc(a.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-bank-toggle="${esc(a.id)}">${esc(a.active!==false?tr('إيقاف','Disable'):tr('تفعيل','Enable'))}</button><button class="danger-text" type="button" data-admin-bank-delete="${esc(a.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
const ADMIN_PERMISSION_META=[
  ['requests.read','الطلبات: عرض','Requests: view'],['requests.edit','الطلبات: تعديل','Requests: edit'],
  ['offers.read','العروض: عرض','Offers: view'],['offers.edit','العروض: تعديل','Offers: edit'],
  ['translate','الترجمة','Translation'],['publish','الاعتماد والنشر','Approve & publish'],
  ['accounts.read','بيانات الحسابات','Account data'],['moderate','الحظر والتعليق','Moderation'],
  ['trash','الحذف والاستعادة','Delete & restore'],['settings','الإعدادات والحسابات البنكية','Settings & bank accounts'],
  ['team','إدارة المديرين','Admin team']
];
function operationTabs(){
  return '<div class="segmented admin-segmented admin-segmented-3">'+
    '<button class="'+(operationTab==='payments'?'active':'')+'" data-admin-operation-tab="payments">'+esc(tr('المدفوعات','Payments'))+'</button>'+
    '<button class="'+(operationTab==='execution'?'active':'')+'" data-admin-operation-tab="execution">'+esc(tr('التنفيذ والفحص','Execution'))+'</button>'+
    '<button class="'+(operationTab==='shipping'?'active':'')+'" data-admin-operation-tab="shipping">'+esc(tr('الشحن','Shipping'))+'</button>'+
  '</div>';
}
function operations(){
  const entries=adminOrderEntries().filter(adminOrderMatches);
  let rows=[],titleText='',subtitle='';
  if(operationTab==='payments'){
    rows=entries.filter(e=>e.entity.paymentStatus||e.status==='payment_confirmation').sort((a,b)=>(needsPaymentReview(b.entity)?1:0)-(needsPaymentReview(a.entity)?1:0)||(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0));
    titleText=tr('المدفوعات','Payments');subtitle=tr('راجع الإيصالات وحالات الدفع لجميع الطلبات.','Review receipts and payment states for all orders.');
  }else if(operationTab==='shipping'){
    rows=entries.filter(e=>['ready_to_ship','shipped','in_delivery','delivered'].includes(e.status));
    titleText=tr('الشحن','Shipping');subtitle=tr('الطلبات الجاهزة للشحن والمشحونة وقيد التوصيل.','Orders ready to ship, shipped, or in delivery.');
  }else{
    rows=entries.filter(e=>needsSupplierConfirmationEntry(e)||isInspectionReady(e)||isExecutionProblem(e)||['production','quality_check','ready_to_ship'].includes(e.status));
    titleText=tr('التنفيذ والفحص','Execution & inspection');subtitle=tr('متابعة تأكيد المورد والإنتاج والفحص والمشاكل التشغيلية.','Track supplier confirmation, production, inspection, and execution issues.');
  }
  const paymentReview=entries.filter(e=>needsPaymentReview(e.entity)).length,inspection=entries.filter(isInspectionReady).length,problems=entries.filter(isExecutionProblem).length;
  const stats='<div class="stats-grid admin-operation-stats"><div class="stat-card"><strong>'+paymentReview+'</strong><span>'+esc(tr('إيصالات للمراجعة','Receipts to review'))+'</span></div><div class="stat-card"><strong>'+inspection+'</strong><span>'+esc(tr('جاهز للفحص','Ready for inspection'))+'</span></div><div class="stat-card"><strong>'+problems+'</strong><span>'+esc(tr('مشاكل','Issues'))+'</span></div></div>';
  setRoot('operations',page(tr('العمليات','Operations'),tr('المدفوعات والتنفيذ والفحص والشحن في مساحة عمل واحدة.','Payments, execution, inspection, and shipping in one workspace.'))+
    operationTabs()+stats+search(tr('ابحث برقم الطلب أو العميل','Search order or customer'))+
    '<section class="section-block"><div class="section-title"><div><h2>'+esc(titleText)+'</h2><p>'+esc(subtitle)+'</p></div></div><div class="list-stack" data-admin-results>'+(rows.map(e=>operationalCard(e,operationTab==='payments'?'payment':'execution')).join('')||empty())+'</div></section>');
}
function directoryPanel(role){
  const rows=(state?.accounts||[]).filter(a=>a.role===role&&!a.deletedAt&&matches(a,'account'));
  return '<section class="section-block admin-directory"><div class="section-title"><div><h2>'+esc(role==='client'?tr('العملاء','Customers'):tr('الموردون','Suppliers'))+'</h2><p>'+esc(role==='client'?tr('بيانات العملاء وسجل طلباتهم وإدارة الحساب.','Customer details, order history, and account controls.'):tr('بيانات الموردين وعروضهم وطلباتهم النشطة.','Supplier details, offers, and active orders.'))+'</p></div></div>'+
    search(role==='client'?tr('ابحث باسم العميل أو الشركة','Search customer or company'):tr('ابحث باسم المورد أو الشركة','Search supplier or company'))+
    '<div class="list-stack" data-admin-results>'+((rows.slice(0,150).map(a=>'<button class="admin-account-row" data-admin-account="'+esc(a.id)+'"><div><strong>'+esc(a.company||a.name||'#'+String(a.id).slice(0,8))+'</strong><small>'+esc(a.country||'—')+(a.blockedAt?' · '+esc(tr('محظور','Blocked')):'')+'</small></div><span>›</span></button>').join(''))||empty())+'</div></section>';
}
function teamPanel(){
  const u=me(),admins=(state?.accounts||[]).filter(a=>a.role==='admin'&&!a.deletedAt);
  const owner=admins.find(a=>a.isOwner)||u;
  const rows=admins.filter(a=>!a.isOwner);
  const add=can('team')?'<button class="primary-small" type="button" data-admin-team-new>+ '+esc(tr('إضافة مدير','Add admin'))+'</button>':'';
  const ownerCard='<article class="admin-super-card"><div class="avatar">'+esc((owner?.name||owner?.email||'S').charAt(0).toUpperCase())+'</div><div><small>'+esc(tr('المدير الرئيسي','Super Admin'))+'</small><strong>'+esc(owner?.name||owner?.email||tr('حساب المالك','Owner account'))+'</strong><p>'+esc(tr('جميع الصلاحيات مفعلة دائمًا، ولا يمكن لمدير آخر تعديل هذا الحساب أو حظره.','All permissions are always enabled. Other admins cannot modify or block this account.'))+'</p></div><span>✓</span></article>';
  const list=rows.map(a=>'<article class="admin-team-row"><div><strong>'+esc(a.name||a.email||'#'+String(a.id).slice(0,8))+'</strong><small>'+esc(a.email||'')+(a.blockedAt?' · '+esc(tr('محظور','Blocked')):'')+'</small><div class="admin-team-permissions">'+(a.permissions||[]).slice(0,4).map(p=>'<span>'+esc((ADMIN_PERMISSION_META.find(x=>x[0]===p)||[p,p,p])[lang()==='ar'?1:2])+'</span>').join('')+((a.permissions||[]).length>4?'<span>+'+((a.permissions||[]).length-4)+'</span>':'')+'</div></div>'+(can('team')?'<button class="secondary-btn" type="button" data-admin-team-edit="'+esc(a.id)+'">'+esc(tr('إدارة','Manage'))+'</button>':'')+'</article>').join('');
  return '<section class="section-block admin-team-panel"><div class="section-title"><div><h2>'+esc(tr('المديرون والصلاحيات','Admins & permissions'))+'</h2><p>'+esc(tr('المالك يملك جميع الصلاحيات، ويمكن تفويض المديرين الآخرين حسب مهامهم.','The owner has all permissions; other admins can be delegated by role.'))+'</p></div>'+add+'</div>'+ownerCard+'<div class="admin-team-list">'+(list||empty())+'</div></section>';
}
function settingsPanel(){
  const u=me(),profile='<section class="profile-card admin-profile"><div class="avatar">'+esc((u?.name||u?.email||'M').charAt(0).toUpperCase())+'</div><h2>'+esc(u?.name||tr('الإدارة','Admin'))+'</h2><p>'+esc(u?.isOwner?tr('Super Admin — جميع الصلاحيات','Super Admin — full access'):tr('حساب إدارة','Admin account'))+'</p><button class="danger-btn" data-action="logout">'+esc(tr('تسجيل الخروج','Sign out'))+'</button></section>';
  return profile+bankAccountPanel()+categoryPanel();
}
function moreTabs(){
  return '<div class="admin-more-tabs">'+
    '<button class="'+(moreTab==='customers'?'active':'')+'" data-admin-more-tab="customers">👤<span>'+esc(tr('العملاء','Customers'))+'</span></button>'+
    '<button class="'+(moreTab==='suppliers'?'active':'')+'" data-admin-more-tab="suppliers">▣<span>'+esc(tr('الموردون','Suppliers'))+'</span></button>'+
    '<button class="'+(moreTab==='team'?'active':'')+'" data-admin-more-tab="team">♟<span>'+esc(tr('المديرون','Admins'))+'</span></button>'+
    '<button class="'+(moreTab==='settings'?'active':'')+'" data-admin-more-tab="settings">⚙<span>'+esc(tr('الإعدادات','Settings'))+'</span></button>'+
  '</div>';
}
function more(){
  let content='';
  if(moreTab==='suppliers')content=directoryPanel('supplier');
  else if(moreTab==='team')content=teamPanel();
  else if(moreTab==='settings')content=settingsPanel();
  else content=directoryPanel('client');
  setRoot('more',page(tr('المزيد','More'),tr('الحسابات والمديرون والإعدادات.','Accounts, admins, and platform settings.'))+moreTabs()+content);
}
export function renderAdminScreen(v=activeView()){
  if(!isAdmin()||v==='notifications')return false;
  if(v==='home')home();
  else if(v==='requests')requests();
  else if(v==='offers')offers();
  else if(v==='operations')operations();
  else if(v==='more'||v==='account')more();
  return true;
}
function render(){if(!document.getElementById('appView')?.classList.contains('hidden'))renderAdminScreen();}

function modal(titleText,kicker,html){const m=document.getElementById('modal');if(!m)return;document.getElementById('modalTitle').textContent=titleText;document.getElementById('modalKicker').textContent=kicker||'';document.getElementById('modalBody').innerHTML=html;m.classList.remove('hidden');hydrate(document.getElementById('modalBody'));}
function closeModal(){document.getElementById('modal')?.classList.add('hidden');}
function ownerBox(x){const o=ownerOf(x);if(!o)return'';return`<section class="admin-owner-box"><strong>${esc(tr('صاحب المحتوى','Content owner'))}</strong><p>${esc(o.company||o.name||'#'+String(o.id).slice(0,8))}</p>${can('accounts.read')?`<small>${esc(o.name||'')} ${o.phone?`· ${esc(o.phone)}`:''} ${o.email?`· ${esc(o.email)}`:''} ${o.country?`· ${esc(o.country)}`:''}</small>`:''}</section>`;}
function translations(x,editable){const t=x.translation||{},d=editable?'':'disabled';return`<div class="form-stack admin-translation"><label><span>${esc(tr('العنوان بالعربية','Arabic title'))}</span><input ${d} data-admin-tr="titleAr" value="${esc(t.titleAr||'')}"></label><label><span>${esc(tr('العنوان بالإنجليزية','English title'))}</span><input ${d} data-admin-tr="titleEn" value="${esc(t.titleEn||'')}"></label><label><span>${esc(tr('الوصف بالعربية','Arabic description'))}</span><textarea ${d} data-admin-tr="descriptionAr">${esc(t.descriptionAr||'')}</textarea></label><label><span>${esc(tr('الوصف بالإنجليزية','English description'))}</span><textarea ${d} data-admin-tr="descriptionEn">${esc(t.descriptionEn||'')}</textarea></label></div>`;}
function supplierPicker(x){const s=(state?.accounts||[]).filter(a=>a.role==='supplier'&&!a.deletedAt&&!a.blockedAt);return`<section class="admin-supplier-picker"><h3>${esc(tr('الموردون المدعوون','Invited suppliers'))}</h3><div class="admin-check-list">${s.map(a=>`<label><input type="checkbox" data-admin-supplier value="${esc(a.id)}" ${(x.supplierIds||[]).includes(a.id)?'checked':''}><span>${esc(a.company||a.name||'#'+String(a.id).slice(0,8))}</span></label>`).join('')}</div></section>`;}
function categorySelector(x){
  const rows=activeCategories(),current=x?.categoryId||'';
  if(!rows.length)return`<section class="admin-category-select-box"><strong>${esc(tr('التصنيف','Category'))}</strong><p>${esc(tr('أضف تصنيفًا من تبويب التصنيفات أولًا.','Add a category from the Categories tab first.'))}</p></section>`;
  return `<section class="admin-category-select-box"><label><span>${esc(tr('التصنيف','Category'))}</span><select data-admin-category-select><option value="">—</option>${rows.map(cat=>`<option value="${esc(cat.id)}" ${current===cat.id?'selected':''}>${esc(tr(cat.nameAr,cat.nameEn))}</option>`).join('')}</select></label></section>`;
}
function publicTranslationFields(x){
  const t=x.translation||{},editable=can('translate'),disabled=editable?'':'disabled';
  return `<div class="form-stack admin-public-translation"><label><span>${esc(tr('اسم المنتج بالعربية','Arabic product name'))}</span><input ${disabled} data-admin-public-tr="titleAr" value="${esc(t.titleAr||'')}"></label><label><span>${esc(tr('اسم المنتج بالإنجليزية','English product name'))}</span><input ${disabled} data-admin-public-tr="titleEn" value="${esc(t.titleEn||'')}"></label><label><span>${esc(tr('الوصف بالعربية','Arabic description'))}</span><textarea ${disabled} data-admin-public-tr="descriptionAr">${esc(t.descriptionAr||'')}</textarea></label><label><span>${esc(tr('الوصف بالإنجليزية','English description'))}</span><textarea ${disabled} data-admin-public-tr="descriptionEn">${esc(t.descriptionEn||'')}</textarea></label></div>`;
}
function publicOfferEditor(x){
  const cats=activeCategories(),canPublish=can('publish');
  const currentImages=(x.images||[]).map((src,i)=>`<label class="admin-image-tile"><input checked type="checkbox" data-admin-public-image-index="${i}"><span><img alt="" data-admin-media="${esc(src)}" data-image-viewer></span><small>${esc(tr('إبقاء الصورة','Keep image'))}</small></label>`).join('');
  return `<form id="adminPublicOfferForm" class="form-stack admin-public-offer-editor" data-id="${esc(x.id)}">
    <h3>${esc(tr('تعديل العرض العام','Edit public offer'))}</h3>
    <label><span>${esc(tr('اسم المنتج الأصلي','Original product name'))}</span><input name="product" required maxlength="300" value="${esc(x.product||'')}"></label>
    <label><span>${esc(tr('الوصف الأصلي','Original description'))}</span><textarea name="specs" required maxlength="10000">${esc(x.specs||'')}</textarea></label>
    <div class="form-two"><label><span>${esc(tr('السعر','Price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" required value="${esc(x.unitPrice||'')}"></label><label><span>${esc(tr('العملة','Currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(v=>`<option ${x.currency===v?'selected':''}>${v}</option>`).join('')}</select></label></div>
    <div class="form-two"><label><span>${esc(tr('الحد الأدنى','MOQ'))}</span><input name="moq" type="number" min="1" required value="${esc(x.moq||'')}"></label><label><span>${esc(tr('المخزون','Stock'))}</span><input name="stock" maxlength="100" value="${esc(x.stock||'')}"></label></div>
    <div class="form-two"><label><span>${esc(tr('مدة الإنتاج بالأيام','Production time (days)'))}</span><input name="leadTime" type="number" min="1" required value="${esc(x.leadTime||'')}"></label><label><span>${esc(tr('الدولة','Country'))}</span><input name="country" maxlength="100" value="${esc(x.country||'')}"></label></div>
    <label><span>${esc(tr('صالح حتى','Valid until'))}</span><input name="validUntil" type="date" value="${esc(x.validUntil||'')}"></label>
    <label><span>${esc(tr('التصنيف','Category'))}</span><select name="categoryId"><option value="">—</option>${cats.map(cat=>`<option value="${esc(cat.id)}" ${x.categoryId===cat.id?'selected':''}>${esc(tr(cat.nameAr,cat.nameEn))}</option>`).join('')}</select></label>
    ${canPublish?`<label><span>${esc(tr('حالة النشر','Publication status'))}</span><select name="status"><option value="published" ${x.status==='published'?'selected':''}>${esc(tr('منشور','Published'))}</option><option value="pending" ${x.status==='pending'?'selected':''}>${esc(tr('غير منشور / قيد المراجعة','Unpublished / pending'))}</option></select></label>`:''}
    <section><h3>${esc(tr('النص الظاهر للعملاء','Customer-facing text'))}</h3>${publicTranslationFields(x)}</section>
    <section><h3>${esc(tr('الصور الحالية','Current images'))}</h3><div class="admin-image-grid" data-viewer-gallery>${currentImages}</div></section>
    <label><span>${esc(tr('إضافة صور جديدة','Add new images'))}</span><input id="adminPublicFiles" type="file" accept="image/*" multiple><small>${esc(tr('يمكن اختيار صور كبيرة وسيتم ضغطها تلقائيًا. الحد الأقصى 5 صور إجمالًا.','Large images are compressed automatically. Maximum 5 images total.'))}</small></label>
    <label class="admin-category-toggle-label"><input type="checkbox" data-admin-public-redaction><span>${esc(tr('راجعت النصوص والصور ولا تحتوي على بيانات تواصل مباشرة.','I reviewed the text and images and they contain no direct contact details.'))}</span></label>
    <p class="form-message" data-admin-public-message></p>
    <button class="primary-btn" type="submit">${esc(tr('حفظ التعديلات','Save changes'))}</button>
  </form>`;
}
async function adminFilesToSources(input,maxFiles){
  try{return await filesToCompressedSources(input,{maxFiles});}
  catch(error){
    if(error?.message==='too_many')throw new Error(tr('الحد الأقصى 5 صور إجمالًا.','Maximum 5 images total.'));
    if(error?.message==='too_large')throw new Error(tr('الصورة الأصلية كبيرة جدًا. اختر صورة أقل من 25 MB.','The original image is too large. Choose an image under 25 MB.'));
    if(error?.message==='unsupported'||error?.message==='decode_failed')throw new Error(tr('تعذر قراءة هذه الصورة. جرّب صورة أخرى.','This image could not be read. Try another image.'));
    throw new Error(tr('تعذر ضغط الصورة. جرّب صورة أخرى.','The image could not be compressed. Try another image.'));
  }
}
async function uploadAdminSources(sources){
  const out=[];
  for(const source of sources){const result=await api('/api/v1/uploads',{method:'POST',body:{source}});out.push(result.src);}
  return out;
}
async function savePublicOffer(form){
  const x=(state?.publicOffers||[]).find(item=>item.id===form.dataset.id);if(!x)return;
  const message=form.querySelector('[data-admin-public-message]');
  try{
    message.textContent=tr('جارٍ تجهيز الصور...','Preparing images...');
    const kept=(x.images||[]).filter((src,i)=>form.querySelector(`[data-admin-public-image-index="${i}"]`)?.checked);
    const remaining=5-kept.length;if(remaining<0)throw new Error(tr('الحد الأقصى 5 صور إجمالًا.','Maximum 5 images total.'));
    const sources=await adminFilesToSources(form.querySelector('#adminPublicFiles'),remaining);
    message.textContent=sources.length?tr('جارٍ رفع الصور...','Uploading images...'):tr('جارٍ الحفظ...','Saving...');
    const uploaded=await uploadAdminSources(sources),images=[...kept,...uploaded];
    if(!images.length)throw new Error(tr('يجب الإبقاء على صورة واحدة على الأقل.','Keep at least one image.'));
    const patch={
      product:form.product.value.trim(),specs:form.specs.value.trim(),
      unitPrice:form.unitPrice.value,currency:form.currency.value,moq:form.moq.value,
      stock:form.stock.value.trim(),leadTime:form.leadTime.value,country:form.country.value.trim(),
      validUntil:form.validUntil.value,categoryId:form.categoryId.value,images
    };
    if(can('translate')){
      const translation={};form.querySelectorAll('[data-admin-public-tr]').forEach(el=>translation[el.dataset.adminPublicTr]=el.value.trim());
      if(Object.values(translation).some(v=>!v))throw new Error(tr('أكمل الاسم والوصف بالعربية والإنجليزية.','Complete the name and description in Arabic and English.'));
      patch.translation=translation;
    }
    if(can('publish'))patch.status=form.status.value;
    if(patch.status==='published'&&activeCategories().length&&!patch.categoryId)throw new Error(tr('اختر التصنيف أولًا.','Choose a category first.'));
    const redaction=form.querySelector('[data-admin-public-redaction]')?.checked;
    if((patch.status||x.status)==='published'&&!redaction)throw new Error(tr('أكد مراجعة النصوص والصور أولًا.','Confirm that you reviewed the text and images first.'));
    message.textContent=tr('جارٍ الحفظ...','Saving...');
    await mutate('publicOffers',x,patch,!!redaction);
    closeModal();schedule();toast(tr('تم تحديث العرض العام.','Public offer updated.'));
  }catch(error){message.textContent=error.message||tr('تعذر حفظ التعديلات.','Could not save changes.');}
}
const PAYMENT_STATUS_LABELS={
  awaiting_receipt:['بانتظار إيصال الدفع','Waiting for receipt'],
  receipt_submitted:['إيصال جديد بانتظار المراجعة','New receipt awaiting review'],
  confirmed:['تم تأكيد الدفع','Payment confirmed'],
  reupload_requested:['تم طلب إعادة رفع الإيصال','Receipt re-upload requested']
};
function paymentStatusLabel(value){const row=PAYMENT_STATUS_LABELS[value];return row?tr(row[0],row[1]):value||'—';}
function defaultPaymentMessage(x,kind){
  if(x?.paymentMessage)return x.paymentMessage;
  const number=kind==='request'&&ref(x)!=='—'?' #'+ref(x):'';
  return tr('يرجى إتمام عملية الدفع وإرفاق إيصال الدفع لتأكيد طلبك'+number+'. بعد إرسال الإيصال ستقوم الإدارة بمراجعته وإشعارك عند تأكيد الدفع.','Please complete payment and upload the receipt to confirm your order'+number+'. After submission, the admin will review it and notify you when payment is confirmed.');
}
function paymentReviewPanel(x,entityType){
  if(!x?.paymentStatus)return '';
  const receipt=x.paymentReceipt;
  const receiptHtml=receipt?.src?(receipt.mime==='application/pdf'
    ?'<button class="secondary-btn full" type="button" data-admin-payment-document="'+esc(receipt.src)+'">'+esc(tr('عرض إيصال PDF','View PDF receipt'))+'</button>'
    :'<div class="payment-receipt-preview" data-viewer-gallery><img alt="" data-admin-media="'+esc(receipt.src)+'" data-image-viewer></div>'):'';
  const review=x.paymentStatus==='receipt_submitted'?'<label><span>'+esc(tr('ملاحظة عند طلب إعادة الرفع','Note if requesting re-upload'))+'</span><textarea data-admin-payment-review-note maxlength="1000"></textarea></label><div class="admin-review-actions"><button class="secondary-btn" type="button" data-admin-payment-reupload="'+esc(x.id)+'" data-entity-type="'+entityType+'">'+esc(tr('طلب إعادة رفع الإيصال','Request re-upload'))+'</button><button class="primary-btn" type="button" data-admin-payment-confirm="'+esc(x.id)+'" data-entity-type="'+entityType+'">'+esc(tr('تأكيد الدفع','Confirm payment'))+'</button></div>':'';
  const note=x.paymentReviewNote?'<p class="payment-review-note"><b>'+esc(tr('ملاحظة الإدارة','Admin note'))+':</b> '+esc(x.paymentReviewNote)+'</p>':'';
  return '<section class="admin-payment-review"><div class="payment-card-head"><div><small>'+esc(tr('حالة الدفع','Payment status'))+'</small><strong>'+esc(paymentStatusLabel(x.paymentStatus))+'</strong></div></div>'+receiptHtml+note+review+'</section>';
}
function paymentMessageField(x,kind,current){
  const hidden=current==='payment_confirmation'?'':' hidden',allBanks=activeBankAccounts(),pricing=kind==='request'?requestPricing(x):interestPricing(x);
  const derivedCurrency=pricing?.currency||'',currency=derivedCurrency||(x?.paymentCurrency||x?.paymentBankAccount?.currency||'AED');
  const matchingBanks=derivedCurrency?allBanks.filter(a=>a.currency===derivedCurrency):allBanks;
  const priorSelected=x?.paymentBankAccountId||x?.paymentBankAccount?.id||'',validPrior=matchingBanks.some(a=>a.id===priorSelected)?priorSelected:'';
  const selected=validPrior||(matchingBanks.length===1?matchingBanks[0].id:'');
  const banks=matchingBanks;
  const bankSelect=banks.length?'<label><span>'+esc(tr('حساب استلام المبلغ','Receiving bank account'))+'</span><select data-admin-payment-bank required><option value="">—</option>'+banks.map(a=>'<option value="'+esc(a.id)+'" '+(selected===a.id?'selected':'')+'>'+esc(a.label||a.bankName)+' · '+esc(a.currency||'')+'</option>').join('')+'</select></label>':'<p class="payment-review-note">'+esc(derivedCurrency?tr('لا يوجد حساب بنكي نشط بعملة '+derivedCurrency+'. أضف حسابًا بهذه العملة من صفحة الحسابات.','There is no active bank account in '+derivedCurrency+'. Add one from the Accounts page.'):tr('أضف حسابًا بنكيًا نشطًا من صفحة الحسابات أولًا.','Add an active bank account from the Accounts page first.'))+'</p>';
  const amount=x?.paymentAmount||pricing?.total||'';
  const currencyField=pricing?'<label><span>'+esc(tr('العملة','Currency'))+'</span><select data-admin-payment-currency disabled>'+['AED','SAR','USD','CNY','EUR'].map(v=>'<option '+(currency===v?'selected':'')+'>'+v+'</option>').join('')+'</select><small>'+esc(kind==='request'?tr('تُحدد تلقائيًا من العرض المختار.','Set automatically from the selected quote.'):tr('تُحدد تلقائيًا من العرض العام.','Set automatically from the public offer.'))+'</small></label>':'<label><span>'+esc(tr('العملة','Currency'))+'</span><select data-admin-payment-currency>'+['AED','SAR','USD','CNY','EUR'].map(v=>'<option '+(currency===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
  const amountHint=pricing?'<small>'+esc(tr('تم تعبئة الإجمالي تلقائيًا. يمكنك تخفيض المبلغ إذا كانت هذه دفعة جزئية أو عربونًا.','The total is filled automatically. You can reduce it for a partial payment or deposit.'))+'</small>':'';
  return '<section class="admin-payment-message-field'+hidden+'"><h4>'+esc(tr('بيانات الدفع','Payment details'))+'</h4>'+bankSelect+'<div class="form-two"><label><span>'+esc(tr('المبلغ المطلوب','Amount due'))+'</span><input type="number" min="0.01" step="0.01" data-admin-payment-amount value="'+esc(amount)+'" required>'+amountHint+'</label>'+currencyField+'</div><label><span>'+esc(tr('رسالة الدفع للعميل','Payment message to customer'))+'</span><textarea data-admin-payment-message maxlength="2000">'+esc(defaultPaymentMessage(x,kind))+'</textarea><small>'+esc(tr('سيشاهد العميل بيانات الحساب والمبلغ داخل الطلب ثم يرفع الإيصال.','The customer will see the account details and amount inside the order, then upload the receipt.'))+'</small></label></section>';
}
function interestTrackingEditor(x){
  const current=interestTracking(x),supplier=supplierExecutionInfo(x,'interest'),canPay=supplier.confirmed||current==='payment_confirmation';
  const approve=current==='received'?'<button class="primary-btn admin-send-to-supplier" type="button" data-admin-send-interest-supplier="'+esc(x.id)+'">'+esc(tr('اعتماد وإرسال للمورد','Approve & send to supplier'))+'</button>':'';
  return '<section class="admin-tracking-editor"><h3>'+esc(tr('متابعة طلب المنتج الجاهز','Ready-product order tracking'))+'</h3>'+approve+'<label><span>'+esc(tr('الحالة الحالية','Current status'))+'</span><select data-admin-interest-tracking-status>'+trackingOptions(READY_TRACKING,current,canPay)+'</select></label>'+paymentMessageField(x,'interest',current)+'<label><span>'+esc(tr('ملاحظة للعميل (اختياري)','Customer note (optional)'))+'</span><textarea data-admin-interest-tracking-note maxlength="1000">'+esc(x.trackingNote||'')+'</textarea></label><small>'+(x.trackingUpdatedAt?esc(tr('آخر تحديث','Last update'))+': '+esc(date(x.trackingUpdatedAt)):'')+'</small><button class="primary-btn" type="button" data-admin-save-interest-tracking="'+esc(x.id)+'">'+esc(tr('حفظ حالة الطلب','Save order status'))+'</button></section>'+paymentReviewPanel(x,'interest');
}
function adminRequestOverview(x){
  return '<section class="admin-order-overview"><div><small>#'+esc(ref(x))+' · '+esc(tr('طلب خاص','Custom request'))+'</small><strong>'+esc(title(x))+'</strong></div><div class="admin-order-overview-facts"><span>'+esc(tr('الحالة','Status'))+': '+esc(status(requestTracking(x)))+'</span><span>'+esc(tr('الكمية','Quantity'))+': '+esc(x.quantity||'—')+'</span><span>'+esc(tr('الدولة','Country'))+': '+esc(x.country||'—')+'</span></div></section>';
}
function activityLog(x,kind){
  const rows=[];
  const push=(at,label,note='',actorId='')=>{if(at)rows.push({at,label,note,actorId});};
  (x?.trackingHistory||[]).forEach(h=>push(h.at,tr('حالة الطلب: ','Order status: ')+status(h.status),h.note||''));
  const executionSource=kind==='request'?selectedQuoteForRequest(x):x;
  (executionSource?.supplierOrderHistory||[]).forEach(h=>push(h.at,tr('المورد: ','Supplier: ')+status(h.status),h.note||''));
  (x?.paymentHistory||[]).forEach(h=>push(h.at,tr('الدفع: ','Payment: ')+status(h.status),h.note||''));
  (x?.moderationHistory||[]).forEach(h=>push(h.at,tr('إجراء إداري: ','Admin action: ')+status(h.action),h.reason||h.note||'',h.actorId||''));
  rows.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
  if(!rows.length)return '';
  return '<section class="admin-activity-log"><div class="section-title"><div><h3>'+esc(tr('سجل النشاط','Activity log'))+'</h3><p>'+esc(tr('آخر التغييرات على الطلب.','Recent changes to this order.'))+'</p></div></div><div class="admin-activity-list">'+rows.slice(0,30).map(h=>{const actor=h.actorId?account(h.actorId):null;return '<article><span></span><div><strong>'+esc(h.label)+'</strong><small>'+esc(date(h.at))+(actor?' · '+esc(actor.name||actor.email||tr('مدير','Admin')):'')+'</small>'+(h.note?'<p>'+esc(h.note)+'</p>':'')+'</div></article>';}).join('')+'</div></section>';
}
function openInterest(id){
  const x=(state?.interests||[]).find(item=>item.id===id);if(!x)return;
  const offer=(state?.publicOffers||[]).find(o=>o.id===x.offerId),customer=account(x.customerId);
  const pricing=interestPricing(x);
  const orderSummary=pricing?'<section class="admin-selected-quote-card"><div class="admin-selected-quote-head"><div><small>'+esc(tr('طلب العرض العام','Public-offer order'))+'</small><strong>#'+esc(ref(x))+'</strong></div><span class="status-pill status-published">'+esc(tr('الكمية محددة','Quantity selected'))+'</span></div><div class="admin-selected-quote-values"><div><span>'+esc(tr('سعر الوحدة','Unit price'))+'</span><strong>'+esc(formatMoney(pricing.unitPrice,pricing.currency))+'</strong></div><div><span>'+esc(tr('الكمية','Quantity'))+'</span><strong>'+esc(Number(pricing.quantity).toLocaleString())+'</strong></div><div class="total"><span>'+esc(tr('الإجمالي','Total'))+'</span><strong>'+esc(formatMoney(pricing.total,pricing.currency))+'</strong></div></div><small>'+esc(tr('تم تثبيت السعر والعملة وقت تقديم العميل للطلب.','Price and currency were captured when the customer placed the request.'))+'</small></section>':'';
  const html=(customer?'<section class="admin-owner-box"><strong>'+esc(tr('العميل','Customer'))+'</strong><p>'+esc(customer.company||customer.name||'—')+'</p>'+(can('accounts.read')?'<small>'+esc(customer.name||'')+(customer.phone?' · '+esc(customer.phone):'')+(customer.email?' · '+esc(customer.email):'')+'</small>':'')+'</section>':'')+orderSummary+supplierConfirmationCard(x,'interest')+interestTrackingEditor(x)+(offer?'<section class="admin-source-box"><h3>'+esc(tr('المنتج','Product'))+'</h3><strong>'+esc(title(offer))+'</strong><p>'+esc(desc(offer)||'—')+'</p></section>'+gallery(offer.images||[]):'')+activityLog(x,'interest');
  modal(offer?title(offer):tr('طلب منتج جاهز','Ready-product request'),'#'+ref(offer),html);
}
async function saveInterestTracking(id){
  const x=(state?.interests||[]).find(item=>item.id===id);if(!x)return;
  const trackingStatus=document.querySelector('[data-admin-interest-tracking-status]')?.value,trackingNote=document.querySelector('[data-admin-interest-tracking-note]')?.value||'';
  const patch={trackingStatus,trackingNote};
  if(trackingStatus==='payment_confirmation'){if(!supplierExecutionInfo(x,'interest').confirmed&&interestTracking(x)!=='payment_confirmation'){toast(tr('يجب أن يؤكد المورد التنفيذ قبل الانتقال للدفع.','Supplier must confirm fulfillment before payment.'));return;}const pricing=interestPricing(x),paymentMessage=document.querySelector('[data-admin-payment-message]')?.value.trim()||'',paymentBankAccountId=document.querySelector('[data-admin-payment-bank]')?.value||'',paymentAmount=document.querySelector('[data-admin-payment-amount]')?.value||'',paymentCurrency=pricing?.currency||document.querySelector('[data-admin-payment-currency]')?.value||'';if(!paymentMessage){toast(tr('اكتب رسالة الدفع للعميل.','Add a payment message for the customer.'));return;}if(!paymentBankAccountId||!paymentAmount||!paymentCurrency){toast(tr('اختر الحساب البنكي وأدخل مبلغ الدفع.','Choose the bank account and enter the payment amount.'));return;}Object.assign(patch,{paymentMessage,paymentBankAccountId,paymentAmount,paymentCurrency});}
  try{await mutate('interests',x,patch);closeModal();schedule();toast(tr('تم تحديث حالة الطلب.','Order status updated.'));}catch(e){toast(e.message);}
}
async function sendInterestToSupplier(id){
  const x=(state?.interests||[]).find(item=>item.id===id);if(!x)return;
  try{await mutate('interests',x,{trackingStatus:'supplier_confirmation',trackingNote:''});closeModal();schedule();toast(tr('تم اعتماد الطلب وإرساله للمورد للتأكيد.','Order approved and sent to the supplier for confirmation.'));}catch(e){toast(e.message);}
}
function trackingEditor(x){
  const current=requestTracking(x),supplier=supplierExecutionInfo(x,'request'),canPay=supplier.confirmed||current==='payment_confirmation';
  return '<section class="admin-tracking-editor"><h3>'+esc(tr('متابعة الطلب','Order tracking'))+'</h3><label><span>'+esc(tr('الحالة الحالية','Current status'))+'</span><select data-admin-tracking-status>'+trackingOptions(TRACKING,current,canPay)+'</select></label>'+paymentMessageField(x,'request',current)+'<label><span>'+esc(tr('ملاحظة للعميل (اختياري)','Customer note (optional)'))+'</span><textarea data-admin-tracking-note maxlength="1000">'+esc(x.trackingNote||'')+'</textarea></label><small>'+(x.trackingUpdatedAt?esc(tr('آخر تحديث','Last update'))+': '+esc(date(x.trackingUpdatedAt)):'')+'</small><button class="primary-btn" type="button" data-admin-save-tracking="'+esc(x.id)+'">'+esc(tr('حفظ حالة الطلب','Save order status'))+'</button></section>'+paymentReviewPanel(x,'request');
}
async function reviewPayment(entityType,id,action){
  const rows=entityType==='request'?(state?.requests||[]):(state?.interests||[]),x=rows.find(item=>item.id===id);if(!x)return;
  const note=document.querySelector('[data-admin-payment-review-note]')?.value.trim()||'';
  if(action==='reupload'&&!note){toast(tr('اكتب سبب طلب إعادة رفع الإيصال.','Add a reason for requesting a new receipt.'));return;}
  try{await api('/api/v1/payment-review',{method:'POST',body:{entityType,entityId:id,version:Number(x.version||0),action,note}});await reload();closeModal();schedule();toast(action==='confirm'?tr('تم تأكيد الدفع.','Payment confirmed.'):tr('تم طلب إعادة رفع الإيصال.','Receipt re-upload requested.'));}catch(e){toast(e.message);}
}
async function openAdminPaymentDocument(src){const url=await imageUrl(src);if(!url){toast(tr('تعذر فتح الإيصال.','Could not open receipt.'));return;}modal(tr('إيصال الدفع','Payment receipt'),'PDF','<div class="pdf-preview-wrap"><iframe class="pdf-preview-frame" title="'+esc(tr('إيصال الدفع','Payment receipt'))+'" src="'+esc(url)+'"></iframe><a class="secondary-btn full pdf-fallback-link" href="'+esc(url)+'" target="_self">'+esc(tr('فتح الملف مباشرة','Open file directly'))+'</a></div>');}
export function openAdminPayment(entityType,id){if(!isAdmin())return;if(entityType==='request')openRecord('request',id);else if(entityType==='interest')openInterest(id);}
function bankAccountDialog(id=''){
  const current=bankAccounts().find(x=>x.id===id);
  modal(current?tr('تعديل الحساب البنكي','Edit bank account'):tr('إضافة حساب بنكي','Add bank account'),'M Platform','<form id="adminBankAccountForm" class="form-stack" data-id="'+esc(current?.id||'')+'"><label><span>'+esc(tr('اسم مختصر للحساب','Account label'))+'</span><input name="label" required maxlength="100" value="'+esc(current?.label||'')+'"></label><label><span>'+esc(tr('اسم المستفيد','Beneficiary'))+'</span><input name="beneficiary" required maxlength="160" value="'+esc(current?.beneficiary||'')+'"></label><label><span>'+esc(tr('اسم البنك','Bank name'))+'</span><input name="bankName" required maxlength="160" value="'+esc(current?.bankName||'')+'"></label><label><span>IBAN</span><input name="iban" maxlength="120" value="'+esc(current?.iban||'')+'"></label><label><span>SWIFT / BIC</span><input name="swift" maxlength="40" value="'+esc(current?.swift||'')+'"></label><label><span>'+esc(tr('رقم الحساب','Account number'))+'</span><input name="accountNumber" maxlength="120" value="'+esc(current?.accountNumber||'')+'"></label><div class="form-two"><label><span>'+esc(tr('الدولة','Country'))+'</span><input name="country" maxlength="100" value="'+esc(current?.country||'')+'"></label><label><span>'+esc(tr('العملة','Currency'))+'</span><select name="currency">'+['AED','SAR','USD','CNY','EUR'].map(v=>'<option '+((current?.currency||'AED')===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><label class="admin-category-toggle-label"><input type="checkbox" name="active" '+(current?.active===false?'':'checked')+'><span>'+esc(tr('الحساب نشط','Account active'))+'</span></label><small>'+esc(tr('يجب إدخال IBAN أو رقم الحساب على الأقل.','Enter at least an IBAN or account number.'))+'</small><button class="primary-btn" type="submit">'+esc(tr('حفظ','Save'))+'</button></form>');
}
async function saveBankAccounts(rows){
  try{await api('/api/v1/settings',{method:'POST',body:{version:Number(state.settings?._version||0),data:{bankAccounts:rows}}});await reload();schedule();toast(tr('تم حفظ الحسابات البنكية.','Bank accounts saved.'));return true;}catch(e){toast(e.message);return false;}
}
async function submitBankAccount(form){
  const id=form.dataset.id||crypto.randomUUID(),rows=bankAccounts(),next={id,label:form.label.value.trim(),beneficiary:form.beneficiary.value.trim(),bankName:form.bankName.value.trim(),iban:form.iban.value.trim(),swift:form.swift.value.trim(),accountNumber:form.accountNumber.value.trim(),country:form.country.value.trim(),currency:form.currency.value,active:form.active.checked};
  if(!next.iban&&!next.accountNumber){toast(tr('أدخل IBAN أو رقم الحساب.','Enter an IBAN or account number.'));return;}
  const index=rows.findIndex(x=>x.id===id);if(index>=0)rows[index]={...rows[index],...next};else rows.push(next);
  if(await saveBankAccounts(rows))closeModal();
}
async function toggleBankAccount(id){const rows=bankAccounts(),x=rows.find(a=>a.id===id);if(!x)return;x.active=x.active===false;await saveBankAccounts(rows);}
async function deleteBankAccount(id){await saveBankAccounts(bankAccounts().filter(x=>x.id!==id));}
function categoryDialog(id=''){
  const current=categories().find(cat=>cat.id===id);
  modal(current?tr('تعديل التصنيف','Edit category'):tr('إضافة تصنيف','Add category'),'M Platform',`<form id="adminCategoryForm" class="form-stack" data-id="${esc(current?.id||'')}"><label><span>${esc(tr('الاسم بالعربية','Arabic name'))}</span><input name="nameAr" required maxlength="80" value="${esc(current?.nameAr||'')}"></label><label><span>${esc(tr('الاسم بالإنجليزية','English name'))}</span><input name="nameEn" required maxlength="80" value="${esc(current?.nameEn||'')}"></label><label class="admin-category-toggle-label"><input type="checkbox" name="active" ${current?.active===false?'':'checked'}><span>${esc(tr('إظهار التصنيف للعملاء','Show category to customers'))}</span></label><button class="primary-btn" type="submit">${esc(tr('حفظ','Save'))}</button></form>`);
}
async function saveCategories(rows){
  try{await api('/api/v1/settings',{method:'POST',body:{version:Number(state.settings?._version||0),data:{categories:rows}}});await reload();schedule();toast(tr('تم حفظ التصنيفات.','Categories saved.'));return true;}catch(e){toast(e.message);return false;}
}
async function submitCategory(form){
  const id=form.dataset.id||crypto.randomUUID(),rows=categories(),next={id,nameAr:form.nameAr.value.trim(),nameEn:form.nameEn.value.trim(),active:form.active.checked};
  const index=rows.findIndex(cat=>cat.id===id);if(index>=0)rows[index]={...rows[index],...next};else rows.push(next);
  if(await saveCategories(rows))closeModal();
}
async function moveCategory(id,direction){const rows=categories(),i=rows.findIndex(cat=>cat.id===id),j=i+Number(direction);if(i<0||j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];await saveCategories(rows);}
async function toggleCategory(id){const rows=categories(),cat=rows.find(x=>x.id===id);if(!cat)return;cat.active=cat.active===false;await saveCategories(rows);}
async function deleteCategory(id){await saveCategories(categories().filter(cat=>cat.id!==id));}
async function saveTracking(id){
  const x=(state?.requests||[]).find(item=>item.id===id);if(!x)return;
  const trackingStatus=document.querySelector('[data-admin-tracking-status]')?.value,trackingNote=document.querySelector('[data-admin-tracking-note]')?.value||'';
  const patch={trackingStatus,trackingNote};
  if(trackingStatus==='payment_confirmation'){if(!supplierExecutionInfo(x,'request').confirmed&&requestTracking(x)!=='payment_confirmation'){toast(tr('يجب أن يؤكد المورد التنفيذ قبل الانتقال للدفع.','Supplier must confirm fulfillment before payment.'));return;}const paymentMessage=document.querySelector('[data-admin-payment-message]')?.value.trim()||'',paymentBankAccountId=document.querySelector('[data-admin-payment-bank]')?.value||'',paymentAmount=document.querySelector('[data-admin-payment-amount]')?.value||'',paymentCurrency=document.querySelector('[data-admin-payment-currency]')?.value||'';if(!paymentMessage){toast(tr('اكتب رسالة الدفع للعميل.','Add a payment message for the customer.'));return;}if(!paymentBankAccountId||!paymentAmount){toast(tr('اختر الحساب البنكي وأدخل مبلغ الدفع.','Choose the bank account and enter the payment amount.'));return;}Object.assign(patch,{paymentMessage,paymentBankAccountId,paymentAmount,paymentCurrency});}
  try{await mutate('requests',x,patch);closeModal();schedule();toast(tr('تم تحديث حالة الطلب.','Order status updated.'));}catch(e){toast(e.message);}
}
async function savePublicCategory(id){
  const x=(state?.publicOffers||[]).find(item=>item.id===id),categoryId=document.querySelector('[data-admin-category-select]')?.value||'';if(!x)return;
  try{await mutate('publicOffers',x,{categoryId});closeModal();schedule();toast(tr('تم تحديث التصنيف.','Category updated.'));}catch(e){toast(e.message);}
}
function openRecord(kind,id){
  const arr=kind==='request'?state?.requests:kind==='quote'?state?.quotes:state?.publicOffers,x=(arr||[]).find(v=>v.id===id);if(!x)return;
  const pending=kind==='request'?x.status==='review':x.status==='pending',editPerm=kind==='request'?'requests.edit':'offers.edit',editImages=pending&&can(editPerm),editTr=pending&&can('translate'),approve=pending&&can('publish'),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null;
  let html=(kind==='request'?adminRequestOverview(x):'')+ownerBox(x)+`<section class="admin-source-box"><h3>${esc(tr('المحتوى الأصلي','Original content'))}</h3><strong>${esc(x.product||linked?.product||title(x))}</strong><p>${esc(x.specs||x.notes||'—')}</p>${kind==='request'?`<div class="facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(x.quantity||'—')}</span><span>${esc(tr('الدولة','Country'))}: ${esc(x.country||'—')}</span><span>${esc(tr('تاريخ الاحتياج','Needed date'))}: ${esc(x.neededDate||'—')}</span></div>${x.repeatedFromRequestId?`<p class="payment-review-note"><b>${esc(tr('طلب مكرر من','Repeated from'))}:</b> #${esc(ref((state?.requests||[]).find(r=>r.id===x.repeatedFromRequestId)||{id:x.repeatedFromRequestId}))}</p>`:''}`:''}${linked?`<div class="facts"><span>${esc(tr('الطلب المرتبط','Linked request'))}: #${esc(ref(linked))}</span></div>`:''}</section>`;
  if(kind==='request'&&(can('requests.edit')||can('publish')))html+=selectedQuoteCard(x)+supplierConfirmationCard(x,'request')+trackingEditor(x);
  if(kind==='public'&&can('offers.edit'))html+=publicOfferEditor(x);
  if(kind!=='public'||!can('offers.edit'))html+=`<section><h3>${esc(tr('الصور','Images'))}</h3>${gallery(x.images||[],editImages)||`<p class="muted">${esc(tr('لا توجد صور.','No images.'))}</p>`}</section><section><h3>${esc(tr('الترجمة','Translation'))}</h3>${translations(x,editTr)}</section>`;
  if(kind==='request'&&pending&&can('publish'))html+=supplierPicker(x);
  if(pending&&!(kind==='public'&&can('offers.edit'))){
    html+=`<section class="admin-redaction"><h3>${esc(tr('فحص الخصوصية','Privacy check'))}</h3><label><input type="checkbox" data-admin-redact="identity"><span>${esc(tr('تمت مراجعة الصور والنصوص وإزالة الهوية.','Images and text were checked and identity removed.'))}</span></label><label><input type="checkbox" data-admin-redact="contact"><span>${esc(tr('تمت إزالة بيانات التواصل المباشر.','Direct contact details were removed.'))}</span></label></section><div class="admin-review-actions">${editTr?`<button class="secondary-btn" data-admin-save-review data-kind="${kind}" data-id="${esc(x.id)}">${esc(tr('حفظ دون نشر','Save without publishing'))}</button>`:''}${approve?`<button class="primary-btn" data-admin-approve data-kind="${kind}" data-id="${esc(x.id)}">${esc(tr('اعتماد ونشر','Approve & publish'))}</button>`:''}</div>`;
  }else if(kind==='request'&&x.status==='sent'&&can('publish'))html+=`<div class="admin-review-actions"><button class="secondary-btn" data-admin-reopen-request data-id="${esc(x.id)}">${esc(tr('إعادة للمراجعة','Return to review'))}</button><button class="primary-btn" data-admin-complete-request data-id="${esc(x.id)}">${esc(tr('تحديد كمكتمل','Mark completed'))}</button></div>`;
  html+=activityLog(x,kind);
  modal(`#${ref(x)} — ${title(x)}`,kind==='request'?status(requestTracking(x)):status(x.status),html);
}
function openAccount(id){
  const a=account(id);if(!a)return;
  const req=(state?.requests||[]).filter(r=>r.customerId===id),ints=(state?.interests||[]).filter(x=>x.customerId===id),qs=(state?.quotes||[]).filter(q=>q.supplierId===id),po=(state?.publicOffers||[]).filter(o=>o.supplierId===id);
  const publicOrderCount=a.role==='supplier'?(state?.interests||[]).filter(i=>po.some(o=>o.id===i.offerId)).length:ints.length;
  const controls=(can('moderate')||can('trash'))?'<div class="admin-account-controls">'+
    (can('moderate')?'<button class="secondary-btn" type="button" data-admin-account-moderate="'+esc(a.id)+'" data-action="'+(a.blockedAt?'unblock':'block')+'">'+esc(a.blockedAt?tr('إلغاء الحظر','Unblock'):tr('حظر الحساب','Block account'))+'</button>':'')+
    (can('trash')?'<button class="danger-btn" type="button" data-admin-account-moderate="'+esc(a.id)+'" data-action="delete">'+esc(tr('حذف الحساب','Delete account'))+'</button>':'')+
  '</div>':'';
  const history=a.role==='client'
    ?'<span>'+esc(tr('الطلبات الخاصة','Custom requests'))+': '+req.length+'</span><span>'+esc(tr('طلبات العروض العامة','Public-offer orders'))+': '+publicOrderCount+'</span>'
    :'<span>'+esc(tr('العروض المقدمة','Submitted quotes'))+': '+qs.length+'</span><span>'+esc(tr('العروض العامة','Public offers'))+': '+po.length+'</span><span>'+esc(tr('طلبات التنفيذ','Orders'))+': '+publicOrderCount+'</span>';
  modal(a.company||a.name||'#'+String(a.id).slice(0,8),a.role==='client'?tr('عميل','Customer'):tr('مورد','Supplier'),
    '<dl class="admin-account-details"><div><dt>'+esc(tr('الاسم','Name'))+'</dt><dd>'+esc(a.name||'—')+'</dd></div><div><dt>'+esc(tr('الشركة','Company'))+'</dt><dd>'+esc(a.company||'—')+'</dd></div><div><dt>'+esc(tr('رقم التواصل','Phone'))+'</dt><dd>'+esc(a.phone||'—')+'</dd></div><div><dt>'+esc(tr('البريد','Email'))+'</dt><dd>'+esc(a.email||'—')+'</dd></div><div><dt>'+esc(tr('الدولة','Country'))+'</dt><dd>'+esc(a.country||'—')+'</dd></div><div><dt>'+esc(tr('الحالة','Status'))+'</dt><dd>'+esc(a.blockedAt?tr('محظور','Blocked'):tr('نشط','Active'))+'</dd></div></dl>'+
    '<h3>'+esc(tr('السجل','History'))+'</h3><div class="facts">'+history+'</div>'+controls);
}
function moderationDialog(id,action){
  const a=account(id);if(!a)return;
  const label=action==='delete'?tr('حذف الحساب','Delete account'):action==='block'?tr('حظر الحساب','Block account'):tr('إلغاء حظر الحساب','Unblock account');
  modal(label,a.company||a.name||a.email||'#'+String(a.id).slice(0,8),
    '<form id="adminModerationForm" class="form-stack" data-id="'+esc(id)+'" data-action="'+esc(action)+'"><p class="payment-review-note">'+esc(action==='delete'?tr('سيتم حذف الحساب من الاستخدام مع الاحتفاظ بالسجل الإداري.','The account will be removed from use while retaining the administrative record.'):tr('اكتب سبب الإجراء ليظهر في السجل الإداري.','Add a reason for the administrative record.'))+'</p><label><span>'+esc(tr('السبب','Reason'))+'</span><textarea name="reason" required maxlength="1000"></textarea></label><button class="'+(action==='delete'?'danger-btn':'primary-btn')+'" type="submit">'+esc(label)+'</button></form>');
}
async function submitModeration(form){
  const id=form.dataset.id,action=form.dataset.action,reason=form.reason.value.trim();if(!reason)return;
  try{await api('/api/v1/moderation',{method:'POST',body:{kind:'account',id,action,reason}});await reload();closeModal();schedule();toast(tr('تم تحديث الحساب.','Account updated.'));}catch(e){toast(e.message);}
}
function teamDialog(id=''){
  const current=id?account(id):null;
  if(current?.isOwner){toast(tr('حساب المدير الرئيسي محمي.','The Super Admin account is protected.'));return;}
  const checks=ADMIN_PERMISSION_META.map(([key,ar,en])=>'<label class="admin-permission-check"><input type="checkbox" name="permission" value="'+esc(key)+'" '+((current?.permissions||[]).includes(key)?'checked':'')+'><span><strong>'+esc(tr(ar,en))+'</strong><small>'+esc(key)+'</small></span></label>').join('');
  const identity=current?'<div class="admin-team-identity"><strong>'+esc(current.name||current.email||'#'+String(current.id).slice(0,8))+'</strong><small>'+esc(current.email||'')+'</small></div>':'<label><span>'+esc(tr('بريد حساب المدير','Admin account email'))+'</span><input name="email" type="email" required autocomplete="off"></label>';
  const block=current?'<button class="secondary-btn" type="button" data-admin-team-toggle="'+esc(current.id)+'" data-action="'+(current.blockedAt?'unblock':'block')+'">'+esc(current.blockedAt?tr('إلغاء الحظر','Unblock'):tr('حظر المدير','Block admin'))+'</button>':'';
  modal(current?tr('صلاحيات المدير','Admin permissions'):tr('إضافة مدير','Add admin'),tr('إدارة الفريق','Team management'),
    '<form id="adminTeamForm" class="form-stack" data-id="'+esc(current?.id||'')+'">'+identity+'<div class="admin-permission-grid">'+checks+'</div><div class="admin-team-dialog-actions">'+block+'<button class="primary-btn" type="submit">'+esc(tr('حفظ الصلاحيات','Save permissions'))+'</button></div></form>');
}
async function submitTeam(form){
  const id=form.dataset.id,email=form.email?.value.trim().toLowerCase()||'',permissions=[...form.querySelectorAll('input[name="permission"]:checked')].map(x=>x.value);
  try{await api('/api/v1/team',{method:'POST',body:{action:'save',...(id?{id}:{email}),permissions,reason:'Admin permissions updated'}});await reload();closeModal();schedule();toast(tr('تم حفظ صلاحيات المدير.','Admin permissions saved.'));}catch(e){toast(e.message);}
}
async function toggleTeam(id,action){
  const a=account(id);if(!a||a.isOwner)return;
  try{await api('/api/v1/team',{method:'POST',body:{id,action,permissions:a.permissions||[],reason:'Admin access updated'}});await reload();closeModal();schedule();toast(tr('تم تحديث حساب المدير.','Admin account updated.'));}catch(e){toast(e.message);}
}
function readForm(x){const translation={};document.querySelectorAll('[data-admin-tr]').forEach(e=>translation[e.dataset.adminTr]=e.value.trim());const images=[];(x.images||[]).forEach((src,i)=>{const b=document.querySelector(`[data-admin-image-index="${i}"]`);if(!b||b.checked)images.push(src);});return{translation,images,suppliers:[...document.querySelectorAll('[data-admin-supplier]:checked')].map(e=>e.value),categoryId:document.querySelector('[data-admin-category-select]')?.value||'',identity:document.querySelector('[data-admin-redact="identity"]')?.checked,contact:document.querySelector('[data-admin-redact="contact"]')?.checked};}
async function approve(kind,id){const arr=kind==='request'?state.requests:kind==='quote'?state.quotes:state.publicOffers,x=arr.find(v=>v.id===id);if(!x)return;const f=readForm(x);if(Object.values(f.translation).some(v=>!v)){toast(tr('أكمل العنوان والوصف بالعربية والإنجليزية.','Complete Arabic and English title and description.'));return;}if(!f.identity||!f.contact){toast(tr('أكمل فحص إزالة الهوية وبيانات التواصل.','Complete both privacy checks.'));return;}if(kind==='request'&&!f.suppliers.length){toast(tr('اختر موردًا واحدًا على الأقل.','Select at least one supplier.'));return;}const patch={translation:f.translation,reviewedAt:new Date().toISOString(),status:kind==='request'?'sent':'published'},editPerm=kind==='request'?'requests.edit':'offers.edit';if(can(editPerm))patch.images=f.images;if(kind==='request')patch.supplierIds=f.suppliers;if(kind==='public'){if(activeCategories().length&&!f.categoryId){toast(tr('اختر التصنيف أولًا.','Choose a category first.'));return;}patch.categoryId=f.categoryId;}try{await mutate(kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers',x,patch,true);closeModal();schedule();toast(tr('تم الاعتماد بنجاح.','Approved successfully.'));}catch(e){toast(e.message);}}
async function saveReview(kind,id){const arr=kind==='request'?state.requests:kind==='quote'?state.quotes:state.publicOffers,x=arr.find(v=>v.id===id);if(!x)return;const f=readForm(x);if(Object.values(f.translation).some(v=>!v)){toast(tr('أكمل الترجمة أولًا.','Complete the translation first.'));return;}const patch={translation:f.translation,reviewedAt:new Date().toISOString()},editPerm=kind==='request'?'requests.edit':'offers.edit';if(can(editPerm))patch.images=f.images;if(kind==='public')patch.categoryId=f.categoryId;try{await mutate(kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers',x,patch);closeModal();schedule();toast(tr('تم حفظ المراجعة.','Review saved.'));}catch(e){toast(e.message);}}
async function requestStatus(id,s){const x=(state?.requests||[]).find(v=>v.id===id);if(!x)return;try{await mutate('requests',x,{status:s});closeModal();schedule();toast(tr('تم تحديث الحالة.','Status updated.'));}catch(e){toast(e.message);}}
async function interestStatus(id,s){const x=(state?.interests||[]).find(v=>v.id===id);if(!x)return;try{await mutate('interests',x,{status:s});schedule();toast(tr('تم تحديث الحالة.','Status updated.'));}catch(e){toast(e.message);}}
function go(view,tab){
  if(view==='offers'&&tab)offerTab=tab;
  if(view==='operations'&&tab)operationTab=tab;
  if(view==='more'&&tab)moreTab=tab;
  document.querySelector('#bottomNav button[data-screen="'+view+'"]')?.click();
  setTimeout(schedule,30);
}

document.addEventListener('click',e=>{
  if(!isAdmin()||document.getElementById('appView').classList.contains('hidden'))return;
  const g=e.target.closest('[data-admin-go]');if(g){go(g.dataset.adminGo,g.dataset.adminTabTarget);return;}
  const active=e.target.closest('[data-admin-request-active]');if(active){requestFilter='active';schedule();return;}
  const completed=e.target.closest('[data-admin-request-completed]');if(completed){requestFilter='completed';schedule();return;}
  const ot=e.target.closest('[data-admin-offer-tab]');if(ot){offerTab=ot.dataset.adminOfferTab;offerFilter='pending';schedule();return;}
  const of=e.target.closest('[data-admin-offer-filter]');if(of){offerFilter=of.dataset.adminOfferFilter;schedule();return;}
  const op=e.target.closest('[data-admin-operation-tab]');if(op){operationTab=op.dataset.adminOperationTab;schedule();return;}
  const mt=e.target.closest('[data-admin-more-tab]');if(mt){moreTab=mt.dataset.adminMoreTab;schedule();return;}
  const tn=e.target.closest('[data-admin-team-new]');if(tn){teamDialog();return;}
  const te=e.target.closest('[data-admin-team-edit]');if(te){teamDialog(te.dataset.adminTeamEdit);return;}
  const tt=e.target.closest('[data-admin-team-toggle]');if(tt){toggleTeam(tt.dataset.adminTeamToggle,tt.dataset.action);return;}
  const am=e.target.closest('[data-admin-account-moderate]');if(am){moderationDialog(am.dataset.adminAccountModerate,am.dataset.action);return;}
  const bn=e.target.closest('[data-admin-bank-new]');if(bn){bankAccountDialog();return;}
  const be=e.target.closest('[data-admin-bank-edit]');if(be){bankAccountDialog(be.dataset.adminBankEdit);return;}
  const bt=e.target.closest('[data-admin-bank-toggle]');if(bt){toggleBankAccount(bt.dataset.adminBankToggle);return;}
  const bd=e.target.closest('[data-admin-bank-delete]');if(bd){deleteBankAccount(bd.dataset.adminBankDelete);return;}
  const cn=e.target.closest('[data-admin-category-new]');if(cn){categoryDialog();return;}
  const ce=e.target.closest('[data-admin-category-edit]');if(ce){categoryDialog(ce.dataset.adminCategoryEdit);return;}
  const cm=e.target.closest('[data-admin-category-move]');if(cm){moveCategory(cm.dataset.adminCategoryMove,cm.dataset.direction);return;}
  const ct=e.target.closest('[data-admin-category-toggle]');if(ct){toggleCategory(ct.dataset.adminCategoryToggle);return;}
  const cd=e.target.closest('[data-admin-category-delete]');if(cd){deleteCategory(cd.dataset.adminCategoryDelete);return;}
  const st=e.target.closest('[data-admin-save-tracking]');if(st){saveTracking(st.dataset.adminSaveTracking);return;}
  const sendSupplier=e.target.closest('[data-admin-send-interest-supplier]');if(sendSupplier){sendInterestToSupplier(sendSupplier.dataset.adminSendInterestSupplier);return;}
  const si=e.target.closest('[data-admin-save-interest-tracking]');if(si){saveInterestTracking(si.dataset.adminSaveInterestTracking);return;}
  const interest=e.target.closest('[data-admin-interest]');if(interest){openInterest(interest.dataset.adminInterest);return;}
  const sc=e.target.closest('[data-admin-save-category]');if(sc){savePublicCategory(sc.dataset.adminSaveCategory);return;}
  const o=e.target.closest('[data-admin-open]');if(o){openRecord(o.dataset.adminOpen,o.dataset.adminId);return;}
  const a=e.target.closest('[data-admin-account]');if(a){openAccount(a.dataset.adminAccount);return;}
  const ap=e.target.closest('[data-admin-approve]');if(ap){approve(ap.dataset.kind,ap.dataset.id);return;}
  const sv=e.target.closest('[data-admin-save-review]');if(sv){saveReview(sv.dataset.kind,sv.dataset.id);return;}
  const rr=e.target.closest('[data-admin-reopen-request]');if(rr){requestStatus(rr.dataset.id,'review');return;}
  const cr=e.target.closest('[data-admin-complete-request]');if(cr){requestStatus(cr.dataset.id,'completed');return;}
  const pc=e.target.closest('[data-admin-payment-confirm]');if(pc){reviewPayment(pc.dataset.entityType,pc.dataset.adminPaymentConfirm,'confirm');return;}
  const pr=e.target.closest('[data-admin-payment-reupload]');if(pr){reviewPayment(pr.dataset.entityType,pr.dataset.adminPaymentReupload,'reupload');return;}
  const pd=e.target.closest('[data-admin-payment-document]');if(pd){openAdminPaymentDocument(pd.dataset.adminPaymentDocument);return;}
});
document.addEventListener('input',e=>{
  if(!isAdmin()||!e.target.matches('[data-admin-search]'))return;
  searches.set(searchKey(),e.target.value);
  if(!e.isComposing)schedule();
});
document.addEventListener('compositionend',e=>{
  if(isAdmin()&&e.target.matches('[data-admin-search]')){searches.set(searchKey(),e.target.value);schedule();}
});
document.addEventListener('change',e=>{
  if(!isAdmin())return;
  if(e.target.matches('[data-admin-request-filter]')){requestFilter=e.target.value;schedule();return;}
  if(e.target.matches('[data-admin-tracking-status],[data-admin-interest-tracking-status]')){
    const field=e.target.closest('.admin-tracking-editor')?.querySelector('.admin-payment-message-field');
    if(field)field.classList.toggle('hidden',e.target.value!=='payment_confirmation');
  }
});
document.addEventListener('submit',e=>{
  if(!isAdmin())return;
  if(e.target.matches('#adminBankAccountForm')){e.preventDefault();submitBankAccount(e.target);}
  else if(e.target.matches('#adminCategoryForm')){e.preventDefault();submitCategory(e.target);}
  else if(e.target.matches('#adminPublicOfferForm')){e.preventDefault();savePublicOffer(e.target);}
  else if(e.target.matches('#adminTeamForm')){e.preventDefault();submitTeam(e.target);}
  else if(e.target.matches('#adminModerationForm')){e.preventDefault();submitModeration(e.target);}
});
