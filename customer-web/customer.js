document.addEventListener('m:ready', async () => {
  const user=M.requireRole('client'); if(!user)return;
  M.fillUser(user,'عميل','Customer');
  const E=W.escape;
  const views=[
    ['requests','الطلبات','Requests'],['market','العروض العامة','Public offers'],
    ['interests','العروض التي طلبتها','Requested offers']
  ];
  let view=location.hash.slice(1)||'requests';
  const section=document.getElementById('requests'), body=document.getElementById('customerRequests');
  const search=Search.create(document.querySelector('main'),()=>render());
  let pictures=[];
  const uploader=M.setupImages('requestImages','requestPreview',v=>{pictures=[...v];});
  function go(key){
    const filters={review:'review',sent:'active',quotes:'active',selected:'completed'};
    if(filters[key])search.setStatus(filters[key]);else search.setStatus('');
    view=views.some(x=>x[0]===key)?key:'requests';history.replaceState(null,'','#'+view);render();
  }
  function myRequests(){return M.state().requests.filter(x=>x.customerId===user.id&&R.requestVisible(x));}
  function chosen(r,s){return r.selectedQuoteId || (s.quotes.some(q=>q.id===s.selectedQuote&&q.requestId===r.id)?s.selectedQuote:null);}
  function quoteCard(q,r,s) {
    const selected=chosen(r,s),enabled=R.userActive()&&R.requestOpen(r,s)&&R.offerOpen(q,s);
    return '<article class="offer-card"><span class="offer-code">#'+E(q.id)+'</span><div class="offer-price">'+E(q.currency)+' '+E(q.unitPrice)+'</div>'+W.gallery(q.images)+
      '<p class="preserve-lines">'+E(W.copy(q,'description'))+'</p><div class="offer-facts"><div>MOQ: '+E(q.moq)+'</div><div>'+M.tr('الإنتاج بالأيام','Production days')+': '+E(q.leadTime)+'</div><div>'+M.tr('العينة','Sample')+': '+E(q.sampleCost)+'</div></div>'+
      '<button class="btn btn-outline choose-quote" data-id="'+E(q.id)+'" '+(selected||!enabled?'disabled':'')+'>'+(!enabled?M.tr('غير متاح حاليًا','Currently unavailable'):selected===q.id?M.tr('تم اختيار هذا العرض','Selected'):selected?M.tr('اختير عرض آخر لهذا الطلب','Another quote selected'):M.tr('اختيار العرض','Select quote'))+'</button></article>';
  }
  function requestCard(r,s) {
    const quotes=s.quotes.filter(q=>q.requestId===r.id&&q.status==='published'&&R.offerVisible(q,s));
    return '<article class="invite-card"><span class="request-id">#'+E(r.id)+'</span><h3>'+E(r.product)+'</h3>'+W.badge(R.stateLabel(r))+
      '<p>'+E(W.date(r.createdAt))+'</p>'+W.gallery(r.images)+'<p class="preserve-lines">'+E(r.specs)+'</p><div class="meta-list"><span class="meta-chip">'+M.tr('الكمية','Quantity')+': '+E(r.quantity)+'</span><span class="meta-chip">'+E(r.country)+'</span><span class="meta-chip">'+M.tr('تاريخ الاحتياج','Needed date')+': '+E(r.neededDate||'—')+'</span></div>'+
      '<details><summary>'+M.tr('سجل الطلب','Request history')+'</summary>'+W.history(r)+'</details><div class="offer-grid">'+quotes.filter(q=>view!=='selected'||q.id===chosen(r,s)).map(q=>quoteCard(q,r,s)).join('')+'</div></article>';
  }
  function render() {
    const s=M.state(),mine=myRequests(),quotes=s.quotes.filter(q=>q.status==='published'&&R.offerVisible(q,s)&&mine.some(r=>r.id===q.requestId));
    W.nav(views,view,go);
    const counts={requestCount:mine.length,reviewCount:mine.filter(x=>x.status==='review').length,quoteCount:mine.filter(r=>r.status==='sent'&&!chosen(r,s)&&!r.suspendedAt).length,selectedCount:mine.filter(r=>chosen(r,s)||r.status==='completed').length};
    Object.entries(counts).forEach(([id,n])=>document.getElementById(id).textContent=n);
    const title=views.find(x=>x[0]===view)||views[0];
    section.querySelector('h2').textContent=M.tr(title[1],title[2]);
    section.querySelector('.card-head p').textContent=M.tr('بيانات حسابك فقط — جميع الأطراف مجهولة الهوية.','Your account only — counterpart identities stay hidden.');
    let html='';
    if(view==='market') {
      html='<div class="market-offer-grid">'+s.publicOffers.filter(W.available).filter(o=>search.match(o,[o.id,W.copy(o,'title'),W.copy(o,'description')])).map(o=>W.offerCard(o,user)).join('')+'</div>';
      if(!s.publicOffers.filter(W.available).some(o=>search.match(o,[o.id,W.copy(o,'title'),W.copy(o,'description')])))html=W.empty();
    } else if(view==='interests') {
      html=s.interests.filter(i=>i.customerId===user.id).filter(i=>{const o=s.publicOffers.find(o=>o.id===i.offerId&&R.offerOpen(o,s));return search.match({...i,country:o?.country,status:i.status||'pending'},[i.offerId,o?W.copy(o,'title'):'']);}).map(i=>{
        const offer=s.publicOffers.find(o=>o.id===i.offerId&&R.offerOpen(o,s));
        return '<article class="invite-card"><span>#'+E(i.offerId)+'</span><h3>'+E(offer?W.copy(offer,'title'):M.tr('عرض مؤرشف','Archived offer'))+'</h3>'+W.badge(i.status||'pending')+'<p>'+E(W.date(i.createdAt||i.requestedAt))+'</p>'+ (offer?W.gallery(offer.images):'')+W.history(i)+'</article>';
      }).join('')||W.empty();
    } else {
      const filtered=mine.filter(r=>search.match(r,[r.id,r.product,r.specs,...s.quotes.filter(q=>q.requestId===r.id&&q.status==='published'&&R.offerVisible(q,s)).map(q=>q.id)])).filter(r=>view==='review'?r.status==='review':view==='sent'?r.status==='sent':view==='quotes'?quotes.some(q=>q.requestId===r.id):view==='selected'?chosen(r,s):true);
      html=filtered.map(r=>requestCard(r,s)).join('')||W.empty();
    }
    body.innerHTML=(!R.userActive()?'<p class="account-restriction">'+M.tr('الحساب موقوف؛ الإرسال والاختيار غير متاحين.','Account disabled; submissions and selection are unavailable.')+'</p>':'')+html; M.applySettings();
  }
  const stats=['requests','review','quotes','selected'];
  document.querySelectorAll('.stat-card').forEach((card,i)=>{card.setAttribute('role','button');card.tabIndex=0;card.onclick=()=>go(stats[i]);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(stats[i]);}};});
  document.getElementById('requestForm').addEventListener('submit', async e =>{
    e.preventDefault();
    if(!R.guard())return;
    const product=document.getElementById('requestProduct').value.trim(),specs=document.getElementById('requestSpecs').value.trim(),error=document.getElementById('requestError');
    if(M.containsContact(product+' '+specs)){error.textContent=M.tr('احذف بيانات التواصل.','Remove contact details.');return;}
    if(!pictures.length){error.textContent=M.tr('أضف صورة واحدة على الأقل.','Add at least one image.');return;}
    const s=M.state();
    s.requests.push({id:M.id('M'),customerId:user.id,customerName:user.company||user.name,product,specs,quantity:document.getElementById('requestQty').value,country:document.getElementById('requestCountry').value,neededDate:document.getElementById('requestDate').value,images:[...pictures],status:'review'});
    try{await M.save(s);}catch{error.textContent=M.tr('تعذر الحفظ؛ تحقق من الاتصال بالخادم.','Could not save: check the server connection.');return;}
    e.target.reset();uploader.reset();pictures=[];error.textContent='';M.closeDialog('requestDialog');go('review');
  });
  body.addEventListener('click', async e =>{
    const select=e.target.closest('.choose-quote');
    if(select) {
      const s=M.state(),q=s.quotes.find(x=>x.id===select.dataset.id&&x.status==='published'),r=s.requests.find(x=>x.id===q?.requestId&&x.customerId===user.id);
      if(!r||chosen(r,s)||!R.guard()||!R.requestOpen(r,s)||!R.offerOpen(q,s))return;
      r.selectedQuoteId=q.id;await M.save(s);go('selected');return;
    }
    const ask=e.target.closest('.request-market');
    if(ask&&await W.interest(ask.dataset.id,user))go('interests');
  });
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',render));
  window.addEventListener('storage',render);
  go(view);
  const pending=new URLSearchParams(location.search).get('offer');
  if(pending) {
    go('market');
    const target=[...body.querySelectorAll('.request-market')].find(b=>b.dataset.id===pending);
    target?.closest('article').scrollIntoView({block:'center'});
  }
});
