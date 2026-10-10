'use strict';
(()=>{
  let root=null,overview=null,loadingOverview=false,loading=false,error='',messages=[];
  let creatorOpen=false,productFiles=[],productDraft=null,generating=false,savingProduct=false,productError='';
  let productInput={sku:'',price:'',currency:'SAR',moq:'1',stock:'',leadDays:'7',country:'',notes:''};

  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
  const api=(body)=>window.MStudioSession.request('/api/v1/admin-ai',{auth:true,...(body?{method:'POST',body}:{})});
  const studioApi=(path,body)=>window.MStudioSession.request('/api/v1/'+path,{auth:true,method:'POST',body});
  const number=value=>new Intl.NumberFormat(document.documentElement.lang==='en'?'en':'ar').format(Number(value)||0);
  const replyHtml=value=>esc(value).replace(/\n/g,'<br>');
  const taxonomy=()=>overview?.taxonomy||{categories:[],subcategories:[],supplyCountries:[]};
  const selectedCountry=()=>{
    const countries=taxonomy().supplyCountries||[];
    if(productInput.country&&countries.some(x=>x.id===productInput.country))return productInput.country;
    const china=countries.find(x=>String(x.id).toLowerCase()==='china');
    return china?.id||countries[0]?.id||'';
  };
  const labelOf=x=>document.documentElement.lang==='en'?(x?.nameEn||x?.nameAr||x?.id):(x?.nameAr||x?.nameEn||x?.id);

  const imageErrorMessage=(error,fallbackAr,fallbackEn)=>{
    const code=String(error?.message||'').trim();
    const known={
      compress_failed:tr('تعذر تجهيز الصورة على هذا الجهاز. جرّب الصورة مرة أخرى أو اختر صورة أخرى.','Could not prepare this image on this device. Try it again or choose another image.'),
      decode_failed:tr('تعذر قراءة الصورة. إذا كانت HEIC جرّب اختيارها من تطبيق الصور مرة أخرى أو استخدم JPG/PNG.','Could not read the image. If it is HEIC, try selecting it again from Photos or use JPG/PNG.'),
      unsupported:tr('صيغة الصورة غير مدعومة. اختر صورة من تطبيق الصور أو استخدم JPG/PNG/WebP.','Unsupported image format. Choose an image from Photos or use JPG/PNG/WebP.'),
      too_large:tr('حجم الصورة أكبر من 10MB. اختر صورة أصغر.','The image is larger than 10MB. Choose a smaller image.'),
      too_many:tr('يمكن اختيار 5 صور كحد أقصى.','You can select up to 5 images.'),
      read_failed:tr('تعذر قراءة ملف الصورة. اختر الصورة مرة أخرى.','Could not read the image file. Select it again.')
    };
    return known[code]||error?.message||tr(fallbackAr,fallbackEn);
  };

  function cards(){
    const o=overview?.overview||{};
    return `<div class="mg-ai-stats">
      <article><small>${esc(tr('المنتجات المنشورة','Published products'))}</small><strong>${number(o.products?.published)}</strong><span>${esc(tr('مسودة','Drafts'))}: ${number(o.products?.drafts)}</span></article>
      <article><small>${esc(tr('طلبات المتجر','Store orders'))}</small><strong>${number(o.orders?.total)}</strong><span>${esc(tr('طلبات توريد','Sourcing requests'))}: ${number(o.sourcingRequests?.total)}</span></article>
      <article><small>${esc(tr('العملاء','Customers'))}</small><strong>${number(o.customers?.total)}</strong><span>${esc(tr('بيانات مجمعة فقط','Aggregated data only'))}</span></article>
      <article><small>${esc(tr('أقسام الصفحة الرئيسية','Homepage sections'))}</small><strong>${number(o.storefront?.visibleSections)}</strong><span>${esc(tr('ظاهر من','Visible of'))} ${number(o.storefront?.sections)}</span></article>
    </div>`;
  }


  function usagePanel(){
    const m=overview?.usage?.month;
    if(!m)return '';
    const free=Number(m.database||0)+Number(m.cache||0);
    const cost=Number(m.costUsd||0);
    return `<section class="mg-ai-usage">
      <div class="mg-ai-usage-head"><div><strong>${esc(tr('استهلاك الذكاء الاصطناعي هذا الشهر','AI usage this month'))}</strong><small>${esc(tr('يُحسب من الاستخدام الفعلي، ولا يتم حفظ نص الأسئلة هنا.','Calculated from actual usage; prompt text is not stored here.'))}</small></div><span>${esc(tr('نسبة بدون OpenAI','No-OpenAI rate'))}: ${Number(m.freeRate||0).toFixed(1)}%</span></div>
      <div class="mg-ai-usage-grid">
        <article><small>${esc(tr('إجمالي الطلبات','Total requests'))}</small><strong>${number(m.requests)}</strong></article>
        <article><small>${esc(tr('بدون تكلفة OpenAI','No OpenAI call'))}</small><strong>${number(free)}</strong><span>${number(m.database)} DB · ${number(m.cache)} Cache</span></article>
        <article><small>${esc(tr('طلبات OpenAI','OpenAI calls'))}</small><strong>${number(m.openai)}</strong><span>${number(m.totalTokens)} tokens</span></article>
        <article><small>${esc(tr('التكلفة المقدرة','Estimated cost'))}</small><strong>${cost<0.01?cost.toFixed(4):cost.toFixed(2)}</strong><span>GPT‑6 Luna</span></article>
      </div>
    </section>`;
  }

  function conversionPanel(){
    const x=overview?.conversion;
    if(!x)return '';
    const rate=Number(x.conversionRate||0);
    return `<section class="mg-ai-conversion">
      <div class="mg-ai-conversion-head">
        <div><strong>${esc(tr('تحويلات شات العملاء','Customer chat conversions'))}</strong><small>${esc(tr('آخر 30 يومًا · بيانات فعلية من رحلة العميل','Last 30 days · actual customer journey data'))}</small></div>
        <span>${esc(tr('محادثة → طلب','Chat → order'))}: ${rate.toFixed(1)}%</span>
      </div>
      <div class="mg-ai-conversion-flow">
        <article><small>${esc(tr('اقتراحات منتجات','Recommendations'))}</small><strong>${number(x.recommendations)}</strong></article>
        <b>→</b>
        <article><small>${esc(tr('ضغط على المنتج','Product clicks'))}</small><strong>${number(x.productClicks)}</strong></article>
        <b>→</b>
        <article><small>${esc(tr('إضافة للسلة','Add to cart'))}</small><strong>${number(x.addToCart)}</strong></article>
        <b>→</b>
        <article><small>${esc(tr('بدأ الطلب','Checkout started'))}</small><strong>${number(x.checkoutStarted)}</strong></article>
        <b>→</b>
        <article><small>${esc(tr('طلبات منشأة','Orders created'))}</small><strong>${number(x.orders)}</strong></article>
      </div>
    </section>`;
  }

  function quickPrompts(){
    const prompts=overview?.quickPrompts||[
      tr('حلل أداء المتجر واقترح أهم الإجراءات الآن','Analyze store performance and suggest the most important actions now'),
      tr('اقترح ترتيب الصفحة الرئيسية والمنتجات التي يجب أن تظهر أولًا','Suggest homepage ordering and which products should appear first'),
      tr('ما المنتجات التي تستحق حملة تسويقية الآن؟','Which products deserve a marketing campaign now?'),
      tr('راجع الكتالوج واقترح تحسينات','Review the catalog and suggest improvements')
    ];
    return `<div class="mg-ai-prompts">${prompts.map(p=>`<button type="button" data-mg-ai-prompt="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;
  }

  function countryOptions(){
    const current=selectedCountry();
    return (taxonomy().supplyCountries||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===current?'selected':''}>${esc(labelOf(x))}</option>`).join('');
  }

  function categoryOptions(value=''){
    return '<option value="">'+esc(tr('اختر التصنيف','Choose category'))+'</option>'+
      (taxonomy().categories||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(labelOf(x))}</option>`).join('');
  }

  function subcategoryOptions(categoryId,value=''){
    return '<option value="">'+esc(tr('بدون تصنيف فرعي','No subcategory'))+'</option>'+
      (taxonomy().subcategories||[]).filter(x=>x.parentId===categoryId).map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(labelOf(x))}</option>`).join('');
  }

  function creatorIntro(){
    if(!overview?.productDraftEnabled)return '';
    return `<section class="mg-ai-product-card">
      <div class="mg-ai-product-card-head">
        <div>
          <span class="mg-ai-feature-tag">${esc(tr('جديد','New'))}</span>
          <h3>${esc(tr('إضافة منتج بالذكاء الاصطناعي','Add product with AI'))}</h3>
          <p>${esc(tr('ارفع صور المنتج وأدخل السعر والحد الأدنى. IMSG AI يجهز النصوص والتصنيف، ثم تحفظه كمسودة بعد مراجعتك.','Upload product images and enter price and MOQ. IMSG AI prepares copy and categorization, then saves only after your review.'))}</p>
        </div>
        <button type="button" class="primary" data-mg-ai-toggle-product>${esc(creatorOpen?tr('إغلاق','Close'):tr('إضافة منتج','Add product'))}</button>
      </div>
      ${creatorOpen?productCreator():''}
    </section>`;
  }

  function fileSummary(){
    if(!productFiles.length)return `<div class="mg-ai-file-empty">${esc(tr('لم يتم اختيار صور بعد','No images selected yet'))}</div>`;
    return `<div class="mg-ai-file-summary"><strong>${esc(tr('الصور المختارة','Selected images'))}: ${productFiles.length}/5</strong><div>${productFiles.map((f,i)=>`<span>${i+1}. ${esc(f.name||tr('صورة','Image'))}</span>`).join('')}</div><button type="button" data-mg-ai-clear-images>${esc(tr('إزالة الصور','Clear images'))}</button></div>`;
  }

  function productCreator(){
    if(productDraft)return productDraftReview();
    return `<form class="mg-ai-product-form" data-mg-ai-product-analyze>
      <div class="mg-ai-form-grid">
        <label class="mg-ai-upload full">
          <span>${esc(tr('صور المنتج','Product images'))}</span>
          <input type="file" accept="image/*" multiple data-mg-ai-images ${generating?'disabled':''}>
          <small>${esc(tr('حتى 5 صور. يبدأ IMSG AI بصورة واحدة فقط، ويطلب صورًا إضافية تلقائيًا إذا احتاجها. عند الاعتماد تُرفع جميع الصور المختارة.','Up to 5 images. IMSG AI starts with one image and only uses more when needed; all selected images are uploaded after approval.'))}</small>
        </label>
        <div class="full">${fileSummary()}</div>
        <label><span>${esc(tr('SKU / الموديل (اختياري)','SKU / model (optional)'))}</span><input name="sku" maxlength="80" value="${esc(productInput.sku)}" placeholder="MG-825"></label>
        <label><span>${esc(tr('السعر','Price'))}</span><input name="price" type="number" min="0.01" step="0.01" required value="${esc(productInput.price)}"></label>
        <label><span>${esc(tr('العملة','Currency'))}</span><select name="currency">${['SAR','USD','CNY','AED','EUR'].map(x=>`<option value="${x}" ${x===productInput.currency?'selected':''}>${x}</option>`).join('')}</select></label>
        <label><span>${esc(tr('الحد الأدنى للطلب','MOQ'))}</span><input name="moq" type="number" min="1" step="1" required value="${esc(productInput.moq)}"></label>
        <label><span>${esc(tr('المخزون (اختياري)','Stock (optional)'))}</span><input name="stock" type="number" min="0" step="1" value="${esc(productInput.stock)}"></label>
        <label><span>${esc(tr('مدة التجهيز بالأيام','Lead time (days)'))}</span><input name="leadDays" type="number" min="1" step="1" required value="${esc(productInput.leadDays)}"></label>
        <label><span>${esc(tr('دولة التوريد','Supply country'))}</span><select name="country" required>${countryOptions()}</select></label>
        <label class="full"><span>${esc(tr('معلومات إضافية لـ IMSG AI','Extra information for IMSG AI'))}</span><textarea name="notes" rows="3" maxlength="1800" placeholder="${esc(tr('مثال: المادة TPU، جميع الموديلات متوفرة، لا تذكر الألوان.','Example: TPU material, all models available, do not mention colors.'))}">${esc(productInput.notes)}</textarea></label>
      </div>
      ${productError?`<p class="mg-ai-error">${esc(productError)}</p>`:''}
      <div class="mg-ai-product-actions"><button type="submit" class="primary" ${generating?'disabled':''}>${esc(generating?tr('جاري تحليل الصور…','Analyzing images…'):tr('تحليل وتجهيز المسودة','Analyze & prepare draft'))}</button></div>
    </form>`;
  }

  function productDraftReview(){
    const d=productDraft||{};
    return `<form class="mg-ai-product-form" data-mg-ai-product-save>
      <div class="mg-ai-review-head">
        <div><strong>${esc(tr('راجع المنتج قبل الحفظ','Review before saving'))}</strong><small>${esc(tr('لن يتم نشر المنتج. سيُحفظ كمسودة فقط.','The product will not be published. It will be saved as a draft only.'))}</small></div>
        <button type="button" data-mg-ai-redo-product>${esc(tr('إعادة التحليل','Analyze again'))}</button>
      </div>
      ${d.reviewNotes?`<div class="mg-ai-review-note"><strong>${esc(tr('ملاحظة IMSG AI','IMSG AI note'))}</strong><span>${esc(d.reviewNotes)}</span></div>`:''}
      <div class="mg-ai-form-grid">
        <label><span>${esc(tr('الاسم بالعربية','Arabic name'))}</span><input name="name" maxlength="100" required value="${esc(d.name)}"></label>
        <label><span>${esc(tr('الاسم بالإنجليزية','English name'))}</span><input name="nameEn" maxlength="100" value="${esc(d.nameEn)}"></label>
        <label><span>SKU</span><input name="sku" maxlength="80" required pattern="[A-Za-z0-9._-]+" value="${esc(d.sku)}"></label>
        <label><span>${esc(tr('التصنيف','Category'))}</span><select name="categoryId" data-mg-ai-category>${categoryOptions(d.categoryId)}</select></label>
        <label><span>${esc(tr('التصنيف الفرعي','Subcategory'))}</span><select name="subcategoryId">${subcategoryOptions(d.categoryId,d.subcategoryId)}</select></label>
        <label><span>${esc(tr('دولة التوريد','Supply country'))}</span><select name="country" required>${countryOptions()}</select></label>
        <label><span>${esc(tr('السعر','Price'))}</span><input name="price" type="number" min="0.01" step="0.01" required value="${esc(productInput.price)}"></label>
        <label><span>${esc(tr('العملة','Currency'))}</span><select name="currency">${['SAR','USD','CNY','AED','EUR'].map(x=>`<option value="${x}" ${x===productInput.currency?'selected':''}>${x}</option>`).join('')}</select></label>
        <label><span>${esc(tr('الحد الأدنى للطلب','MOQ'))}</span><input name="moq" type="number" min="1" step="1" required value="${esc(productInput.moq)}"></label>
        <label><span>${esc(tr('المخزون','Stock'))}</span><input name="stock" type="number" min="0" step="1" value="${esc(productInput.stock)}"></label>
        <label><span>${esc(tr('مدة التجهيز بالأيام','Lead time (days)'))}</span><input name="leadDays" type="number" min="1" step="1" required value="${esc(productInput.leadDays)}"></label>
        <label class="full"><span>${esc(tr('وصف مختصر','Short description'))}</span><textarea name="shortDescription" rows="2" maxlength="500">${esc(d.shortDescription)}</textarea></label>
        <label class="full"><span>${esc(tr('الوصف العربي','Arabic description'))}</span><textarea name="description" rows="5">${esc(d.description)}</textarea></label>
        <label class="full"><span>${esc(tr('الوصف الإنجليزي','English description'))}</span><textarea name="descriptionEn" rows="5">${esc(d.descriptionEn)}</textarea></label>
        <label class="full"><span>${esc(tr('المواصفات الفنية','Technical specifications'))}</span><textarea name="technicalSpecs" rows="4">${esc(d.technicalSpecs)}</textarea></label>
        <label class="full"><span>${esc(tr('الموديلات / الخيارات','Models / options'))}</span><textarea name="options" rows="3">${esc(d.options)}</textarea></label>
      </div>
      <div class="mg-ai-image-confirm">${esc(tr('سيتم رفع','Will upload'))} <strong>${productFiles.length}</strong> ${esc(tr('صور مع المنتج عند الاعتماد.','images with the product after approval.'))}</div>
      ${productError?`<p class="mg-ai-error">${esc(productError)}</p>`:''}
      <div class="mg-ai-product-actions">
        <button type="button" data-mg-ai-cancel-product>${esc(tr('إلغاء','Cancel'))}</button>
        <button type="submit" class="primary" ${savingProduct?'disabled':''}>${esc(savingProduct?tr('جاري رفع الصور وحفظ المسودة…','Uploading images & saving draft…'):tr('اعتماد وإنشاء المسودة','Approve & create draft'))}</button>
      </div>
    </form>`;
  }

  function conversation(){
    if(!messages.length)return `<div class="mg-ai-empty">
      <strong>${esc(tr('اسأل IMSG AI عن المتجر','Ask IMSG AI about the store'))}</strong>
      <p>${esc(tr('يمكنه تحليل المنتجات والطلبات والمخزون واقتراح ترتيب الصفحة الرئيسية والتسويق.','It can analyze products, orders and stock, and suggest homepage merchandising and marketing.'))}</p>
    </div>`;
    return messages.map(row=>`<div class="mg-ai-message ${row.role==='user'?'is-user':'is-assistant'}"><div>${replyHtml(row.content)}</div></div>`).join('')+
      (loading?`<div class="mg-ai-message is-assistant"><div class="mg-ai-thinking">${esc(tr('جاري تحليل بيانات المتجر…','Analyzing store data…'))}</div></div>`:'');
  }

  function draw(){
    if(!root||!root.isConnected)return;
    root.innerHTML=`<section class="mg-ai-shell">
      <header class="mg-ai-hero">
        <div>
          <span class="mg-ai-badge">IMSG AI · ${esc(tr('تحليل + مسودات','Analysis + drafts'))}</span>
          <h2>${esc(tr('مساعد الإدارة الذكي','Admin AI Assistant'))}</h2>
          <p>${esc(tr('يحلل المتجر ويجهز منتجات جديدة من الصور، لكن لا ينشر أي منتج أو تغيير تلقائيًا.','Analyzes the store and prepares new products from images, but never publishes products or changes automatically.'))}</p>
        </div>
        <div class="mg-ai-safety">${esc(tr('آمن: الاعتماد مطلوب قبل الحفظ','Safe: approval required before saving'))}</div>
      </header>
      ${overview?cards():`<div class="mg-ai-loading">${esc(loadingOverview?tr('جاري تحميل ملخص المتجر…','Loading store overview…'):tr('تعذر تحميل ملخص المتجر','Could not load store overview'))}</div>`}
      ${usagePanel()}
      ${conversionPanel()}
      ${creatorIntro()}
      ${overview?.productDraftEnabled?'<div data-ai-catalog-root></div>':''}
      <section class="mg-ai-panel">
        <div class="mg-ai-panel-head">
          <div><strong>${esc(tr('اقتراحات سريعة','Quick prompts'))}</strong><small>${esc(tr('ابدأ بتحليل جاهز أو اكتب سؤالك','Start with a suggested analysis or type your own request'))}</small></div>
        </div>
        ${quickPrompts()}
        <div class="mg-ai-chat" data-mg-ai-chat>${conversation()}</div>
        ${error?`<p class="mg-ai-error">${esc(error)}</p>`:''}
        <form class="mg-ai-form" data-mg-ai-form>
          <textarea name="message" rows="3" maxlength="2500" placeholder="${esc(tr('مثال: اختر لي المنتجات التي يجب أن تظهر أول الصفحة هذا الأسبوع','Example: choose which products should appear first on the homepage this week'))}" ${loading?'disabled':''}></textarea>
          <button type="submit" class="primary" ${loading?'disabled':''}>${esc(tr('إرسال','Send'))}</button>
        </form>
        <footer>${esc(tr('تحويلات شات العملاء تُحسب من أحداث فعلية ومجمعة بدون حفظ نص المحادثة داخل سجل التحويل.','Customer chat conversions are calculated from real aggregated events; chat text is not stored in the conversion log.'))}</footer>
      </section>
    </section>`;
    window.MCatalogAI?.render(root.querySelector('[data-ai-catalog-root]'),{categories:taxonomy().categories});
    requestAnimationFrame(()=>{const chat=root?.querySelector('[data-mg-ai-chat]');if(chat)chat.scrollTop=chat.scrollHeight;});
  }

  function syncProductInput(form){
    if(!form)return;
    for(const key of Object.keys(productInput)){
      const control=form.elements?.[key];
      if(control)productInput[key]=String(control.value??'').trim();
    }
    if(!productInput.country)productInput.country=selectedCountry();
  }

  async function loadOverview(){
    if(overview||loadingOverview)return;
    loadingOverview=true;draw();
    try{
      overview=await api();
      if(!productInput.country)productInput.country=selectedCountry();
      error='';
    }catch(e){error=e?.message||tr('تعذر تحميل IMSG AI','Could not load IMSG AI');}
    finally{loadingOverview=false;draw();}
  }

  async function send(text){
    const message=String(text||'').trim();
    if(!message||loading)return;
    const history=messages.slice(-6).map(row=>({role:row.role,content:row.content}));
    messages.push({role:'user',content:message});loading=true;error='';draw();
    try{
      const result=await api({message,language:document.documentElement.lang==='en'?'en':'ar',history});
      messages.push({role:'assistant',content:String(result?.reply||tr('لم يصل رد صالح.','No valid response was returned.'))});
      if(result?.overview&&overview)overview={...overview,overview:result.overview};
    }catch(e){error=e?.message||tr('تعذر الحصول على رد من IMSG AI','Could not get a response from IMSG AI');}
    finally{loading=false;draw();}
  }

  async function analyzeProduct(form){
    syncProductInput(form);
    if(!productFiles.length){productError=tr('أضف صورة واحدة على الأقل.','Add at least one image.');draw();return;}
    if(!form.reportValidity())return;
    generating=true;productError='';draw();
    try{
      const firstImages=await window.MStudioImages.filesToCompressedSources({files:productFiles.slice(0,1)},{targetBytes:260*1024,maxDimension:1400});
      let result=await api({action:'product-draft',images:firstImages,notes:productInput.notes,sku:productInput.sku,language:document.documentElement.lang==='en'?'en':'ar'});
      if(result?.needsMoreImages&&productFiles.length>1){
        const extraImages=await window.MStudioImages.filesToCompressedSources({files:productFiles.slice(0,3)},{targetBytes:260*1024,maxDimension:1400});
        result=await api({action:'product-draft',images:extraImages,notes:productInput.notes,sku:productInput.sku,language:document.documentElement.lang==='en'?'en':'ar'});
      }
      productDraft=result?.draft||null;
      if(!productDraft)throw Error(tr('لم يتم إنشاء مسودة صالحة.','No valid draft was created.'));
      if(!productInput.sku)productInput.sku=productDraft.sku||'';
    }catch(e){productError=imageErrorMessage(e,'تعذر تحليل المنتج.','Could not analyze the product.');}
    finally{generating=false;draw();}
  }

  async function uploadProductImages(){
    const sources=await window.MStudioImages.filesToCompressedSources({files:productFiles});
    const images=[];
    for(const source of sources){
      const result=await studioApi('uploads',{source});
      if(!result?.src)throw Error(tr('تعذر رفع إحدى الصور.','One image could not be uploaded.'));
      images.push(result.src);
    }
    return images;
  }

  async function saveProduct(form){
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    savingProduct=true;productError='';draw();
    try{
      productInput={...productInput,
        price:String(fd.get('price')||'').trim(),
        currency:String(fd.get('currency')||'SAR').trim(),
        moq:String(fd.get('moq')||'').trim(),
        stock:String(fd.get('stock')||'').trim(),
        leadDays:String(fd.get('leadDays')||'').trim(),
        country:String(fd.get('country')||'').trim(),
        sku:String(fd.get('sku')||'').trim()
      };
      const images=await uploadProductImages();
      const id='mgai-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
      const product={
        id,version:0,status:'draft',
        name:String(fd.get('name')||'').trim(),
        nameEn:String(fd.get('nameEn')||'').trim(),
        sku:productInput.sku,
        shortDescription:String(fd.get('shortDescription')||'').trim(),
        description:String(fd.get('description')||'').trim(),
        descriptionEn:String(fd.get('descriptionEn')||'').trim(),
        technicalSpecs:String(fd.get('technicalSpecs')||'').trim(),
        options:String(fd.get('options')||'').trim(),
        notes:'',
        categoryId:String(fd.get('categoryId')||'').trim(),
        subcategoryId:String(fd.get('subcategoryId')||'').trim(),
        country:productInput.country,
        price:Number(productInput.price),
        currency:productInput.currency,
        moq:Number(productInput.moq),
        stock:productInput.stock===''?null:Number(productInput.stock),
        leadDays:Number(productInput.leadDays),
        images,tiers:[]
      };
      await studioApi('studio-product',{product,redactionConfirmed:false});
      location.assign('/admin.html?screen=products');
    }catch(e){
      productError=imageErrorMessage(e,'تعذر حفظ مسودة المنتج.','Could not save the product draft.');
      savingProduct=false;draw();
    }
  }

  document.addEventListener('input',e=>{
    const form=e.target.closest('[data-mg-ai-product-analyze]');
    if(form)syncProductInput(form);
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-mg-ai-images]')){
      const files=[...(e.target.files||[])];
      productError='';
      if(files.length>5){productFiles=files.slice(0,5);productError=tr('تم الاحتفاظ بأول 5 صور فقط.','Only the first 5 images were kept.');}
      else productFiles=files;
      productDraft=null;draw();return;
    }
    if(e.target.matches('[data-mg-ai-category]')){
      const form=e.target.closest('[data-mg-ai-product-save]'),sub=form?.elements?.subcategoryId;
      if(sub)sub.innerHTML=subcategoryOptions(e.target.value,'');
    }
  });
  document.addEventListener('submit',e=>{
    const chat=e.target.closest('[data-mg-ai-form]');
    if(chat){e.preventDefault();const textarea=chat.querySelector('textarea[name="message"]');const value=textarea?.value||'';if(textarea)textarea.value='';void send(value);return;}
    const analyze=e.target.closest('[data-mg-ai-product-analyze]');
    if(analyze){e.preventDefault();void analyzeProduct(analyze);return;}
    const save=e.target.closest('[data-mg-ai-product-save]');
    if(save){e.preventDefault();void saveProduct(save);}
  });
  document.addEventListener('click',e=>{
    const prompt=e.target.closest('[data-mg-ai-prompt]');if(prompt){void send(prompt.dataset.mgAiPrompt||'');return;}
    if(e.target.closest('[data-mg-ai-toggle-product]')){creatorOpen=!creatorOpen;productError='';draw();return;}
    if(e.target.closest('[data-mg-ai-clear-images]')){productFiles=[];productDraft=null;productError='';draw();return;}
    if(e.target.closest('[data-mg-ai-redo-product]')){productDraft=null;productError='';draw();return;}
    if(e.target.closest('[data-mg-ai-cancel-product]')){productDraft=null;productFiles=[];productError='';creatorOpen=false;draw();}
  });

  window.MAdminAI={
    render(target){
      root=target;
      draw();
      void loadOverview();
      return true;
    },
    reset(){
      window.MCatalogAI?.reset();
      overview=null;messages=[];error='';loading=false;loadingOverview=false;
      creatorOpen=false;productFiles=[];productDraft=null;generating=false;savingProduct=false;productError='';
      productInput={sku:'',price:'',currency:'SAR',moq:'1',stock:'',leadDays:'7',country:'',notes:''};
      if(root)draw();
    }
  };
})();
