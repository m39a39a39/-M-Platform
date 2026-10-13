'use strict';
(()=>{
 const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields={titleAr:['name','العنوان العربي','Arabic title'],titleEn:['nameEn','العنوان الإنجليزي','English title'],descriptionAr:['description','الوصف العربي','Arabic description'],descriptionEn:['descriptionEn','الوصف الإنجليزي','English description'],shortDescription:['shortDescription','الوصف المختصر','Short description'],technicalSpecs:['technicalSpecs','المواصفات المؤكدة','Confirmed specifications'],options:['options','الخيارات المؤكدة','Confirmed options']};
 async function analysisImages(form,product){
  const entries=form.productImages?.entries()||[],files=entries.filter(x=>x.file).map(x=>x.file).slice(0,3),images=[];
  const compress=async file=>{try{const out=await window.MStudioImages.filesToCompressedSources({files:[file]},{targetBytes:260*1024,maxDimension:1400});if(out[0]?.length<=480000)images.push(out[0]);}catch{/* An unavailable image must not block name-based completion. */}};
  for(const file of files)await compress(file);
  const kept=entries.filter(x=>!x.file).map(x=>x.src);
  for(const src of kept){
   if(images.length>=3)break;
   try{
    let response;
    if(/^\/api\/media\/[a-f0-9-]{36}$/i.test(src))response=await window.MStudioSession.raw(src,{auth:true});
    else{const url=new URL(src);if(url.protocol!=='https:'||!['ueeshop.ly200-cdn.com','www.amaya.com.cn','amaya.com.cn'].includes(url.hostname))continue;response=await fetch(url.href,{signal:AbortSignal.timeout(8000)});}
    if(response.ok)await compress(await response.blob());
   }catch{/* Keep any usable images and the supplied text. */}
  }
  return images;
 }
 function mount(form,{product={},categories=[],subcategories=[],canCreate=false}={}){
  if(!form||form.querySelector('[data-complete-panel]'))return;
  const panel=document.createElement('section');panel.className='product-copy full';panel.dataset.completePanel='';
  panel.innerHTML=`<button type="button" data-complete-generate>✨ ${tr('إكمال بيانات المنتج','Complete product details')}</button><p class="tip">${tr('يقترح البيانات من الاسم والصور لتراجعها قبل الحفظ.','Suggests details from the name and images for review before saving.')}</p><p data-complete-status role="status" aria-live="polite"></p><div data-complete-preview></div><button type="button" data-complete-undo hidden>${tr('التراجع عن التعبئة','Undo completion')}</button>`;
  (form.querySelector('[data-product-ai-slot]')||form.querySelector('.form-grid')||form).append(panel);
  const button=panel.querySelector('[data-complete-generate]'),status=panel.querySelector('[data-complete-status]'),preview=panel.querySelector('[data-complete-preview]'),dialog=form.closest('dialog');
  const read=()=>Object.fromEntries([...Object.values(fields).map(([name])=>name),'categoryId','subcategoryId'].map(k=>[k,form.elements.namedItem(k)?.value||'']));
  const signature=()=>JSON.stringify({values:read(),keep:[...form.querySelectorAll('[name=keep]:checked')].map(e=>e.value),images:form.productImages?.signature()});
  let token=0,busy=false,result=null,baseline='',applied=[];
  const clearSuggestions=()=>form.querySelectorAll('.product-ai-suggestion').forEach(el=>el.remove());
  const apply=(input,value)=>{const before=input.value;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));applied.push({input,before,value});panel.querySelector('[data-complete-undo]').hidden=false;let badge=input.parentElement.querySelector('.product-ai-badge');if(!badge){badge=document.createElement('small');badge.className='product-ai-badge';input.insertAdjacentElement('afterend',badge);}badge.textContent=tr('مقترح — قابل للتعديل','Suggested — editable');};
  dialog?.addEventListener('close',()=>{token++;result=null;},{once:true});
  const alive=t=>t===token&&form.isConnected&&(!dialog||dialog.open);
  const category=form.elements.namedItem('categoryId'),sub=form.elements.namedItem('subcategoryId');
  const fillSub=value=>{if(!sub)return;sub.innerHTML=`<option value="">${tr('بدون','None')}</option>`+subcategories.filter(c=>c.parentId===value&&c.active!==false).map(c=>`<option value="${esc(c.id)}">${esc(tr(c.nameAr,c.nameEn))}</option>`).join('');};
  category?.addEventListener('change',()=>{delete form.dataset.taxonomyProposal;form.querySelectorAll('[data-ai-taxonomy-option]').forEach(el=>el.remove());fillSub(category.value);});
  sub?.addEventListener('change',()=>{const t=form.dataset.taxonomyProposal?JSON.parse(form.dataset.taxonomyProposal):null;if(t?.newCategory){t.subcategoryId=sub.value;t.newSubcategory=null;form.dataset.taxonomyProposal=JSON.stringify(t);}else delete form.dataset.taxonomyProposal;});
  button.onclick=async()=>{
   if(busy)return;clearSuggestions();busy=true;button.disabled=true;result=null;preview.replaceChildren();baseline=signature();const source=read(),t=++token;
   status.textContent=tr('جاري تجهيز الاقتراح…','Preparing suggestion…');
   try{
    const images=await analysisImages(form,product);if(!alive(t))return;
    result=await window.MStudioSession.request('/api/v1/product-copy',{auth:true,method:'POST',body:{mode:'complete',source,images}});if(!alive(t))return;
    if(signature()!==baseline){result=null;status.textContent=tr('تغيّرت البيانات أثناء الإكمال؛ أعد المحاولة للاعتماد على أحدث تعديلاتك.','Details changed while completing; retry with your latest edits.');return;}
    const taxonomy=result.taxonomy,ref=result.taxonomyReference||{categories,subcategories};
    const categoryName=taxonomy?.newCategory?tr(taxonomy.newCategory.nameAr,taxonomy.newCategory.nameEn):ref.categories.find(c=>c.id===taxonomy?.categoryId);
    const subName=taxonomy?.newSubcategory?tr(taxonomy.newSubcategory.nameAr,taxonomy.newSubcategory.nameEn):ref.subcategories.find(c=>c.id===taxonomy?.subcategoryId);
    const label=v=>typeof v==='string'?v:v?tr(v.nameAr,v.nameEn):'';
    const isNew=!!(taxonomy?.newCategory||taxonomy?.newSubcategory),allowed=!isNew||canCreate;
    preview.innerHTML=''+(result.evidence?.length?`<details><summary>${tr('المعلومات المقروءة من الصور','Text read from images')}</summary><ul>${result.evidence.map(v=>`<li dir="auto">${esc(v)}</li>`).join('')}</ul></details>`:'')+(taxonomy?`<div class="product-copy-field"><label><input type="checkbox" data-complete-taxonomy ${allowed?'checked':'disabled'}> ${tr('استخدام التصنيف المقترح','Use suggested category')}: ${esc(label(categoryName))}${subName?' ← '+esc(label(subName)):''}</label>${isNew?`<p>${tr('ستُنشأ الفئة الجديدة عند حفظ المنتج.','The new category will be created when you save the product.')}</p>`:''}${!allowed?`<p>${tr('إنشاء الفئة يحتاج صلاحية الإعدادات؛ يمكنك استخدام بقية البيانات واختيار فئة موجودة.','Creating a category requires settings permission; you can use the copy and choose an existing category.')}</p>`:''}</div>`:'')+`<div class="product-copy-actions"><button type="button" data-complete-use>${tr('اعتماد التصنيف المقترح','Apply suggested category')}</button><button type="button" data-complete-discard>${tr('إخفاء الاقتراحات','Hide suggestions')}</button></div>`;
    for(const [key,value] of Object.entries(result.proposal||{})){
     const input=form.elements.namedItem(fields[key]?.[0]);if(!input||!value)continue;
     if(!input.value.trim()){apply(input,value);continue;}
     if(input.value===value)continue;
     const suggestion=document.createElement('div');suggestion.className='product-ai-suggestion';suggestion.innerHTML=`<small>${tr('اقتراح','Suggestion')}</small><p dir="auto">${esc(value)}</p><button type="button">${tr('استخدام بدل النص الحالي','Replace current text')}</button>`;
     input.parentElement.append(suggestion);suggestion.querySelector('button').onclick=()=>{apply(input,value);suggestion.remove();baseline=signature();};
    }
    if(!taxonomy)preview.querySelector('[data-complete-use]')?.remove();
    if(Object.entries(result.proposal||{}).some(([key,value])=>value&&form.elements.namedItem(fields[key]?.[0])?.closest('.product-extra'))){const extra=form.querySelector('.product-extra');if(extra)extra.open=true;}
    baseline=signature();
    status.textContent=tr('المعلومات غير الواضحة تُترك فارغة دون تخمين.','Unclear information is left blank without guessing.');
   }catch(error){if(alive(t))status.textContent=error.message;}
   finally{if(alive(t)){busy=false;button.disabled=false;button.textContent=tr('✨ إعادة إكمال البيانات','✨ Complete details again');}}
  };
  panel.addEventListener('click',e=>{
   if(e.target.closest('[data-complete-undo]')){for(const {input,before,value} of applied.slice().reverse())if(input.value===value){input.value=before;input.dispatchEvent(new Event('input',{bubbles:true}));}applied=[];panel.querySelector('[data-complete-undo]').hidden=true;clearSuggestions();form.querySelectorAll('.product-ai-badge').forEach(el=>el.remove());baseline=signature();status.textContent=tr('تم التراجع عن التعبئة مع الاحتفاظ بتعديلاتك اليدوية.','Completion undone; manual edits preserved.');}
   if(e.target.closest('[data-complete-discard]')){clearSuggestions();result=null;preview.replaceChildren();status.textContent='';}
   if(!e.target.closest('[data-complete-use]')||!result)return;
   if(signature()!==baseline){status.textContent=tr('تغيّر الاسم أو الصور أو البيانات؛ أعد التوليد لحماية تعديلاتك.','Name, images or details changed; regenerate to preserve your edits.');return;}

   if(preview.querySelector('[data-complete-taxonomy]')?.checked&&result.taxonomy){
    const t=result.taxonomy,ref=result.taxonomyReference||{categories,subcategories};
    form.querySelectorAll('[data-ai-taxonomy-option]').forEach(el=>el.remove());
    const choose=(select,id,n)=>{if(!select)return;if(![...select.options].some(o=>o.value===id)){const option=new Option(n,id);option.dataset.aiTaxonomyOption='';select.add(option);}select.value=id;};
    const c=t.newCategory||ref.categories.find(c=>c.id===t.categoryId);
    choose(category,t.newCategory?'ai-new-category':t.categoryId,tr(c?.nameAr||'',c?.nameEn||''));
    fillSub(category?.value);
    const s=t.newSubcategory||ref.subcategories.find(s=>s.id===t.subcategoryId);
    if(s)choose(sub,t.newSubcategory?'ai-new-subcategory':t.subcategoryId,tr(s.nameAr,s.nameEn));
    if(t.newCategory||t.newSubcategory)form.dataset.taxonomyProposal=JSON.stringify(t);else delete form.dataset.taxonomyProposal;
   }
   if(form.elements.namedItem('sku')&&!form.elements.namedItem('sku').value.trim())form.elements.namedItem('sku').value='MG-'+String(product.id||crypto.randomUUID()).replace(/[^A-Za-z0-9]/g,'').slice(0,24).toUpperCase();
   result=null;preview.querySelector('[data-complete-use]')?.remove();preview.querySelector('[data-complete-taxonomy]')?.closest('.product-copy-field')?.remove();status.textContent=tr('أُضيف التصنيف للنموذج. راجع البيانات ثم احفظ المنتج.','Details added. Complete your selling terms, then save the product to apply.');
  });
 }
 window.MProductComplete={mount};
})();

