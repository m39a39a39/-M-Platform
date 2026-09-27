'use strict';
const supplySelection=new Set();
let supplyQuery='',supplyStatus='all',supplyPage=0,supplyBusy=false;
const supplyPageSize=50;
const supplyProduct=s=>(liveState.publicOffers||[]).find(p=>p.id===s.productId)||s.proposal||{};
const supplySupplier=s=>{const a=(liveState.accounts||[]).find(a=>a.id===s.supplierId);return a?.company||a?.name||s.supplierId;};
function filteredSupplySources(){return (liveState.supplySources||[]).filter(s=>(supplyStatus==='all'||s.status===supplyStatus)&&[supplyProduct(s).product,supplyProduct(s).translation?.titleAr,supplyProduct(s).sku,supplySupplier(s)].join(' ').toLowerCase().includes(supplyQuery.toLowerCase()));}
function supplyBulkView(){
 const all=liveState.supplySources||[];for(const id of supplySelection)if(!all.some(s=>s.id===id))supplySelection.delete(id);
 const rows=filteredSupplySources();supplyPage=Math.min(supplyPage,Math.max(0,Math.ceil(rows.length/supplyPageSize)-1));
 const page=rows.slice(supplyPage*supplyPageSize,(supplyPage+1)*supplyPageSize),count=supplySelection.size,edit=permitted('offers.edit'),remove=edit&&permitted('trash');
 return heading('عروض ومصادر التوريد','حدد العروض لتحرير بياناتها في جدول أو حذف العروض غير المرغوبة.',btn('تحديث','reload-orders'))+`<section class="panel"><div class="toolbar"><input id="supply-search" type="search" value="${esc(supplyQuery)}" placeholder="ابحث بالمنتج أو الرمز أو المورد" aria-label="بحث عروض التوريد"><select id="supply-status" aria-label="حالة عرض التوريد">${[['all','كل الحالات'],['pending','بانتظار المراجعة'],['approved','معتمد'],['rejected','مرفوض']].map(([v,n])=>`<option value="${v}" ${v===supplyStatus?'selected':''}>${n}</option>`).join('')}</select></div><div class="toolbar"><strong id="supply-selected-count" aria-live="polite">المحدد: ${count}</strong>${btn('تحديد كل النتائج ('+rows.length+')','supply-select-filtered')}${btn('إلغاء التحديد','supply-clear')}${edit?btn('تعديل جماعي','supply-edit','edit','primary',count?'':'disabled'):''}${remove?btn('حذف المحدد','supply-delete','trash','danger',count?'':'disabled'):''}</div><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="supply-select-page" aria-label="تحديد هذه الصفحة" ${page.length&&page.every(s=>supplySelection.has(s.id))?'checked':''}></th><th>المنتج</th><th>المورد</th><th>سعر التوريد</th><th>الحد الأدنى / المخزون</th><th>التجهيز / الدولة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${page.map(s=>{const p=supplyProduct(s);return `<tr><td><input type="checkbox" data-supply-select="${esc(s.id)}" aria-label="تحديد ${esc(p.product||s.id)}" ${supplySelection.has(s.id)?'checked':''}></td><td>${esc(p.translation?.titleAr||p.product||s.productId)}<small style="display:block">${esc(p.sku||'')}</small></td><td>${esc(supplySupplier(s))}</td><td>${fmt(s.terms.unitPrice)} ${esc(s.terms.currency)}</td><td>${esc(s.terms.moq)} / ${esc(s.terms.stock)}</td><td>${esc(s.terms.leadTime)} يوم · ${esc(s.terms.country)}</td><td>${esc(({pending:'بانتظار المراجعة',approved:'معتمد',rejected:'مرفوض'})[s.status]||s.status)}</td><td>${s.status==='pending'&&permitted('publish')&&edit?btn('مراجعة','review-source','check','',`data-id="${esc(s.id)}"`):''}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">لا توجد عروض مطابقة</td></tr>'}</tbody></table></div><div class="toolbar">${btn('السابق','supply-prev','','',supplyPage?'':'disabled')}<span>صفحة ${supplyPage+1} من ${Math.max(1,Math.ceil(rows.length/supplyPageSize))} · ${rows.length} عرض</span>${btn('التالي','supply-next','','',(supplyPage+1)*supplyPageSize<rows.length?'':'disabled')}</div></section>`;
}
function refreshSupplyChecks(){
 const boxes=$$('[data-supply-select]'),all=$('#supply-select-page');if(all){all.checked=!!boxes.length&&boxes.every(b=>b.checked);all.indeterminate=boxes.some(b=>b.checked)&&!all.checked;}
 const count=$('#supply-selected-count');if(count)count.textContent='المحدد: '+supplySelection.size;
 $$('[data-action="supply-edit"],[data-action="supply-delete"]').forEach(b=>b.disabled=!supplySelection.size);
}
function supplyEditDialog(){
 const rows=(liveState.supplySources||[]).filter(s=>supplySelection.has(s.id));if(!rows.length)return;
 const input=(s,k,v,type='text')=>`<input aria-label="${esc(k)}" name="${esc(s.id)}:${k}" value="${esc(v??'')}" type="${type}" ${type==='number'?`required min="${k==='stock'?0:1}" step="1"`:''}>`;
 const body=`<p class="tip">تُحفظ التعديلات مباشرة، وتعود العروض المعدلة إلى «بانتظار المراجعة». لا تتغير أسعار البيع أو الطلبات السابقة.</p><div class="table-wrap"><table class="supply-edit-table"><thead><tr>${['المنتج / المورد','الاسم المقترح','الوصف','رمز المنتج','سعر التوريد','العملة','الحد الأدنى','المخزون','مدة التجهيز (يوم)','دولة التوريد'].map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(supplyProduct(s).product)}<small style="display:block">${esc(supplySupplier(s))}</small></td><td>${!s.productId?input(s,'product',s.proposal?.product):'منتج مرتبط بالكتالوج'}</td><td>${!s.productId?`<textarea aria-label="الوصف" name="${esc(s.id)}:specs">${esc(s.proposal?.specs||'')}</textarea>`:'—'}</td><td>${!s.productId?input(s,'sku',s.proposal?.sku):esc(supplyProduct(s).sku||'')}</td><td><input aria-label="سعر التوريد" name="${esc(s.id)}:unitPrice" type="number" min="0.01" step="0.01" required value="${esc(s.terms.unitPrice)}"></td><td><select aria-label="العملة" name="${esc(s.id)}:currency">${['SAR','USD','CNY','AED','EUR'].map(c=>`<option ${c===s.terms.currency?'selected':''}>${c}</option>`).join('')}</select></td>${['moq','stock','leadTime'].map(k=>'<td>'+input(s,k,s.terms[k],'number')+'</td>').join('')}<td>${input(s,'country',s.terms.country)}</td></tr>`).join('')}</tbody></table></div><p data-supply-progress role="status"></p>`;
 formModal('تعديل '+rows.length+' عرض توريد',body,async fd=>{
  const items=rows.map(s=>{const patch={},terms={},proposal={};for(const k of ['unitPrice','currency','moq','stock','leadTime','country']){const raw=fd.get(s.id+':'+k),value=['currency','country'].includes(k)?String(raw).trim():Number(raw);if(String(value)!==String(s.terms[k]))terms[k]=value;}
   if(!s.productId)for(const k of ['product','specs','sku']){const value=String(fd.get(s.id+':'+k)).trim();if(value!==String(s.proposal?.[k]||''))proposal[k]=value;}
   if(Object.keys(terms).length)patch.terms=terms;if(Object.keys(proposal).length)patch.proposal=proposal;return {id:s.id,version:s.version,patch};}).filter(i=>Object.keys(i.patch).length);
  if(!items.length)throw Error('لا توجد تغييرات');
  await runSupplyBatches(items);
 },'حفظ التعديلات');$('#dialog')?.classList.add('supply-bulk-dialog');
}
async function runSupplyBatches(items){
 if(supplyBusy)return;supplyBusy=true;let completed=0;
 const form=$('#dialog form'),buttons=form?[...form.querySelectorAll('button')]:[];buttons.forEach(b=>b.disabled=true);
 try{
  for(let i=0;i<items.length;i+=20){const batch=items.slice(i,i+20);await api('supply-sources/bulk',{items:batch});completed+=batch.length;for(const item of batch)supplySelection.delete(item.id);const p=$('[data-supply-progress]');if(p)p.textContent=`حُفظ ${completed} من ${items.length}`;}
  closeModal();liveState=await window.MStudioSession.state();render();toast('تم حفظ '+completed+' عرض توريد');
 }catch(error){
  // Never retry a possibly committed write with stale versions or silently claim success.
  closeModal();try{liveState=await window.MStudioSession.state();render();}catch{}
  modal('توقفت العملية',`<div class="dialog-body"><p>تم تأكيد حفظ ${completed} من ${items.length} عرض. حدّث القائمة وراجع العناصر المتبقية قبل إعادة المحاولة.</p><p>${esc(error.message)}</p></div>`);
 }finally{supplyBusy=false;buttons.forEach(b=>b.disabled=false);}
}
document.addEventListener('input',e=>{if(e.target.id==='supply-search'){supplyQuery=e.target.value;supplyPage=0;supplySelection.clear();render();$('#supply-search')?.focus();}});
document.addEventListener('change',e=>{
 if(e.target.id==='supply-status'){supplyStatus=e.target.value;supplyPage=0;supplySelection.clear();render();}
 if(e.target.matches('[data-supply-select]')){if(e.target.checked)supplySelection.add(e.target.dataset.supplySelect);else supplySelection.delete(e.target.dataset.supplySelect);refreshSupplyChecks();}
 if(e.target.id==='supply-select-page'){for(const box of $$('[data-supply-select]')){box.checked=e.target.checked;if(box.checked)supplySelection.add(box.dataset.supplySelect);else supplySelection.delete(box.dataset.supplySelect);}refreshSupplyChecks();}
});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled||supplyBusy)return;const a=b.dataset.action;
 if(a==='supply-select-filtered'){filteredSupplySources().forEach(s=>supplySelection.add(s.id));render();refreshSupplyChecks();}
 if(a==='supply-clear'){supplySelection.clear();render();}
 if(a==='supply-prev'){supplyPage--;render();refreshSupplyChecks();}
 if(a==='supply-next'){supplyPage++;render();refreshSupplyChecks();}
 if(a==='supply-edit'&&permitted('offers.edit'))supplyEditDialog();
 if(a==='supply-delete'&&permitted('trash')&&permitted('offers.edit')){
  const rows=(liveState.supplySources||[]).filter(s=>supplySelection.has(s.id));if(!rows.length)return;
  formModal('حذف '+rows.length+' عرض توريد',`<p>ستُزال العروض المحددة من القائمة ومن خيارات التوريد الجديدة. تبقى منتجات المتجر والطلبات السابقة محفوظة.</p><details><summary>عرض العناصر المحددة (${rows.length})</summary><ul>${rows.map(s=>`<li>${esc(supplyProduct(s).product)} — ${esc(supplySupplier(s))}</li>`).join('')}</ul></details><label><input type="checkbox" required> أؤكد حذف هذه العروض</label><p data-supply-progress role="status"></p>`,()=>runSupplyBatches(rows.map(s=>({id:s.id,version:s.version,delete:true}))),'تأكيد حذف المحدد');
 }
});
