document.addEventListener('m:ready', async () => {
  const user = M.requireRole('supplier');
  if (!user) return;
  M.fillUser(user, 'مورد', 'Supplier');

  const search=Search.createAdmin(document.querySelector('.top-actions'),()=>render());
  let activeRequest = null;
  let quoteImages = [];
  let publicImages = [];
  M.setupImages('quoteImages', 'quotePreview', value => { quoteImages = [...value]; });
  M.setupImages('publicImages', 'publicPreview', value => { publicImages = [...value]; });

  function translatedRequest(request) {
    return {title:W.copy(request,'title'),description:W.copy(request,'description')};
  }

  let view='invites',statusFilter='';
  const views=[['invites','الدعوات','Invitations'],['submitted','عروض الأسعار','Quotations'],['public','عروضي العامة','My public offers'],['interests','طلبات الاهتمام','Customer interest']];
  const restriction=document.createElement('p');restriction.className='account-restriction hidden';document.querySelector('main').prepend(restriction);
  const archive=document.createElement('section'); archive.className='card';archive.id='supplierArchive';
  document.querySelector('main').append(archive);
  const allowed=r=>R.requestOpen(r)&&R.userActive()&&r.status==='sent' && (r.supplierIds || []).includes(user.id);
  function go(key){statusFilter=key==='pending'?'pending':'';view=key==='pending'?'submitted':key;render();}
  function matchOffer(o){const s=M.state(),r=s.requests.find(r=>r.id===o.requestId);return search.match(o,[W.ref(o),r?W.ref(r):'',o.product||'',r?W.copy(r,'title'):'']);}
  function inviteRow(r){
    const copy=translatedRequest(r),E=W.escape;
    return '<article class="admin-request-row"><span class="request-id">#'+E(W.ref(r))+'</span><h3>'+E(copy.title)+'</h3>'+W.badge(R.stateLabel(r))+'<time>'+E(W.date(r.createdAt))+'</time><button class="view-request admin-detail-button" data-id="'+E(r.id)+'" aria-label="'+E(M.tr('عرض التفاصيل','View details'))+'"><span>'+M.tr('التفاصيل','Details')+'</span><b aria-hidden="true">›</b></button></article>';
  }
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
    const inviteMatches=invites.filter(r=>search.match(r,[W.ref(r),W.copy(r,'title')]));
    document.getElementById('inviteList').innerHTML='<div class="admin-request-list">'+(inviteMatches.map(inviteRow).join('')||W.empty())+'</div>';
    const offerRow=o=>'<article class="invite-card"><span>#'+E(W.ref(o))+'</span><h3>'+E(o.product||s.requests.find(r=>r.id===o.requestId)?.product||M.tr('عرض','Offer'))+'</h3>'+W.badge(o.status)+'<p>'+E(o.currency)+' '+E(o.unitPrice)+' · MOQ '+E(o.moq)+'</p><p>'+E(W.date(o.createdAt))+'</p><p>'+M.tr('الإنتاج بالأيام / تكلفة العينة','Production days / sample cost')+': '+E(o.leadTime||'—')+' / '+E(o.sampleCost||'—')+'</p>'+W.gallery(o.images)+'<p class="preserve-lines">'+E(o.specs||o.notes||'')+'</p>'+W.history(o)+'</article>';
    document.getElementById('supplierOffers').innerHTML=pub.filter(matchOffer).map(offerRow).join('')||W.empty();
    let items=statusFilter==='pending'?[...quotes,...pub].filter(q=>q.status==='pending'):quotes;
    let content=items.filter(matchOffer).map(offerRow).join('')||W.empty();
    if(view==='interests')content=pub.filter(matchOffer).map(o=>{
      const count=s.interests.filter(i=>i.offerId===o.id).length;
      return '<article class="invite-card"><h3>'+E(o.product)+'</h3><p>#'+E(W.ref(o))+' — '+M.tr('طلبات الاهتمام','Interest requests')+': '+count+'</p></article>';
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
    document.getElementById('detailRequestId').textContent = `#${W.ref(request)}`;
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
    document.getElementById('quoteRequest').textContent = `#${W.ref(request)} — ${translatedRequest(request).title}`;
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
    await M.save(state); M.closeDialog('publicOfferDialog'); view='public';statusFilter='';render();
    M.toast('تم إرسال العرض العام','Public offer submitted','بانتظار المراجعة والترجمة اليدوية.','Waiting for review and manual translation.');
  });

  window.addEventListener('storage', async () =>{document.getElementById('requestDetailsDialog').classList.add('hidden');document.getElementById('quoteDialog').classList.add('hidden');render();});
  render();
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', render));
});
