/* Shared interface helpers. All operations are authorized by the API. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {
    active:['نشط','Active'], blocked:['محظور','Blocked'], deleted:['محذوف','Deleted'], suspended:['معلق','Suspended'],
    review:['قيد المراجعة','Under review'], pending:['بانتظار المراجعة','Pending review'],
    sent:['أُرسل للموردين','Sent to suppliers'], published:['منشور','Published'],
    coordinating:['جاري التنسيق','Coordinating'], accepted:['تم القبول','Accepted'],
    completed:['مكتمل','Completed'], cancelled:['ملغي','Cancelled'], selected:['اختار العميل عرضًا','Customer selected a quote']
  };
  const status = value => M.tr(...(labels[value] || ['غير محدد','Not specified']));
  const badge = value => `<span class="status ${['published','sent','completed','accepted'].includes(value)?'status-success':'status-warning'}">${status(value)}</span>`;
  const date = value => value ? new Date(value).toLocaleString(M.language()==='ar'?'ar':'en') : M.tr('غير مسجل سابقًا','Not recorded previously');
  const copy = (item, field) => {
    const t = item.translation || {}, lang = M.language();
    return t[field + (lang === 'ar'?'Ar':'En')] || (field === 'description' ? t[lang] : '') || (field === 'title' ? `#${item.id}` : M.tr('بانتظار الترجمة','Awaiting translation'));
  };
  function nav(items, active, callback) {
    const target = document.querySelector('.side-nav');
    target.innerHTML = items.map(([key,ar,en]) => `<button type="button" class="nav-btn ${key===active?'active':''}" data-view="${key}">${M.tr(ar,en)}</button>`).join('');
    target.querySelectorAll('[data-view]').forEach(b => b.onclick = () => callback(b.dataset.view));
  }
  function gallery(images = []) {
    const valid = images.filter(src => /^\/api\/media\/[a-f0-9-]{36}$/.test(src) || /^data:image\/(jpeg|png|webp);base64,/.test(src));
    return valid.length ? `<div class="detail-gallery">${valid.map((src,i) => `<button type="button" class="gallery-open" data-image="${escape(src)}"><img src="${escape(src)}" alt="${M.tr('صورة','Image')} ${i+1}"></button>`).join('')}</div>` : `<p>${M.tr('لا توجد صور مرفقة','No images attached')}</p>`;
  }
  function modal(title, content) {
    document.getElementById('workflowDialog')?.remove();
    const bg = document.createElement('div'); bg.id='workflowDialog'; bg.className='dialog-backdrop';
    bg.innerHTML = `<section class="dialog large" role="dialog" aria-modal="true" aria-labelledby="workflowTitle"><header class="dialog-head"><h2 id="workflowTitle">${escape(title)}</h2><button type="button" class="dialog-close" aria-label="Close">×</button></header><div class="dialog-body">${content}</div></section>`;
    const previous = document.activeElement;
    const close = () => { bg.remove(); previous?.focus(); };
    bg.querySelector('.dialog-close').onclick=close;
    bg.onclick=e=>{if(e.target===bg)close();};
    bg.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const focus=[...bg.querySelectorAll('button,input,select,textarea,a[href]')];const first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    document.body.append(bg); bg.querySelector('.dialog-close').focus();
  }
  function history(item) { return `<ul class="history-list">${(item.history || []).map(h=>`<li>${escape(date(h.at))} — ${escape(status(h.status))}</li>`).join('') || `<li>${M.tr('لا يوجد سجل قديم؛ ستُسجّل التحديثات التالية.','No earlier history; future updates will be recorded.')}</li>`}</ul>`; }
  const empty = () => `<div class="empty-state">${M.tr('لا توجد نتائج في هذه القائمة','No results in this list')}</div>`;
  function available(offer) { return R.offerOpen(offer) && offer.status==='published' && (!offer.validUntil || offer.validUntil >= new Date().toISOString().slice(0,10)); }
  async function interest(offerId, user) {
    if(user?.role!=='client'||!R.userActive())return false;
    const s=M.state(), offer=s.publicOffers.find(x=>x.id===offerId);
    if(!offer || !available(offer))return false;
    if(!s.interests.some(x=>x.offerId===offerId&&x.customerId===user.id))s.interests.push({id:M.id('I'),offerId,customerId:user.id,status:'pending',createdAt:new Date().toISOString()});
    await M.save(s);return true;
  }
  function offerCard(offer,user) {
    const asked=M.state().interests.some(x=>x.customerId===user?.id&&x.offerId===offer.id);
    return `<article class="market-offer-card">${gallery(offer.images)}<div class="market-offer-body"><span class="offer-code">#${escape(offer.id)}</span><h3>${escape(copy(offer,'title'))}</h3><p class="preserve-lines">${escape(copy(offer,'description'))}</p><div class="offer-price">${escape(offer.currency)} ${escape(offer.unitPrice)}</div><div class="offer-facts"><div>MOQ: ${escape(offer.moq)}</div><div>${M.tr('المتوفر','Available')}: ${escape(offer.stock || '—')}</div><div>${M.tr('مدة الإنتاج بالأيام','Production days')}: ${escape(offer.leadTime)}</div><div>${M.tr('ينتهي في','Valid until')}: ${escape(offer.validUntil || M.tr('غير محدد','Not specified'))}</div></div><button type="button" class="btn btn-primary request-market" data-id="${escape(offer.id)}" ${asked?'disabled':''}>${asked?M.tr('تم إرسال الطلب للإدارة','Sent to admin'):M.tr('طلب هذا العرض','Request this offer')}</button></div></article>`;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('.gallery-open');if(!b)return;
    const images=[...b.parentElement.querySelectorAll('.gallery-open')].map(x=>x.dataset.image);let index=images.indexOf(b.dataset.image);
    const overlay=document.createElement('div');overlay.className='image-lightbox';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.innerHTML='<button type="button" class="close-image" aria-label="Close">×</button><button type="button" class="prev-image" aria-label="Previous">‹</button><img alt="Product"><button type="button" class="next-image" aria-label="Next">›</button><span></span>';
    const show=()=>{overlay.querySelector('img').src=images[index];overlay.querySelector('span').textContent=`${index+1} / ${images.length}`;};
    const close=()=>{overlay.remove();b.focus();};overlay.querySelector('.close-image').onclick=close;
    overlay.querySelector('.prev-image').onclick=()=>{index=(index+images.length-1)%images.length;show();};overlay.querySelector('.next-image').onclick=()=>{index=(index+1)%images.length;show();};
    overlay.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();close();}if(event.key==='ArrowRight')overlay.querySelector('.next-image').click();if(event.key==='ArrowLeft')overlay.querySelector('.prev-image').click();};
    document.body.append(overlay);show();overlay.querySelector('.close-image').focus();
  });
  window.W={escape,status,badge,date,copy,nav,gallery,modal,history,empty,available,interest,offerCard};
})();
