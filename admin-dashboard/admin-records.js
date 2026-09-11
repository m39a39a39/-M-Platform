document.addEventListener('m:ready', async () =>{
  if(M.session()?.role!=='admin')return;
  const E=W.escape;
  const allowed={allrequests:['requests.read','requests.edit','translate','publish'],alloffers:['offers.read','offers.edit','translate','publish'],interests:['offers.read','offers.edit','publish'],customers:['accounts.read','moderate'],suppliers:['accounts.read','moderate'],trash:['trash'],settings:['settings'],team:['team']};
  const views=[['allrequests','الطلبات','Requests'],['alloffers','العروض','Offers'],['interests','طلبات الاهتمام','Customer interests'],['customers','العملاء','Customers'],['suppliers','الموردون','Suppliers'],['trash','المحذوفات','Trash'],['settings','النصوص والشعار','Text & logo'],['team','فريق الإدارة','Admin team']].filter(([key])=>allowed[key].some(M.can));
  if(!views.length){document.querySelector('main').textContent=M.tr('لم تُمنح صلاحيات بعد.','No permissions assigned yet.');return;}
  let view=views[0][0];
  const main=document.querySelector('main'),reviewGrid=document.querySelector('.admin-grid'),settings=document.getElementById('siteSettings');
  window.adminSearch=Search.create(main,()=>{document.getElementById('refreshAdmin').click();render();});
  const records=document.createElement('section');records.className='card';main.insertBefore(records,settings);
  function go(key){view=key;render();}
  const account=id=>M.state().accounts.find(a=>a.id===id);
  function contact(a) {
    if(!M.can('accounts.read'))return '';
    if(!a)return '<p>'+M.tr('بيانات الاتصال غير متاحة.','Contact data unavailable.')+'</p>';
    return '<dl class="contact-data">'+[['الاسم','Name',a.name],['الشركة','Company',a.company],['رقم التواصل','Phone',a.phone],['البريد','Email',a.email],['الدولة','Country',a.country],['تاريخ التسجيل','Registered',W.date(a.createdAt)]].map(([ar,en,v])=>'<div><dt>'+M.tr(ar,en)+'</dt><dd>'+E(v||M.tr('غير مسجل','Not recorded'))+'</dd></div>').join('')+'</dl>';
  }
  function collection(kind,s){return kind==='request'?s.requests:kind==='quote'?s.quotes:s.publicOffers;}
  function match(x){const owner=account(x.customerId||x.supplierId),request=M.state().requests.find(r=>r.id===x.requestId);return adminSearch.match({...x,country:x.country||request?.country||owner?.country},[x.id,x.product,x.requestId,request?.product,owner?.name,owner?.company,owner?.phone,owner?.email,x.name,x.company,x.email,x.phone]);}
  function accountRow(a){return '<article class="invite-card"><h3>'+E(a.name)+'</h3><p>'+E(a.company)+'</p>'+W.badge(R.stateLabel(a))+'<button class="btn btn-outline account-detail" data-id="'+E(a.id)+'">'+M.tr('البيانات والسجل','Contact & history')+'</button>'+R.buttons('account',a)+R.log(a)+'</article>';}
  function row(x,kind) {
    return '<article class="invite-card"><span>#'+E(x.id)+'</span><h3>'+E(x.product||x.requestId||x.id)+'</h3>'+W.badge(R.stateLabel(x))+'<p>'+E(W.date(x.createdAt))+'</p><button class="btn btn-outline record-detail" data-id="'+E(x.id)+'" data-kind="'+kind+'">'+M.tr('التفاصيل وبيانات صاحب الطلب','Details & owner contact')+'</button>'+R.buttons(kind,x)+R.log(x)+'</article>';
  }
  function render() {
    const s=M.state(); W.nav(views,view==='review'?'allrequests':view==='pending'?'alloffers':view,go);
    reviewGrid.classList.toggle('hidden',!['overview','review','pending'].includes(view));
    settings.classList.toggle('hidden',view!=='settings');
    records.classList.toggle('hidden',['overview','review','pending','settings'].includes(view));
    if(view==='review')document.querySelector('[data-filter="request"]').click();
    if(view==='pending')document.querySelector('[data-filter="quote"]').click();
    const title=views.find(v=>v[0]===view)||['review','المراجعة والترجمة','Review & translate'];
    let content='';
    if(view==='new')content=s.requests.filter(r=>!r.deletedAt&&r.status==='review'&&!r.reviewedAt&&match(r)).map(r=>row(r,'request')).join('');
    if(view==='sent')content=s.requests.filter(r=>!r.deletedAt&&r.status==='sent'&&match(r)).map(r=>row(r,'request')).join('');
    if(view==='published')content=[...s.quotes.filter(x=>!x.deletedAt&&x.status==='published'&&match(x)).map(x=>row(x,'quote')),...s.publicOffers.filter(x=>!x.deletedAt&&x.status==='published'&&match(x)).map(x=>row(x,'public'))].join('');
    if(view==='allrequests')content=s.requests.filter(x=>!x.deletedAt&&match(x)).map(x=>row(x,'request')).join('');
    if(view==='alloffers')content=s.quotes.filter(x=>!x.deletedAt&&match(x)).map(x=>row(x,'quote')).join('')+s.publicOffers.filter(x=>!x.deletedAt&&match(x)).map(x=>row(x,'public')).join('');
    if(view==='trash')content=s.accounts.filter(x=>x.deletedAt&&match(x)).map(accountRow).join('')+s.requests.filter(x=>x.deletedAt&&match(x)).map(x=>row(x,'request')).join('')+s.quotes.filter(x=>x.deletedAt&&match(x)).map(x=>row(x,'quote')).join('')+s.publicOffers.filter(x=>x.deletedAt&&match(x)).map(x=>row(x,'public')).join('');
    if(['customers','suppliers'].includes(view)){
      const role=view==='customers'?'client':'supplier';
      content='<div class="directory-grid">'+s.accounts.filter(a=>a.role===role&&!a.deletedAt&&match(a)).map(accountRow).join('')+'</div>';
      if(!s.accounts.some(a=>a.role===role&&!a.deletedAt&&match(a)))content='';
    }
    if(view==='interests')content=s.interests.map((i,index)=>{if(!match(i))return '';
      const offer=s.publicOffers.find(o=>o.id===i.offerId);
      return '<article class="invite-card"><h3>#'+E(i.offerId)+' — '+E(offer?.product||'')+'</h3>'+contact(account(i.customerId))+W.badge(i.status||'pending')+
        '<p>'+E(W.date(i.createdAt||i.requestedAt))+'</p><label>'+M.tr('تحديث حالة طلب الاهتمام','Update interest status')+'<select class="interest-state" data-index="'+index+'">'+['pending','coordinating','accepted','completed','cancelled'].map(v=>'<option value="'+v+'" '+((i.status||'pending')===v?'selected':'')+'>'+W.status(v)+'</option>').join('')+'</select></label>'+W.history(i)+'</article>';
    }).join('');
    records.innerHTML='<div class="card-head"><h2>'+M.tr(title[1],title[2])+'</h2></div><div class="card-body">'+(content||W.empty())+'</div>';
    if(view==='team')Team.render(records);
    document.getElementById('interestCount').textContent=s.interests.length;
  }
  records.onclick=e=>{
    const person=e.target.closest('.account-detail');
    if(person){
      const s=M.state(),a=account(person.dataset.id);if(!a)return;
      const related=a.role==='client'?s.requests.filter(r=>r.customerId===a.id):[...s.quotes,...s.publicOffers].filter(o=>o.supplierId===a.id);
      W.modal(a.name,contact(a)+R.buttons('account',a)+R.log(a)+'<h3>'+M.tr('سجل الطلبات والعروض','Request & offer history')+'</h3>'+related.map(x=>'<article class="invite-card">#'+E(x.id)+' '+E(x.product||x.requestId||'')+' '+W.badge(x.status)+'<p>'+E(W.date(x.createdAt))+'</p>'+W.history(x)+'</article>').join(''));return;
    }
    const b=e.target.closest('.record-detail');if(!b)return;
    const s=M.state(),x=collection(b.dataset.kind,s).find(x=>x.id===b.dataset.id);if(!x)return;
    let content=contact(account(x.customerId||x.supplierId))+W.gallery(x.images)+'<p class="preserve-lines">'+E(x.specs||x.notes||'')+'</p>';
    if(b.dataset.kind==='request'){
      content+='<p>'+M.tr('الكمية / التسليم / تاريخ الاحتياج','Quantity / delivery / needed date')+': '+[x.quantity,x.country,x.neededDate||'—'].map(E).join(' / ')+'</p><h3>'+M.tr('الموردون المدعوون','Invited suppliers')+'</h3><p>'+(x.supplierIds||[]).map(id=>E(account(id)?.company||account(id)?.name||id)).join('، ')+'</p><h3>'+M.tr('العروض المستلمة','Received quotes')+'</h3>'+
        s.quotes.filter(q=>q.requestId===x.id).map(q=>'<article class="invite-card">#'+E(q.id)+' '+E(q.currency)+' '+E(q.unitPrice)+' '+W.badge(q.status)+(x.selectedQuoteId===q.id?' — '+M.tr('اختاره العميل','Customer selected'):'')+contact(account(q.supplierId))+W.gallery(q.images)+'</article>').join('');
      if(!x.deletedAt&&!x.suspendedAt&&x.status==='sent')content+='<button class="btn btn-outline" id="reopen-review">'+M.tr('إعادة المراجعة وتحديد الموردين','Review again and assign suppliers')+'</button>';
      if(!x.deletedAt&&!x.suspendedAt&&x.status==='review')content+='<button class="btn btn-primary" id="open-review">'+M.tr('فتح قائمة المراجعة للاعتماد','Open review queue to approve')+'</button>';
    }
    if(b.dataset.kind!=='request'&&x.status==='pending'&&(M.can('translate')||M.can('publish')||M.can('offers.edit')))content+='<button class="btn btn-primary" id="open-offer-review">'+M.tr('المراجعة والترجمة','Review & translate')+'</button>';
    content+=R.buttons(b.dataset.kind,x)+R.log(x)+W.history(x);W.modal('#'+x.id,content);
    document.getElementById('open-offer-review')?.addEventListener('click',()=>{
      document.getElementById('workflowDialog').remove();go('pending');document.querySelector('[data-filter="'+(b.dataset.kind==='quote'?'quote':'public')+'"]').click();document.querySelector('.review-item[data-id="'+CSS.escape(x.id)+'"]')?.click();
    });
    document.getElementById('reopen-review')?.addEventListener('click', async () =>{
      const latest=M.state(),request=latest.requests.find(r=>r.id===x.id);if(!request||request.deletedAt||request.suspendedAt)return;
      request.status='review';await M.save(latest);document.getElementById('workflowDialog').remove();go('review');
      document.querySelector('.review-item[data-id="'+CSS.escape(x.id)+'"]')?.click();
    });
    document.getElementById('open-review')?.addEventListener('click', async () =>{
      document.getElementById('workflowDialog').remove();go('review');
      document.querySelector('.review-item[data-id="'+CSS.escape(x.id)+'"]')?.click();
    });
  };
  records.onchange=async e=>{
    if(!e.target.matches('.interest-state'))return;
    const s=M.state(),i=s.interests[Number(e.target.dataset.index)];
    if(!i)return;i.status=e.target.value;await M.save(s);render();
  };
  document.querySelectorAll('.stat-card').forEach((c,i)=>{c.tabIndex=0;c.setAttribute('role','button');const key=['review','pending','pending','interests'][i];c.onclick=()=>{go(key);if(i===2)document.querySelector('[data-filter="public"]').click();};c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click();}};});
  document.addEventListener('records-changed',render);
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',render));
  window.addEventListener('storage',render);render();
});
