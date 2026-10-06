'use strict';
(()=>{
  let root=null,overview=null,loadingOverview=false,loading=false,error='',messages=[];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
  const api=(body)=>window.MStudioSession.request('/api/v1/admin-ai',{auth:true,...(body?{method:'POST',body}:{})});
  const number=value=>new Intl.NumberFormat(document.documentElement.lang==='en'?'en':'ar').format(Number(value)||0);
  const replyHtml=value=>esc(value).replace(/\n/g,'<br>');

  function cards(){
    const o=overview?.overview||{};
    return `<div class="mg-ai-stats">
      <article><small>${esc(tr('المنتجات المنشورة','Published products'))}</small><strong>${number(o.products?.published)}</strong><span>${esc(tr('مسودة','Drafts'))}: ${number(o.products?.drafts)}</span></article>
      <article><small>${esc(tr('طلبات المتجر','Store orders'))}</small><strong>${number(o.orders?.total)}</strong><span>${esc(tr('طلبات توريد','Sourcing requests'))}: ${number(o.sourcingRequests?.total)}</span></article>
      <article><small>${esc(tr('العملاء','Customers'))}</small><strong>${number(o.customers?.total)}</strong><span>${esc(tr('بيانات مجمعة فقط','Aggregated data only'))}</span></article>
      <article><small>${esc(tr('أقسام الصفحة الرئيسية','Homepage sections'))}</small><strong>${number(o.storefront?.visibleSections)}</strong><span>${esc(tr('ظاهر من','Visible of'))} ${number(o.storefront?.sections)}</span></article>
    </div>`;
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

  function conversation(){
    if(!messages.length)return `<div class="mg-ai-empty">
      <strong>${esc(tr('اسأل MG AI عن المتجر','Ask MG AI about the store'))}</strong>
      <p>${esc(tr('يمكنه تحليل المنتجات والطلبات والمخزون واقتراح ترتيب الصفحة الرئيسية والتسويق. لا ينفذ أي تغيير في هذه المرحلة.','It can analyze products, orders and stock, and suggest homepage merchandising and marketing. It cannot make changes in this phase.'))}</p>
    </div>`;
    return messages.map(row=>`<div class="mg-ai-message ${row.role==='user'?'is-user':'is-assistant'}"><div>${replyHtml(row.content)}</div></div>`).join('')+
      (loading?`<div class="mg-ai-message is-assistant"><div class="mg-ai-thinking">${esc(tr('جاري تحليل بيانات المتجر…','Analyzing store data…'))}</div></div>`:'');
  }

  function draw(){
    if(!root||!root.isConnected)return;
    root.innerHTML=`<section class="mg-ai-shell">
      <header class="mg-ai-hero">
        <div>
          <span class="mg-ai-badge">MG AI · ${esc(tr('قراءة فقط','Read only'))}</span>
          <h2>${esc(tr('مساعد الإدارة الذكي','Admin AI Assistant'))}</h2>
          <p>${esc(tr('تحليل واقتراحات للمنتجات والتسويق والصفحة الرئيسية، بدون تعديل أو نشر تلقائي.','Analysis and recommendations for products, marketing and homepage merchandising, without automatic edits or publishing.'))}</p>
        </div>
        <div class="mg-ai-safety">${esc(tr('آمن: لا توجد صلاحيات كتابة','Safe: no write permissions'))}</div>
      </header>
      ${overview?cards():`<div class="mg-ai-loading">${esc(loadingOverview?tr('جاري تحميل ملخص المتجر…','Loading store overview…'):tr('تعذر تحميل ملخص المتجر','Could not load store overview'))}</div>`}
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
        <footer>${esc(tr('ملاحظة: تتبع المشاهدات والبحث والإضافة للسلة غير مفعّل بعد، لذلك لن يخترع MG AI هذه البيانات.','Note: views, searches and add-to-cart event tracking is not enabled yet, so MG AI will not invent those metrics.'))}</footer>
      </section>
    </section>`;
    requestAnimationFrame(()=>{const chat=root?.querySelector('[data-mg-ai-chat]');if(chat)chat.scrollTop=chat.scrollHeight;});
  }

  async function loadOverview(){
    if(overview||loadingOverview)return;
    loadingOverview=true;draw();
    try{overview=await api();error='';}
    catch(e){error=e?.message||tr('تعذر تحميل MG AI','Could not load MG AI');}
    finally{loadingOverview=false;draw();}
  }

  async function send(text){
    const message=String(text||'').trim();
    if(!message||loading)return;
    const history=messages.slice(-8).map(row=>({role:row.role,content:row.content}));
    messages.push({role:'user',content:message});loading=true;error='';draw();
    try{
      const result=await api({message,language:document.documentElement.lang==='en'?'en':'ar',history});
      messages.push({role:'assistant',content:String(result?.reply||tr('لم يصل رد صالح.','No valid response was returned.'))});
      if(result?.overview&&overview)overview={...overview,overview:result.overview};
    }catch(e){error=e?.message||tr('تعذر الحصول على رد من MG AI','Could not get a response from MG AI');}
    finally{loading=false;draw();}
  }

  document.addEventListener('submit',e=>{
    const form=e.target.closest('[data-mg-ai-form]');if(!form)return;
    e.preventDefault();const textarea=form.querySelector('textarea[name="message"]');const value=textarea?.value||'';if(textarea)textarea.value='';void send(value);
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-mg-ai-prompt]');if(!button)return;
    void send(button.dataset.mgAiPrompt||'');
  });

  window.MAdminAI={
    render(target){
      root=target;
      draw();
      void loadOverview();
      return true;
    },
    reset(){overview=null;messages=[];error='';loading=false;loadingOverview=false;if(root)draw();}
  };
})();
