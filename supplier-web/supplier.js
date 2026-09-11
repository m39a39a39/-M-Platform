document.addEventListener('m:ready', async () => {
  const user = M.requireRole('supplier');
  if (!user) return;
  M.fillUser(user, 'مورد', 'Supplier');

  const search=Search.create(document.querySelector('main'),()=>render());
  let activeRequest = null;
  let quoteImages = [];
  let publicImages = [];
  M.setupImages('quoteImages', 'quotePreview', value => { quoteImages = [...value]; });
  M.setupImages('publicImages', 'publicPreview', value => { publicImages = [...value]; });

  function translatedRequest(request) {
    const t = request.translation || {};
    return {
      title: W.copy(request,'title'),
      description: W.copy(request,'description')
    };
  }


  let view='invites';
  const views=[['invites','الدعوات','Invitations'],['submitted','عروض الأسعار','Quotations'],['public','عروضي العامة','My public offers'],['interests','طلبات الاهتمام','Customer interest']];
  const restriction=document.createElement('p');restriction.className='account-restriction hidden';document.querySelector('main').prepend(restriction);
  const archive=document.createElement('section'); archive.className='card';archive.id='supplierArchive';
  document.querySelector('main').append(archive);
  const allowed=r=>R.requestOpen(r)&&R.userActive()&&r.status==='sent' && (r.supplierIds || []).includes(user.id);
  function go(key){search.setStatus(key==='pending'?'review':'');view=key==='pending'?'submitted':key;render();}
  function matchOffer(o){const s=M.state(),r=s.requests.find(r=>r.id===o.requestId),a=s.accounts.find(a=>a.id===user.id);return search.match({...o,country:o.country||r?.country||a?.country},[o.id,o.requestId,o.product,o.notes,o.specs,r?W.copy(r,'title'):'']);}
  function render() {
    const s=M.state(),invites=s.requests.filter(allowed),quotes=s.quotes.filter(q=>q.supplierId===user.id&&R.offerVisible(q,s)),pub=s.publicOffers.filter(o=>o.supplierId===user.id&&R.offerVisible(o,s)),E=W.escape;
    restriction.classList.toggle('hidden',R.userActive());restriction.textContent=M.tr('الحساب موقوف؛ لا يمكنك تقديم عروض جديدة.','Account disabled; new submissions are unavailable.');
    W.nav(views,view,go);
    document.getElementById('inviteCount').textContent=invites.length;
    document.getElementById('quoteCount').textContent=quotes.length;
    document.getElementById('publicCount').textContent=pub.length;
    document.getElementById('pendingCount').textContent=[...quotes,...pub].filter(x=>x.status==='pending').length;
    document.getElementById('invites').classList.toggle('hidden',view!=='invites');
    document.getElementById('public').classList.toggle('hidden',view!=='public');
    archive.classList.toggle('hidden',['invites','public'].includes(view));
    document.getElementById('inviteList').innerHTML=invites.filter(r=>search.match(r,[r.id,W.copy(r,'title'),W.copy(r,'description')])).map(r=>{
      const copy=translatedRequest(r);
      return '<article class="invite-card"><span>#'+E(r.id)+'</span><h3>'+E(copy.title)+'</h3>'+W.gallery(r.images)+'<p class="preserve-lines">'+E(copy.description)+'</p><div class="meta-list"><span>'+M.tr('الكمية','Quantity')+': '+E(r.quantity)+'</span><span>'+E(r.country)+'</span></div><div class="invite-actions"><button class="btn btn-outline view-request" data-id="'+E(r.id)+'">'+M.tr('التفاصيل والصور','Details & images')+'</button><button class="btn btn-primary open-quote" data-id="'+E(r.id)+'">'+M.tr('تقديم عرض','Submit quote')+'</button></div></article>';
    }).join('')||W.empty();
    const offerRow=o=>'<article class="invite-card"><span>#'+E(o.id)+'</span><h3>'+E(o.product||o.requestId)+'</h3>'+W.badge(o.status)+'<p>'+E(o.currency)+' '+E(o.unitPrice)+' · MOQ '+E(o.moq)+'</p><p>'+E(W.date(o.createdAt))+'</p><p>'+M.tr('الإنتاج بالأيام / تكلفة العينة','Production days / sample cost')+': '+E(o.leadTime||'—')+' / '+E(o.sampleCost||'—')+'</p>'+W.gallery(o.images)+'<p class="preserve-lines">'+E(o.specs||o.notes||'')+'</p>'+W.history(o)+'</article>';
    document.getElementById('supplierOffers').innerHTML=pub.filter(matchOffer).map(offerRow).join('')||W.empty();
    let items=view==='pending'?[...quotes,...pub].filter(q=>q.status==='pending'):view==='published'?quotes.filter(q=>q.status==='published'):quotes;
    let content=items.filter(matchOffer).map(offerRow).join('')||W.empty();
    if(view==='interests')content=pub.filter(matchOffer).map(o=>{
      const count=s.interests.filter(i=>i.offerId===o.id).length;
      return '<article class="invite-card"><h3>'+E(o.product)+'</h3><p>#'+E(o.id)+' — '+M.tr('طلبات الاهتمام','Interest requests')+': '+count+'</p></article>';
    }).join('')||W.empty();
    const title=views.find(v=>v[0]===view);
    archive.innerHTML='<div class="card-head"><h2>'+M.tr(title[1],title[2])+'</h2></div><div class="card-body">'+content+'</div>';
  }
  document.querySelectorAll('.stat-card').forEach((card,i)=>{const key=['invites','submitted','public','pending'][i];card.tabIndex=0;card.setAttribute('role','button');card.onclick=()=>go(key);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(key);}};});

  function showDetails(id) {
    const request = M.state().requests.find(item => item.id === id && allowed(item));
    if (!request) return;
    activeRequest = request.id;
    const copy = translatedRequest(request);
    document.getElementById('detailProduct').textContent = copy.title;
    document.getElementById('detailRequestId').textContent = `#${request.id}`;
    document.getElementById('detailQuantity').textContent = request.quantity || '—';
    document.getElementById('detailCountry').textContent = request.country || '—';
    document.getElementById('detailDate').textContent = request.neededDate || M.tr('غير محدد','Not specified');
    document.getElementById('detailDescription').textContent = copy.description || '—';
    document.getElementById('detailGallery').innerHTML = W.gallery(request.images);
    M.openDialog('requestDetailsDialog');
  }

  function openQuote(id) {
    const request = M.state().requests.find(item => item.id === id && allowed(item));
    if (!request) return;
    activeRequest = id;
    document.getElementById('quoteRequest').textContent = `#${id} — ${translatedRequest(request).title}`;
    M.closeDialog('requestDetailsDialog');
    M.openDialog('quoteDialog');
  }

  document.addEventListener('click', async event => {
    const detailsButton = event.target.closest('.view-request');
    if (detailsButton) { showDetails(detailsButton.dataset.id); return; }
    const quoteButton = event.target.closest('.open-quote');
    if (quoteButton) openQuote(quoteButton.dataset.id);
  });
  document.getElementById('detailQuoteButton').addEventListener('click', async () => openQuote(activeRequest));

  document.getElementById('quoteForm').addEventListener('submit', async event => {
    event.preventDefault();
    if(!R.guard())return;
    const notes = document.getElementById('quoteNotes').value.trim();
    const error = document.getElementById('quoteError');
    if (M.containsContact(notes)) { error.textContent = M.tr('احذف بيانات التواصل.','Remove contact details.'); return; }
    const state = M.state();
    if (!state.requests.some(r=>r.id===activeRequest&&allowed(r))) return;
    state.quotes.push({ id:M.id('Q'), requestId:activeRequest, supplierId:user.id, supplierName:user.company || user.name, unitPrice:document.getElementById('quotePrice').value, currency:document.getElementById('quoteCurrency').value, moq:document.getElementById('quoteMoq').value, leadTime:document.getElementById('quoteLead').value, sampleCost:document.getElementById('quoteSample').value, notes, images:quoteImages, status:'pending' });
    await M.save(state); M.closeDialog('quoteDialog'); go('pending');
    M.toast('تم إرسال العرض','Quote submitted','بانتظار مراجعة الإدارة.','Waiting for admin review.');
  });

  document.getElementById('publicOfferForm').addEventListener('submit', async event => {
    event.preventDefault();
    if(!R.guard())return;
    const product = document.getElementById('publicProduct').value.trim();
    const specs = document.getElementById('publicSpecs').value.trim();
    const error = document.getElementById('publicError');
    if (M.containsContact(`${product} ${specs}`)) { error.textContent = M.tr('احذف بيانات التواصل.','Remove contact details.'); return; }
    if (!publicImages.length) { error.textContent = M.tr('أضف صورة واحدة على الأقل.','Add at least one image.'); return; }
    const state = M.state();
    state.publicOffers.push({ id:M.id('P'), supplierId:user.id, supplierName:user.company || user.name, product, country:user.country||'', unitPrice:document.getElementById('publicPrice').value, currency:document.getElementById('publicCurrency').value, moq:document.getElementById('publicMoq').value, stock:document.getElementById('publicStock').value, leadTime:document.getElementById('publicLead').value, specs, validUntil:document.getElementById('publicExpiry').value, images:publicImages, status:'pending' });
    await M.save(state); M.closeDialog('publicOfferDialog'); view='public'; render();
    M.toast('تم إرسال العرض العام','Public offer submitted','بانتظار المراجعة والترجمة اليدوية.','Waiting for review and manual translation.');
  });

  window.addEventListener('storage', async () =>{document.getElementById('requestDetailsDialog').classList.add('hidden');document.getElementById('quoteDialog').classList.add('hidden');render();});
  render();
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', render));
});
