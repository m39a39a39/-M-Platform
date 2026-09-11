document.addEventListener('m:ready', async () => {
  const user = M.requireRole('admin');
  if (!user) return;
  M.fillUser(user, 'إدارة', 'Admin');
  let filter = 'request';
  let pendingLogo = null;
  let reviewImages=[];

  function pendingItems() {
    const state = M.state();
    if (filter === 'request') return state.requests.filter(item => !item.deletedAt&&!item.suspendedAt&&item.status === 'review').map(item => ({ ...item, kind:'request', title:item.product, identity:item.customerName || item.customerId, source:item.specs }));
    if (filter === 'quote') return state.quotes.filter(item => !item.deletedAt&&item.status === 'pending').map(item => ({ ...item, kind:'quote', title:`${item.currency} ${item.unitPrice} · MOQ ${item.moq}`, identity:item.supplierName || item.supplierId, source:item.notes || `${item.leadTime} days` }));
    return state.publicOffers.filter(item => !item.deletedAt&&item.status === 'pending').map(item => ({ ...item, kind:'public', title:item.product, identity:item.supplierName || item.supplierId, source:item.specs }));
  }

  function renderQueue() {
    const state = M.state();
    document.getElementById('adminRequestCount').textContent = state.requests.filter(item => !item.deletedAt&&!item.suspendedAt&&item.status === 'review').length;
    document.getElementById('adminQuoteCount').textContent = state.quotes.filter(item => !item.deletedAt&&item.status === 'pending').length;
    document.getElementById('adminPublicCount').textContent = state.publicOffers.filter(item => !item.deletedAt&&item.status === 'pending').length;
    document.getElementById('interestCount').textContent = state.interests.length;
    const list = pendingItems().filter(item=>{const owner=state.accounts.find(a=>a.id===(item.customerId||item.supplierId)),request=state.requests.find(r=>r.id===item.requestId);return !window.adminSearch||window.adminSearch.match({...item,country:item.country||request?.country||owner?.country},[item.id,item.requestId,item.title,item.identity,request?.product,owner?.name,owner?.company,owner?.phone,owner?.email]);});
    document.getElementById('adminQueue').innerHTML = list.length ? list.map(item => `<article class="invite-card"><div class="invite-top"><div><span class="request-id">#${W.escape(item.id)}</span><h3>${W.escape(item.title)}</h3><p>${M.tr('صاحب المحتوى: ','Owner: ')}${W.escape(item.identity || '—')}</p></div><span class="status status-warning">${M.tr('بانتظار المراجعة','Pending')}</span></div><div class="invite-footer" style="margin-top:14px"><span>${item.images?.length || 0} ${M.tr('صور','images')}</span><button class="btn btn-primary btn-sm review-item" data-id="${W.escape(item.id)}">${M.tr('مراجعة وترجمة','Review & translate')}</button></div>${R.buttons(item.kind==='public'?'public':item.kind,item)}</article>`).join('') : `<div class="empty-state"><strong>${M.tr('لا توجد عناصر معلقة','No pending items')}</strong></div>`;
  }

  function resetTranslation() {
    ['translationTitleAr','translationTitleEn','translationDescriptionAr','translationDescriptionEn'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('redactIdentity').checked = false;
    document.getElementById('redactContact').checked = false;
    document.getElementById('adminError').textContent = '';
  }

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', async () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderQueue();
  }));

  document.addEventListener('click', async event => {
    const button = event.target.closest('.review-item');
    if (!button) return;
    const item = pendingItems().find(entry => entry.id === button.dataset.id);
    if (!item) return;
    const card = document.getElementById('review');
    card.dataset.kind = item.kind; card.dataset.id = item.id;
    document.getElementById('reviewTitle').textContent = `#${item.id} — ${item.title}`;
    document.getElementById('reviewIdentity').textContent = `${M.tr('الهوية الأصلية: ','Source identity: ')}${item.identity || '—'}`;
    document.getElementById('reviewSource').textContent = item.source || '—';
    reviewImages=[...(item.images||[])];
    function showReviewImages(){
      const target=document.getElementById('reviewImages');target.innerHTML=W.gallery(reviewImages);
      if(M.can(item.kind==='request'?'requests.edit':'offers.edit')){
        const controls=document.createElement('div');controls.className='invite-actions';
        reviewImages.forEach((src,index)=>{const b=document.createElement('button');b.type='button';b.className='btn btn-outline btn-sm';b.textContent=M.tr('استبعاد الصورة ','Exclude image ')+(index+1);b.onclick=()=>{reviewImages.splice(index,1);showReviewImages();};controls.append(b);});target.append(controls);
      }
    }
    showReviewImages();
    const account=M.state().accounts.find(a=>a.id===(item.customerId||item.supplierId));
    document.getElementById('reviewAccount').innerHTML=M.can('accounts.read')&&account ? '<div class="source-copy">'+[account.name,account.company,account.phone||M.tr('رقم التواصل غير مسجل','Phone not recorded'),account.email,account.country].map(W.escape).join('<br>')+'</div>' : '';
    document.getElementById('supplierPicker').classList.toggle('hidden',item.kind!=='request');
    const suppliers=M.state().accounts.filter(a=>a.role==='supplier'&&!a.deletedAt&&!a.blockedAt);
    document.getElementById('supplierChoices').innerHTML=suppliers.map(a=>'<label class="check-row"><input type="checkbox" value="'+W.escape(a.id)+'" '+((item.supplierIds||[]).includes(a.id)?'checked':'')+'>'+W.escape(a.company||a.name)+'</label>').join('');
    const state=M.state(),raw=(item.kind==='request'?state.requests:item.kind==='quote'?state.quotes:state.publicOffers).find(x=>x.id===item.id);
    if(raw&&!raw.reviewedAt&&(M.can('translate')||M.can('publish')||M.can(item.kind==='request'?'requests.edit':'offers.edit'))){raw.reviewedAt=new Date().toISOString();await M.save(state);}
    resetTranslation();
    ['TitleAr','TitleEn','DescriptionAr','DescriptionEn'].forEach(key=>{
      const prop=key.charAt(0).toLowerCase()+key.slice(1);
      document.getElementById('translation'+key).value=item.translation?.[prop] || (key.startsWith('Description')?item.translation?.[key.endsWith('Ar')?'ar':'en']:'') || '';
    });
    card.scrollIntoView({ behavior:'smooth' });
  });

  document.getElementById('approveItem').addEventListener('click', async () => {
    const card = document.getElementById('review');
    const kind = card.dataset.kind, id = card.dataset.id;
    const translation = {
      titleAr:document.getElementById('translationTitleAr').value.trim(),
      titleEn:document.getElementById('translationTitleEn').value.trim(),
      descriptionAr:document.getElementById('translationDescriptionAr').value.trim(),
      descriptionEn:document.getElementById('translationDescriptionEn').value.trim()
    };
    const error = document.getElementById('adminError');
    if (!kind) { error.textContent = M.tr('اختر عنصرًا أولًا.','Select an item first.'); return; }
    if (!document.getElementById('redactIdentity').checked || !document.getElementById('redactContact').checked) { error.textContent = M.tr('أكمل فحص إزالة بيانات الهوية والتواصل.','Complete both redaction checks.'); return; }
    if (Object.values(translation).some(value => !value)) { error.textContent = M.tr('أدخل الاسم والوصف بالعربية والإنجليزية يدويًا.','Enter the name and description manually in Arabic and English.'); return; }
    const state = M.state();
    const collection = kind === 'request' ? state.requests : kind === 'quote' ? state.quotes : state.publicOffers;
    const item = collection.find(entry => entry.id === id);
    const supplierIds=[...document.querySelectorAll('#supplierChoices input:checked')].map(x=>x.value);
    if(kind==='request'&&(!supplierIds.length||supplierIds.some(id=>!R.accountActive(id,state)))){error.textContent=M.tr('اختر موردًا واحدًا على الأقل.','Select at least one supplier.');return;}
    if(Object.values(translation).some(M.containsContact)){error.textContent=M.tr('احذف بيانات التواصل من الترجمة.','Remove contact details from translations.');return;}
    if(!item||item.deletedAt||item.suspendedAt||!R.accountActive(item.customerId||item.supplierId,state)){error.textContent=M.tr('العنصر أو حساب صاحبه موقوف.','Item or owner account is disabled.');return;}
    if(kind==='quote'&&!R.requestOpen(state.requests.find(r=>r.id===item.requestId),state)){error.textContent=M.tr('الطلب المرتبط موقوف أو محذوف.','Linked request is suspended or deleted.');return;}
    if (item) { item.translation = translation; item.images=[...reviewImages];item.status = kind === 'request' ? 'sent' : 'published'; if(kind==='request')item.supplierIds=supplierIds; }
    await M.save(state); document.dispatchEvent(new Event('records-changed')); card.dataset.kind = ''; card.dataset.id = '';
    document.getElementById('reviewTitle').textContent = M.tr('تم الاعتماد','Approved');
    document.getElementById('reviewSource').textContent = '—';
    renderQueue();
    M.toast('تم الاعتماد','Approved',kind === 'request' ? 'أُرسل الطلب إلى الموردين المناسبين.' : 'نُشر العرض بهوية مجهولة.',kind === 'request' ? 'Request sent to matched suppliers.' : 'Offer published anonymously.');
  });

  const draft=document.createElement('button');draft.type='button';draft.className='btn btn-outline';draft.textContent=M.tr('حفظ الترجمة دون نشر','Save translation without publishing');
  document.getElementById('approveItem').after(draft);
  draft.hidden=!M.can('translate');document.getElementById('approveItem').disabled=!M.can('publish');
  draft.onclick=async()=>{
    const card=document.getElementById('review'),s=M.state(),kind=card.dataset.kind;
    const item=(kind==='request'?s.requests:kind==='quote'?s.quotes:s.publicOffers).find(x=>x.id===card.dataset.id);if(!item)return;
    item.translation={};for(const suffix of ['TitleAr','TitleEn','DescriptionAr','DescriptionEn'])item.translation[suffix.charAt(0).toLowerCase()+suffix.slice(1)]=document.getElementById('translation'+suffix).value.trim();
    item.images=[...reviewImages];await M.save(s);M.toast('تم الحفظ','Saved','حُفظت الترجمة دون نشر.','Translation saved without publishing.');
  };
  function renderLogoPreview(source) {
    document.getElementById('logoPreview').innerHTML = source ? `<img src="${source}" alt="Logo">` : 'M';
  }
  function loadSettingsForm() {
    const settings = M.state().settings || {};
    document.querySelectorAll('#siteSettingsForm [name]').forEach(field => { field.value = settings[field.name] || ''; });
    pendingLogo = settings.logo || '';
    renderLogoPreview(pendingLogo);
  }
  document.getElementById('siteLogoInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { document.getElementById('settingsError').textContent = M.tr('اختر ملف صورة صالحًا.','Choose a valid image file.'); return; }
    M.imageData(file, 600, .9).then(source => { pendingLogo = source; renderLogoPreview(pendingLogo); });
  });
  document.getElementById('removeLogo').addEventListener('click', async () => { pendingLogo = ''; document.getElementById('siteLogoInput').value = ''; renderLogoPreview(''); });
  document.getElementById('siteSettingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    const state = M.state();
    const values = Object.fromEntries(new FormData(event.target));
    state.settings = { ...(state.settings || {}), ...values, logo:pendingLogo, logoText:'M' };
    await M.save(state); M.applySettings();
    M.toast('تم حفظ الإعدادات','Settings saved','تم تحديث النصوص والشعار في جميع الواجهات.','Text and logo were updated across all interfaces.');
  });

  document.getElementById('refreshAdmin').addEventListener('click', renderQueue);
  document.addEventListener('records-changed', async () =>{document.getElementById('review').dataset.kind='';renderQueue();});
  window.addEventListener('storage', async () =>{document.getElementById('review').dataset.kind='';renderQueue();});
  renderQueue(); loadSettingsForm();
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', renderQueue));
});
