const tr=(ar,en)=>document.documentElement.lang==='en'?en:ar;
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const categories=[
  ['company','الشركة','Company'],
  ['service','الخدمة وطريقة العمل','Service & process'],
  ['shipping','الشحن والتوصيل','Shipping & delivery'],
  ['payment','الدفع','Payment'],
  ['orders','الطلبات','Orders'],
  ['returns','الإلغاء والاسترجاع','Cancellation & returns'],
  ['products','معلومات عامة عن المنتجات','General product info'],
  ['general','عام','General']
];
const normalize=value=>String(value||'').toLowerCase().normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');

let root=null,state=null,config={},query='',editor=null,busy=false,error='';

const rows=()=>Array.isArray(state?.settings?.knowledgeBase)?state.settings.knowledgeBase:[];
const clone=value=>JSON.parse(JSON.stringify(value));
const uid=()=>globalThis.crypto?.randomUUID
  ?'kb-'+globalThis.crypto.randomUUID().replace(/-/g,'').slice(0,18)
  :'kb-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const categoryLabel=id=>{
  const row=categories.find(x=>x[0]===id);
  return row?(document.documentElement.lang==='en'?row[2]:row[1]):id||tr('عام','General');
};
function filteredRows(){
  const q=normalize(query.trim());
  if(!q)return rows();
  return rows().filter(row=>normalize([
    row.questionAr,row.questionEn,row.answerAr,row.answerEn,row.category,...(Array.isArray(row.keywords)?row.keywords:[])
  ].join(' ')).includes(q));
}
function statsHtml(){
  const all=rows(),active=all.filter(x=>x.active!==false).length;
  return `<div class="kb-stats">
    <article><small>${esc(tr('إجمالي المعلومات','Total entries'))}</small><strong>${all.length}</strong></article>
    <article><small>${esc(tr('المفعّل للشات','Active for chat'))}</small><strong>${active}</strong></article>
    <article><small>${esc(tr('غير مفعّل','Inactive'))}</small><strong>${all.length-active}</strong></article>
  </div>`;
}
function editorHtml(){
  if(!editor)return '';
  const optionHtml=categories.map(([id,ar,en])=>`<option value="${id}" ${editor.category===id?'selected':''}>${esc(tr(ar,en))}</option>`).join('');
  return `<section class="kb-editor">
    <div class="kb-editor-head">
      <div><strong>${esc(editor._new?tr('إضافة معلومة جديدة','Add knowledge entry'):tr('تعديل المعلومة','Edit knowledge entry'))}</strong>
      <small>${esc(tr('أضف السؤال والإجابة وصيغًا بديلة ليستطيع الشات فهم طرق السؤال المختلفة.','Add the question, answer, and alternate wording so chat understands different phrasing.'))}</small></div>
      <button type="button" data-kb-cancel aria-label="${esc(tr('إغلاق','Close'))}">×</button>
    </div>
    <form data-kb-form>
      <div class="kb-form-grid">
        <label><span>${esc(tr('التصنيف','Category'))}</span><select name="category">${optionHtml}</select></label>
        <label class="kb-switch"><span>${esc(tr('مفعّل في شات العملاء','Active in customer chat'))}</span><input name="active" type="checkbox" ${editor.active!==false?'checked':''}></label>
        <label class="full"><span>${esc(tr('سؤال العميل بالعربية','Customer question in Arabic'))}</span><input name="questionAr" maxlength="500" required value="${esc(editor.questionAr||'')}"></label>
        <label class="full"><span>${esc(tr('الإجابة بالعربية','Arabic answer'))}</span><textarea name="answerAr" rows="4" maxlength="5000" required>${esc(editor.answerAr||'')}</textarea></label>
        <label class="full"><span>${esc(tr('السؤال بالإنجليزية — اختياري','English question — optional'))}</span><input name="questionEn" maxlength="500" value="${esc(editor.questionEn||'')}"></label>
        <label class="full"><span>${esc(tr('الإجابة بالإنجليزية — اختياري','English answer — optional'))}</span><textarea name="answerEn" rows="3" maxlength="5000">${esc(editor.answerEn||'')}</textarea></label>
        <label class="full"><span>${esc(tr('كلمات مفتاحية وصيغ أخرى','Keywords and alternate phrasing'))}</span><textarea name="keywords" rows="2" placeholder="${esc(tr('مثال: عنوان الشركة، وين مقركم، موقعكم','Example: company address, office location, where are you located'))}">${esc((Array.isArray(editor.keywords)?editor.keywords:[]).join('، '))}</textarea></label>
      </div>
      ${error?`<p class="kb-error">${esc(error)}</p>`:''}
      <div class="kb-editor-actions">
        <button type="button" data-kb-cancel>${esc(tr('إلغاء','Cancel'))}</button>
        <button type="submit" class="primary" ${busy?'disabled':''}>${esc(busy?tr('جاري الحفظ…','Saving…'):tr('حفظ في بنك المعلومات','Save to knowledge base'))}</button>
      </div>
    </form>
  </section>`;
}
function listHtml(){
  const list=filteredRows();
  if(!list.length)return `<div class="kb-empty"><strong>${esc(query?tr('لا توجد نتائج','No results'):tr('بنك المعلومات فارغ','Knowledge base is empty'))}</strong>
    <p>${esc(query?tr('جرّب كلمة بحث أخرى.','Try another search term.'):tr('اضغط «إضافة معلومة» لبدء إضافة إجابات شات العملاء.','Tap “Add entry” to start adding customer-chat answers.'))}</p></div>`;
  return `<div class="kb-list">${list.map(row=>`<article class="kb-card ${row.active===false?'is-inactive':''}">
    <div class="kb-card-main">
      <div class="kb-card-meta"><span>${esc(categoryLabel(row.category))}</span><span class="${row.active===false?'off':'on'}">${esc(row.active===false?tr('غير مفعّل','Inactive'):tr('مفعّل','Active'))}</span></div>
      <h3>${esc(row.questionAr||row.questionEn||tr('بدون سؤال','No question'))}</h3>
      <p>${esc(row.answerAr||row.answerEn||'')}</p>
      ${Array.isArray(row.keywords)&&row.keywords.length?`<div class="kb-keywords">${row.keywords.slice(0,8).map(k=>`<span>${esc(k)}</span>`).join('')}</div>`:''}
    </div>
    <div class="kb-card-actions">
      <button type="button" data-kb-edit="${esc(row.id)}">${esc(tr('تعديل','Edit'))}</button>
      <button type="button" data-kb-toggle="${esc(row.id)}">${esc(row.active===false?tr('تفعيل','Enable'):tr('إيقاف','Disable'))}</button>
      <button type="button" class="danger" data-kb-delete="${esc(row.id)}">${esc(tr('حذف','Delete'))}</button>
    </div>
  </article>`).join('')}</div>`;
}
function draw(){
  if(!root)return;
  root.innerHTML=`<section class="kb-shell">
    <header class="kb-hero">
      <div><span class="kb-badge">IMSG · ${esc(tr('مصدر إجابات العملاء','Customer answer source'))}</span>
      <h2>${esc(tr('بنك المعلومات','Knowledge Base'))}</h2>
      <p>${esc(tr('أضف وعدّل المعلومات التي يعتمد عليها شات العملاء. يتم الرجوع إليها قبل OpenAI.','Add and edit the information used by customer chat. It is checked before OpenAI.'))}</p></div>
      <button type="button" class="primary" data-kb-add>＋ ${esc(tr('إضافة معلومة','Add entry'))}</button>
    </header>
    ${statsHtml()}
    <div class="kb-toolbar">
      <label><span class="sr-only">${esc(tr('بحث','Search'))}</span><input data-kb-search value="${esc(query)}" placeholder="${esc(tr('ابحث في بنك المعلومات…','Search the knowledge base…'))}"></label>
      <small>${esc(tr('يمكن تعديل أو تعطيل أي إجابة بدون حذفها.','Any answer can be edited or disabled without deleting it.'))}</small>
    </div>
    ${editorHtml()}
    ${listHtml()}
  </section>`;
  bind();
}
function parseKeywords(value){
  return [...new Set(String(value||'').split(/[\n,،]+/).map(x=>x.trim()).filter(Boolean))].slice(0,30);
}
async function persist(next,message){
  if(busy)return;
  busy=true;error='';draw();
  try{
    await window.MStudioSession.request('/api/v1/settings',{
      auth:true,method:'POST',
      body:{version:Number(state?.settings?._version||0),data:{knowledgeBase:next}}
    });
    editor=null;
    state=config.refresh?await config.refresh():await window.MStudioSession.state();
    config.toast?.(message||tr('تم حفظ بنك المعلومات','Knowledge base saved'));
  }catch(e){
    error=e?.message||tr('تعذر حفظ بنك المعلومات','Could not save the knowledge base');
  }finally{
    busy=false;draw();
  }
}
function bind(){
  root.querySelector('[data-kb-add]')?.addEventListener('click',()=>{
    editor={_new:true,id:uid(),category:'general',questionAr:'',questionEn:'',answerAr:'',answerEn:'',keywords:[],active:true};
    error='';draw();root.querySelector('.kb-editor')?.scrollIntoView({block:'start'});
  });
  root.querySelectorAll('[data-kb-cancel]').forEach(button=>button.addEventListener('click',()=>{editor=null;error='';draw();}));
  root.querySelectorAll('[data-kb-edit]').forEach(button=>button.addEventListener('click',()=>{
    const row=rows().find(x=>String(x.id)===button.dataset.kbEdit);
    if(!row)return;
    editor=clone(row);editor._new=false;error='';draw();root.querySelector('.kb-editor')?.scrollIntoView({block:'start'});
  }));
  root.querySelectorAll('[data-kb-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const next=clone(rows()),row=next.find(x=>String(x.id)===button.dataset.kbToggle);if(!row)return;
    row.active=row.active===false;
    void persist(next,row.active?tr('تم تفعيل المعلومة','Entry enabled'):tr('تم إيقاف المعلومة','Entry disabled'));
  }));
  root.querySelectorAll('[data-kb-delete]').forEach(button=>button.addEventListener('click',()=>{
    if(!window.confirm(tr('حذف هذه المعلومة من بنك المعلومات؟','Delete this entry from the knowledge base?')))return;
    void persist(rows().filter(x=>String(x.id)!==button.dataset.kbDelete),tr('تم حذف المعلومة','Entry deleted'));
  }));
  const search=root.querySelector('[data-kb-search]');
  if(search)search.addEventListener('input',event=>{
    query=event.target.value;
    const pos=event.target.selectionStart;
    draw();
    const next=root.querySelector('[data-kb-search]');next?.focus();
    try{next?.setSelectionRange(pos,pos);}catch{}
  });
  const form=root.querySelector('[data-kb-form]');
  if(form)form.addEventListener('submit',event=>{
    event.preventDefault();
    const fd=new FormData(form);
    const row={
      id:editor.id,category:String(fd.get('category')||'general'),
      questionAr:String(fd.get('questionAr')||'').trim(),
      questionEn:String(fd.get('questionEn')||'').trim(),
      answerAr:String(fd.get('answerAr')||'').trim(),
      answerEn:String(fd.get('answerEn')||'').trim(),
      keywords:parseKeywords(fd.get('keywords')),active:fd.has('active')
    };
    if(!row.questionAr||!row.answerAr){error=tr('أدخل السؤال والإجابة بالعربية.','Enter the Arabic question and answer.');draw();return;}
    const next=clone(rows()),index=next.findIndex(x=>String(x.id)===String(row.id));
    if(index>=0)next[index]=row;else next.unshift(row);
    void persist(next,tr('تم حفظ المعلومة وربطها بشات العملاء','Entry saved and linked to customer chat'));
  });
}
export const knowledgeBase={
  render(host,liveState,options={}){
    root=host;state=liveState;config=options||{};error='';
    draw();
  }
};
