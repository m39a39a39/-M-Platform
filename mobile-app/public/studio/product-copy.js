'use strict';
(()=>{
 const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields={titleAr:['name','العنوان العربي','Arabic title'],titleEn:['nameEn','العنوان الإنجليزي','English title'],descriptionAr:['description','الوصف العربي','Arabic description'],descriptionEn:['descriptionEn','الوصف الإنجليزي','English description']};
 const request=body=>window.MStudioSession.request('/api/v1/product-copy',{auth:true,method:'POST',body});
 const modes=()=>[['both',tr('العنوان والوصف','Title and description')],['title',tr('العنوان فقط','Title only')],['description',tr('الوصف فقط','Description only')],['shorten',tr('اختصار الوصف','Shorten description')]];
 const controls=()=>`<div class="product-copy-controls"><label>${tr('نوع التحسين','Improve')}<select data-pc-mode>${modes().map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>${tr('توجيه اختياري','Optional instruction')}<input data-pc-instruction maxlength="800" placeholder="${tr('مثال: وصف مختصر مناسب للبيع بالجملة','Example: concise wholesale description')}"></label><button type="button" data-pc-generate>✨ ${tr('توليد اقتراح','Generate suggestion')}</button></div>`;
 const comparison=(before,proposal,editable=false)=>Object.entries(proposal).filter(([k])=>fields[k]).map(([k,v])=>`<div class="product-copy-field"><strong>${tr(fields[k][1],fields[k][2])}</strong><div class="product-copy-compare"><div><small>${tr('الحالي','Current')}</small><p dir="auto">${esc(before[k]||'—')}</p></div><div><small>${tr('المقترح','Suggested')}</small>${editable?`<textarea data-pc-field="${k}" aria-label="${tr(fields[k][1],fields[k][2])}" maxlength="${k.startsWith('title')?100:5000}" dir="auto">${esc(v)}</textarea>`:`<p dir="auto">${esc(v)}</p>`}</div></div></div>`).join('');
 const rawCopy=p=>({titleAr:p.translation?.titleAr||p.product||'',titleEn:p.translation?.titleEn||'',descriptionAr:p.translation?.descriptionAr||p.specs||'',descriptionEn:p.translation?.descriptionEn||''});
 function mountEditor(form){
  if(!form||form.querySelector('[data-product-copy]'))return;
  const panel=document.createElement('section');panel.className='product-copy full';panel.dataset.productCopy='';
  panel.innerHTML=`<details><summary>✨ ${tr('تحسين بالذكاء الاصطناعي','Improve with AI')}</summary>${controls()}<p class="tip">${tr('يستخدم بيانات هذا النموذج. راجع الاقتراح ثم استخدمه؛ يُحفظ عند حفظ المنتج.','Uses this form’s details. Review and use a suggestion, then save the product.')}</p><p data-pc-status role="status" aria-live="polite"></p><div data-pc-preview></div></details>`;
  const grid=form.querySelector('.form-grid')||form;grid.prepend(panel);
  for(const [name,mode] of [['name','title'],['description','description']]){
   const input=form.elements.namedItem(name);if(!input)continue;
   const button=document.createElement('button');button.type='button';button.className='product-copy-shortcut';button.textContent='✨ '+tr(mode==='title'?'تحسين العنوان':'تحسين الوصف',mode==='title'?'Improve title':'Improve description');
   input.insertAdjacentElement('afterend',button);button.onclick=()=>{panel.querySelector('details').open=true;panel.querySelector('[data-pc-mode]').value=mode;panel.scrollIntoView({block:'nearest'});panel.querySelector('[data-pc-generate]').focus();};
  }
  const read=()=>Object.fromEntries([...Object.values(fields).map(x=>x[0]),'technicalSpecs','options','shortDescription'].map(k=>[k,form.elements.namedItem(k)?.value||'']));
  const copy=s=>Object.fromEntries(Object.entries(fields).map(([k,[name]])=>[k,s[name]]));
  const status=panel.querySelector('[data-pc-status]'),preview=panel.querySelector('[data-pc-preview]'),generate=panel.querySelector('[data-pc-generate]');
  let busy=false,proposal=null,baseline=null,serial=0;
  const dialog=form.closest('dialog');dialog?.addEventListener('close',()=>{serial++;busy=false;},{once:true});
  const alive=token=>form.isConnected&&(!dialog||dialog.open)&&token===serial;
  panel.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-pc-generate')&&!busy){
    busy=true;generate.disabled=true;proposal=null;preview.replaceChildren();status.textContent=tr('جاري كتابة الاقتراح…','Writing suggestion…');
    const token=++serial;baseline=read();
    try{
     const result=await request({mode:panel.querySelector('[data-pc-mode]').value,instruction:panel.querySelector('[data-pc-instruction]').value,source:baseline});
     if(!alive(token))return;proposal=result.proposal;
     preview.innerHTML=comparison(copy(baseline),proposal)+`<div class="product-copy-actions"><button type="button" data-pc-use>${tr('استخدام الاقتراح','Use suggestion')}</button><button type="button" data-pc-dismiss>${tr('إلغاء الاقتراح','Discard suggestion')}</button></div>`;
     status.textContent=tr('راجع الاسم والمواصفات قبل الاستخدام.','Check the name and specifications before use.');generate.textContent=tr('إعادة الصياغة','Regenerate');
    }catch(error){if(alive(token))status.textContent=error.message;}
    finally{if(alive(token)){busy=false;generate.disabled=false;}}
   }
   if(b.hasAttribute('data-pc-dismiss')){proposal=null;preview.replaceChildren();status.textContent='';}
   if(b.hasAttribute('data-pc-use')&&proposal){
    const now=read();if(Object.keys(baseline).some(k=>now[k]!==baseline[k])){status.textContent=tr('تغيّرت بيانات النموذج. أعد التوليد باستخدام بياناتك الجديدة.','Form details changed. Regenerate using your latest edits.');return;}
    for(const [k,v] of Object.entries(proposal)){const input=form.elements.namedItem(fields[k]?.[0]);if(input){input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));}}
    proposal=null;preview.replaceChildren();status.textContent=tr('أُضيف الاقتراح إلى النموذج. اضغط حفظ المنتج لاعتماده.','Suggestion added to the form. Save the product to apply it.');
   }
  });
 }
 function mountBulk(root,products,{save,onSaved,canSave=true}={}){
  let stopped=false,busy=false,saving=false,revision=0;
  const rows=products.map(p=>({id:p.id,version:p.version,before:rawCopy(p),sku:p.sku,status:'pending',proposal:null,selected:false,error:''}));
  root.classList.add('product-copy');
  root.innerHTML=`${controls()}<p>${tr('تظهر النتائج تباعًا هنا. اترك النافذة مفتوحة أثناء التوليد؛ يمكنك إيقافه ومراجعة ما اكتمل.','Results appear here as they finish. Keep this window open while generating; you can stop and review completed results.')}</p><p data-pc-status role="status" aria-live="polite"></p><div class="product-copy-actions"><button type="button" data-pc-stop hidden>${tr('إيقاف التوليد','Stop generating')}</button><button type="button" data-pc-save disabled>${tr('اعتماد المحدد','Apply selected')}</button></div><div data-pc-results></div>`;
  const dialog=root.closest('dialog'),status=root.querySelector('[data-pc-status]'),results=root.querySelector('[data-pc-results]'),generate=root.querySelector('[data-pc-generate]'),stop=root.querySelector('[data-pc-stop]'),apply=root.querySelector('[data-pc-save]');
  const alive=()=>root.isConnected&&(!dialog||dialog.open);
  dialog?.addEventListener('close',()=>{stopped=true;revision++;},{once:true});
  const label=s=>({pending:tr('بانتظار التوليد','Waiting'),generating:tr('جاري التوليد','Generating'),ready:tr('جاهز للمراجعة','Ready to review'),error:tr('تعذر التوليد','Generation failed'),saved:tr('تم الحفظ','Saved')})[s];
  const updateButtons=()=>{generate.disabled=busy||saving;apply.disabled=!canSave||busy||saving||!rows.some(r=>r.status==='ready'&&r.selected);stop.hidden=!busy;};
  const drawRow=r=>{
   let el=results.querySelector(`[data-pc-row="${r.id}"]`);if(!el){el=document.createElement('article');el.dataset.pcRow=r.id;el.className='product-copy-row';results.append(el);}
   el.innerHTML=`<header><label><input type="checkbox" data-pc-select ${r.selected?'checked':''} ${r.status!=='ready'||saving?'disabled':''}> ${esc(r.before.titleAr||r.before.titleEn)} <small>${esc(r.sku)}</small></label><span>${label(r.status)}</span></header>${r.error?`<p role="alert">${esc(r.error)}</p>`:''}${r.proposal?`<details><summary>${tr('مقارنة وتعديل الاقتراح','Compare and edit suggestion')}</summary>${comparison(r.before,r.proposal,r.status!=='saved')}</details>`:''}`;
  };
  rows.forEach(drawRow);updateButtons();if(!canSave)status.textContent=tr('اعتماد المجموعة يحتاج صلاحية الترجمة وتعديل المنتجات.','Applying a group requires translation and product edit permissions.');
  results.addEventListener('change',e=>{const r=rows.find(x=>x.id===e.target.closest('[data-pc-row]')?.dataset.pcRow);if(r&&e.target.hasAttribute('data-pc-select')){r.selected=e.target.checked;updateButtons();}});
  results.addEventListener('input',e=>{const r=rows.find(x=>x.id===e.target.closest('[data-pc-row]')?.dataset.pcRow),k=e.target.dataset.pcField;if(r?.status==='ready'&&fields[k])r.proposal[k]=e.target.value;});
  stop.onclick=()=>{stopped=true;stop.disabled=true;status.textContent=tr('سيتوقف بعد اكتمال الطلب الحالي.','Stopping after the current request.');};
  generate.onclick=async()=>{
   if(busy||saving)return;busy=true;stopped=false;stop.disabled=false;const token=++revision;
   // Regenerate the selected ready rows; unfinished/failed rows are always eligible.
   const queue=rows.filter(r=>r.status!=='saved'&&(r.status!=='ready'||r.selected));
   const mode=root.querySelector('[data-pc-mode]').value,instruction=root.querySelector('[data-pc-instruction]').value;
   updateButtons();let done=0;
   for(const r of queue){
    if(stopped||!alive()||token!==revision)break;
    const previous=r.proposal;r.status='generating';r.error='';drawRow(r);status.textContent=tr(`توليد ${done+1} من ${queue.length}…`,`Generating ${done+1} of ${queue.length}…`);
    try{const result=await request({productId:r.id,version:r.version,mode,instruction});if(!alive()||token!==revision)return;r.proposal=result.proposal;r.status='ready';r.selected=true;}
    catch(error){if(!alive()||token!==revision)return;r.proposal=previous;r.status=previous?'ready':'error';r.selected=false;r.error=error.message;}
    done++;drawRow(r);
   }
   if(!alive()||token!==revision)return;busy=false;generate.textContent=tr('توليد / إعادة صياغة المحدد','Generate / regenerate selected');status.textContent=tr(`اكتمل ${done} طلب. حدد الاقتراحات التي تريد اعتمادها.`,`${done} requests finished. Select suggestions to apply.`);updateButtons();
  };
  apply.onclick=async()=>{
   if(apply.disabled)return;const selected=rows.filter(r=>r.status==='ready'&&r.selected);
   if(selected.some(r=>Object.entries(r.proposal).some(([k,v])=>!String(v).trim()||v.length>(k.startsWith('title')?100:5000)))){status.textContent=tr('أكمل النصوص المقترحة قبل الحفظ.','Complete the suggested fields before saving.');return;}
   saving=true;updateButtons();root.querySelectorAll('[data-pc-select],[data-pc-field]').forEach(el=>el.disabled=true);
   // Small atomic groups preserve confirmed successes if a later group conflicts.
   let saved=0;
   try{
    for(let i=0;i<selected.length;i+=10){
     if(!alive())break;
     const group=selected.slice(i,i+10);await save(group.map(r=>({id:r.id,version:r.version,patch:{translation:r.proposal,...(r.proposal.titleAr?{product:r.proposal.titleAr}:{}),...(r.proposal.descriptionAr?{specs:r.proposal.descriptionAr}:{})}})));
     for(const r of group){r.status='saved';r.selected=false;drawRow(r);}saved+=group.length;
    }
    if(alive())status.textContent=tr(`تم حفظ ${saved} منتج.`,`${saved} products saved.`);
   }catch(error){if(alive())status.textContent=tr(`تم تأكيد حفظ ${saved} منتج. `,`${saved} products confirmed saved. `)+error.message;}
   finally{saving=false;if(saved)try{await onSaved?.();}catch{if(alive())status.textContent+=tr(' تعذر تحديث القائمة؛ حدّث الصفحة.',' List refresh failed; reload the page.');}if(alive()){rows.forEach(drawRow);updateButtons();}}
  };
 }
 window.MProductCopy={mountEditor,mountBulk};
})();
