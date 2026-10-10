'use strict';
(()=>{
 let root=null,categories=[],jobs=[],job=null,busy=false,error='',notice='',loaded=false,canPublish=false,timer=null,epoch=0;
 let selection={categoryId:'',limit:'100',onlyNeeding:true,skus:''},filter='all';
 const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
 const esc=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const api=body=>window.MStudioSession.request('/api/v1/ai-catalog',{auth:true,method:'POST',body});
 const names={draft:['جاهزة للبدء','Ready to start'],submitting:['جاري إرسال الدفعة','Submitting'],queued:['جاري التحليل في الخلفية','Processing in background'],completed:['اكتملت المعالجة','Processing complete'],failed:['تعذر إرسال الدفعة','Submission failed'],pending:['بانتظار التحليل','Pending'],ready:['جاهز للاعتماد','Ready to approve'],review:['يحتاج مراجعة','Needs review'],error:['تعذر التحليل','Analysis failed'],applied:['تم الاعتماد','Applied'],skipped:['مستبعد','Skipped'],conflict:['تغيّر المنتج؛ لم يُعدّل','Product changed; skipped'],reverted:['تم التراجع','Reverted'],revert_conflict:['تغيّر المنتج بعد الاعتماد؛ لم يُستبدل','Changed after approval; preserved']};
 const label=x=>names[x]?tr(...names[x]):x;
 const reasons={missing_image:['لا توجد صورة مناسبة؛ أضف المعلومات يدويًا','No usable image; supply verified information'],missing_title:['عنوان بلغة واحدة أو ناقص','Missing title'],missing_description:['وصف بلغة واحدة أو ناقص','Missing description'],short_title:['عنوان قصير','Short title'],short_description:['وصف قصير','Short description'],repeated_description:['الوصف يكرر العنوان','Repeated description'],unverified_numbers:['أرقام غير مثبتة في البيانات المقروءة','Numbers not grounded in source'],invalid_or_failed_response:['استجابة غير مكتملة؛ راجع أو استبعد المنتج','Incomplete response; review or skip']};
 const reason=x=>reasons[x]?tr(...reasons[x]):x;
 const texts={titleAr:['العنوان العربي','Arabic title'],titleEn:['العنوان الإنجليزي','English title'],descriptionAr:['الوصف العربي','Arabic description'],descriptionEn:['الوصف الإنجليزي','English description'],shortDescription:['وصف مختصر','Short description']};
 const button=(action,text,extra='')=>`<button type="button" data-copy-action="${action}" ${extra} ${busy?'disabled':''}>${esc(text)}</button>`;
 function itemCard(item){
  const editable=job.status==='completed'&&['ready','review','error','skipped'].includes(item.status);
  return `<details class="copy-item" data-copy-item="${esc(item.id)}"><summary><strong>${esc(item.sku||item.original.titleAr||item.id)}</strong><span>${esc(label(item.status))}</span></summary>
  <p>${esc((item.reasons||[]).map(reason).join(' · '))}</p>
  ${item.visibleName?`<p><b>${esc(tr('الاسم المقروء من الصورة','Name read from image'))}:</b> ${esc(item.visibleName)}</p>`:''}
  ${item.evidence?.length?`<p>${esc(tr('المعلومات المقروءة','Read facts'))}: ${esc(item.evidence.join(' · '))}</p>`:''}
  ${item.issues?.length?`<p class="mg-ai-error">${esc(item.issues.map(reason).join(' · '))}</p>`:''}
  <form data-copy-review="${esc(item.id)}"><div class="copy-comparison">${Object.entries(texts).map(([key,title])=>`<label><strong>${esc(tr(...title))}</strong><small>${esc(tr('الحالي','Current'))}: ${esc(item.original[key]||'—')}</small><textarea name="${key}" rows="${key.includes('description')||key==='shortDescription'?3:2}" maxlength="${key.startsWith('title')?100:key==='shortDescription'?500:1600}" ${editable?'required':'readonly'} dir="${key.endsWith('En')?'ltr':'auto'}">${esc(item.proposal?.[key]||'')}</textarea></label>`).join('')}</div>
  ${editable?`<p>${esc(tr('حفظ المراجعة يجعل المنتج جاهزًا للاعتماد الجماعي. تأكد من صحة المعلومات.','Saving marks this product ready for batch approval. Verify the facts.'))}</p><button type="submit" ${busy?'disabled':''}>${esc(tr('حفظ المراجعة','Save review'))}</button> ${button('skip',tr('استبعاد','Skip'),`data-product-id="${esc(item.id)}"`)}`:''}</form></details>`;
 }
 function draw(){
  if(!root?.isConnected)return;
  const c=job?.counts||{},items=(job?.items||[]).filter(x=>filter==='all'||x.status===filter);
  root.innerHTML=`<section class="mg-ai-panel copy-panel"><div class="mg-ai-panel-head"><div><strong>${esc(tr('تحسين المنتجات جماعيًا من الصور','Bulk product copy from images'))}</strong><small>${esc(tr('اختر المنتجات مرة واحدة، ثم اعتمد النتائج الواضحة دفعة واحدة.','Select once, then approve clear results in one batch.'))}</small></div>${button('list',tr('تحديث الدفعات','Refresh batches'))}</div>
  <p>${esc(tr('تستمر المعالجة بعد إغلاق الصفحة وقد تستغرق حتى 24 ساعة. الأسعار والمخزون لا تتغير، وتكلفة التحليل حسب استخدام OpenAI.','Processing continues after you close the page and may take up to 24 hours. Prices and inventory stay unchanged. OpenAI usage charges apply.'))}</p>
  <form data-copy-create class="copy-selection"><label>${esc(tr('التصنيف','Category'))}<select name="categoryId"><option value="">${esc(tr('جميع التصنيفات','All categories'))}</option>${categories.map(x=>`<option value="${esc(x.id)}" ${selection.categoryId===x.id?'selected':''}>${esc(tr(x.nameAr||x.id,x.nameEn||x.nameAr||x.id))}</option>`).join('')}</select></label>
  <label>${esc(tr('عدد المنتجات في الدفعة','Products per batch'))}<select name="limit">${[20,50,100,500,1000].map(n=>`<option ${String(n)===selection.limit?'selected':''}>${n}</option>`).join('')}</select></label>
  <label class="copy-check"><input name="onlyNeeding" type="checkbox" ${selection.onlyNeeding?'checked':''}>${esc(tr('الأولوية للمنتجات التي تحتاج تحسينًا','Only products needing improvement'))}</label>
  <label>${esc(tr('SKU محددة (اختياري، تفصل بفاصلة أو سطر)','Specific SKUs (optional, comma or newline separated)'))}<textarea name="skus" rows="2" maxlength="20000">${esc(selection.skus)}</textarea></label>
  <button type="submit" class="primary" ${busy?'disabled':''}>${esc(busy?tr('جاري التنفيذ…','Working…'):tr('بدء التحسين الجماعي','Start bulk improvement'))}</button></form>
  <p role="status" aria-live="polite">${esc(notice)}</p>${error?`<p role="alert" class="mg-ai-error">${esc(error)}</p>`:''}
  <div class="copy-jobs">${jobs.map(x=>button('open',new Date(x.created_at).toLocaleDateString()+' · '+label(x.status),`data-job-id="${esc(x.id)}"`)).join('')}</div>
  ${job?`<section><h3>${esc(label(job.status))} · ${job.total} ${esc(tr('منتج','products'))}</h3><div class="copy-counts">${Object.entries(c).map(([k,v])=>`<span>${esc(label(k))}: ${v}</span>`).join('')}</div>${job.error?`<p class="mg-ai-error">${esc(job.error)}</p>`:''}
   <div class="copy-actions">${button('refresh',tr('تحديث الحالة','Refresh status'))}${job.status==='draft'?button('submit',tr('إرسال الدفعة','Submit batch')):''}${job.status==='completed'&&canPublish&&c.ready?button('apply',tr('اعتماد جميع الجاهزة','Apply all ready')+' ('+c.ready+')'):''}${canPublish&&c.applied?button('revert',tr('التراجع عن الدفعة','Undo batch')):''}</div>
   ${job.status==='completed'&&!canPublish?`<p>${esc(tr('يمكنك تجهيز المقترحات؛ الاعتماد يتطلب صلاحيات الترجمة والنشر.','You can prepare proposals; applying requires translation and publishing permissions.'))}</p>`:''}
   <label>${esc(tr('عرض','Show'))}<select data-copy-filter><option value="all">${esc(tr('الكل في هذه الصفحة','All on this page'))}</option>${Object.keys(c).map(k=>`<option value="${esc(k)}" ${filter===k?'selected':''}>${esc(label(k))}</option>`).join('')}</select></label>
   <div>${items.map(itemCard).join('')||`<p>${esc(tr('لا توجد نتائج في هذه الصفحة لهذا الفلتر','No matching results on this page'))}</p>`}</div>
   <div class="copy-actions">${job.page>0?button('prev',tr('السابق','Previous')):''}<span>${job.page+1} / ${Math.max(1,Math.ceil(job.total/30))}</span>${(job.page+1)*30<job.total?button('next',tr('التالي','Next')):''}</div></section>`:''}</section>`;
  schedule();
 }
 function schedule(){clearTimeout(timer);if(job&&['queued','submitting'].includes(job.status))timer=setTimeout(()=>{if(root?.isConnected&&!busy&&!root.querySelector('details[open]')&&!root.contains(document.activeElement))void run('refresh');},30000);}
 async function loadList(token=epoch){const data=await api({action:'list'});if(token!==epoch)return;jobs=data.jobs;canPublish=data.canPublish;loaded=true;}
 async function run(action,extra={}){
  if(busy)return;busy=true;error='';notice='';const token=epoch;draw();
  try{
   if(action==='list'){await loadList(token);}
   else if(action==='create'){
    const data=await api({action:'create',requestId:crypto.randomUUID(),categoryId:selection.categoryId,limit:Number(selection.limit),onlyNeeding:selection.onlyNeeding,skus:selection.skus?selection.skus.split(/[,،\n]+/).map(x=>x.trim()).filter(Boolean):undefined});if(token!==epoch)return;
    job=data;draw();const submitted=await api({action:'submit',id:job.id});if(token!==epoch)return;job=submitted;await loadList(token);
   }else{
    const data=await api({action:action==='open'||action==='prev'||action==='next'?'get':action,id:extra.id||job.id,version:job?.version,page:action==='prev'?job.page-1:action==='next'?job.page+1:action==='open'?0:job?.page||0,...extra});if(token!==epoch)return;job=data;
    if(data.result)notice=tr('تم تعديل ','Changed ')+data.result.changed+tr(' منتج. تعارضات محفوظة دون استبدال: ',' products. Conflicts preserved: ')+data.result.conflicts;
    if(['apply','revert','submit'].includes(action))await loadList(token);
   }
  }catch(e){if(token===epoch)error=e.message;}
  finally{if(token===epoch){busy=false;draw();}}
 }
 document.addEventListener('click',event=>{
  const target=event.target.closest('[data-copy-action]');if(!target||!root?.contains(target))return;
  const action=target.dataset.copyAction;
  if(action==='revert'&&!window.confirm(tr('التراجع عن النصوص التي اعتمدتها هذه الدفعة؟ لن نستبدل المنتجات التي تغيّرت بعدها.','Undo text applied by this batch? Products changed since approval will be preserved.')))return;
  void run(action,{...(target.dataset.jobId?{id:target.dataset.jobId}:{}),...(target.dataset.productId?{productId:target.dataset.productId}:{})});
 });
 document.addEventListener('submit',event=>{
  if(!root?.contains(event.target))return;
  const form=event.target;
  if(form.matches('[data-copy-create]')){event.preventDefault();selection={categoryId:form.elements.categoryId.value,limit:form.elements.limit.value,onlyNeeding:form.elements.onlyNeeding.checked,skus:form.elements.skus.value};void run('create');}
  if(form.matches('[data-copy-review]')){event.preventDefault();const proposal=Object.fromEntries(Object.keys(texts).map(k=>[k,form.elements[k].value]));void run('review',{productId:form.dataset.copyReview,proposal});}
 });
 document.addEventListener('input',event=>{const form=event.target.closest('[data-copy-create]');if(form&&root?.contains(form)){selection={categoryId:form.elements.categoryId.value,limit:form.elements.limit.value,onlyNeeding:form.elements.onlyNeeding.checked,skus:form.elements.skus.value};}});
 document.addEventListener('change',event=>{if(root?.contains(event.target)&&event.target.matches('[data-copy-filter]')){filter=event.target.value;draw();}});
 window.MCatalogAI={render(target,options={}){root=target;if(!root)return;categories=options.categories||[];draw();if(!loaded&&!busy)void run('list');},reset(){epoch++;clearTimeout(timer);root=null;jobs=[];job=null;busy=false;loaded=false;canPublish=false;error='';notice='';}};
})();
