/* Unified IMSG B2B RFQ administration, isolated from historical order workflows. */
let current=null,records=[],contacts=[],busy=false,panel='requests',filter={q:'',status:'all',country:'all',source:'all',date:'all'};
const x=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const ar=()=>document.documentElement.lang!=='en';
const T=(a,b)=>ar()?a:b;
const statuses=[['new','جديد','New'],['contacted','تم التواصل','Contacted'],['agreed','تم الاتفاق','Agreed'],['closed','مغلق','Closed']];
const statusLabel=v=>{const row=statuses.find(y=>y[0]===v);return row?T(row[1],row[2]):v;};
const fmtDate=value=>value?new Intl.DateTimeFormat(ar()?'ar':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
function nameOf(p){
 const lang=ar()?'titleAr':'titleEn';
 return p?.translation?.[lang]||p?.translation?.titleAr||p?.translation?.titleEn||p?.product||p?.sku||'—';
}
const normalized=v=>String(v||'').trim().toLowerCase();
const api=async(path,options={})=>current.request(path,options);
function listProducts(){return (current?.offers||[]).filter(p=>p.status==='published'&&!p.deletedAt);}
function filteredRows(){
 const q=normalized(filter.q);
 return records.filter(row=>{
  const c=row.customer||{},search=[row.number,c.name,c.whatsapp,c.country,c.company,...row.items.flatMap(item=>[item.snapshot?.sku,item.snapshot?.model,item.snapshot?.product,item.snapshot?.translation?.titleAr,item.snapshot?.translation?.titleEn])].join(' ').toLowerCase();
  if(q&&!search.includes(q))return false;
  if(filter.status!=='all'&&row.status!==filter.status)return false;
  if(filter.source!=='all'&&row.source!==filter.source)return false;
  if(filter.country!=='all'&&c.country!==filter.country)return false;
  const created=new Date(row.createdAt).getTime(),now=Date.now();
  if(filter.date==='today'&&new Date(row.createdAt).toDateString()!==new Date().toDateString())return false;
  if(filter.date==='week'&&created<now-7*86400000)return false;
  if(filter.date==='month'&&created<now-30*86400000)return false;
  return true;
 }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
const actionLink=r=>'https://wa.me/'+encodeURIComponent(String(r.customer?.whatsapp||'').replace(/\D/g,''))+'?text='+encodeURIComponent(T('مرحبًا، معك فريق IMSG بخصوص طلب عرض السعر رقم ','Hello, this is IMSG regarding quote request ')+r.number+T('. نود التواصل معك لمراجعة المنتجات والكميات المطلوبة.','. We would like to review the requested products and quantities with you.'));
function tableHTML(){
 const rows=filteredRows();
 return '<div class="imsg-rfq-scroll"><table class="imsg-rfq-table"><thead><tr>'+
 [T('رقم الطلب','Reference'),T('العميل','Customer'),T('واتساب','WhatsApp'),T('الدولة','Country'),T('المنتجات','Products'),T('التاريخ','Date'),T('المصدر','Source'),T('الحالة','Status'),T('الإجراءات','Actions')].map(h=>'<th>'+h+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(row=>'<tr><td><b dir="ltr">'+x(row.number)+'</b></td><td>'+x(row.customer?.name||'—')+'</td><td dir="ltr">'+x(row.customer?.whatsapp||'')+'</td><td>'+x(row.customer?.country||'')+'</td><td>'+row.items.length+'</td><td>'+x(fmtDate(row.createdAt))+'</td><td>'+T(row.source==='website'?'الموقع':'الإدارة',row.source==='website'?'Website':'Admin')+'</td><td><span class="imsg-rfq-status status-'+x(row.status)+'">'+x(statusLabel(row.status))+'</span></td><td><button type="button" data-rfq-view="'+x(row.id)+'">'+T('عرض','View')+'</button> <button type="button" data-rfq-edit="'+x(row.id)+'">'+T('تعديل','Edit')+'</button> <a href="'+x(actionLink(row))+'" target="_blank" rel="noopener noreferrer">'+T('واتساب','WhatsApp')+'</a></td></tr>').join('')+
 '</tbody></table></div>'+(!rows.length?'<p class="imsg-rfq-empty">'+T('لا توجد طلبات مطابقة.','No matching requests.')+'</p>':'');
}
function customersHTML(){
 const q=normalized(filter.q);
 const rows=contacts.filter(c=>!q||normalized([c.name,c.whatsapp,c.country,c.company].join(' ')).includes(q)).sort((a,b)=>String(b.last_request_at).localeCompare(String(a.last_request_at)));
 return '<div class="imsg-rfq-scroll"><table class="imsg-rfq-table"><thead><tr>'+[T('العميل','Customer'),T('واتساب','WhatsApp'),T('الدولة','Country'),T('الشركة','Company'),T('أول طلب','First request'),T('آخر طلب','Last request'),T('عدد الطلبات','Requests'),T('الإجراءات','Actions')].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+
 rows.map(c=>'<tr><td><b>'+x(c.name)+'</b></td><td dir="ltr">'+x(c.whatsapp)+'</td><td>'+x(c.country)+'</td><td>'+x(c.company||'—')+'</td><td>'+x(fmtDate(c.first_request_at))+'</td><td>'+x(fmtDate(c.last_request_at))+'</td><td>'+records.filter(r=>r.customerId===c.id).length+'</td><td><button data-rfq-client-view="'+x(c.id)+'">'+T('عرض','View')+'</button><button data-rfq-client-new="'+x(c.id)+'">'+T('طلب جديد','New request')+'</button></td></tr>').join('')+'</tbody></table></div>'+(!rows.length?'<p class="imsg-rfq-empty">'+T('لا توجد ملفات عملاء مطابقة','No matching customer records')+'</p>':'');
}
function showCustomer(c){
 if(!c)return;
 const orders=records.filter(r=>r.customerId===c.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 modal(T('ملف العميل','Customer file')+' — '+c.name,'<div class="imsg-rfq-details"><p><strong>'+x(c.name)+'</strong> <span dir="ltr">'+x(c.whatsapp)+'</span></p><p>'+x(c.country)+' · '+x(c.company||'')+'</p><p>'+T('أول طلب','First request')+': '+x(fmtDate(c.first_request_at))+' · '+T('آخر طلب','Last request')+': '+x(fmtDate(c.last_request_at))+'</p>'+
 '<label>'+T('ملاحظات الإدارة','Internal customer notes')+'<textarea rows="3" style="width:100%;box-sizing:border-box" data-rfq-customer-notes maxlength="2000">'+x(c.notes||'')+'</textarea></label>'+
 '<p data-rfq-customer-notes-status role="status"></p><div class="imsg-rfq-dialog-actions"><button data-rfq-customer-save>'+T('حفظ الملاحظات','Save notes')+'</button><button data-rfq-customer-create>'+T('إنشاء طلب جديد','Create request')+'</button><a href="https://wa.me/'+x(c.whatsapp.replace(/\D/g,''))+'" target="_blank" rel="noopener noreferrer">'+T('واتساب','WhatsApp')+'</a></div>'+
 '<h3>'+T('سجل طلبات العميل','Customer request history')+'</h3><div class="imsg-rfq-items">'+orders.map(row=>'<button type="button" data-rfq-history="'+x(row.id)+'">'+x(row.number)+' · '+x(statusLabel(row.status))+' · '+x(fmtDate(row.createdAt))+'</button>').join('')+'</div></div>');
 dialog.querySelector('[data-rfq-customer-create]').onclick=()=>showEditor(null,null,c);
 dialog.querySelectorAll('[data-rfq-history]').forEach(b=>b.onclick=()=>showDetails(records.find(r=>r.id===b.dataset.rfqHistory)));
 dialog.querySelector('[data-rfq-customer-save]').onclick=async event=>{
  const button=event.currentTarget,status=dialog.querySelector('[data-rfq-customer-notes-status]'),notes=dialog.querySelector('[data-rfq-customer-notes]').value;
  button.disabled=true;
  try{await api('/api/v1/rfq',{method:'POST',body:{action:'customer-note',customerId:c.id,notes}});c.notes=notes;status.textContent=T('تم الحفظ','Saved');}
  catch(error){status.textContent=error.message;button.disabled=false;}
 };
}
function renderList(){
 const host=current?.host;if(!host||!host.isConnected)return;
 const countries=[...new Set(records.map(r=>r.customer?.country).filter(Boolean))].sort();
 host.innerHTML='<section class="imsg-rfq-admin"><div class="imsg-rfq-heading"><div><h1>'+T('طلبات عروض الأسعار','Quote requests')+'</h1><p>'+T('إدارة طلبات العملاء والتواصل عبر واتساب','Manage B2B customer inquiries and WhatsApp follow-ups')+'</p></div><div class="imsg-rfq-dialog-actions"><button type="button" data-rfq-panel="requests" class="'+(panel==='requests'?'primary-btn':'')+'">'+T('الطلبات','Requests')+'</button><button type="button" data-rfq-panel="customers" class="'+(panel==='customers'?'primary-btn':'')+'">'+T('العملاء','Customers')+'</button><button type="button" class="primary-btn" data-rfq-new>+ '+T('إنشاء طلب جديد','Create request')+'</button></div></div>'+
 '<div class="imsg-rfq-filters"><input type="search" data-rfq-filter="q" placeholder="'+T('بحث برقم الطلب أو العميل أو المنتج أو الموديل','Search orders, customers, products and models')+'" value="'+x(filter.q)+'">'+
 '<select data-rfq-filter="status"><option value="all">'+T('جميع الحالات','All statuses')+'</option>'+statuses.map(s=>'<option value="'+s[0]+'" '+(filter.status===s[0]?'selected':'')+'>'+T(s[1],s[2])+'</option>').join('')+'</select>'+
 '<select data-rfq-filter="country"><option value="all">'+T('جميع الدول','All countries')+'</option>'+countries.map(v=>'<option value="'+x(v)+'" '+(filter.country===v?'selected':'')+'>'+x(v)+'</option>').join('')+'</select>'+
 '<select data-rfq-filter="source"><option value="all">'+T('كل المصادر','All sources')+'</option><option value="website">'+T('الموقع','Website')+'</option><option value="admin">'+T('الإدارة','Admin')+'</option></select>'+
 '<select data-rfq-filter="date"><option value="all">'+T('كل التواريخ','All dates')+'</option><option value="today">'+T('اليوم','Today')+'</option><option value="week">'+T('آخر 7 أيام','Last 7 days')+'</option><option value="month">'+T('آخر 30 يوم','Last 30 days')+'</option></select></div><div data-rfq-results>'+(panel==='customers'?customersHTML():tableHTML())+'</div></section>';
 for(const [key,value] of Object.entries(filter)){const sel=host.querySelector('[data-rfq-filter="'+key+'"]');if(sel)sel.value=value;}
 host.querySelectorAll('[data-rfq-filter]').forEach(sel=>sel.addEventListener(sel.tagName==='INPUT'?'input':'change',()=>{
  filter[sel.dataset.rfqFilter]=sel.value;
  host.querySelector('[data-rfq-results]').innerHTML=panel==='customers'?customersHTML():tableHTML();
 }));
 host.onclick=e=>{
  const newBtn=e.target.closest('[data-rfq-new]'),view=e.target.closest('[data-rfq-view]'),edit=e.target.closest('[data-rfq-edit]'),tab=e.target.closest('[data-rfq-panel]'),client=e.target.closest('[data-rfq-client-view]'),customerCreate=e.target.closest('[data-rfq-client-new]');
  if(tab){panel=tab.dataset.rfqPanel;renderList();return;}
  if(client){showCustomer(contacts.find(c=>c.id===client.dataset.rfqClientView));return;}
  if(customerCreate){showEditor(null,null,contacts.find(c=>c.id===customerCreate.dataset.rfqClientNew));return;}
  if(newBtn)showEditor();
  else if(view)showDetails(records.find(r=>r.id===view.dataset.rfqView));
  else if(edit)showEditor(records.find(r=>r.id===edit.dataset.rfqEdit));
 };
}
let dialog=null;
function modal(title,html){
 if(dialog)dialog.remove();
 dialog=document.createElement('div');dialog.className='imsg-rfq-dialog-backdrop';
 dialog.innerHTML='<section class="imsg-rfq-dialog" role="dialog" aria-modal="true" aria-label="'+x(title)+'"><div class="imsg-rfq-dialog-head"><h2>'+x(title)+'</h2><button data-rfq-close aria-label="'+T('إغلاق','Close')+'">×</button></div><div data-rfq-dialog-body>'+html+'</div></section>';
 document.body.append(dialog);dialog.querySelector('[data-rfq-close]').onclick=()=>{dialog.remove();dialog=null;};
}
function showDetails(row){
 if(!row)return;
 const c=row.customer||{}, audit=row.audit||[];
 modal(row.number,'<div class="imsg-rfq-details"><p><b>'+x(c.name)+'</b> · <span dir="ltr">'+x(c.whatsapp)+'</span> · '+x(c.country)+'</p><p>'+T('الشركة','Company')+': '+x(c.company||'—')+' · '+T('الحالة','Status')+': '+x(statusLabel(row.status))+'</p><p>'+T('الملاحظات','Notes')+': '+x(row.notes||'—')+'</p><div class="imsg-rfq-items">'+row.items.map(item=>'<div><span>'+x(nameOf(item.snapshot))+' ('+x(item.snapshot?.sku||'')+')</span><b>× '+Number(item.quantity)+'</b></div>').join('')+'</div><div class="imsg-rfq-dialog-actions"><button type="button" data-rfq-details-edit>'+T('تعديل الطلب','Edit request')+'</button><button type="button" data-rfq-details-copy>'+T('نسخ الطلب','Duplicate')+'</button><a href="'+x(actionLink(row))+'" target="_blank" rel="noopener noreferrer">'+T('تواصل عبر واتساب','Contact on WhatsApp')+'</a></div><h3>'+T('سجل التعديلات','Change history')+'</h3><div class="imsg-rfq-audit">'+audit.map(e=>'<p><small>'+x(fmtDate(e.at))+' · '+x(e.actorId||T('الموقع','Website'))+'</small><br>'+x(e.action==='created'?T('تم إنشاء الطلب','Created'):T('تم تعديل الطلب','Updated'))+' · '+x(JSON.stringify(e.before?.items||[]))+' → '+x(JSON.stringify(e.after?.items||[]))+'</p>').join('')+'</div></div>');
 dialog.querySelector('[data-rfq-details-edit]').onclick=()=>showEditor(row);
 dialog.querySelector('[data-rfq-details-copy]').onclick=()=>showEditor(null,row);
}
function itemView(item,index){
 const offer=listProducts().find(p=>p.id===item.offerId)||item.snapshot||{};
 const moq=Math.max(1,Math.ceil(Number(offer.moq)||1));
 return '<div class="imsg-rfq-editor-item"><div><strong>'+x(nameOf(offer))+'</strong><small>'+x(offer.sku||'')+'</small></div><input type="number" data-rfq-item-qty="'+index+'" min="'+moq+'" step="1" value="'+item.quantity+'" aria-label="'+T('الكمية','Quantity')+'"><button type="button" data-rfq-item-remove="'+index+'">'+T('حذف','Remove')+'</button></div>';
}
function showEditor(original=null,duplicate=null,customerPrefill=null){
 const base=original||duplicate||{},rowCustomer=customerPrefill||base.customer||{},selected=base.items?.map(item=>({offerId:item.offerId,quantity:item.quantity,snapshot:item.snapshot}))||[],itemMap=new Map(selected.map(item=>[item.offerId,item]));
 const edit=!!original,copy=!!duplicate;
 modal(edit?T('تعديل الطلب','Edit request'):copy?T('نسخ الطلب','Duplicate request'):T('إنشاء طلب جديد','Create request'),'<form id="imsg-rfq-editor" class="imsg-rfq-editor">'+
 '<label>'+T('بحث عن عميل موجود','Find customer')+'<input type="search" data-rfq-customer-search placeholder="'+T('الاسم أو رقم واتساب','Name or WhatsApp')+'"></label><div class="imsg-rfq-pick-list" data-rfq-customer-results></div>'+
 '<div class="imsg-rfq-contact-grid">'+
 '<label>'+T('الاسم','Name')+' *<input name="name" maxlength="140" minlength="2" value="'+x(rowCustomer.name||'')+'" required></label>'+
 '<label>'+T('واتساب دولي (+966...)','International WhatsApp')+' *<input name="whatsapp" type="tel" inputmode="tel" dir="ltr" value="'+x(rowCustomer.whatsapp||'')+'" required></label>'+
 '<label>'+T('الدولة','Country')+' *<input name="country" maxlength="120" value="'+x(rowCustomer.country||'')+'" required></label>'+
 '<label>'+T('الشركة أو المتجر','Company or store')+'<input name="company" maxlength="200" value="'+x(rowCustomer.company||'')+'"></label></div>'+
 '<label>'+T('بحث عن المنتجات','Find products')+'<input type="search" data-rfq-product-search placeholder="'+T('الاسم أو الموديل أو SKU أو التصنيف','Name, model, SKU or category')+'"></label><div class="imsg-rfq-pick-list" data-rfq-product-results></div>'+
 '<div class="imsg-rfq-editor-items" data-rfq-selected-items></div>'+
 '<label>'+T('حالة الطلب','Status')+'<select name="status">'+statuses.map(s=>'<option value="'+s[0]+'" '+(base.status===s[0]?'selected':'')+'>'+T(s[1],s[2])+'</option>').join('')+'</select></label>'+
 '<label>'+T('ملاحظات العميل','Customer notes')+'<textarea name="notes" maxlength="2000">'+x(base.notes||'')+'</textarea></label>'+
 '<label>'+T('ملاحظات الإدارة','Internal notes')+'<textarea name="internalNotes" maxlength="4000">'+x(base.internalNotes||'')+'</textarea></label>'+
 '<p data-rfq-editor-error role="status" class="imsg-rfq-error"></p><button type="submit" class="primary-btn">'+T('حفظ الطلب','Save request')+'</button></form>');
 const form=dialog.querySelector('#imsg-rfq-editor'),selectedNode=form.querySelector('[data-rfq-selected-items]');
 const repaint=()=>{selectedNode.innerHTML=[...itemMap.values()].map(itemView).join('')||'<p>'+T('أضف منتجًا واحدًا على الأقل','Add at least one product')+'</p>';};
 repaint();
 selectedNode.onchange=e=>{const input=e.target.closest('[data-rfq-item-qty]');if(input){const item=[...itemMap.values()][Number(input.dataset.rfqItemQty)];if(item)item.quantity=Number(input.value);}};
 selectedNode.onclick=e=>{const btn=e.target.closest('[data-rfq-item-remove]');if(btn){const item=[...itemMap.values()][Number(btn.dataset.rfqItemRemove)];if(item)itemMap.delete(item.offerId);repaint();}};
 const psearch=form.querySelector('[data-rfq-product-search]'),presults=form.querySelector('[data-rfq-product-results]');
 psearch.oninput=()=>{const q=normalized(psearch.value);presults.innerHTML=q.length<1?'':listProducts().filter(p=>normalized([nameOf(p),p.sku,p.categoryId,p.subcategoryId].join(' ')).includes(q)).slice(0,30).map(p=>'<button type="button" data-rfq-add-product="'+x(p.id)+'"><span>'+x(nameOf(p))+'</span><small>'+x(p.sku||'')+'</small></button>').join('');};
 presults.onclick=e=>{const btn=e.target.closest('[data-rfq-add-product]');if(!btn)return;const p=listProducts().find(v=>v.id===btn.dataset.rfqAddProduct);if(!p)return;if(!itemMap.has(p.id))itemMap.set(p.id,{offerId:p.id,quantity:Math.max(1,Math.ceil(Number(p.moq)||1)),snapshot:p});repaint();psearch.value='';presults.innerHTML='';};
 const csearch=form.querySelector('[data-rfq-customer-search]'),cresults=form.querySelector('[data-rfq-customer-results]');
 csearch.oninput=()=>{const q=normalized(csearch.value);cresults.innerHTML=q.length<1?'':contacts.filter(c=>normalized(c.name+' '+c.whatsapp+' '+c.company).includes(q)).slice(0,20).map(c=>'<button type="button" data-rfq-pick-customer="'+x(c.id)+'">'+x(c.name)+' · <small dir="ltr">'+x(c.whatsapp)+'</small></button>').join('');};
 cresults.onclick=e=>{const btn=e.target.closest('[data-rfq-pick-customer]');if(!btn)return;const c=contacts.find(v=>v.id===btn.dataset.rfqPickCustomer);if(!c)return;for(const k of ['name','whatsapp','country','company'])form.elements[k].value=c[k]||'';csearch.value='';cresults.innerHTML='';};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const values=[...itemMap.values()],error=form.querySelector('[data-rfq-editor-error]'),submit=form.querySelector('[type="submit"]');
  if(!values.length){error.textContent=T('أضف منتجًا واحدًا على الأقل','Add a product');return;}
  if(values.some(v=>!Number.isSafeInteger(v.quantity)||v.quantity<Math.max(1,Math.ceil(Number((listProducts().find(p=>p.id===v.offerId)||v.snapshot)?.moq)||1)))){error.textContent=T('تحقق من الكميات والحد الأدنى','Check quantities and MOQ');return;}
  const f=new FormData(form),payload={
   source:'admin',customer:{name:f.get('name'),whatsapp:f.get('whatsapp'),country:f.get('country'),company:f.get('company')},
   status:f.get('status'),notes:f.get('notes'),internalNotes:f.get('internalNotes'),
   items:values.map(v=>({offerId:v.offerId,quantity:v.quantity}))
  };
  if(edit){payload.requestId=original.id;payload.expectedVersion=original.version;}
  busy=true;submit.disabled=true;error.textContent=T('جارٍ الحفظ...','Saving...');
  try{
   const result=await api('/api/v1/rfq',{method:'POST',body:payload});
   if(!result?.number)throw new Error('Invalid response');
   await loadRecords();dialog?.remove();dialog=null;
  }catch(err){error.textContent=err?.message||T('تعذر الحفظ','Could not save');submit.disabled=false;}finally{busy=false;}
 };
}
async function loadRecords(){
 const result=await api('/api/v1/rfq');
 records=Array.isArray(result.requests)?result.requests:[];
 contacts=Array.isArray(result.customers)?result.customers:[];
 if(current?.host?.isConnected)renderList();
}
export function mountRfqAdmin({host,request,offers=[]}){
 if(!host)return;
 panel='requests';current={host,request,offers};
 host.innerHTML='<div class="imsg-rfq-admin"><h1>'+T('طلبات عروض الأسعار','Quote requests')+'</h1><p>'+T('جارٍ تحميل الطلبات...','Loading requests...')+'</p></div>';
 void loadRecords().catch(error=>{if(current?.host===host)host.innerHTML='<div class="imsg-rfq-admin"><h1>'+T('طلبات عروض الأسعار','Quote requests')+'</h1><p role="alert">'+x(error.message||T('تعذر تحميل الطلبات','Could not load requests'))+'</p><button type="button" data-rfq-retry>'+T('إعادة المحاولة','Retry')+'</button></div>';host.querySelector('[data-rfq-retry]')?.addEventListener('click',()=>mountRfqAdmin({host,request,offers}));});
}
