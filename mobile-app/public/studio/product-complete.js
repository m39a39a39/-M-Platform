'use strict';
(()=>{
 const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields={titleAr:['name','العنوان العربي','Arabic title'],titleEn:['nameEn','العنوان الإنجليزي','English title'],descriptionAr:['description','الوصف العربي','Arabic description'],descriptionEn:['descriptionEn','الوصف الإنجليزي','English description'],shortDescription:['shortDescription','الوصف المختصر','Short description'],technicalSpecs:['technicalSpecs','المواصفات المؤكدة','Confirmed specifications'],options:['options','الخيارات المؤكدة','Confirmed options']};
 async function analysisImages(form,product){
  const files=[...(form.elements.namedItem('photos')?.files||[])].slice(0,3),images=[];
  const compress=async file=>{try{const out=await window.MStudioImages.filesToCompressedSources({files:[file]},{targetBytes:260*1024,maxDimension:1400});if(out[0]?.length<=480000)images.push(out[0]);}catch{/* An unavailable image must not block name-based completion. */}};
  for(const file of files)await compress(file);
  const kept=[...form.querySelectorAll('[name=keep]:checked')].map(el=>product.images?.[Number(el.value)]).filter(Boolean);
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
  panel.innerHTML=`<button type="button" data-complete-generate>✨ ${tr('إكمال بيانات المنتج من الاسم والصور','Complete product from name and images')}</button><p class="tip">${tr('يكتفي بالمعلومات الواضحة ويترك المواصفات غير المؤكدة فارغة. راجع الاقتراح قبل حفظ المنتج.','Uses only clear information and leaves unknown specifications blank. Review before saving.')}</p><p data-complete-status role="status" aria-live="polite"></p><div data-complete-preview></div>`;
  (form.querySelector('.form-grid')||form).prepend(panel);
  const button=panel.querySelector('[data-complete-generate]'),status=panel.querySelector('[data-complete-status]'),preview=panel.querySelector('[data-complete-preview]'),dialog=form.closest('dialog');
  const read=()=>Object.fromEntries([...Object.values(fields).map(([name])=>name),'categoryId','subcategoryId'].map(k=>[k,form.elements.namedItem(k)?.value||'']));
  const signature=()=>JSON.stringify({values:read(),keep:[...form.querySelectorAll('[name=keep]:checked')].map(e=>e.value),files:[...(form.elements.namedItem('photos')?.files||[])].map(f=>[f.name,f.size,f.lastModified])});
  let token=0,busy=false,result=null,baseline='';
  dialog?.addEventListener('close',()=>{token++;result=null;},{once:true});
  const alive=t=>t===token&&form.isConnected&&(!dialog||dialog.open);
  const category=form.elements.namedItem('categoryId'),sub=form.elements.namedItem('subcategoryId');
  const fillSub=value=>{if(!sub)return;sub.innerHTML=`<option value="">${tr('بدون','None')}</option>`+subcategories.filter(c=>c.parentId===value&&c.active!==false).map(c=>`<option value="${esc(c.id)}">${esc(tr(c.nameAr,c.nameEn))}</option>`).join('');};
  category?.addEventListener('change',()=>{delete form.dataset.taxonomyProposal;form.querySelectorAll('[data-ai-taxonomy-option]').forEach(el=>el.remove());fillSub(category.value);});
  sub?.addEventListener('change',()=>{const t=form.dataset.taxonomyProposal?JSON.parse(form.dataset.taxonomyProposal):null;if(t?.newCategory){t.subcategoryId=sub.value;t.newSubcategory=null;form.dataset.taxonomyProposal=JSON.stringify(t);}else delete form.dataset.taxonomyProposal;});
  button.onclick=async()=>{
   if(busy)return;busy=true;button.disabled=true;result=null;preview.replaceChildren();baseline=signature();const source=read(),t=++token;
   status.textContent=tr('جاري تجهيز الاقتراح…','Preparing suggestion…');
   try{
    const images=await analysisImages(form,product);if(!alive(t))return;
    result=await window.MStudioSession.request('/api/v1/product-copy',{auth:true,method:'POST',body:{mode:'complete',source,images}});if(!alive(t))return;
    const taxonomy=result.taxonomy,ref=result.taxonomyReference||{categories,subcategories};
    const categoryName=taxonomy?.newCategory?tr(taxonomy.newCategory.nameAr,taxonomy.newCategory.nameEn):ref.categories.find(c=>c.id===taxonomy?.categoryId);
    const subName=taxonomy?.newSubcategory?tr(taxonomy.newSubcategory.nameAr,taxonomy.newSubcategory.nameEn):ref.subcategories.find(c=>c.id===taxonomy?.subcategoryId);
    const label=v=>typeof v==='string'?v:v?tr(v.nameAr,v.nameEn):'';
    const isNew=!!(taxonomy?.newCategory||taxonomy?.newSubcategory),allowed=!isNew||canCreate;
    preview.innerHTML=Object.entries(result.proposal).filter(([k])=>fields[k]).map(([k,v])=>`<div class="product-copy-field"><strong>${tr(fields[k][1],fields[k][2])}</strong><p dir="auto">${esc(v||tr('غير مؤكد — سيبقى الحقل كما هو','Unconfirmed — existing field will be kept'))}</p></div>`).join('')+(result.evidence?.length?`<details><summary>${tr('المعلومات المقروءة من الصور','Text read from images')}</summary><ul>${result.evidence.map(v=>`<li dir="auto">${esc(v)}</li>`).join('')}</ul></details>`:'')+(taxonomy?`<div class="product-copy-field"><label><input type="checkbox" data-complete-taxonomy ${allowed?'checked':'disabled'}> ${tr('استخدام التصنيف المقترح','Use suggested category')}: ${esc(label(categoryName))}${subName?' ← '+esc(label(subName)):''}</label>${isNew?`<p>${tr('ستُنشأ الفئة الجديدة عند حفظ المنتج.','The new category will be created when you save the product.')}</p>`:''}${!allowed?`<p>${tr('إنشاء الفئة يحتاج صلاحية الإعدادات؛ يمكنك استخدام بقية البيانات واختيار فئة موجودة.','Creating a category requires settings permission; you can use the copy and choose an existing category.')}</p>`:''}</div>`:'')+`<div class="product-copy-actions"><button type="button" data-complete-use>${tr('استخدام البيانات المقترحة','Use suggested details')}</button><button type="button" data-complete-discard>${tr('إلغاء الاقتراح','Discard suggestion')}</button></div>`;
    status.textContent=tr('المعلومات غير الواضحة تُترك فارغة دون تخمين.','Unclear information is left blank without guessing.');
   }catch(error){if(alive(t))status.textContent=error.message;}
   finally{if(alive(t)){busy=false;button.disabled=false;button.textContent=tr('✨ إكمال / إعادة توليد البيانات','✨ Complete / regenerate details');}}
  };
  panel.addEventListener('click',e=>{
   if(e.target.closest('[data-complete-discard]')){result=null;preview.replaceChildren();status.textContent='';}
   if(!e.target.closest('[data-complete-use]')||!result)return;
   if(signature()!==baseline){status.textContent=tr('تغيّر الاسم أو الصور أو البيانات؛ أعد التوليد لحماية تعديلاتك.','Name, images or details changed; regenerate to preserve your edits.');return;}
   for(const [k,v] of Object.entries(result.proposal)){const input=form.elements.namedItem(fields[k]?.[0]);if(input&&v){input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));}}
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
   result=null;preview.replaceChildren();status.textContent=tr('أُضيفت البيانات للنموذج. أكمل بيانات البيع ثم احفظ المنتج لاعتمادها.','Details added. Complete your selling terms, then save the product to apply.');
  });
 }
 window.MProductComplete={mount};
})();
