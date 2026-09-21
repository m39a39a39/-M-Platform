import { session } from './session.js';
import { filesToCompressedSources } from './image-upload.js';
import { downloadInvoicePdf } from './invoice-pdf.js';
import { categoryRows, subcategoryRows, supplyCountryRows, taxonomyLabel } from './catalog-taxonomy.js';
let state=null,revision=0;
let requestFilter='all',offerTab='pending',timer=null;
let selectedProducts=new Set();
const searches=new Map(),mediaCache=new Map(),mediaTasks=new Map();
const MEDIA_CONCURRENCY=6;
let reloadWorkspace=async()=>{};
export function configureAdmin({reload}) { reloadWorkspace=reload; }
export function resetAdmin() {
  clearTimeout(timer); state=null; revision++;
  requestFilter='all'; offerTab='pending'; searches.clear(); selectedProducts.clear();
  for(const url of mediaCache.values()) URL.revokeObjectURL(url);
  mediaCache.clear();mediaTasks.clear();
}
export function updateAdminState(next) {
  if(next?.user?.role!=='admin') { resetAdmin(); return; }
  if(state?.user?.id!==next.user.id) resetAdmin();
  state=next; revision++;
}
const searchKey=()=>activeView()==='offers'?`offers:${offerTab}`:activeView();
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
const status=s=>({review:tr('قيد المراجعة','Under review'),sent:tr('تم الإرسال للموردين','Sent to suppliers'),completed:tr('مكتمل','Completed'),pending:tr('قيد المراجعة','Under review'),published:tr('منشور','Published'),coordinating:tr('قيد التنسيق','Coordinating'),accepted:tr('مقبول','Accepted'),cancelled:tr('ملغي','Cancelled'),...Object.fromEntries(TRACKING.map(x=>[x[0],tr(x[1],x[2])]))})[s]||s||'—';
const requestTracking=x=>x?.trackingStatus||(x?.status==='completed'?'completed':x?.selectedQuoteId?'quote_selected':x?.status==='sent'?'sourcing':'received');
const interestTracking=x=>x?.trackingStatus||(x?.status==='completed'?'completed':x?.status==='cancelled'?'cancelled':['coordinating','accepted'].includes(x?.status)?'payment_confirmation':'received');
const activeInterest=x=>!['completed','cancelled'].includes(interestTracking(x));
const categories=()=>categoryRows(state?.settings,{activeOnly:false});
const activeCategories=()=>categoryRows(state?.settings);
const subcategories=()=>subcategoryRows(state?.settings,{activeOnly:false});
const activeSubcategories=(parentId='')=>subcategoryRows(state?.settings,{parentId});
const supplyCountries=()=>supplyCountryRows(state?.settings,{activeOnly:false});
const activeSupplyCountries=()=>supplyCountryRows(state?.settings);
const currencies=()=>{const rows=Array.isArray(state?.settings?.currencies)?state.settings.currencies:[{code:'SAR',nameAr:'الريال السعودي',nameEn:'Saudi Riyal',rate:1,active:true,order:0}];return [...rows].sort((a,b)=>(a.order||0)-(b.order||0));};
const bankAccounts=()=>{const rows=Array.isArray(state?.settings?.bankAccounts)?state.settings.bankAccounts:[];return [...rows].sort((a,b)=>(a.order||0)-(b.order||0));};
const activeBankAccounts=()=>bankAccounts().filter(x=>x.active!==false);
const selectedQuoteForRequest=x=>x?.selectedQuoteId?(state?.quotes||[]).find(q=>q.id===x.selectedQuoteId&&q.requestId===x.id):null;
function requestPricing(x){
  if(x?.orderType==='cart'){
    const total=Number(x.cartTotal),quantity=Number(x.cartItemCount),currency=String(x.currency||'').toUpperCase();
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(quantity)||quantity<=0||!currency)return null;
    return {isCart:true,quote:null,unitPrice:null,quantity,total,currency};
  }
  const quote=selectedQuoteForRequest(x),unitPrice=Number(quote?.unitPrice),quantity=Number(x?.quantity);
  if(!quote||!Number.isFinite(unitPrice)||unitPrice<=0||!Number.isFinite(quantity)||quantity<=0)return null;
  return {isCart:false,quote,unitPrice,quantity,total:unitPrice*quantity,currency:String(quote.currency||'').toUpperCase()};
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
  const {quote,unitPrice,quantity,total,currency,isCart}=pricing;
  if(isCart)return '<section class="admin-selected-quote-card"><div class="admin-selected-quote-head"><div><small>'+esc(tr('إجمالي طلب المنتجات','Product order total'))+'</small><strong>'+esc(Number(quantity).toLocaleString())+' '+esc(tr('منتجات','products'))+'</strong></div><span class="status-pill status-published">'+esc(currency)+'</span></div><div class="admin-selected-quote-values"><div class="total"><span>'+esc(tr('الإجمالي الكلي','Grand total'))+'</span><strong>'+esc(formatMoney(total,currency))+'</strong></div></div><small>'+esc(tr('تم تثبيت سعر وكمية كل منتج عند إرسال العميل للطلب.','Each product price and quantity were locked when the customer submitted the order.'))+'</small></section>';
  return '<section class="admin-selected-quote-card"><div class="admin-selected-quote-head"><div><small>'+esc(tr('العرض المختار','Selected quote'))+'</small><strong>#'+esc(ref(quote))+'</strong></div><span class="status-pill status-published">'+esc(tr('مختار','Selected'))+'</span></div><div class="admin-selected-quote-values"><div><span>'+esc(tr('سعر الوحدة','Unit price'))+'</span><strong>'+esc(formatMoney(unitPrice,currency))+'</strong></div><div><span>'+esc(tr('الكمية','Quantity'))+'</span><strong>'+esc(Number(quantity).toLocaleString())+'</strong></div><div class="total"><span>'+esc(tr('الإجمالي','Total'))+'</span><strong>'+esc(formatMoney(total,currency))+'</strong></div></div><small>'+esc(tr('الإجمالي = سعر الوحدة × كمية الطلب، ويُستخدم تلقائيًا كمبلغ الدفع المطلوب.','Total = unit price × order quantity and is used automatically as the amount due.'))+'</small></section>';
}
function supplierExecutionInfo(x,kind){
  if(kind==='request'&&x?.orderType==='cart'){
    const children=(state?.interests||[]).filter(i=>i.cartOrderId===x.id);
    if(!children.length)return {status:'pending_confirmation',note:'',confirmed:false,count:0,confirmedCount:0,isCart:true};
    const statuses=children.map(i=>i.supplierOrderStatus||'pending_confirmation'),confirmedCount=statuses.filter(s=>['confirmed','production','ready_for_inspection'].includes(s)).length;
    const status=statuses.some(s=>s==='cannot_fulfill')?'cannot_fulfill':statuses.every(s=>s==='ready_for_inspection')?'ready_for_inspection':statuses.some(s=>s==='production'||s==='ready_for_inspection')?'production':statuses.every(s=>s==='confirmed')?'confirmed':'pending_confirmation';
    const notes=children.filter(i=>i.supplierOrderNote).map(i=>i.supplierOrderNote);
    return {status,note:notes.join(' · '),confirmed:confirmedCount===children.length,count:children.length,confirmedCount,isCart:true};
  }
  const source=kind==='request'?requestPricing(x)?.quote:x;
  const status=source?.supplierOrderStatus||'pending_confirmation',note=source?.supplierOrderNote||'';
  return {status,note,confirmed:['confirmed','production','ready_for_inspection'].includes(status),isCart:false};
}
function supplierConfirmationCard(x,kind){
  if(kind==='request'&&!requestPricing(x))return '';
  const info=supplierExecutionInfo(x,kind),labels={
    pending_confirmation:[tr('بانتظار تأكيد المورد','Awaiting supplier confirmation'),'pending'],
    confirmed:[tr('المورد أكد التنفيذ','Supplier confirmed fulfillment'),'confirmed'],
    production:[tr('المورد أكد التنفيذ وبدأ الإنتاج','Supplier confirmed and started production'),'confirmed'],
    ready_for_inspection:[tr('المورد أكد التنفيذ والطلب جاهز للفحص','Supplier confirmed; order ready for inspection'),'confirmed'],
    cannot_fulfill:[tr('تعذر على المورد التنفيذ','Supplier cannot fulfill'),'blocked']
  };
  if(info.isCart){
    const cartLabel=info.status==='cannot_fulfill'?tr('يوجد مورد تعذر عليه التنفيذ','A supplier cannot fulfill an item'):info.confirmed?tr('جميع الموردين أكدوا التنفيذ','All suppliers confirmed fulfillment'):tr(`${info.confirmedCount} من ${info.count} مورد/منتج تم تأكيده`,`${info.confirmedCount} of ${info.count} supplier items confirmed`);
    return '<section class="admin-supplier-confirmation '+esc(info.status==='cannot_fulfill'?'blocked':info.confirmed?'confirmed':'pending')+'"><div class="admin-supplier-confirmation-head"><div><small>'+esc(tr('تأكيد الموردين','Supplier confirmations'))+'</small><strong>'+esc(cartLabel)+'</strong></div><span>'+esc(info.confirmed?'✓':info.status==='cannot_fulfill'?'✕':'…')+'</span></div>'+(info.note?'<p><b>'+esc(tr('ملاحظات الموردين','Supplier notes'))+':</b> '+esc(info.note)+'</p>':'')+'<small>'+esc(info.confirmed?tr('يمكن الآن الانتقال إلى تأكيد الطلب والدفع للإجمالي الكامل.','The full order can now move to payment confirmation.'):info.status==='cannot_fulfill'?tr('راجع المنتج الذي تعذر تنفيذه قبل المتابعة.','Review the item that cannot be fulfilled before continuing.'):tr('الدفع يبقى غير متاح حتى يؤكد جميع الموردين التنفيذ.','Payment remains unavailable until all suppliers confirm fulfillment.'))+'</small></section>';
  }
  const row=labels[info.status]||labels.pending_confirmation;
  return '<section class="admin-supplier-confirmation '+esc(row[1])+'"><div class="admin-supplier-confirmation-head"><div><small>'+esc(tr('تأكيد المورد','Supplier confirmation'))+'</small><strong>'+esc(row[0])+'</strong></div><span>'+esc(info.confirmed?'✓':info.status==='cannot_fulfill'?'✕':'…')+'</span></div>'+(info.note?'<p><b>'+esc(tr('ملاحظة المورد','Supplier note'))+':</b> '+esc(info.note)+'</p>':'')+'<small>'+esc(info.confirmed?tr('يمكن الآن الانتقال إلى تأكيد الطلب والدفع.','The order can now move to payment confirmation.'):info.status==='cannot_fulfill'?tr('لا يمكن الانتقال للدفع. راجع سبب تعذر التنفيذ.','Payment cannot start. Review the supplier reason.'):tr('تأكيد الطلب والدفع سيبقى غير متاح حتى يؤكد المورد التنفيذ.','Payment confirmation remains unavailable until the supplier confirms fulfillment.'))+'</small></section>';
}
const TRACKING_EXCEPTION_KEYS=new Set(['customer_action','on_hold','cancelled']);
function trackingOptions(rows,item,current,canPay,{rfq=false}={}){
  const linear=rows.map(x=>x[0]).filter(key=>!TRACKING_EXCEPTION_KEYS.has(key)),allowed=new Set([current]);
  if(!['completed','cancelled'].includes(current)){
    if(TRACKING_EXCEPTION_KEYS.has(current)){
      const history=Array.isArray(item?.trackingHistory)?item.trackingHistory:[],last=[...history].reverse().find(h=>linear.includes(h?.status))?.status||linear[0],index=linear.indexOf(last);
      allowed.add(last);if(linear[index+1])allowed.add(linear[index+1]);
    }else{
      const index=linear.indexOf(current),next=linear[index+1];
      if(next&&!(rfq&&!item?.selectedQuoteId&&['reviewing','sourcing','quotes_available'].includes(current)))allowed.add(next);
    }
    for(const key of TRACKING_EXCEPTION_KEYS)allowed.add(key);
  }
  return rows.filter(([key])=>allowed.has(key)).map(([key,ar,en])=>'<option value="'+key+'" '+(current===key?'selected':'')+' '+(key==='payment_confirmation'&&!canPay&&current!=='payment_confirmation'?'disabled':'')+'>'+esc(tr(ar,en))+'</option>').join('');
}


async function mutate(collection,item,patch,redactionConfirmed=false){await api('/api/v1/mutations',{method:'POST',body:{collection,id:item.id,version:Number(item.version||0),patch,redactionConfirmed}});await reload();}

function toast(msg){if(!isAdmin())return;const e=document.getElementById('toast');if(!e)return;e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2400);}
function activeView(){return document.querySelector('#bottomNav button.active')?.dataset.screen||'home';}
function rootKey(view){return [view,lang(),revision,searchText(),requestFilter,offerTab].join('|');}
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
function row(x,kind){
  const o=ownerOf(x),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null,offer=kind==='interest'?(state?.publicOffers||[]).find(v=>v.id===x.offerId):null;
  const currentStatus=kind==='request'?requestTracking(x):kind==='interest'?interestTracking(x):x.status;
  const item=offer||x,openAttrs=kind==='interest'?`data-admin-interest="${esc(x.id)}"`:`data-admin-open="${kind}" data-admin-id="${esc(x.id)}"`;
  const kindLabel=kind==='request'?(x.orderType==='cart'?tr('طلب منتجات','Product order'):tr('طلب عرض سعر','RFQ order')):kind==='interest'?tr('طلب منتج','Product order'):kind==='quote'?tr('عرض سعر','Quote'):tr('منتج','Product');
  const pendingQuoteCount=kind==='request'?(state?.quotes||[]).filter(q=>q.requestId===x.id&&!q.deletedAt&&q.status==='pending').length:0;
  return`<article class="list-card admin-record-card" ${openAttrs}><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(offer||x))}</small><h3>${esc(title(item))}</h3></div>${badge(currentStatus)}</div>${desc(item)?`<p>${esc(desc(item))}</p>`:''}<div class="admin-record-meta"><span class="status-pill">${esc(kindLabel)}</span>${kind==='public'&&x.sku?`<span>SKU: ${esc(x.sku)}</span>`:''}${pendingQuoteCount?`<span class="status-pill status-review">${esc(tr('عروض للمراجعة','Quotes to review'))}: ${pendingQuoteCount}</span>`:''}${o?`<span>${esc(o.company||o.name||tr('صاحب المحتوى','Owner'))}</span>`:''}${linked?`<span>${esc(tr('الطلب','Order'))} #${esc(ref(linked))}</span>`:''}<span>${esc(date(x.createdAt))}</span></div>${gallery(item.images||[])}</article>`;
}
function matches(x,kind=''){if(!searchText().trim())return true;const q=searchText().trim().toLowerCase(),o=ownerOf(x),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null,offer=kind==='interest'?(state?.publicOffers||[]).find(v=>v.id===x.offerId):null,client=linked?account(linked.customerId):null,requestQuotes=kind==='request'?(state?.quotes||[]).filter(v=>v.requestId===x.id):[],quoteSuppliers=requestQuotes.map(v=>account(v.supplierId)),cartChildren=kind==='request'&&x.orderType==='cart'?(state?.interests||[]).filter(v=>v.cartOrderId===x.id):[],cartOffers=cartChildren.map(v=>(state?.publicOffers||[]).find(o=>o.id===v.offerId)).filter(Boolean),cartSuppliers=cartOffers.map(v=>account(v.supplierId));return[ref(x),ref(offer),x.sku,x.name,x.company,x.email,x.phone,x.product,x.specs,x.notes,x.country,offer?title(offer):'',offer?desc(offer):'',o?.name,o?.company,linked?.displayNo,client?.name,client?.company,...requestQuotes.flatMap(v=>[ref(v),v.product,v.specs]),...quoteSuppliers.flatMap(v=>[v?.name,v?.company]),...(x.cartItems||[]).flatMap(v=>[v.sku,v.product,v.translation?.titleAr,v.translation?.titleEn]),...cartOffers.flatMap(v=>[v.sku,title(v),desc(v)]),...cartSuppliers.flatMap(v=>[v?.name,v?.company])].filter(Boolean).join(' ').toLowerCase().includes(q);}

function home(){
  const req=state?.requests||[],qs=state?.quotes||[],po=state?.publicOffers||[],ints=(state?.interests||[]).filter(activeInterest),acc=state?.accounts||[];
  const pendingRequests=req.filter(x=>!x.deletedAt&&!x.suspendedAt&&x.status==='review');
  const pendingQuotes=qs.filter(x=>!x.deletedAt&&x.status==='pending');
  const pendingProducts=po.filter(x=>!x.deletedAt&&x.status==='pending');
  const priority=[...pendingRequests.slice(0,2).map(x=>row(x,'request')),...pendingQuotes.slice(0,2).map(x=>row(x,'quote')),...pendingProducts.slice(0,2).map(x=>row(x,'public'))].join('');
  setRoot('home',page(tr('لوحة الإدارة','Admin dashboard'),tr('متابعة الطلبات والمنتجات وعروض الأسعار من مكان واحد.','Monitor orders, products, and supplier quotes from one place.'))+`<div class="stats-grid admin-stats"><button class="stat-card" data-admin-go="requests"><strong>${pendingRequests.length}</strong><span>${esc(tr('طلبات بانتظار الاعتماد','Orders pending approval'))}</span></button><button class="stat-card" data-admin-go="offers"><strong>${pendingProducts.length}</strong><span>${esc(tr('منتجات بانتظار المراجعة','Products pending review'))}</span></button><button class="stat-card" data-admin-go="requests"><strong>${pendingQuotes.length}</strong><span>${esc(tr('عروض أسعار بانتظار المراجعة','Quotes pending review'))}</span></button><button class="stat-card" data-admin-go="account"><strong>${acc.filter(a=>['client','supplier'].includes(a.role)&&!a.deletedAt).length}</strong><span>${esc(tr('العملاء والموردون','Customers & suppliers'))}</span></button></div><section class="section-block"><div class="section-title"><h2>${esc(tr('الأولوية الآن','Priority now'))}</h2></div><div class="list-stack">${priority||empty()}</div></section>`);
}
const unifiedRequestTracking=x=>x.__kind==='interest'?interestTracking(x):requestTracking(x);
function requestFilterControls(allRows){
  const count=s=>allRows.filter(x=>unifiedRequestTracking(x)===s).length;
  const active=allRows.filter(x=>!['completed','cancelled'].includes(unifiedRequestTracking(x))).length;
  const pendingQuotes=(state?.quotes||[]).filter(q=>!q.deletedAt&&q.status==='pending').length;
  const options=[`<option value="all" ${requestFilter==='all'?'selected':''}>${esc(tr('كل الحالات','All statuses'))} (${allRows.length})</option>`,...TRACKING.map(([key,ar,en])=>`<option value="${key}" ${requestFilter===key?'selected':''}>${esc(tr(ar,en))} (${count(key)})</option>`)].join('');
  return `<div class="admin-request-filters"><button type="button" data-admin-request-all class="${requestFilter==='all'?'active':''}">${esc(tr('كل الطلبات','All orders'))} (${allRows.length})</button><button type="button" data-admin-request-active class="${requestFilter==='active'?'active':''}">${esc(tr('الطلبات النشطة','Active orders'))} (${active})</button><button type="button" data-admin-request-quotes class="${requestFilter==='quotes_pending'?'active':''}">${esc(tr('عروض تحتاج مراجعة','Quotes to review'))} (${pendingQuotes})</button><label class="admin-filter-select"><span>${esc(tr('تصفية حسب الحالة','Filter by status'))}</span><select data-admin-request-filter>${options}</select></label></div>`;
}
function requests(){
  const custom=(state?.requests||[]).filter(x=>!x.deletedAt&&!x.suspendedAt&&matches(x,'request')).map(x=>({...x,__kind:'request'}));
  const interests=(state?.interests||[]).filter(x=>!x.cartOrderId&&matches(x,'interest')).map(x=>({...x,__kind:'interest'}));
  const allRows=[...custom,...interests];
  let rows=[...allRows];rows.sort((a,b)=>(a.__kind==='request'&&a.status==='review'?0:1)-(b.__kind==='request'&&b.status==='review'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(requestFilter==='active')rows=rows.filter(x=>!['completed','cancelled'].includes(unifiedRequestTracking(x)));
  else if(requestFilter==='quotes_pending'){
    const requestIds=new Set((state?.quotes||[]).filter(q=>!q.deletedAt&&q.status==='pending').map(q=>q.requestId));
    rows=rows.filter(x=>x.__kind==='request'&&requestIds.has(x.id));
  }else if(requestFilter!=='all')rows=rows.filter(x=>unifiedRequestTracking(x)===requestFilter);
  setRoot('requests',page(tr('الطلبات','Orders'),tr('جميع طلبات العملاء: طلبات عروض الأسعار وطلبات المنتجات.','All customer orders: RFQs and product orders.'))+search(tr('ابحث برقم الطلب أو اسم العميل أو رقم العرض أو المورد','Search order, customer, quote, or supplier'))+requestFilterControls(allRows)+`<div class="list-stack" data-admin-results>${rows.map(x=>row(x,x.__kind)).join('')||empty()}</div>`);
}
function subcategoryPanel(){
  if(!can('settings'))return '';
  const rows=subcategories();
  return `<section class="admin-category-panel admin-subcategory-panel"><div class="section-title"><div><h2>${esc(tr('التصنيفات الفرعية','Subcategories'))}</h2><p>${esc(tr('كل تصنيف فرعي مرتبط بتصنيف رئيسي.','Each subcategory belongs to a main category.'))}</p></div><button class="primary-small" type="button" data-admin-subcategory-new>+ ${esc(tr('إضافة تصنيف فرعي','Add subcategory'))}</button></div><div class="admin-category-list">${rows.map(x=>`<article class="admin-category-row"><div><strong>${esc(taxonomyLabel(x,lang()))}</strong><small>${esc(taxonomyLabel(categories().find(c=>c.id===x.parentId),lang()))}</small></div><div class="admin-category-actions"><button type="button" data-admin-subcategory-edit="${esc(x.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-subcategory-toggle="${esc(x.id)}">${esc(x.active!==false?tr('إخفاء','Hide'):tr('إظهار','Show'))}</button><button class="danger-text" type="button" data-admin-subcategory-delete="${esc(x.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
function supplyCountryPanel(){
  if(!can('settings'))return '';
  const rows=supplyCountries();
  return `<section class="admin-category-panel admin-country-panel"><div class="section-title"><div><h2>${esc(tr('دول التوريد','Supply countries'))}</h2><p>${esc(tr('تُستخدم في المنتجات وفلترة العملاء.','Used by products and customer filters.'))}</p></div><button class="primary-small" type="button" data-admin-country-new>+ ${esc(tr('إضافة دولة','Add country'))}</button></div><div class="admin-category-list">${rows.map(x=>`<article class="admin-category-row"><div><strong>${esc(taxonomyLabel(x,lang()))}</strong><small>${esc(x.nameAr)} · ${esc(x.nameEn)}</small></div><div class="admin-category-actions"><button type="button" data-admin-country-edit="${esc(x.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-country-toggle="${esc(x.id)}">${esc(x.active!==false?tr('إخفاء','Hide'):tr('إظهار','Show'))}</button><button class="danger-text" type="button" data-admin-country-delete="${esc(x.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
function categoryPanel(){
  const rows=categories();
  return `<section class="admin-category-panel admin-main-category-panel"><div class="section-title"><div><h2>${esc(tr('التصنيفات','Categories'))}</h2><p>${esc(tr('تظهر للعميل كأزرار نصية فوق المنتجات الجاهزة.','Shown to customers as text buttons above ready products.'))}</p></div><button class="primary-small" type="button" data-admin-category-new>+ ${esc(tr('إضافة تصنيف','Add category'))}</button></div><div class="admin-category-list" data-admin-results>${rows.map((cat,i)=>`<article class="admin-category-row"><div><strong>${esc(tr(cat.nameAr,cat.nameEn))}</strong><small>${esc(cat.nameAr)} · ${esc(cat.nameEn)}</small><span class="status-pill ${cat.active!==false?'status-published':'status-cancelled'}">${esc(cat.active!==false?tr('ظاهر','Visible'):tr('مخفي','Hidden'))}</span></div><div class="admin-category-actions"><button type="button" data-admin-category-move="${esc(cat.id)}" data-direction="-1" ${i===0?'disabled':''}>↑</button><button type="button" data-admin-category-move="${esc(cat.id)}" data-direction="1" ${i===rows.length-1?'disabled':''}>↓</button><button type="button" data-admin-category-edit="${esc(cat.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-category-toggle="${esc(cat.id)}">${esc(cat.active!==false?tr('إخفاء','Hide'):tr('إظهار','Show'))}</button><button class="danger-text" type="button" data-admin-category-delete="${esc(cat.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
function offerTabs(){
  return `<div class="segmented admin-segmented"><button class="${offerTab==='pending'?'active':''}" data-admin-offer-tab="pending">${esc(tr('بانتظار المراجعة','Pending review'))}</button><button class="${offerTab==='all'?'active':''}" data-admin-offer-tab="all">${esc(tr('جميع المنتجات','All products'))}</button></div>`;
}
function productSelectionRow(x){
  const owner=ownerOf(x),checked=selectedProducts.has(x.id);
  return `<article class="list-card admin-record-card admin-selectable-product"><label class="admin-product-check"><input type="checkbox" data-admin-product-select="${esc(x.id)}" ${checked?'checked':''}><span></span></label><button type="button" class="admin-product-open" data-admin-open="public" data-admin-id="${esc(x.id)}"><div class="list-card-main"><div class="list-card-title"><small>#${esc(ref(x))} · ${esc(x.sku||'')}</small><h3>${esc(title(x))}</h3></div>${badge(x.status)}</div><div class="meta-line">${esc(formatMoney(x.unitPrice,x.currency))} · MOQ ${esc(x.moq||'—')} · ${esc(owner?.company||owner?.name||'')}</div>${gallery(x.images||[])}</button></article>`;
}
function bulkToolbar(rows){
  const count=selectedProducts.size,all=rows.length&&rows.every(x=>selectedProducts.has(x.id));
  return `<section class="admin-bulk-toolbar"><label><input type="checkbox" data-admin-product-select-all ${all?'checked':''}><span>${esc(tr('تحديد الكل','Select all'))}</span></label><strong data-admin-bulk-count>${esc(tr(`المحدد: ${count}`,`Selected: ${count}`))}</strong><div class="admin-bulk-actions"><button type="button" class="primary-small" data-admin-bulk-edit ${count?'':'disabled'}>${esc(tr('تعديل جماعي','Bulk edit'))}</button><button type="button" class="secondary-btn compact" data-admin-bulk-action="publish" ${count?'':'disabled'}>${esc(tr('نشر','Publish'))}</button><button type="button" class="secondary-btn compact" data-admin-bulk-action="hide" ${count?'':'disabled'}>${esc(tr('إخفاء','Hide'))}</button><button type="button" class="secondary-btn compact" data-admin-bulk-action="category" ${count?'':'disabled'}>${esc(tr('تغيير التصنيف','Change category'))}</button><button type="button" class="secondary-btn compact" data-admin-bulk-action="country" ${count?'':'disabled'}>${esc(tr('تغيير الدولة','Change country'))}</button><button type="button" class="secondary-btn compact" data-admin-bulk-action="translation" ${count?'':'disabled'}>${esc(tr('الترجمة','Translations'))}</button><button type="button" class="danger-btn compact" data-admin-bulk-action="delete" ${count?'':'disabled'}>${esc(tr('حذف','Delete'))}</button></div></section>`;
}
function offers(){
  if(!['pending','all'].includes(offerTab))offerTab='pending';
  let rows=(state?.publicOffers||[]).filter(x=>!x.deletedAt&&matches(x,'public')).map(x=>({...x,__kind:'public'}));
  rows.sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(offerTab==='pending')rows=rows.filter(x=>x.status==='pending');
  const visibleIds=new Set(rows.map(x=>x.id));for(const id of [...selectedProducts])if(!(state?.publicOffers||[]).some(x=>x.id===id&&!x.deletedAt))selectedProducts.delete(id);
  setRoot('offers',page(tr('المنتجات','Products'),tr('مراجعة وإدارة المنتجات التي يضيفها الموردون.','Review and manage supplier products.'))+search(tr('ابحث برقم المنتج أو SKU أو الاسم أو المورد','Search product number, SKU, name, or supplier'))+offerTabs()+bulkToolbar(rows)+`<div class="list-stack" data-admin-results>${rows.map(productSelectionRow).join('')||empty()}</div>`);
}
const selectedProductRows=()=>[...selectedProducts].map(id=>(state?.publicOffers||[]).find(x=>x.id===id&&!x.deletedAt)).filter(Boolean);
function updateBulkSelectionUi(){
  const count=selectedProducts.size,countEl=document.querySelector('[data-admin-bulk-count]');
  if(countEl)countEl.textContent=tr(`المحدد: ${count}`,`Selected: ${count}`);
  document.querySelectorAll('[data-admin-bulk-edit],[data-admin-bulk-action]').forEach(btn=>btn.disabled=!count);
  const boxes=[...document.querySelectorAll('[data-admin-product-select]')],all=document.querySelector('[data-admin-product-select-all]');
  if(all)all.checked=!!boxes.length&&boxes.every(box=>box.checked);
}
function bulkCategoryOptionRows(selected){return activeCategories().map(x=>`<option value="${esc(x.id)}" ${selected===x.id?'selected':''}>${esc(taxonomyLabel(x,lang()))}</option>`).join('');}
function bulkSubcategoryOptionRows(selected,parentId){return activeSubcategories(parentId).map(x=>`<option value="${esc(x.id)}" ${selected===x.id?'selected':''}>${esc(taxonomyLabel(x,lang()))}</option>`).join('');}
function bulkCountryOptionRows(selected){return activeSupplyCountries().map(x=>`<option value="${esc(x.id)}" ${selected===x.id?'selected':''}>${esc(taxonomyLabel(x,lang()))}</option>`).join('');}
function bulkProductEditorRow(x){
  const t=x.translation||{};
  return `<tr data-bulk-product-row="${esc(x.id)}"><td class="sticky-col"><strong>#${esc(ref(x))}</strong><small>${esc(x.sku||'')}</small></td><td><input data-bulk-edit="product" value="${esc(x.product||'')}" maxlength="300"></td><td><textarea data-bulk-edit="specs" maxlength="10000">${esc(x.specs||'')}</textarea></td><td><input data-bulk-edit="unitPrice" type="number" step="0.01" min="0.01" value="${esc(x.unitPrice||'')}"></td><td><input data-bulk-edit="moq" type="number" min="1" value="${esc(x.moq||'')}"></td><td><input data-bulk-edit="stock" type="number" min="0" value="${esc(x.stock||'')}"></td><td><select data-bulk-edit="categoryId"><option value="">—</option>${bulkCategoryOptionRows(x.categoryId)}</select></td><td><select data-bulk-edit="subcategoryId"><option value="">—</option>${bulkSubcategoryOptionRows(x.subcategoryId,x.categoryId)}</select></td><td><select data-bulk-edit="country"><option value="">—</option>${bulkCountryOptionRows(x.country)}</select></td><td><select data-bulk-edit="status"><option value="published" ${x.status==='published'?'selected':''}>${esc(tr('منشور','Published'))}</option><option value="pending" ${x.status==='pending'?'selected':''}>${esc(tr('مخفي / قيد المراجعة','Hidden / pending'))}</option></select></td><td><input data-bulk-edit="titleAr" value="${esc(t.titleAr||'')}"></td><td><input data-bulk-edit="titleEn" value="${esc(t.titleEn||'')}"></td><td><textarea data-bulk-edit="descriptionAr">${esc(t.descriptionAr||'')}</textarea></td><td><textarea data-bulk-edit="descriptionEn">${esc(t.descriptionEn||'')}</textarea></td></tr>`;
}
function syncBulkProductSubcategory(row){
  const cat=row.querySelector('[data-bulk-edit="categoryId"]')?.value||'',sub=row.querySelector('[data-bulk-edit="subcategoryId"]');if(!sub)return;
  const current=sub.value;sub.innerHTML='<option value="">—</option>'+bulkSubcategoryOptionRows(current,cat);
  if(current&&![...sub.options].some(o=>o.value===current))sub.value='';
}
function normalizeBulkEditorViewport(){
  const viewport=document.querySelector('meta[name="viewport"]');
  if(viewport){const value='width=device-width, initial-scale=1, viewport-fit=cover';if(viewport.getAttribute('content')!==value)viewport.setAttribute('content',value);}
  document.documentElement.style.removeProperty('zoom');document.body.style.removeProperty('zoom');
}
function friendlyBulkError(error){
  const raw=String(error?.detail||error?.message||'').trim();
  if(!raw||/^not found$/i.test(raw)||/^http\s*404$/i.test(raw))return tr('تعذر حفظ التعديلات لأن بيانات المنتجات لم تعد متزامنة. تم تحديث البيانات؛ راجع التعديلات وحاول مرة أخرى.','The product data changed while editing. The data was refreshed; review the changes and try again.');
  return raw;
}
function openBulkProductEditor(mode='all'){
  const rows=selectedProductRows();if(!rows.length)return;
  const translationOnly=mode==='translation';
  const headers=translationOnly?[tr('المنتج','Product'),tr('الاسم AR','Name AR'),tr('الاسم EN','Name EN'),tr('الوصف AR','Description AR'),tr('الوصف EN','Description EN')]:[tr('المنتج','Product'),tr('الاسم الأصلي','Original name'),tr('الوصف الأصلي','Original description'),tr('السعر','Price'),'MOQ',tr('المخزون','Stock'),tr('الرئيسي','Main'),tr('الفرعي','Sub'),tr('دولة التوريد','Supply country'),tr('النشر','Status'),tr('الاسم AR','Name AR'),tr('الاسم EN','Name EN'),tr('الوصف AR','Description AR'),tr('الوصف EN','Description EN')];
  const body=translationOnly?rows.map(x=>{const t=x.translation||{};return `<tr data-bulk-product-row="${esc(x.id)}"><td class="sticky-col"><strong>#${esc(ref(x))}</strong><small>${esc(x.sku||'')}</small></td><td><input data-bulk-edit="titleAr" value="${esc(t.titleAr||'')}"></td><td><input data-bulk-edit="titleEn" value="${esc(t.titleEn||'')}"></td><td><textarea data-bulk-edit="descriptionAr">${esc(t.descriptionAr||'')}</textarea></td><td><textarea data-bulk-edit="descriptionEn">${esc(t.descriptionEn||'')}</textarea></td></tr>`}).join(''):rows.map(bulkProductEditorRow).join('');
  modal(translationOnly?tr('تحديث الترجمة جماعيًا','Bulk translation update'):tr('تعديل المنتجات جماعيًا','Bulk edit products'),tr(`${rows.length} منتجات محددة`,`${rows.length} products selected`),`<form id="adminBulkProductsForm" class="form-stack admin-bulk-products-form" data-mode="${translationOnly?'translation':'all'}"><div class="admin-bulk-table-wrap"><table class="admin-bulk-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><label class="admin-category-toggle-label"><input type="checkbox" name="reviewed" required><span>${esc(tr('راجعت النصوص والتعديلات وأؤكد جاهزيتها للنشر.','I reviewed the content and confirm it is ready to publish.'))}</span></label><p class="form-message" data-admin-bulk-message></p><button class="primary-btn" type="submit">${esc(tr('حفظ جميع التعديلات','Save all changes'))}</button></form>`);
}
async function submitBulkProducts(form){
  const message=form.querySelector('[data-admin-bulk-message]'),items=[],same=(a,b)=>String(a??'')===String(b??'');
  for(const trEl of form.querySelectorAll('[data-bulk-product-row]')){
    const original=(state?.publicOffers||[]).find(x=>x.id===trEl.dataset.bulkProductRow);if(!original)continue;
    const v=name=>trEl.querySelector(`[data-bulk-edit="${name}"]`)?.value,patch={},translation={};
    for(const field of ['titleAr','titleEn','descriptionAr','descriptionEn']){
      const next=v(field),before=original.translation?.[field]??'';
      if(next!==undefined&&!same(next,before))translation[field]=next;
    }
    if(Object.keys(translation).length)patch.translation=translation;
    if(form.dataset.mode!=='translation'){
      for(const field of ['product','specs','unitPrice','moq','stock','categoryId','subcategoryId','country','status']){
        const next=v(field);if(next!==undefined&&!same(next,original[field]))patch[field]=next;
      }
    }
    if(Object.keys(patch).length)items.push({id:original.id,version:original.version,patch});
  }
  if(!items.length){message.textContent=tr('لا توجد تغييرات للحفظ.','There are no changes to save.');return;}
  try{
    message.textContent=tr('جارٍ حفظ جميع المنتجات...','Saving all products...');
    await api('/api/v1/bulk-public-offers',{method:'POST',body:{items,redactionConfirmed:!!form.reviewed.checked}});
    selectedProducts.clear();await reload();closeModal();schedule();toast(tr('تم حفظ جميع التعديلات.','All changes saved.'));
  }catch(e){
    if(Number(e?.status)===404){try{await reload();}catch{}}
    message.textContent=friendlyBulkError(e);
  }
}
async function runBulkProductAction(action,value=''){
  const rows=selectedProductRows();if(!rows.length)return false;
  if(action==='delete'&&!confirm(tr('حذف المنتجات المحددة؟','Delete selected products?')))return false;
  const patch=action==='publish'?{status:'published'}:action==='hide'?{status:'pending'}:action==='category'?{categoryId:value,subcategoryId:''}:action==='country'?{country:value}:{};
  try{await api('/api/v1/bulk-public-offers',{method:'POST',body:{items:rows.map(x=>({id:x.id,version:x.version,...(action==='delete'?{delete:true}:{patch})})),redactionConfirmed:action!=='hide'}});selectedProducts.clear();await reload();schedule();toast(tr('تم تنفيذ الإجراء الجماعي.','Bulk action completed.'));return true;}catch(e){toast(e.message);return false;}
}
function bulkAssignDialog(kind){
  const isCategory=kind==='category',rows=isCategory?activeCategories():activeSupplyCountries();
  modal(isCategory?tr('تغيير التصنيف','Change category'):tr('تغيير دولة التوريد','Change supply country'),tr('إجراء جماعي','Bulk action'),`<form id="adminBulkAssignForm" class="form-stack" data-kind="${kind}"><label><span>${esc(isCategory?tr('التصنيف الرئيسي','Main category'):tr('دولة التوريد','Supply country'))}</span><select name="value" required><option value="">—</option>${rows.map(x=>`<option value="${esc(x.id)}">${esc(taxonomyLabel(x,lang()))}</option>`).join('')}</select></label><button class="primary-btn" type="submit">${esc(tr('تطبيق على المحدد','Apply to selected'))}</button></form>`);
}
function currencyPanel(){
  if(!can('settings'))return '';
  const rows=currencies();
  return `<section class="section-block admin-bank-panel"><div class="section-title"><div><h2>${esc(tr('العملات وأسعار الصرف','Currencies & exchange rates'))}</h2><p>${esc(tr('SAR هي العملة الأساسية. أدخل سعر كل عملة مقابل ريال سعودي واحد.','SAR is the base currency. Enter each currency value per 1 SAR.'))}</p></div><button class="primary-small" type="button" data-admin-currency-new>+ ${esc(tr('إضافة عملة','Add currency'))}</button></div><div class="admin-bank-list">${rows.map(x=>`<article class="admin-bank-row"><div><strong>${esc(x.code)} · ${esc(lang()==='ar'?x.nameAr:x.nameEn)}</strong><small>${x.code==='SAR'?esc(tr('العملة الأساسية','Base currency')):esc('1 SAR = '+x.rate+' '+x.code)}</small><span class="status-pill ${x.active!==false?'status-published':'status-cancelled'}">${esc(x.active!==false?tr('نشطة','Active'):tr('متوقفة','Inactive'))}</span></div><div class="admin-category-actions"><button type="button" data-admin-currency-edit="${esc(x.code)}">${esc(tr('تعديل','Edit'))}</button>${x.code==='SAR'?'':`<button type="button" data-admin-currency-toggle="${esc(x.code)}">${esc(x.active!==false?tr('إيقاف','Disable'):tr('تفعيل','Enable'))}</button>`}</div></article>`).join('')}</div></section>`;
}
function currencyDialog(code=''){
  const x=currencies().find(v=>v.code===code),isSar=x?.code==='SAR';
  modal(x?tr('تعديل العملة','Edit currency'):tr('إضافة عملة','Add currency'),tr('العملات وأسعار الصرف','Currencies & exchange rates'),`<form id="adminCurrencyForm" class="form-stack" data-code="${esc(x?.code||'')}"><label><span>${esc(tr('رمز العملة','Currency code'))}</span><input name="code" required maxlength="3" value="${esc(x?.code||'')}" ${x?'readonly':''}></label><label><span>${esc(tr('الاسم بالعربية','Arabic name'))}</span><input name="nameAr" required maxlength="80" value="${esc(x?.nameAr||'')}"></label><label><span>${esc(tr('الاسم بالإنجليزية','English name'))}</span><input name="nameEn" required maxlength="80" value="${esc(x?.nameEn||'')}"></label><label><span>${esc(tr('سعر الصرف مقابل 1 SAR','Exchange rate per 1 SAR'))}</span><input name="rate" type="number" min="0.000001" step="any" required value="${esc(isSar?1:(x?.rate||''))}" ${isSar?'readonly':''}></label><label class="admin-category-toggle-label"><input type="checkbox" name="active" ${x?.active===false?'':'checked'} ${isSar?'disabled':''}><span>${esc(tr('العملة نشطة','Currency active'))}</span></label><button class="primary-btn" type="submit">${esc(tr('حفظ','Save'))}</button></form>`);
}
async function saveCurrencies(rows){try{await api('/api/v1/settings',{method:'POST',body:{version:Number(state.settings?._version||0),data:{currencies:rows}}});await reload();schedule();toast(tr('تم حفظ العملات وأسعار الصرف.','Currencies and exchange rates saved.'));return true;}catch(e){toast(e.message);return false;}}
async function submitCurrency(form){const old=form.dataset.code,code=form.code.value.trim().toUpperCase(),rows=currencies(),next={code,nameAr:form.nameAr.value.trim(),nameEn:form.nameEn.value.trim(),rate:code==='SAR'?1:Number(form.rate.value),active:code==='SAR'?true:form.active.checked},i=rows.findIndex(x=>x.code===(old||code));if(i>=0)rows[i]={...rows[i],...next};else rows.push(next);if(await saveCurrencies(rows))closeModal();}
async function toggleCurrency(code){const rows=currencies(),x=rows.find(v=>v.code===code);if(!x||code==='SAR')return;x.active=x.active===false;await saveCurrencies(rows);}
function bankAccountPanel(){
  if(!can('settings'))return '';
  const rows=bankAccounts();
  return `<section class="section-block admin-bank-panel"><div class="section-title"><div><h2>${esc(tr('حسابات استلام المدفوعات','Payment receiving accounts'))}</h2><p>${esc(tr('تظهر بيانات الحساب للعميل فقط بعد اختيارها داخل طلب في مرحلة الدفع.','Account details are shown to a customer only after the account is selected for an order at the payment stage.'))}</p></div><button class="primary-small" type="button" data-admin-bank-new>+ ${esc(tr('إضافة حساب','Add account'))}</button></div><div class="admin-bank-list">${rows.map(a=>`<article class="admin-bank-row"><div><strong>${esc(a.label||a.bankName)}</strong><small>${esc(a.bankName)} · ${esc(a.currency||'')}</small><span class="status-pill ${a.active!==false?'status-published':'status-cancelled'}">${esc(a.active!==false?tr('نشط','Active'):tr('متوقف','Inactive'))}</span></div><div class="admin-category-actions"><button type="button" data-admin-bank-edit="${esc(a.id)}">${esc(tr('تعديل','Edit'))}</button><button type="button" data-admin-bank-toggle="${esc(a.id)}">${esc(a.active!==false?tr('إيقاف','Disable'):tr('تفعيل','Enable'))}</button><button class="danger-text" type="button" data-admin-bank-delete="${esc(a.id)}">${esc(tr('حذف','Delete'))}</button></div></article>`).join('')||empty()}</div></section>`;
}
const TEAM_PERMISSION_LABELS=[
  ['requests.read','مشاهدة الطلبات','View requests'],
  ['requests.edit','تعديل الطلبات والصور','Edit requests & images'],
  ['offers.read','مشاهدة المنتجات وعروض الأسعار','View products & quotes'],
  ['offers.edit','تعديل المنتجات وعروض الأسعار','Edit products & quotes'],
  ['translate','الترجمة اليدوية','Manual translation'],
  ['publish','الاعتماد والإرسال','Approve & publish'],
  ['accounts.read','بيانات الحسابات والتواصل','Account contact details'],
  ['accounts.manage','إدارة حسابات العملاء والموردين','Manage customer & supplier accounts'],
  ['moderate','تعليق الطلبات','Suspend requests'],
  ['trash','الحذف والاستعادة','Trash & restore'],
  ['settings','النصوص والشعار','Text & logo'],
  ['team','إدارة الفريق','Manage team']
];
function teamPanel(){
  if(!can('team'))return '';
  const admins=(state?.accounts||[]).filter(a=>a.role==='admin'&&!a.deletedAt);
  return `<section class="section-block admin-team-panel">
    <div class="section-title"><div><h2>${esc(tr('فريق الإدارة','Admin team'))}</h2><p>${esc(tr('إضافة المدراء وتحديد صلاحيات كل مدير.','Add managers and control each manager’s permissions.'))}</p></div><button class="primary-small" type="button" data-admin-team-new>+ ${esc(tr('إضافة مدير','Add manager'))}</button></div>
    <div class="list-stack">${admins.map(a=>`<article class="list-card admin-record-card"><div class="list-card-main"><div class="list-card-title"><h3>${esc(a.name||a.email||'#'+String(a.id).slice(0,8))}</h3><small>${esc(a.email||'')}</small></div><span class="status-pill ${a.blockedAt?'status-cancelled':'status-published'}">${esc(a.blockedAt?tr('متوقف','Disabled'):tr('نشط','Active'))}</span></div>${a.isOwner?`<p class="muted">${esc(tr('المدير الرئيسي — محمي','Owner — protected'))}</p>`:a.id===me()?.id?'':`<div class="admin-review-actions"><button class="secondary-btn" type="button" data-admin-team-edit="${esc(a.id)}">${esc(tr('تعديل الصلاحيات','Edit permissions'))}</button><button class="${a.blockedAt?'primary-btn':'danger-btn'}" type="button" data-admin-team-toggle="${esc(a.id)}">${esc(a.blockedAt?tr('إعادة تفعيل المدير','Reactivate manager'):tr('إيقاف المدير','Disable manager'))}</button></div>`}</article>`).join('')||empty()}</div>
  </section>`;
}
function teamDialog(id=''){
  if(!can('team'))return;
  const current=id?(state?.accounts||[]).find(a=>a.id===id&&a.role==='admin'):null,u=me();
  const allowed=TEAM_PERMISSION_LABELS.filter(([p])=>u?.isOwner||(p!=='team'&&u?.permissions?.includes(p)));
  const selected=new Set(current?.permissions||[]);
  modal(current?tr('تعديل صلاحيات المدير','Edit manager permissions'):tr('إضافة مدير','Add manager'),tr('فريق الإدارة','Admin team'),
    '<form id="adminTeamForm" class="form-stack" data-id="'+esc(current?.id||'')+'">'+
    '<label><span>'+esc(tr('البريد الإلكتروني','Email'))+'</span><input name="email" type="email" required maxlength="254" value="'+esc(current?.email||'')+'" '+(current?'readonly':'')+'></label>'+
    '<div class="admin-check-list">'+allowed.map(([p,ar,en])=>'<label><input type="checkbox" name="permission" value="'+esc(p)+'" '+(selected.has(p)?'checked':'')+'><span>'+esc(tr(ar,en))+'</span></label>').join('')+'</div>'+
    '<small>'+esc(tr('يجب أن يكون الحساب مسجلًا في المنصة أولًا.','The account must already be registered on the platform.'))+'</small>'+
    '<button class="primary-btn" type="submit">'+esc(tr('حفظ المدير وصلاحياته','Save manager & permissions'))+'</button></form>');
}
async function submitTeam(form){
  const id=form.dataset.id||undefined,permissions=[...form.querySelectorAll('[name="permission"]:checked')].map(x=>x.value);
  try{
    await api('/api/v1/team',{method:'POST',body:{id,email:form.email.value.trim(),permissions,action:'save'}});
    await reload();closeModal();schedule();toast(tr('تم حفظ المدير وصلاحياته.','Manager and permissions saved.'));
  }catch(e){toast(e.message);}
}
function teamToggleDialog(id){
  const a=(state?.accounts||[]).find(x=>x.id===id&&x.role==='admin');if(!a||a.isOwner||a.id===me()?.id||!can('team'))return;
  const action=a.blockedAt?'unblock':'block';
  modal(a.blockedAt?tr('إعادة تفعيل المدير','Reactivate manager'):tr('إيقاف المدير','Disable manager'),a.name||a.email||'', '<form id="adminTeamStatusForm" class="form-stack" data-id="'+esc(a.id)+'" data-action="'+action+'"><p>'+esc(a.blockedAt?tr('سيتمكن المدير من تسجيل الدخول مجددًا بعد إعادة التفعيل.','The manager can sign in again after reactivation.'):tr('لن يتمكن المدير من تسجيل الدخول أثناء إيقاف الحساب.','The manager cannot sign in while the account is disabled.'))+'</p><button class="'+(a.blockedAt?'primary-btn':'danger-btn')+'" type="submit">'+esc(a.blockedAt?tr('إعادة التفعيل','Reactivate'):tr('إيقاف المدير','Disable manager'))+'</button></form>');
}
async function submitTeamStatus(form){
  const a=(state?.accounts||[]).find(x=>x.id===form.dataset.id&&x.role==='admin');if(!a)return;
  try{
    await api('/api/v1/team',{method:'POST',body:{id:a.id,permissions:a.permissions||[],action:form.dataset.action}});
    await reload();closeModal();schedule();toast(form.dataset.action==='block'?tr('تم إيقاف المدير.','Manager disabled.'):tr('تمت إعادة تفعيل المدير.','Manager reactivated.'));
  }catch(e){toast(e.message);}
}
function accounts(){const u=me(),rows=(state?.accounts||[]).filter(a=>['client','supplier'].includes(a.role)&&!a.deletedAt&&matches(a,'account'));setRoot('account',page(tr('الحساب والإعدادات','Account & settings'),tr('بيانات الإدارة والحسابات وإعدادات المنتجات.','Admin profile, accounts, and product settings.'))+`<section class="profile-card admin-profile"><div class="avatar">${esc((u?.name||u?.email||'M').charAt(0).toUpperCase())}</div><h2>${esc(u?.name||tr('الإدارة','Admin'))}</h2><p>${esc(tr('حساب إدارة','Admin account'))}</p><button class="danger-btn" data-action="logout">${esc(tr('تسجيل الخروج','Sign out'))}</button></section>`+teamPanel()+currencyPanel()+bankAccountPanel()+`<section class="section-block admin-directory"><div class="section-title"><h2>${esc(tr('العملاء والموردون','Customers & suppliers'))}</h2></div>${search(tr('ابحث بالاسم أو الشركة','Search name or company'))}<div class="list-stack" data-admin-results>${rows.slice(0,100).map(a=>`<button class="admin-account-row" data-admin-account="${esc(a.id)}"><div><strong>${esc(a.company||a.name||'#'+String(a.id).slice(0,8))}</strong><small>${esc(a.role==='client'?tr('عميل','Customer'):tr('مورد','Supplier'))} · ${esc(a.blockedAt?tr('متوقف','Disabled'):tr('نشط','Active'))}</small></div><span>›</span></button>`).join('')||empty()}</div></section>`+categoryPanel()+subcategoryPanel()+supplyCountryPanel());}
export function renderAdminScreen(v=activeView()){if(!isAdmin()||v==='notifications')return false;if(v==='home')home();else if(v==='requests')requests();else if(v==='offers')offers();else if(v==='account')accounts();return true;}
function render(){if(!document.getElementById('appView')?.classList.contains('hidden'))renderAdminScreen();}

function modal(titleText,kicker,html){const m=document.getElementById('modal');if(!m)return;document.getElementById('modalTitle').textContent=titleText;document.getElementById('modalKicker').textContent=kicker||'';document.getElementById('modalBody').innerHTML=html;m.classList.remove('hidden');hydrate(document.getElementById('modalBody'));}
function closeModal(){document.getElementById('modal')?.classList.add('hidden');}
function ownerBox(x){const o=ownerOf(x);if(!o)return'';return`<section class="admin-owner-box"><strong>${esc(tr('صاحب المحتوى','Content owner'))}</strong><p>${esc(o.company||o.name||'#'+String(o.id).slice(0,8))}</p>${can('accounts.read')?`<small>${esc(o.name||'')} ${o.phone?`· ${esc(o.phone)}`:''} ${o.email?`· ${esc(o.email)}`:''} ${o.country?`· ${esc(o.country)}`:''}</small>`:''}</section>`;}
function translations(x,editable){const t=x.translation||{},d=editable?'':'disabled';return`<div class="form-stack admin-translation"><label><span>${esc(tr('العنوان بالعربية','Arabic title'))}</span><input ${d} data-admin-tr="titleAr" value="${esc(t.titleAr||'')}"></label><label><span>${esc(tr('العنوان بالإنجليزية','English title'))}</span><input ${d} data-admin-tr="titleEn" value="${esc(t.titleEn||'')}"></label><label><span>${esc(tr('الوصف بالعربية','Arabic description'))}</span><textarea ${d} data-admin-tr="descriptionAr">${esc(t.descriptionAr||'')}</textarea></label><label><span>${esc(tr('الوصف بالإنجليزية','English description'))}</span><textarea ${d} data-admin-tr="descriptionEn">${esc(t.descriptionEn||'')}</textarea></label></div>`;}
function supplierPicker(x){const s=(state?.accounts||[]).filter(a=>a.role==='supplier'&&!a.deletedAt&&!a.blockedAt);return`<section class="admin-supplier-picker"><h3>${esc(tr('الموردون المدعوون','Invited suppliers'))}</h3><div class="admin-check-list">${s.map(a=>`<label><input type="checkbox" data-admin-supplier value="${esc(a.id)}" ${(x.supplierIds||[]).includes(a.id)?'checked':''}><span>${esc(a.company||a.name||'#'+String(a.id).slice(0,8))}</span></label>`).join('')}</div></section>`;}
function categorySelector(x){
  const rows=activeCategories(),current=x?.categoryId||'';
  if(!rows.length)return`<section class="admin-category-select-box"><strong>${esc(tr('التصنيف','Category'))}</strong><p>${esc(tr('أضف تصنيفًا من الحساب > التصنيفات أولًا.','Add a category from Account > Categories first.'))}</p></section>`;
  return `<section class="admin-category-select-box"><label><span>${esc(tr('التصنيف','Category'))}</span><select data-admin-category-select><option value="">—</option>${rows.map(cat=>`<option value="${esc(cat.id)}" ${current===cat.id?'selected':''}>${esc(tr(cat.nameAr,cat.nameEn))}</option>`).join('')}</select></label></section>`;
}
function syncPublicProductSubcategory(form){
  const cat=form?.categoryId?.value||'',sub=form?.subcategoryId;if(!sub)return;
  const current=sub.value;sub.innerHTML='<option value="">—</option>'+activeSubcategories(cat).map(x=>`<option value="${esc(x.id)}" ${x.id===current?'selected':''}>${esc(taxonomyLabel(x,lang()))}</option>`).join('');
  if(current&&![...sub.options].some(o=>o.value===current))sub.value='';
}
function publicTranslationFields(x){
  const t=x.translation||{},editable=can('translate'),disabled=editable?'':'disabled';
  return `<div class="form-stack admin-public-translation"><label><span>${esc(tr('اسم المنتج بالعربية','Arabic product name'))}</span><input ${disabled} data-admin-public-tr="titleAr" value="${esc(t.titleAr||'')}"></label><label><span>${esc(tr('اسم المنتج بالإنجليزية','English product name'))}</span><input ${disabled} data-admin-public-tr="titleEn" value="${esc(t.titleEn||'')}"></label><label><span>${esc(tr('الوصف بالعربية','Arabic description'))}</span><textarea ${disabled} data-admin-public-tr="descriptionAr">${esc(t.descriptionAr||'')}</textarea></label><label><span>${esc(tr('الوصف بالإنجليزية','English description'))}</span><textarea ${disabled} data-admin-public-tr="descriptionEn">${esc(t.descriptionEn||'')}</textarea></label></div>`;
}
function publicOfferEditor(x){
  const cats=activeCategories(),subs=activeSubcategories(x.categoryId),countries=activeSupplyCountries(),canPublish=can('publish');
  const currentImages=(x.images||[]).map((src,i)=>`<label class="admin-image-tile"><input checked type="checkbox" data-admin-public-image-index="${i}"><span><img alt="" data-admin-media="${esc(src)}" data-image-viewer></span><small>${esc(tr('إبقاء الصورة','Keep image'))}</small></label>`).join('');
  return `<form id="adminPublicOfferForm" class="form-stack admin-public-offer-editor" data-id="${esc(x.id)}">
    <h3>${esc(tr('تعديل المنتج','Edit product'))}</h3>
    <label><span>${esc(tr('اسم المنتج الأصلي','Original product name'))}</span><input name="product" required maxlength="300" value="${esc(x.product||'')}"></label>
    <label><span>${esc(tr('الوصف الأصلي','Original description'))}</span><textarea name="specs" required maxlength="10000">${esc(x.specs||'')}</textarea></label>
    <div class="form-two"><label><span>${esc(tr('السعر','Price'))}</span><input name="unitPrice" type="number" step="0.01" min="0.01" required value="${esc(x.unitPrice||'')}"></label><label><span>${esc(tr('العملة','Currency'))}</span><select name="currency">${['USD','SAR','AED','CNY','EUR'].map(v=>`<option ${x.currency===v?'selected':''}>${v}</option>`).join('')}</select></label></div>
    <div class="form-two"><label><span>${esc(tr('الحد الأدنى','MOQ'))}</span><input name="moq" type="number" min="1" required value="${esc(x.moq||'')}"></label><label><span>${esc(tr('المخزون','Stock'))}</span><input name="stock" maxlength="100" value="${esc(x.stock||'')}"></label></div>
    <div class="form-two"><label><span>${esc(tr('مدة الإنتاج بالأيام','Production time (days)'))}</span><input name="leadTime" type="number" min="1" required value="${esc(x.leadTime||'')}"></label><label><span>${esc(tr('دولة التوريد','Supply country'))}</span><select name="country" required><option value="">—</option>${countries.map(v=>`<option value="${esc(v.id)}" ${x.country===v.id?'selected':''}>${esc(taxonomyLabel(v,lang()))}</option>`).join('')}</select></label></div>
    <label><span>${esc(tr('صالح حتى','Valid until'))}</span><input name="validUntil" type="date" value="${esc(x.validUntil||'')}"></label>
    <div class="form-two"><label><span>${esc(tr('التصنيف الرئيسي','Main category'))}</span><select name="categoryId"><option value="">—</option>${cats.map(cat=>`<option value="${esc(cat.id)}" ${x.categoryId===cat.id?'selected':''}>${esc(taxonomyLabel(cat,lang()))}</option>`).join('')}</select></label><label><span>${esc(tr('التصنيف الفرعي','Subcategory'))}</span><select name="subcategoryId"><option value="">—</option>${subs.map(s=>`<option value="${esc(s.id)}" ${x.subcategoryId===s.id?'selected':''}>${esc(taxonomyLabel(s,lang()))}</option>`).join('')}</select></label></div>
    ${canPublish?`<label><span>${esc(tr('حالة المنتج','Product status'))}</span><select name="status"><option value="published" ${x.status==='published'?'selected':''}>${esc(tr('منشور','Published'))}</option><option value="pending" ${x.status==='pending'?'selected':''}>${esc(tr('غير منشور / قيد المراجعة','Unpublished / pending'))}</option></select></label>`:''}
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
      validUntil:form.validUntil.value,categoryId:form.categoryId.value,subcategoryId:form.subcategoryId.value,images
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
  const currencyHint=pricing?.isCart?tr('تُحدد تلقائيًا من عملة طلب المنتجات.','Set automatically from the product order currency.'):kind==='request'?tr('تُحدد تلقائيًا من العرض المختار.','Set automatically from the selected quote.'):tr('تُحدد تلقائيًا من العرض العام.','Set automatically from the public offer.');
  const currencyField=pricing?'<label><span>'+esc(tr('العملة','Currency'))+'</span><select data-admin-payment-currency disabled>'+['AED','SAR','USD','CNY','EUR'].map(v=>'<option '+(currency===v?'selected':'')+'>'+v+'</option>').join('')+'</select><small>'+esc(currencyHint)+'</small></label>':'<label><span>'+esc(tr('العملة','Currency'))+'</span><select data-admin-payment-currency>'+['AED','SAR','USD','CNY','EUR'].map(v=>'<option '+(currency===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
  const amountHint=pricing?'<small>'+esc(tr('تم تعبئة الإجمالي تلقائيًا. يمكنك تخفيض المبلغ إذا كانت هذه دفعة جزئية أو عربونًا.','The total is filled automatically. You can reduce it for a partial payment or deposit.'))+'</small>':'';
  return '<section class="admin-payment-message-field'+hidden+'"><h4>'+esc(tr('بيانات الدفع','Payment details'))+'</h4>'+bankSelect+'<div class="form-two"><label><span>'+esc(tr('المبلغ المطلوب','Amount due'))+'</span><input type="number" min="0.01" step="0.01" data-admin-payment-amount value="'+esc(amount)+'" required>'+amountHint+'</label>'+currencyField+'</div><label><span>'+esc(tr('رسالة الدفع للعميل','Payment message to customer'))+'</span><textarea data-admin-payment-message maxlength="2000">'+esc(defaultPaymentMessage(x,kind))+'</textarea><small>'+esc(tr('سيشاهد العميل بيانات الحساب والمبلغ داخل الطلب ثم يرفع الإيصال.','The customer will see the account details and amount inside the order, then upload the receipt.'))+'</small></label></section>';
}
function interestTrackingEditor(x){
  const current=interestTracking(x),supplier=supplierExecutionInfo(x,'interest'),canPay=supplier.confirmed||current==='payment_confirmation';
  const approve=current==='received'?'<button class="primary-btn admin-send-to-supplier" type="button" data-admin-send-interest-supplier="'+esc(x.id)+'">'+esc(tr('اعتماد وإرسال للمورد','Approve & send to supplier'))+'</button>':'';
  return '<section class="admin-tracking-editor"><h3>'+esc(tr('متابعة طلب المنتج الجاهز','Ready-product order tracking'))+'</h3>'+approve+'<label><span>'+esc(tr('الحالة الحالية','Current status'))+'</span><select data-admin-interest-tracking-status>'+trackingOptions(READY_TRACKING,x,current,canPay)+'</select></label>'+paymentMessageField(x,'interest',current)+'<label><span>'+esc(tr('ملاحظة للعميل (اختياري)','Customer note (optional)'))+'</span><textarea data-admin-interest-tracking-note maxlength="1000">'+esc(x.trackingNote||'')+'</textarea></label><small>'+(x.trackingUpdatedAt?esc(tr('آخر تحديث','Last update'))+': '+esc(date(x.trackingUpdatedAt)):'')+'</small><button class="primary-btn" type="button" data-admin-save-interest-tracking="'+esc(x.id)+'">'+esc(tr('حفظ حالة الطلب','Save order status'))+'</button></section>'+paymentReviewPanel(x,'interest');
}
function adminInvoicePanel(item,entityType){
  const proforma=item?.proformaInvoice,finalInvoice=item?.finalInvoice;
  if(!proforma&&!finalInvoice)return '';
  const button=(invoice,kind,label)=>invoice?.number?'<button type="button" class="invoice-document-btn '+(kind==='final'?'paid':'')+'" data-admin-invoice-pdf="'+kind+'" data-admin-invoice-type="'+esc(entityType)+'" data-admin-invoice-id="'+esc(item.id)+'"><span>'+esc(label)+'</span><strong>'+esc(invoice.number)+'</strong>'+(kind==='final'?'<b>PAID</b>':'')+'</button>':'';
  return '<section class="invoice-documents-card"><div><small>'+esc(tr('الفواتير والمستندات','Invoices & documents'))+'</small><strong>'+esc(tr('مستندات PDF الرسمية','Official PDF documents'))+'</strong></div><div class="invoice-document-actions">'+button(proforma,'proforma','Proforma Invoice')+button(finalInvoice,'final',tr('الفاتورة النهائية','Final Invoice'))+'</div></section>';
}
async function openAdminInvoicePdf(target){
  const entityType=target.dataset.adminInvoiceType,id=target.dataset.adminInvoiceId,kind=target.dataset.adminInvoicePdf;
  const rows=entityType==='request'?(state?.requests||[]):(state?.interests||[]),item=rows.find(x=>x.id===id);if(!item)return;
  const invoice=kind==='final'?item.finalInvoice:item.proformaInvoice;if(!invoice)return;
  target.disabled=true;try{await downloadInvoicePdf(invoice,{orderNo:ref(item)});}catch{toast(tr('تعذر فتح ملف الفاتورة. حاول مجددًا.','Could not open the invoice PDF. Please try again.'));}finally{target.disabled=false;}
}
function openInterest(id){
  const x=(state?.interests||[]).find(item=>item.id===id);if(!x)return;
  const offer=(state?.publicOffers||[]).find(o=>o.id===x.offerId),customer=account(x.customerId);
  const pricing=interestPricing(x);
  const orderSummary=pricing?'<section class="admin-selected-quote-card"><div class="admin-selected-quote-head"><div><small>'+esc(tr('طلب العرض العام','Public-offer order'))+'</small><strong>#'+esc(ref(x))+'</strong></div><span class="status-pill status-published">'+esc(tr('الكمية محددة','Quantity selected'))+'</span></div><div class="admin-selected-quote-values"><div><span>'+esc(tr('سعر الوحدة','Unit price'))+'</span><strong>'+esc(formatMoney(pricing.unitPrice,pricing.currency))+'</strong></div><div><span>'+esc(tr('الكمية','Quantity'))+'</span><strong>'+esc(Number(pricing.quantity).toLocaleString())+'</strong></div><div class="total"><span>'+esc(tr('الإجمالي','Total'))+'</span><strong>'+esc(formatMoney(pricing.total,pricing.currency))+'</strong></div></div><small>'+esc(tr('تم تثبيت السعر والعملة وقت تقديم العميل للطلب.','Price and currency were captured when the customer placed the request.'))+'</small></section>':'';
  const html=(customer?'<section class="admin-owner-box"><strong>'+esc(tr('العميل','Customer'))+'</strong><p>'+esc(customer.company||customer.name||'—')+'</p>'+(can('accounts.read')?'<small>'+esc(customer.name||'')+(customer.phone?' · '+esc(customer.phone):'')+(customer.email?' · '+esc(customer.email):'')+'</small>':'')+'</section>':'')+orderSummary+supplierConfirmationCard(x,'interest')+interestTrackingEditor(x)+adminInvoicePanel(x,'interest')+(offer?'<section class="admin-source-box"><h3>'+esc(tr('المنتج','Product'))+'</h3><strong>'+esc(title(offer))+'</strong><p>'+esc(desc(offer)||'—')+'</p></section>'+gallery(offer.images||[]):'');
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
  const current=requestTracking(x),supplier=supplierExecutionInfo(x,'request'),canPay=supplier.confirmed||current==='payment_confirmation',flow=x.orderType==='cart'?READY_TRACKING:TRACKING;
  const approve=x.orderType==='cart'&&current==='received'?'<button class="primary-btn admin-send-to-supplier" type="button" data-admin-send-cart-suppliers="'+esc(x.id)+'">'+esc(tr('اعتماد وإرسال المنتجات للموردين','Approve & send items to suppliers'))+'</button>':'';
  return '<section class="admin-tracking-editor"><h3>'+esc(tr('متابعة الطلب','Order tracking'))+'</h3>'+approve+'<label><span>'+esc(tr('الحالة الحالية','Current status'))+'</span><select data-admin-tracking-status>'+trackingOptions(flow,x,current,canPay,{rfq:x.orderType!=='cart'})+'</select></label>'+paymentMessageField(x,'request',current)+'<label><span>'+esc(tr('ملاحظة للعميل (اختياري)','Customer note (optional)'))+'</span><textarea data-admin-tracking-note maxlength="1000">'+esc(x.trackingNote||'')+'</textarea></label><small>'+(x.trackingUpdatedAt?esc(tr('آخر تحديث','Last update'))+': '+esc(date(x.trackingUpdatedAt)):'')+'</small><button class="primary-btn" type="button" data-admin-save-tracking="'+esc(x.id)+'">'+esc(tr('حفظ حالة الطلب','Save order status'))+'</button></section>'+paymentReviewPanel(x,'request');
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
function subcategoryDialog(id=''){
  const current=subcategories().find(x=>x.id===id),parents=activeCategories();if(!parents.length){toast(tr('أضف تصنيفًا رئيسيًا أولًا.','Add a main category first.'));return;}
  modal(current?tr('تعديل التصنيف الفرعي','Edit subcategory'):tr('إضافة تصنيف فرعي','Add subcategory'),'M Platform',`<form id="adminSubcategoryForm" class="form-stack" data-id="${esc(current?.id||'')}"><label><span>${esc(tr('التصنيف الرئيسي','Main category'))}</span><select name="parentId" required>${parents.map(x=>`<option value="${esc(x.id)}" ${current?.parentId===x.id?'selected':''}>${esc(taxonomyLabel(x,lang()))}</option>`).join('')}</select></label><label><span>${esc(tr('الاسم بالعربية','Arabic name'))}</span><input name="nameAr" required maxlength="80" value="${esc(current?.nameAr||'')}"></label><label><span>${esc(tr('الاسم بالإنجليزية','English name'))}</span><input name="nameEn" required maxlength="80" value="${esc(current?.nameEn||'')}"></label><button class="primary-btn" type="submit">${esc(tr('حفظ','Save'))}</button></form>`);
}
async function saveSubcategories(rows){try{await api('/api/v1/settings',{method:'POST',body:{version:Number(state.settings?._version||0),data:{subcategories:rows}}});await reload();schedule();return true;}catch(e){toast(e.message);return false;}}
async function submitSubcategory(form){const id=form.dataset.id||crypto.randomUUID(),rows=subcategories(),next={id,parentId:form.parentId.value,nameAr:form.nameAr.value.trim(),nameEn:form.nameEn.value.trim(),active:true},i=rows.findIndex(x=>x.id===id);if(i>=0)rows[i]={...rows[i],...next};else rows.push(next);if(await saveSubcategories(rows))closeModal();}
async function toggleSubcategory(id){const rows=subcategories(),x=rows.find(v=>v.id===id);if(!x)return;x.active=x.active===false;await saveSubcategories(rows);}
async function deleteSubcategory(id){const used=(state?.publicOffers||[]).some(x=>x.subcategoryId===id&&!x.deletedAt);if(used){toast(tr('غيّر تصنيف المنتجات المرتبطة أولًا.','Reassign linked products first.'));return;}await saveSubcategories(subcategories().filter(x=>x.id!==id));}
function supplyCountryDialog(id=''){
  const current=supplyCountries().find(x=>x.id===id);
  modal(current?tr('تعديل دولة التوريد','Edit supply country'):tr('إضافة دولة توريد','Add supply country'),'M Platform',`<form id="adminSupplyCountryForm" class="form-stack" data-id="${esc(current?.id||'')}"><label><span>${esc(tr('الاسم بالعربية','Arabic name'))}</span><input name="nameAr" required maxlength="80" value="${esc(current?.nameAr||'')}"></label><label><span>${esc(tr('الاسم بالإنجليزية','English name'))}</span><input name="nameEn" required maxlength="80" value="${esc(current?.nameEn||'')}"></label><button class="primary-btn" type="submit">${esc(tr('حفظ','Save'))}</button></form>`);
}
async function saveSupplyCountries(rows){try{await api('/api/v1/settings',{method:'POST',body:{version:Number(state.settings?._version||0),data:{supplyCountries:rows}}});await reload();schedule();return true;}catch(e){toast(e.message);return false;}}
async function submitSupplyCountry(form){const id=form.dataset.id||crypto.randomUUID(),rows=supplyCountries(),next={id,nameAr:form.nameAr.value.trim(),nameEn:form.nameEn.value.trim(),active:true},i=rows.findIndex(x=>x.id===id);if(i>=0)rows[i]={...rows[i],...next};else rows.push(next);if(await saveSupplyCountries(rows))closeModal();}
async function toggleSupplyCountry(id){const rows=supplyCountries(),x=rows.find(v=>v.id===id);if(!x)return;x.active=x.active===false;await saveSupplyCountries(rows);}
async function deleteSupplyCountry(id){await saveSupplyCountries(supplyCountries().filter(x=>x.id!==id));}
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
async function deleteCategory(id){
  if(subcategories().some(x=>x.parentId===id)||(state?.publicOffers||[]).some(x=>x.categoryId===id&&!x.deletedAt)){toast(tr('غيّر تصنيف المنتجات واحذف التصنيفات الفرعية المرتبطة أولًا.','Reassign products and remove linked subcategories first.'));return;}
  await saveCategories(categories().filter(cat=>cat.id!==id));
}
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
function cartSupplierStatus(value){
  const labels={pending_confirmation:tr('بانتظار التأكيد','Awaiting confirmation'),confirmed:tr('تم التأكيد','Confirmed'),production:tr('قيد الإنتاج','In production'),ready_for_inspection:tr('جاهز للفحص','Ready for inspection'),cannot_fulfill:tr('تعذر التنفيذ','Unable to fulfill')};
  return labels[value]||labels.pending_confirmation;
}
function cartOrderAdminPanel(request){
  const snapshots=Array.isArray(request.cartItems)?request.cartItems:[],children=(state?.interests||[]).filter(i=>i.cartOrderId===request.id);
  const rows=snapshots.map((item,index)=>{
    const child=children.find(i=>i.id===item.interestId),offer=(state?.publicOffers||[]).find(o=>o.id===item.offerId),supplier=offer?account(offer.supplierId):null,statusValue=child?.supplierOrderStatus||'pending_confirmation';
    const name=lang()==='ar'?(item.translation?.titleAr||item.translation?.titleEn||item.product):(item.translation?.titleEn||item.translation?.titleAr||item.product);
    const image=(item.images||[])[0];
    return '<article class="admin-cart-line">'+(image?'<div class="admin-cart-line-image"><img alt="" data-admin-media="'+esc(image)+'" data-image-viewer></div>':'')+'<div class="admin-cart-line-main"><div><small>'+esc(tr('المنتج','Product'))+' '+(index+1)+'</small><strong>'+esc(name||tr('منتج','Product'))+'</strong></div><div class="facts"><span>'+esc(tr('الكمية','Quantity'))+': '+esc(item.quantity||'—')+'</span><span>'+esc(tr('سعر الوحدة','Unit price'))+': '+esc(formatMoney(item.unitPrice,item.currency))+'</span><span>'+esc(tr('الإجمالي','Total'))+': '+esc(formatMoney(item.total,item.currency))+'</span></div><div class="admin-record-meta">'+(supplier?'<span>'+esc(tr('المورد','Supplier'))+': '+esc(supplier.company||supplier.name||'#'+String(supplier.id||'').slice(0,8))+'</span>':'')+'<span class="status-pill">'+esc(cartSupplierStatus(statusValue))+'</span></div>'+(child?.supplierOrderNote?'<p class="muted">'+esc(child.supplierOrderNote)+'</p>':'')+'</div></article>';
  }).join('');
  return '<section class="section-block admin-cart-order-panel"><div class="section-title"><div><h3>'+esc(tr('منتجات الطلب','Order products'))+' ('+snapshots.length+')</h3><p>'+esc(tr('كل منتج مرتبط بمورده ويُتابع تنفيذه بشكل مستقل.','Each item is linked to its supplier and tracked independently.'))+'</p></div></div><div class="admin-cart-lines">'+(rows||empty())+'</div><div class="admin-selected-quote-card"><div class="admin-selected-quote-values"><div class="total"><span>'+esc(tr('الإجمالي الكلي','Grand total'))+'</span><strong>'+esc(formatMoney(request.cartTotal,request.currency))+'</strong></div></div></div></section>';
}
async function sendCartToSuppliers(id){
  const x=(state?.requests||[]).find(item=>item.id===id&&item.orderType==='cart');if(!x)return;
  try{await mutate('requests',x,{trackingStatus:'supplier_confirmation',trackingNote:''});closeModal();schedule();toast(tr('تم اعتماد الطلب وإرسال كل منتج إلى مورده.','Order approved and each item was sent to its supplier.'));}catch(e){toast(e.message);}
}
function requestQuotesPanel(request){
  const rows=(state?.quotes||[]).filter(q=>q.requestId===request.id&&!q.deletedAt).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(!rows.length)return `<section class="section-block"><div class="section-title"><div><h3>${esc(tr('عروض الأسعار المستلمة','Received quotes'))}</h3><p>${esc(tr('لم يصل عرض سعر لهذا الطلب بعد.','No quote has been received for this order yet.'))}</p></div></div></section>`;
  const pending=rows.filter(q=>q.status==='pending').length;
  return `<section class="section-block admin-request-quotes"><div class="section-title"><div><h3>${esc(tr('عروض الأسعار المستلمة','Received quotes'))} (${rows.length})</h3><p>${pending?esc(tr(`${pending} بانتظار المراجعة`,`${pending} pending review`)):esc(tr('تمت مراجعة جميع العروض','All quotes reviewed'))}</p></div></div><div class="list-stack">${rows.map(q=>row(q,'quote')).join('')}</div></section>`;
}
function openRecord(kind,id){
  const arr=kind==='request'?state?.requests:kind==='quote'?state?.quotes:state?.publicOffers,x=(arr||[]).find(v=>v.id===id);if(!x)return;
  if(kind==='request'&&x.orderType==='cart'){
    const html=ownerBox(x)+cartOrderAdminPanel(x)+selectedQuoteCard(x)+supplierConfirmationCard(x,'request')+((can('requests.edit')||can('publish'))?trackingEditor(x):'')+adminInvoicePanel(x,'request');
    modal('#'+ref(x)+' — '+tr('طلب منتجات','Product order'),status(requestTracking(x)),html);return;
  }
  const pending=kind==='request'?x.status==='review':x.status==='pending',editPerm=kind==='request'?'requests.edit':'offers.edit',editImages=pending&&can(editPerm),editTr=pending&&can('translate'),approve=pending&&can('publish'),linked=kind==='quote'?(state?.requests||[]).find(r=>r.id===x.requestId):null;
  let html=ownerBox(x)+`<section class="admin-source-box"><h3>${esc(tr('المحتوى الأصلي','Original content'))}</h3><strong>${esc(x.product||linked?.product||title(x))}</strong><p>${esc(x.specs||x.notes||'—')}</p>${kind==='request'?`<div class="facts"><span>${esc(tr('الكمية','Quantity'))}: ${esc(x.quantity||'—')}</span><span>${esc(tr('الدولة','Country'))}: ${esc(x.country||'—')}</span><span>${esc(tr('تاريخ الاحتياج','Needed date'))}: ${esc(x.neededDate||'—')}</span></div>${x.repeatedFromRequestId?`<p class="payment-review-note"><b>${esc(tr('طلب مكرر من','Repeated from'))}:</b> #${esc(ref((state?.requests||[]).find(r=>r.id===x.repeatedFromRequestId)||{id:x.repeatedFromRequestId}))}</p>`:''}`:''}${linked?`<div class="facts"><span>${esc(tr('الطلب المرتبط','Linked request'))}: #${esc(ref(linked))}</span></div>`:''}</section>`;
  if(kind==='request')html+=requestQuotesPanel(x);
  if(kind==='request'&&(can('requests.edit')||can('publish')))html+=selectedQuoteCard(x)+supplierConfirmationCard(x,'request')+trackingEditor(x);
  if(kind==='request')html+=adminInvoicePanel(x,'request');
  if(kind==='public'&&can('offers.edit'))html+=publicOfferEditor(x);
  if(kind!=='public'||!can('offers.edit'))html+=`<section><h3>${esc(tr('الصور','Images'))}</h3>${gallery(x.images||[],editImages)||`<p class="muted">${esc(tr('لا توجد صور.','No images.'))}</p>`}</section><section><h3>${esc(tr('الترجمة','Translation'))}</h3>${translations(x,editTr)}</section>`;
  if(kind==='request'&&pending&&can('publish'))html+=supplierPicker(x);
  if(pending&&!(kind==='public'&&can('offers.edit'))){
    html+=`<section class="admin-redaction"><h3>${esc(tr('فحص الخصوصية','Privacy check'))}</h3><label><input type="checkbox" data-admin-redact="identity"><span>${esc(tr('تمت مراجعة الصور والنصوص وإزالة الهوية.','Images and text were checked and identity removed.'))}</span></label><label><input type="checkbox" data-admin-redact="contact"><span>${esc(tr('تمت إزالة بيانات التواصل المباشر.','Direct contact details were removed.'))}</span></label></section><div class="admin-review-actions">${editTr?`<button class="secondary-btn" data-admin-save-review data-kind="${kind}" data-id="${esc(x.id)}">${esc(tr('حفظ دون نشر','Save without publishing'))}</button>`:''}${approve?`<button class="primary-btn" data-admin-approve data-kind="${kind}" data-id="${esc(x.id)}">${esc(tr('اعتماد ونشر','Approve & publish'))}</button>`:''}</div>`;
  }else if(kind==='request'&&x.status==='sent'&&can('publish'))html+=`<div class="admin-review-actions"><button class="secondary-btn" data-admin-reopen-request data-id="${esc(x.id)}">${esc(tr('إعادة للمراجعة','Return to review'))}</button></div>`;
  modal(`#${ref(x)} — ${title(x)}`,kind==='request'?status(requestTracking(x)):status(x.status),html);
}
function accountActivity(a){
  const edits=(a.accountHistory||[]).map(h=>({...h,label:tr('تعديل البيانات','Details edited')})),mods=(a.moderationHistory||[]).map(h=>({...h,label:h.action==='block'?tr('إيقاف الحساب','Account disabled'):h.action==='unblock'?tr('إعادة تفعيل الحساب','Account reactivated'):tr('إجراء إداري','Admin action')}));
  const rows=[...edits,...mods].sort((x,y)=>String(y.at||'').localeCompare(String(x.at||'')));
  return rows.length?'<ul class="history-list">'+rows.map(h=>'<li>'+esc(date(h.at))+' — '+esc(h.label)+(h.fields?.length?'<p>'+esc(h.fields.join(', '))+'</p>':'')+(h.reason?'<p>'+esc(h.reason)+'</p>':'')+'</li>').join('')+'</ul>':'<p class="muted">'+esc(tr('لا يوجد نشاط إداري بعد.','No admin activity yet.'))+'</p>';
}
function openAccount(id){
  const a=account(id);if(!a)return;const req=(state?.requests||[]).filter(r=>r.customerId===id),qs=(state?.quotes||[]).filter(q=>q.supplierId===id),po=(state?.publicOffers||[]).filter(o=>o.supplierId===id);
  const controls=can('accounts.manage')?'<div class="admin-review-actions"><button class="secondary-btn" data-admin-edit-account="'+esc(a.id)+'">'+esc(tr('تعديل البيانات','Edit details'))+'</button><button class="'+(a.blockedAt?'primary-btn':'danger-btn')+'" data-admin-toggle-account="'+esc(a.id)+'">'+esc(a.blockedAt?tr('إعادة تفعيل الحساب','Reactivate account'):tr('إيقاف الحساب','Disable account'))+'</button></div>':'';
  modal(a.company||a.name||'#'+String(a.id).slice(0,8),a.role==='client'?tr('عميل','Customer'):tr('مورد','Supplier'),'<div class="facts"><span>'+esc(a.blockedAt?tr('متوقف','Disabled'):tr('نشط','Active'))+'</span></div><dl class="admin-account-details"><div><dt>'+esc(tr('الاسم','Name'))+'</dt><dd>'+esc(a.name||'—')+'</dd></div><div><dt>'+esc(tr('الشركة','Company'))+'</dt><dd>'+esc(a.company||'—')+'</dd></div><div><dt>'+esc(tr('رقم التواصل','Phone'))+'</dt><dd>'+esc(a.phone||'—')+'</dd></div><div><dt>'+esc(tr('البريد','Email'))+'</dt><dd>'+esc(a.email||'—')+'</dd></div><div><dt>'+esc(tr('الدولة','Country'))+'</dt><dd>'+esc(a.country||'—')+'</dd></div></dl>'+controls+'<h3>'+esc(tr('سجل النشاط','Activity log'))+'</h3>'+accountActivity(a)+'<h3>'+esc(tr('الملخص','Summary'))+'</h3><div class="facts"><span>'+esc(tr('الطلبات','Requests'))+': '+req.length+'</span><span>'+esc(tr('العروض','Offers'))+': '+(qs.length+po.length)+'</span></div>');
}
function accountEditDialog(id){
  const a=account(id);if(!a||!can('accounts.manage'))return;
  modal(tr('تعديل بيانات الحساب','Edit account details'),a.role==='client'?tr('عميل','Customer'):tr('مورد','Supplier'),'<form id="adminAccountEditForm" class="form-stack" data-id="'+esc(a.id)+'"><label><span>'+esc(tr('الاسم','Name'))+'</span><input name="name" required maxlength="200" value="'+esc(a.name||'')+'"></label><label><span>'+esc(tr('الشركة','Company'))+'</span><input name="company" maxlength="200" value="'+esc(a.company||'')+'"></label><label><span>'+esc(tr('رقم التواصل','Phone'))+'</span><input name="phone" required maxlength="200" value="'+esc(a.phone||'')+'"></label><label><span>'+esc(tr('البريد الإلكتروني','Email'))+'</span><input name="email" type="email" required maxlength="254" value="'+esc(a.email||'')+'"></label><label><span>'+esc(tr('الدولة','Country'))+'</span><input name="country" required maxlength="200" value="'+esc(a.country||'')+'"></label>'+(a.role==='supplier'?'<label><span>'+esc(tr('التصنيف','Category'))+'</span><input name="category" maxlength="200" value="'+esc(a.category||'')+'"></label>':'')+'<button class="primary-btn" type="submit">'+esc(tr('حفظ التعديلات','Save changes'))+'</button></form>');
}
async function submitAccountEdit(form){
  const a=account(form.dataset.id);if(!a)return;
  try{await api('/api/v1/accounts/update',{method:'POST',body:{id:a.id,name:form.name.value,company:form.company.value,phone:form.phone.value,email:form.email.value,country:form.country.value,category:form.category?.value||''}});await reload();closeModal();schedule();toast(tr('تم تحديث بيانات الحساب.','Account details updated.'));}catch(e){toast(e.message);}
}
function accountStatusDialog(id){
  const a=account(id);if(!a||!can('accounts.manage'))return;
  const action=a.blockedAt?'unblock':'block';
  modal(a.blockedAt?tr('إعادة تفعيل الحساب','Reactivate account'):tr('إيقاف الحساب','Disable account'),a.company||a.name||'', '<form id="adminAccountStatusForm" class="form-stack" data-id="'+esc(a.id)+'" data-action="'+action+'"><label><span>'+esc(tr('سبب الإجراء','Reason'))+'</span><textarea name="reason" required maxlength="1000"></textarea></label><button class="'+(a.blockedAt?'primary-btn':'danger-btn')+'" type="submit">'+esc(a.blockedAt?tr('إعادة التفعيل','Reactivate'):tr('إيقاف الحساب','Disable account'))+'</button></form>');
}
async function submitAccountStatus(form){
  const a=account(form.dataset.id);if(!a)return;
  try{await api('/api/v1/moderation',{method:'POST',body:{kind:'account',id:a.id,action:form.dataset.action,reason:form.reason.value.trim()}});await reload();closeModal();schedule();toast(form.dataset.action==='block'?tr('تم إيقاف الحساب.','Account disabled.'):tr('تمت إعادة تفعيل الحساب.','Account reactivated.'));}catch(e){toast(e.message);}
}
function readForm(x){const translation={};document.querySelectorAll('[data-admin-tr]').forEach(e=>translation[e.dataset.adminTr]=e.value.trim());const images=[];(x.images||[]).forEach((src,i)=>{const b=document.querySelector(`[data-admin-image-index="${i}"]`);if(!b||b.checked)images.push(src);});return{translation,images,suppliers:[...document.querySelectorAll('[data-admin-supplier]:checked')].map(e=>e.value),categoryId:document.querySelector('[data-admin-category-select]')?.value||'',identity:document.querySelector('[data-admin-redact="identity"]')?.checked,contact:document.querySelector('[data-admin-redact="contact"]')?.checked};}
async function approve(kind,id){const arr=kind==='request'?state.requests:kind==='quote'?state.quotes:state.publicOffers,x=arr.find(v=>v.id===id);if(!x)return;const f=readForm(x);if(Object.values(f.translation).some(v=>!v)){toast(tr('أكمل العنوان والوصف بالعربية والإنجليزية.','Complete Arabic and English title and description.'));return;}if(!f.identity||!f.contact){toast(tr('أكمل فحص إزالة الهوية وبيانات التواصل.','Complete both privacy checks.'));return;}if(kind==='request'&&!f.suppliers.length){toast(tr('اختر موردًا واحدًا على الأقل.','Select at least one supplier.'));return;}const patch={translation:f.translation,reviewedAt:new Date().toISOString(),status:kind==='request'?'sent':'published'},editPerm=kind==='request'?'requests.edit':'offers.edit';if(can(editPerm))patch.images=f.images;if(kind==='request')patch.supplierIds=f.suppliers;if(kind==='public'){if(activeCategories().length&&!f.categoryId){toast(tr('اختر التصنيف أولًا.','Choose a category first.'));return;}patch.categoryId=f.categoryId;}try{await mutate(kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers',x,patch,true);closeModal();schedule();toast(tr('تم الاعتماد بنجاح.','Approved successfully.'));}catch(e){toast(e.message);}}
async function saveReview(kind,id){const arr=kind==='request'?state.requests:kind==='quote'?state.quotes:state.publicOffers,x=arr.find(v=>v.id===id);if(!x)return;const f=readForm(x);if(Object.values(f.translation).some(v=>!v)){toast(tr('أكمل الترجمة أولًا.','Complete the translation first.'));return;}const patch={translation:f.translation,reviewedAt:new Date().toISOString()},editPerm=kind==='request'?'requests.edit':'offers.edit';if(can(editPerm))patch.images=f.images;if(kind==='public')patch.categoryId=f.categoryId;try{await mutate(kind==='request'?'requests':kind==='quote'?'quotes':'publicOffers',x,patch);closeModal();schedule();toast(tr('تم حفظ المراجعة.','Review saved.'));}catch(e){toast(e.message);}}
async function requestStatus(id,s){const x=(state?.requests||[]).find(v=>v.id===id);if(!x)return;try{await mutate('requests',x,{status:s});closeModal();schedule();toast(tr('تم تحديث الحالة.','Status updated.'));}catch(e){toast(e.message);}}
function go(view,tab){if(view==='offers'&&tab)offerTab=tab;document.querySelector(`#bottomNav button[data-screen="${view}"]`)?.click();setTimeout(schedule,30);}

document.addEventListener('click',e=>{
  if(!isAdmin()||document.getElementById('appView').classList.contains('hidden'))return;
  const g=e.target.closest('[data-admin-go]');if(g){go(g.dataset.adminGo,g.dataset.adminTabTarget);return;}
  const all=e.target.closest('[data-admin-request-all]');if(all){requestFilter='all';schedule();return;}
  const active=e.target.closest('[data-admin-request-active]');if(active){requestFilter='active';schedule();return;}
  const quoteReview=e.target.closest('[data-admin-request-quotes]');if(quoteReview){requestFilter='quotes_pending';schedule();return;}
  const ot=e.target.closest('[data-admin-offer-tab]');if(ot){offerTab=ot.dataset.adminOfferTab;schedule();return;}
  const bulkEdit=e.target.closest('[data-admin-bulk-edit]');if(bulkEdit){openBulkProductEditor();return;}
  const ba=e.target.closest('[data-admin-bulk-action]');if(ba){const action=ba.dataset.adminBulkAction;if(action==='translation')openBulkProductEditor('translation');else if(['category','country'].includes(action))bulkAssignDialog(action);else runBulkProductAction(action);return;}
  const tn=e.target.closest('[data-admin-team-new]');if(tn){teamDialog();return;}
  const te=e.target.closest('[data-admin-team-edit]');if(te){teamDialog(te.dataset.adminTeamEdit);return;}
  const tt=e.target.closest('[data-admin-team-toggle]');if(tt){teamToggleDialog(tt.dataset.adminTeamToggle);return;}
  const cun=e.target.closest('[data-admin-currency-new]');if(cun){currencyDialog();return;}
  const cue=e.target.closest('[data-admin-currency-edit]');if(cue){currencyDialog(cue.dataset.adminCurrencyEdit);return;}
  const cut=e.target.closest('[data-admin-currency-toggle]');if(cut){toggleCurrency(cut.dataset.adminCurrencyToggle);return;}
  const bn=e.target.closest('[data-admin-bank-new]');if(bn){bankAccountDialog();return;}
  const be=e.target.closest('[data-admin-bank-edit]');if(be){bankAccountDialog(be.dataset.adminBankEdit);return;}
  const bt=e.target.closest('[data-admin-bank-toggle]');if(bt){toggleBankAccount(bt.dataset.adminBankToggle);return;}
  const bd=e.target.closest('[data-admin-bank-delete]');if(bd){deleteBankAccount(bd.dataset.adminBankDelete);return;}
  const cn=e.target.closest('[data-admin-category-new]');if(cn){categoryDialog();return;}
  const ce=e.target.closest('[data-admin-category-edit]');if(ce){categoryDialog(ce.dataset.adminCategoryEdit);return;}
  const cm=e.target.closest('[data-admin-category-move]');if(cm){moveCategory(cm.dataset.adminCategoryMove,cm.dataset.direction);return;}
  const ct=e.target.closest('[data-admin-category-toggle]');if(ct){toggleCategory(ct.dataset.adminCategoryToggle);return;}
  const cd=e.target.closest('[data-admin-category-delete]');if(cd){deleteCategory(cd.dataset.adminCategoryDelete);return;}
  const sn=e.target.closest('[data-admin-subcategory-new]');if(sn){subcategoryDialog();return;}
  const se=e.target.closest('[data-admin-subcategory-edit]');if(se){subcategoryDialog(se.dataset.adminSubcategoryEdit);return;}
  const stg=e.target.closest('[data-admin-subcategory-toggle]');if(stg){toggleSubcategory(stg.dataset.adminSubcategoryToggle);return;}
  const sd=e.target.closest('[data-admin-subcategory-delete]');if(sd){deleteSubcategory(sd.dataset.adminSubcategoryDelete);return;}
  const cntry=e.target.closest('[data-admin-country-new]');if(cntry){supplyCountryDialog();return;}
  const ce2=e.target.closest('[data-admin-country-edit]');if(ce2){supplyCountryDialog(ce2.dataset.adminCountryEdit);return;}
  const ct2=e.target.closest('[data-admin-country-toggle]');if(ct2){toggleSupplyCountry(ct2.dataset.adminCountryToggle);return;}
  const cd2=e.target.closest('[data-admin-country-delete]');if(cd2){deleteSupplyCountry(cd2.dataset.adminCountryDelete);return;}
  const st=e.target.closest('[data-admin-save-tracking]');if(st){saveTracking(st.dataset.adminSaveTracking);return;}
  const sendCart=e.target.closest('[data-admin-send-cart-suppliers]');if(sendCart){sendCartToSuppliers(sendCart.dataset.adminSendCartSuppliers);return;}
  const sendSupplier=e.target.closest('[data-admin-send-interest-supplier]');if(sendSupplier){sendInterestToSupplier(sendSupplier.dataset.adminSendInterestSupplier);return;}
  const si=e.target.closest('[data-admin-save-interest-tracking]');if(si){saveInterestTracking(si.dataset.adminSaveInterestTracking);return;}
  const interest=e.target.closest('[data-admin-interest]');if(interest){openInterest(interest.dataset.adminInterest);return;}
  const sc=e.target.closest('[data-admin-save-category]');if(sc){savePublicCategory(sc.dataset.adminSaveCategory);return;}
  const o=e.target.closest('[data-admin-open]');if(o){openRecord(o.dataset.adminOpen,o.dataset.adminId);return;}
  const ae=e.target.closest('[data-admin-edit-account]');if(ae){accountEditDialog(ae.dataset.adminEditAccount);return;}
  const at=e.target.closest('[data-admin-toggle-account]');if(at){accountStatusDialog(at.dataset.adminToggleAccount);return;}
  const a=e.target.closest('[data-admin-account]');if(a){openAccount(a.dataset.adminAccount);return;}
  const ap=e.target.closest('[data-admin-approve]');if(ap){approve(ap.dataset.kind,ap.dataset.id);return;}
  const sv=e.target.closest('[data-admin-save-review]');if(sv){saveReview(sv.dataset.kind,sv.dataset.id);return;}
  const rr=e.target.closest('[data-admin-reopen-request]');if(rr){requestStatus(rr.dataset.id,'review');return;}
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
  if(e.target.matches('[data-admin-product-select]')){if(e.target.checked)selectedProducts.add(e.target.dataset.adminProductSelect);else selectedProducts.delete(e.target.dataset.adminProductSelect);updateBulkSelectionUi();return;}
  if(e.target.matches('[data-admin-product-select-all]')){const checked=e.target.checked;document.querySelectorAll('[data-admin-product-select]').forEach(box=>{box.checked=checked;if(checked)selectedProducts.add(box.dataset.adminProductSelect);else selectedProducts.delete(box.dataset.adminProductSelect);});updateBulkSelectionUi();return;}
  if(e.target.matches('#adminPublicOfferForm [name="categoryId"]')){syncPublicProductSubcategory(e.target.form);return;}
  if(e.target.matches('[data-bulk-edit="categoryId"]')){syncBulkProductSubcategory(e.target.closest('[data-bulk-product-row]'));return;}
  if(e.target.matches('[data-admin-request-filter]')){requestFilter=e.target.value;schedule();return;}
  if(e.target.matches('[data-admin-tracking-status],[data-admin-interest-tracking-status]')){
    const field=e.target.closest('.admin-tracking-editor')?.querySelector('.admin-payment-message-field');
    if(field)field.classList.toggle('hidden',e.target.value!=='payment_confirmation');
  }
});
document.addEventListener('focusout',e=>{
  if(!e.target.closest?.('#adminBulkProductsForm'))return;
  setTimeout(()=>{if(!document.activeElement?.closest?.('#adminBulkProductsForm'))normalizeBulkEditorViewport();},180);
});
if(window.visualViewport){
  let bulkKeyboardTimer;
  window.visualViewport.addEventListener('resize',()=>{
    if(!document.getElementById('adminBulkProductsForm'))return;
    clearTimeout(bulkKeyboardTimer);bulkKeyboardTimer=setTimeout(()=>{
      if(!document.activeElement?.matches?.('#adminBulkProductsForm input,#adminBulkProductsForm textarea,#adminBulkProductsForm select'))normalizeBulkEditorViewport();
    },180);
  });
}
document.addEventListener('click',e=>{const target=e.target.closest?.('[data-admin-invoice-pdf]');if(target&&isAdmin()){e.preventDefault();openAdminInvoicePdf(target);}});
document.addEventListener('submit',e=>{
  if(!isAdmin())return;
  if(e.target.matches('#adminTeamForm')){e.preventDefault();submitTeam(e.target);}
  else if(e.target.matches('#adminTeamStatusForm')){e.preventDefault();submitTeamStatus(e.target);}
  else if(e.target.matches('#adminCurrencyForm')){e.preventDefault();submitCurrency(e.target);}
  else if(e.target.matches('#adminBankAccountForm')){e.preventDefault();submitBankAccount(e.target);}
  else if(e.target.matches('#adminAccountEditForm')){e.preventDefault();submitAccountEdit(e.target);}
  else if(e.target.matches('#adminAccountStatusForm')){e.preventDefault();submitAccountStatus(e.target);}
  else if(e.target.matches('#adminCategoryForm')){e.preventDefault();submitCategory(e.target);}
  else if(e.target.matches('#adminSubcategoryForm')){e.preventDefault();submitSubcategory(e.target);}
  else if(e.target.matches('#adminSupplyCountryForm')){e.preventDefault();submitSupplyCountry(e.target);}
  else if(e.target.matches('#adminPublicOfferForm')){e.preventDefault();savePublicOffer(e.target);}
  else if(e.target.matches('#adminBulkProductsForm')){e.preventDefault();submitBulkProducts(e.target);}
  else if(e.target.matches('#adminBulkAssignForm')){e.preventDefault();const form=e.target;runBulkProductAction(form.dataset.kind,form.value.value).then(ok=>{if(ok)closeModal();});}
});
