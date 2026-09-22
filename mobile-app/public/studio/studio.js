'use strict';

StoreRules.normalize(state.draft);StoreRules.normalize(state.published);
state.history=(state.history||[]).map(h=>({...h,data:StoreRules.normalize(h.data)}));
let committedState=clone(state),undoItems=[],redoItems=[],editGroup=null,lastEditGroup=null,historyMove=false;
let collectionEdit=null,productEdit=null,activeProductTab='basic',productImageIndex=0;
paths.undo='M3 10h8a8 8 0 0 1 8 8 M3 10l5-5 M3 10l5 5';
paths.redo='M21 10h-8a8 8 0 0 0-8 8 M21 10l-5-5 M21 10l-5 5';
paths.compare='M8 3v18 M16 3v18 M3 7h10 M11 17h10';

function persist(){
  StoreRules.normalize(state.draft);
  const before=committedState.draft,modified=JSON.stringify(before)!==JSON.stringify(state.draft);
  if(modified&&!historyMove){
    if(!editGroup||lastEditGroup!==editGroup){undoItems.push(clone(before));undoItems=undoItems.slice(-20)}
    redoItems=[];lastEditGroup=editGroup;
  }
  committedState=clone(state);refreshEditingTools();return true;
}
function refreshEditingTools(){
  const host=$('#editing-tools');if(!host)return;
  const count=StoreRules.differences(state.published,state.draft).length;
  host.innerHTML=ib('تراجع','undo','undo',`${undoItems.length?'':'disabled'} title="تراجع عن آخر تعديل في هذه الجلسة"`)+ib('إعادة','redo','redo',`${redoItems.length?'':'disabled'}`)+btn(`مراجعة التغييرات${count?' ('+fmt(count)+')':''}`,'review','compare','review-button');
}
function travelHistory(direction){
  const from=direction==='undo'?undoItems:redoItems,to=direction==='undo'?redoItems:undoItems;
  if(!from.length)return;const current=clone(state.draft),next=from[from.length-1];
  historyMove=true;state.draft=clone(next);const ok=persist();historyMove=false;
  if(ok){from.pop();to.push(current);lastEditGroup=null;render();toast(direction==='undo'?'تم التراجع عن التعديل':'تمت إعادة التعديل')}
}
document.addEventListener('focusin',e=>{if(e.target.matches('[data-section-field],[data-theme]'))editGroup=uid()});
document.addEventListener('focusout',e=>{if(e.target.matches('[data-section-field],[data-theme]'))editGroup=null});

function collectionsView(){
  const data=state.draft;
  return heading('مجموعات المنتجات','اختر منتجات كل مجموعة ورتّب ظهورها في واجهة متجرك.',btn('إضافة مجموعة','new-collection','plus','primary'))+
    `<div class="notice">اربط المجموعة بقسم «مجموعة منتجات» في محرر الرئيسية. المنتجات المسودة أو المؤرشفة لا تظهر للعملاء.</div><div class="cards">`+
    data.collections.map(c=>{const products=c.productIds.map(id=>data.products.find(p=>p.id===id)).filter(Boolean),used=data.sections.filter(s=>s.collectionId===c.id).length;return `<article class="panel collection-card"><div class="panel-head"><span class="section-icon">${icon('layers')}</span>${tag(c.active?'مفعّلة':'مخفية',c.active?'':'gray')}</div><div class="panel-body"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.description||'مجموعة مخصصة')}</p><div class="collection-thumbs">${products.slice(0,4).map(p=>thumb(p)).join('')||'<small>لم تُضف منتجات بعد</small>'}</div><div class="row between"><small>${fmt(products.length)} منتجات · ${fmt(products.filter(p=>p.status==='active').length)} منشورة</small><small>${fmt(used)} أقسام مرتبطة</small></div><div class="card-actions">${btn('تعديل المجموعة','edit-collection','edit','',`data-id="${c.id}"`)}${ib('حذف المجموعة','delete-collection','trash',`data-id="${c.id}"`)}</div></div></article>`}).join('')+
    `${data.collections.length?'':'<div class="panel empty" style="grid-column:1/-1"><h2>أنشئ أول مجموعة</h2><p>مثل «منتجات من الصين» أو «مختارات الموسم».</p></div>'}</div>`;
}
function editCollection(id){
  const existing=state.draft.collections.find(c=>c.id===id);
  collectionEdit=clone(existing||{id:uid(),name:'',description:'',active:true,productIds:[]});
  formModal(existing?'تعديل المجموعة':'إضافة مجموعة',field('اسم المجموعة','name',collectionEdit.name,'text','required maxlength="80"')+area('وصف المجموعة','description',collectionEdit.description)+`<label class="checkline"><input type="checkbox" name="active" ${collectionEdit.active?'checked':''}>إظهار المجموعة في المتجر</label><div class="form-section-head"><h3>اختيار المنتجات</h3><small>ترتيب القائمة هو ترتيب ظهورها</small></div><div id="collection-picker"></div>`,fd=>{
    const name=fd.get('name').trim();if(!name)throw Error('أدخل اسم المجموعة.');
    if(state.draft.collections.some(c=>c.id!==collectionEdit.id&&c.name===name))throw Error('اسم المجموعة مستخدم بالفعل.');
    Object.assign(collectionEdit,{name,description:fd.get('description').trim(),active:fd.has('active')});
    if(existing)Object.assign(existing,clone(collectionEdit));else state.draft.collections.push(clone(collectionEdit));
    closeModal();changed('تم حفظ المجموعة');
  });
  $('#dialog').classList.add('wide-dialog');renderCollectionPicker();
}
function renderCollectionPicker(){
  const selectedProducts=collectionEdit.productIds.map(id=>state.draft.products.find(p=>p.id===id)).filter(Boolean),available=state.draft.products.filter(p=>!collectionEdit.productIds.includes(p.id));
  $('#collection-picker').innerHTML=`<div class="picked-products">${selectedProducts.map((p,i)=>`<div class="picker-row"><span class="rank">${fmt(i+1)}</span>${thumb(p)}<div class="picker-name"><strong>${esc(p.name)}</strong><small>${statuses[p.status][0]}</small></div>${ib('رفع '+p.name,'collection-up','up',`data-index="${i}" ${i?'':'disabled'}`)}${ib('خفض '+p.name,'collection-down','down',`data-index="${i}" ${i===selectedProducts.length-1?'disabled':''}`)}${ib('إزالة '+p.name,'collection-remove','close',`data-id="${p.id}"`)}</div>`).join('')||'<div class="empty compact">اختر منتجات من القائمة أدناه.</div>'}</div><h3 class="form-section-head">منتجات متاحة</h3>${available.map(p=>`<button type="button" class="picker-row add-pick" data-action="collection-add" data-id="${p.id}">${thumb(p)}<span class="picker-name">${esc(p.name)}<small>${esc(p.sku)} · ${statuses[p.status][0]}</small></span>${icon('plus')}</button>`).join('')||'<p class="help">أضفت جميع المنتجات.</p>'}`;
}
function sectionSettings(s){
  let html=baseSectionSettings(s);
  if(s.type==='products'){
    const fieldHtml=`<div class="field"><label for="section-collection">مصدر المنتجات</label><select id="section-collection" data-section-field="collectionId"><option value="">جميع المنتجات المنشورة</option>${state.draft.collections.map(c=>`<option value="${c.id}" ${s.collectionId===c.id?'selected':''}>${esc(c.name)}${c.active?'':' (مخفية)'}</option>`).join('')}</select></div><div class="field"><label for="section-limit">عدد المنتجات المعروضة</label><select id="section-limit" data-section-field="limit">${[3,6,9,12,24].map(n=>`<option value="${n}" ${Number(s.limit)===n?'selected':''}>${fmt(n)}</option>`).join('')}</select></div><p class="help">تُعرض المنتجات المنشورة بترتيب المجموعة. المجموعة المخفية لا تعرض منتجات.</p>`;
    html=html.replace('<p class="help">يعرض أول ٦ منتجات منشورة من قائمة المنتجات.</p>',fieldHtml);
  }
  return html;
}

function productTabs(){return `<div class="product-tabs" role="tablist" aria-label="أقسام المنتج">${[['basic','البيانات الأساسية'],['details','التوريد والمواصفات'],['images','الصور والفيديو'],['pricing','أسعار الجملة']].map(([id,title])=>`<button type="button" role="tab" id="product-tab-${id}" aria-controls="product-panel-${id}" aria-selected="${activeProductTab===id}" data-action="product-tab" data-tab="${id}" class="${activeProductTab===id?'active':''}">${title}</button>`).join('')}</div>`}
function prototypeEditProduct(id){
  const existing=state.draft.products.find(p=>p.id===id);
  productEdit=clone(existing||{id:uid(),name:'',sku:'',category:state.draft.categories[0]?.name||'',price:1,moq:1,status:'draft',image:'',images:[],linked:false,description:'',country:'',supplier:'',leadDays:0,colors:[],sizes:[],specs:[],video:'',pricingMode:'fixed',tiers:[]});
  activeProductTab='basic';
  formModal(existing?'تعديل المنتج':'إضافة منتج',productTabs()+
    `<section id="product-panel-basic" class="product-panel" role="tabpanel" aria-labelledby="product-tab-basic"><div class="form-grid">${field('اسم المنتج','name',productEdit.name,'text','required maxlength="100"')}${field('رمز المنتج SKU','sku',productEdit.sku,'text','required maxlength="50"')}${selectField('التصنيف','category',[['','غير مصنف'],...state.draft.categories.map(c=>[c.name,c.name])],productEdit.category)}${selectField('الحالة','status',Object.entries(statuses).map(([k,v])=>[k,v[0]]),productEdit.status)}<div class="full">${area('وصف المنتج','description',productEdit.description)}</div></div></section>`+
    `<section id="product-panel-details" class="product-panel" role="tabpanel" aria-labelledby="product-tab-details" hidden><div class="form-grid">${field('بلد التوريد','country',productEdit.country,'text','maxlength="80"')}${field('المورد (للإدارة فقط)','supplier',productEdit.supplier,'text','maxlength="100"')}${field('مدة التجهيز بالأيام','leadDays',productEdit.leadDays,'number','min="0" step="1" required')}${field('الألوان — افصل بفاصلة','colors',productEdit.colors.join('، '),'text','maxlength="250"')}${field('المقاسات — افصل بفاصلة','sizes',productEdit.sizes.join('، '),'text','maxlength="250"')}</div><div class="form-section-head"><h3>المواصفات</h3>${btn('إضافة مواصفة','add-spec','plus')}</div><div id="spec-rows"></div><p class="help">الألوان والمقاسات خيارات وصفية في هذه النسخة؛ السعر والكمية موحّدان للمنتج.</p></section>`+
    `<section id="product-panel-images" class="product-panel" role="tabpanel" aria-labelledby="product-tab-images" hidden><div class="form-section-head"><h3>صور المنتج</h3><small>حتى ٦ صور</small></div><div id="product-gallery-editor"></div><div class="upload"><label for="product-images">إضافة صور من الجهاز</label><input id="product-images" type="file" accept="image/png,image/jpeg,image/webp" multiple><p class="help">حتى ١ ميجابايت للصورة. أول صورة هي الصورة الأساسية.</p></div>${state.draft.media.length?`<div class="field" style="margin-top:16px"><label for="library-image">أو اختر من المكتبة</label><div class="row"><select id="library-image"><option value="">اختر صورة</option>${state.draft.media.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>${btn('إضافة','add-library-image','plus')}</div></div>`:''}${field('رابط فيديو للمنتج (HTTPS)','video',productEdit.video,'url','placeholder="https://…"')}<p class="help">يظهر كرابط خارجي اختياري في تفاصيل المنتج، ولا يفتح إلا عند الضغط عليه.</p></section>`+
    `<section id="product-panel-pricing" class="product-panel" role="tabpanel" aria-labelledby="product-tab-pricing" hidden>${selectField('طريقة التسعير','pricingMode',[['fixed','أسعار محددة حسب الكمية'],['rfq','طلب عرض سعر']],productEdit.pricingMode)}<div class="form-grid">${field('الحد الأدنى للطلب','moq',productEdit.moq,'number','required min="1" step="1"')}${field('السعر الأساسي / قطعة (ر.س)','price',productEdit.price,'number','min="0.01" step="0.01"')}</div><div id="fixed-pricing"><div class="form-section-head"><h3>شرائح أسعار الجملة</h3>${btn('إضافة شريحة','add-tier','plus')}</div><p class="help">السعر الأساسي يسري من الحد الأدنى للطلب. أضف سعرًا أقل للكميات الأكبر.</p><div id="tier-rows"></div></div><div id="rfq-note" class="notice" hidden>لن يظهر سعر للعميل. سيظهر خيار «اطلب عرض سعر» مع الحد الأدنى للطلب.</div><div class="pricing-example"><label for="test-quantity">جرّب كمية</label><input id="test-quantity" type="number" min="1" step="1" value="${productEdit.moq}"><div id="pricing-result" aria-live="polite"></div></div></section>`,async fd=>saveProductDetails(fd,existing));
  $('#dialog').classList.add('product-dialog');$('#edit-form').noValidate=true;
  renderSpecs();renderTiers();renderProductGallery();syncPricingMode();
  $('#edit-form').addEventListener('input',e=>{if(e.target.closest('#product-panel-pricing'))updatePricingExample()});
  $('#f-pricingMode').onchange=()=>syncPricingMode();
  $('#product-images').onchange=async e=>{
    const files=Array.from(e.target.files);if(productEdit.images.length+files.length>6){toast('يمكن إضافة ٦ صور كحد أقصى.');e.target.value='';return}
    try{const images=await Promise.all(files.map(readImage));for(const image of images)if(image&&!productEdit.images.includes(image))productEdit.images.push(image);renderProductGallery()}catch(err){toast(err.message)}finally{e.target.value=''}
  };
}
function showProductTab(name){
  activeProductTab=name;$$('.product-panel').forEach(el=>el.hidden=el.id!=='product-panel-'+name);
  $$('[data-action=product-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',b.dataset.tab===name?'true':'false')});
}
function renderSpecs(){
  $('#spec-rows').innerHTML=productEdit.specs.map((s,i)=>`<div class="spec-row"><input aria-label="اسم المواصفة ${i+1}" data-spec-name="${i}" value="${esc(s.name)}" placeholder="مثل: المادة" maxlength="80"><input aria-label="قيمة المواصفة ${i+1}" data-spec-value="${i}" value="${esc(s.value)}" placeholder="مثل: ستانلس ستيل" maxlength="200">${ib('حذف المواصفة '+(i+1),'remove-spec','trash',`data-index="${i}"`)}</div>`).join('')||'<p class="empty compact">أضف المواصفات المهمة للعميل.</p>';
}
function syncSpecs(){productEdit.specs=$$('[data-spec-name]').map(el=>({name:el.value.trim(),value:$(`[data-spec-value="${el.dataset.specName}"]`).value.trim()}))}
function renderTiers(){
  $('#tier-rows').innerHTML=productEdit.tiers.map((t,i)=>`<div class="tier-row"><div><label for="tier-min-${i}">من كمية</label><input id="tier-min-${i}" data-tier-min="${i}" aria-label="كمية الشريحة ${i+1}" value="${t.min}" type="number" min="1" step="1" required></div><div><label for="tier-price-${i}">سعر القطعة (ر.س)</label><input id="tier-price-${i}" data-tier-price="${i}" aria-label="سعر الشريحة ${i+1}" value="${t.price}" type="number" min="0.01" step="0.01" required></div>${ib('حذف الشريحة '+(i+1),'remove-tier','trash',`data-index="${i}"`)}</div>`).join('')||'<p class="empty compact">بدون شرائح إضافية؛ يُستخدم السعر الأساسي لكل الكميات.</p>';
  updatePricingExample();
}
function pricingFromForm(){return {moq:Number($('#f-moq').value),price:Number($('#f-price').value),pricingMode:$('#f-pricingMode').value,tiers:$$('[data-tier-min]').map(el=>({min:Number(el.value),price:Number($(`[data-tier-price="${el.dataset.tierMin}"]`).value)}))}}
function syncPricingMode(){const fixed=$('#f-pricingMode').value==='fixed';$('#fixed-pricing').hidden=!fixed;$('#rfq-note').hidden=fixed;$('#f-price').disabled=!fixed;$('#f-price').required=fixed;$$('#fixed-pricing input').forEach(el=>el.disabled=!fixed);updatePricingExample()}
function updatePricingExample(){
  const result=$('#pricing-result');if(!result)return;
  const p=pricingFromForm(),qty=Number($('#test-quantity').value);
  try{StoreRules.validatePricing(p);if(!Number.isSafeInteger(qty)||qty<p.moq)throw Error('الكمية يجب أن تكون عددًا صحيحًا لا يقل عن '+fmt(p.moq));const price=StoreRules.unitPrice(p,qty);result.innerHTML=price===null?'<strong>طلب عرض سعر</strong>':`<strong>${fmt(price)} ر.س / قطعة</strong><span>الإجمالي: ${fmt(Math.round(price*qty*100)/100)} ر.س</span>`}catch(err){result.textContent=err.message}
}
function renderProductGallery(){
  $('#product-gallery-editor').innerHTML=productEdit.images.map((image,i)=>`<div class="gallery-edit-card"><img src="${esc(image)}" alt="صورة المنتج ${i+1}"><div class="row between">${i===0?tag('أساسية','blue'):btn('اجعلها أساسية','primary-image','','plain',`data-index="${i}"`)}${ib('إزالة الصورة '+(i+1),'remove-product-image','trash',`data-index="${i}"`)}</div></div>`).join('')||'<p class="empty compact">أضف صور المنتج أو اختر من مكتبتك.</p>';
}
async function saveProductDetails(fd,existing){
  syncSpecs();const form=$('#edit-form'),invalid=Array.from(form.elements).find(el=>el.willValidate&&!el.checkValidity());
  if(invalid){showProductTab(invalid.closest('.product-panel').id.replace('product-panel-',''));invalid.reportValidity();throw Error('راجع الحقل المحدد قبل الحفظ.');}
  const name=fd.get('name').trim(),sku=fd.get('sku').trim();
  if(!name||!sku){showProductTab('basic');throw Error('أدخل اسم المنتج ورمزه.');}
  if(state.draft.products.some(p=>p.id!==productEdit.id&&p.sku.toLowerCase()===sku.toLowerCase())){showProductTab('basic');throw Error('رمز المنتج مستخدم بالفعل.');}
  const pricing=pricingFromForm();try{StoreRules.validatePricing(pricing)}catch(err){showProductTab('pricing');throw err}
  const video=fd.get('video').trim();if(video){try{if(new URL(video).protocol!=='https:')throw Error()}catch{showProductTab('images');throw Error('رابط الفيديو يجب أن يبدأ بـ HTTPS.');}}
  if(productEdit.specs.some(s=>!s.name||!s.value)){showProductTab('details');throw Error('أكمل اسم وقيمة كل مواصفة، أو احذف السطر الفارغ.');}
  const split=v=>[...new Set(v.split(/[,،]/).map(x=>x.trim()).filter(Boolean))];
  Object.assign(productEdit,{name,sku,category:fd.get('category'),status:fd.get('status'),description:fd.get('description').trim(),country:fd.get('country').trim(),supplier:fd.get('supplier').trim(),leadDays:Number(fd.get('leadDays')),colors:split(fd.get('colors')),sizes:split(fd.get('sizes')),video,...pricing,tiers:pricing.pricingMode==='fixed'?pricing.tiers.sort((a,b)=>a.min-b.min):[],image:productEdit.images[0]||''});
  if(!Number.isSafeInteger(productEdit.leadDays)||productEdit.leadDays<0){showProductTab('details');throw Error('مدة التجهيز يجب أن تكون عددًا صحيحًا غير سالب.');}
  if(existing)Object.assign(existing,clone(productEdit));else state.draft.products.unshift(clone(productEdit));
  productEdit.images.forEach((image,i)=>rememberMedia(image,name+' — '+(i+1)));closeModal();changed('تم حفظ بيانات المنتج وأسعاره');
}

function priceLabel(p){return p.pricingMode==='rfq'?'اطلب عرض سعر':fmt(p.price)+' ر.س / قطعة'}
function productCardsHtml(products,editing){return products.map(p=>`<${editing?'div':'button'} ${editing?'':'type="button" data-action="preview-product" data-id="'+p.id+'"'} class="product-tile ${editing?'':'product-link'}">${thumb(p,'product-thumb')}<h4>${esc(p.name)}</h4><span>${priceLabel(p)}</span>${p.tiers.length&&p.pricingMode==='fixed'?'<small class="wholesale-badge">أسعار للكميات الأكبر</small>':''}</${editing?'div':'button'}>`).join('')}
function storeHtml(data,dev='desktop',editing=false,page='home'){
  const template=document.createElement('template');template.innerHTML=baseStoreHtml(data,dev,editing,page);
  if(page==='home'){
    const sections=data.sections.filter(s=>s.visible&&(s.channel==='both'||s.channel===channel));
    Array.from(template.content.querySelectorAll('.store-section')).forEach((el,i)=>{if(sections[i]?.type==='products')el.querySelector('.product-grid').innerHTML=productCardsHtml(StoreRules.sectionProducts(data,sections[i]),editing)||'<p class="help">لا توجد منتجات متاحة في هذه المجموعة.</p>'});
  }else if(page==='products'){
    template.content.querySelector('.product-grid').innerHTML=productCardsHtml(data.products.filter(p=>p.status==='active'),editing)||'<p>لا توجد منتجات.</p>';
  }else if(page.startsWith('product:')){
    const p=data.products.find(p=>p.id===page.slice(8)&&p.status==='active');
    template.content.querySelector('.store-block').outerHTML=p?productDetailHtml(p):'<div class="store-block">المنتج غير متاح في هذه النسخة.</div>';
  }
  return template.innerHTML;
}
function productDetailHtml(p){
  const image=p.images[productImageIndex]||p.image;
  return `<div class="store-block product-detail">${btn('العودة للمنتجات','preview-page','arrow','plain','data-page="products"')}<div class="detail-layout"><div><div class="detail-image">${image?`<img src="${esc(image)}" alt="${esc(p.name)}">`:`<span>${esc(p.name.charAt(0))}</span>`}</div><div class="detail-thumbnails">${p.images.map((img,i)=>`<button type="button" data-action="preview-image" data-index="${i}" aria-label="عرض الصورة ${i+1}" class="${i===productImageIndex?'active':''}"><img src="${esc(img)}" alt=""></button>`).join('')}</div>${p.video?`<a class="video-link" href="${esc(p.video)}" target="_blank" rel="noopener noreferrer">مشاهدة فيديو المنتج ↗</a>`:''}</div><div><small>${esc(p.category)}</small><h2>${esc(p.name)}</h2><p class="detail-description">${esc(p.description||'')}</p><div class="detail-tags">${p.country?tag('بلد التوريد: '+p.country,'gray'):''}${p.leadDays?tag('التجهيز: '+fmt(p.leadDays)+' يوم','gray'):''}</div>${p.colors.length?'<p class="detail-option"><strong>الألوان:</strong> '+p.colors.map(esc).join('، ')+'</p>':''}${p.sizes.length?'<p class="detail-option"><strong>المقاسات:</strong> '+p.sizes.map(esc).join('، ')+'</p>':''}<div class="detail-pricing"><strong>${priceLabel(p)}</strong><p class="help">الحد الأدنى للطلب: ${fmt(p.moq)} قطعة</p>${p.pricingMode==='fixed'?`<table class="price-table"><thead><tr><th>من كمية</th><th>سعر القطعة</th></tr></thead><tbody>${[{min:p.moq,price:p.price},...p.tiers].map(t=>`<tr><td>${fmt(t.min)}</td><td>${fmt(t.price)} ر.س</td></tr>`).join('')}</tbody></table><label for="preview-qty">كمية الطلب التجريبية</label><input id="preview-qty" type="number" min="${p.moq}" step="1" value="${p.moq}" data-product="${p.id}"><div id="preview-price-result" aria-live="polite"></div><small>تقدير قيمة المنتجات فقط، دون الشحن أو أي رسوم إضافية.</small>`:btn('اطلب عرض سعر','demo-rfq','','primary')}</div></div></div>${p.specs.length?`<h3 class="form-section-head">مواصفات المنتج</h3><table class="spec-table"><tbody>${p.specs.map(s=>`<tr><th>${esc(s.name)}</th><td>${esc(s.value)}</td></tr>`).join('')}</tbody></table>`:''}</div>`;
}
const originalPreview=preview;
preview=function(mode='draft',reset=true){originalPreview(mode,reset);const el=$('#preview-qty');if(el){el.oninput=()=>{const p=state[previewMode].products.find(p=>p.id===el.dataset.product),qty=Number(el.value),price=StoreRules.unitPrice(p,qty);$('#preview-price-result').innerHTML=price===null?`<p class="price-error">أدخل كمية صحيحة لا تقل عن ${fmt(p.moq)}.</p>`:`<strong>${fmt(price)} ر.س / قطعة</strong><span>الإجمالي: ${fmt(Math.round(price*qty*100)/100)} ر.س</span>`};el.oninput()}};

function diffValue(value,key,data){
  if(value===null||value==='')return '—';
  if(typeof value==='boolean')return value?'نعم':'لا';
  if(['image','logo'].includes(key))return value?'صورة مرفوعة':'بدون صورة';
  if(key==='images')return fmt(value.length)+' صور';
  if(key==='productIds')return value.map(id=>data.products.find(p=>p.id===id)?.name||'منتج محذوف').join(' ← ')||'بدون منتجات';
  if(key==='collectionId')return data.collections.find(c=>c.id===value)?.name||'جميع المنتجات';
  if(key==='tiers')return value.map(t=>fmt(t.min)+' قطعة: '+fmt(t.price)+' ر.س').join(' / ')||'بدون شرائح';
  if(key==='specs')return value.map(s=>s.name+': '+s.value).join('، ')||'بدون مواصفات';
  if(Array.isArray(value))return value.join('، ')||'—';
  if(key==='status')return statuses[value]?.[0]||value;
  if(key==='pricingMode')return value==='rfq'?'طلب عرض سعر':'أسعار محددة';
  if(key==='channel')return {both:'الموقع والتطبيق',web:'الموقع فقط',app:'التطبيق فقط'}[value]||value;
  if(typeof value==='number')return fmt(value);
  return String(value);
}
function reviewChanges(){
  const diffs=StoreRules.differences(state.published,state.draft),labels={add:'إضافة',edit:'تعديل',delete:'حذف',order:'تغيير ترتيب'};
  modal('مراجعة التغييرات قبل النشر',`<div class="dialog-body"><div class="review-summary"><span class="section-icon">${icon('compare')}</span><div><h3>${diffs.length?fmt(diffs.length)+' تغييرات تنتظر النشر':'المسودة مطابقة للنسخة المنشورة'}</h3><p class="help">مقارنة مع النسخة المنشورة فعليًا. النشر يحدّث المتجر الحقيقي.</p></div></div>${diffs.map(d=>`<article class="diff-card"><div class="row between"><div><small>${esc(d.group)}</small><h3>${esc(d.title)}</h3></div>${tag(labels[d.kind],d.kind==='delete'?'warn':d.kind==='add'?'':'blue')}</div>${d.fields.length?`<div class="diff-table"><div class="diff-header"><span>الحقل</span><span>قبل النشر</span><span>المسودة الجديدة</span></div>${d.fields.map(f=>`<div class="diff-row"><strong>${esc(f.label)}</strong><span>${esc(diffValue(f.before,f.key,state.published))}</span><span>${esc(diffValue(f.after,f.key,state.draft))}</span></div>`).join('')}</div>`:`<p class="help">${d.kind==='add'?'سيُضاف هذا العنصر إلى النسخة المنشورة.':d.kind==='delete'?'سيُزال هذا العنصر من النسخة المنشورة.':'سيُطبق الترتيب الجديد.'}</p>`}</article>`).join('')||'<div class="empty">كل التغييرات منشورة بالفعل.</div>'}</div>`,btn('العودة للتعديل','close')+btn('نشر هذه التغييرات فعليًا','publish-reviewed','check','primary',diffs.length?'':'disabled'),'review-dialog');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  const {action:a,id}=b.dataset,index=Number(b.dataset.index);
  switch(a){
    case 'undo':travelHistory('undo');break;case 'redo':travelHistory('redo');break;
    case 'review':reviewChanges();break;case 'publish-reviewed':closeModal();snapshot('نشر على المتجر');break;
    case 'new-collection':editCollection();break;case 'edit-collection':editCollection(id);break;
    case 'delete-collection':if(state.draft.sections.some(s=>s.collectionId===id)){toast('غيّر مصدر المنتجات في الأقسام المرتبطة قبل حذف المجموعة.');break}deleteFrom('collections',id,'المجموعة');break;
    case 'collection-add':if(!collectionEdit.productIds.includes(id))collectionEdit.productIds.push(id);renderCollectionPicker();break;
    case 'collection-remove':collectionEdit.productIds=collectionEdit.productIds.filter(x=>x!==id);renderCollectionPicker();break;
    case 'collection-up':case 'collection-down':{const next=index+(a==='collection-up'?-1:1),list=collectionEdit.productIds;if(next>=0&&next<list.length)[list[index],list[next]]=[list[next],list[index]];renderCollectionPicker();break}
    case 'product-tab':showProductTab(b.dataset.tab);break;
    case 'add-spec':syncSpecs();productEdit.specs.push({name:'',value:''});renderSpecs();break;
    case 'remove-spec':syncSpecs();productEdit.specs.splice(index,1);renderSpecs();break;
    case 'add-tier':{productEdit.tiers=pricingFromForm().tiers;const p=pricingFromForm(),last=productEdit.tiers[productEdit.tiers.length-1];productEdit.tiers.push({min:(last?.min||p.moq)+50,price:last?.price||p.price});renderTiers();break}
    case 'remove-tier':productEdit.tiers=pricingFromForm().tiers;productEdit.tiers.splice(index,1);renderTiers();break;
    case 'remove-product-image':productEdit.images.splice(index,1);renderProductGallery();break;
    case 'primary-image':productEdit.images.unshift(productEdit.images.splice(index,1)[0]);renderProductGallery();break;
    case 'add-library-image':{const m=state.draft.media.find(m=>m.id===$('#library-image').value);if(!m){toast('اختر صورة من المكتبة.');break}if(productEdit.images.length>=6){toast('الحد الأقصى ٦ صور.');break}if(!productEdit.images.includes(m.image))productEdit.images.push(m.image);renderProductGallery();break}
    case 'preview-product':productImageIndex=0;previewPage='product:'+id;preview(previewMode,false);break;
    case 'preview-image':productImageIndex=index;preview(previewMode,false);break;
    case 'demo-rfq':toast('هذا عرض تجريبي للزر. لم يُرسل طلب إلى أي مورد.');break;
  }
});
