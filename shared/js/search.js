(() => {
  const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
  function matches(item,values,f={}){
    const query=norm(f.query),text=norm(values.join(' '));
    if(query&&!query.split(/\s+/).every(q=>text.includes(q)))return false;
    const raw=R.stateLabel(item),group=item.selectedQuoteId||['completed','selected','accepted'].includes(raw)?'completed':['review','pending'].includes(raw)?'review':['sent','published','coordinating','active'].includes(raw)?'active':raw;
    if(f.status&&group!==f.status&&raw!==f.status)return false;
    if(f.country&&!norm(item.country).includes(norm(f.country)))return false;
    const day=item.createdAt?.slice(0,10);
    if((f.from||f.to)&&!day)return false;
    if(f.from&&day<f.from||f.to&&day>f.to)return false;
    return true;
  }
  function create(parent,change){
    const el=document.createElement('form');el.className='search-bar';
    el.innerHTML='<label><span data-ar="بحث" data-en="Search">بحث</span><input name="query" type="search" aria-label="Search"></label><label><span data-ar="الحالة" data-en="Status">الحالة</span><select name="status"><option value="" data-ar="كل الحالات" data-en="All statuses">كل الحالات</option>'+['active','review','pending','sent','published','suspended','blocked','deleted','coordinating','accepted','completed','cancelled'].map(v=>'<option value="'+v+'">'+W.status(v)+'</option>').join('')+'</select></label><label><span data-ar="الدولة" data-en="Country">الدولة</span><input name="country"></label><label><span data-ar="من تاريخ" data-en="From">من تاريخ</span><input name="from" type="date"></label><label><span data-ar="إلى تاريخ" data-en="To">إلى تاريخ</span><input name="to" type="date"></label><button type="reset" class="btn btn-outline" data-ar="مسح الفلاتر" data-en="Clear filters">مسح الفلاتر</button><p class="form-error" aria-live="polite"></p>';
    const select=el.querySelector('select[name="status"]');
    select.innerHTML='<option value="">'+M.tr('الكل','All')+'</option>'+[['review','قيد المراجعة','Under review'],['active','نشطة','Active'],['completed','مكتملة','Completed'],['suspended','معلقة','Suspended'],['blocked','محظورة','Blocked'],['deleted','محذوفة','Deleted']].map(([v,ar,en])=>'<option value="'+v+'">'+M.tr(ar,en)+'</option>').join('');
    const button=document.createElement('button');button.type='submit';button.className='btn btn-primary';button.dataset.ar='بحث';button.dataset.en='Search';button.textContent=M.tr('بحث','Search');el.insertBefore(button,el.querySelector('[type="reset"]'));
    parent.prepend(el);
    M.applyLanguage(M.language());
    const values=()=>Object.fromEntries(new FormData(el));
    let timer;
    function update(){const f=values();el.querySelector('.form-error').textContent=f.from&&f.to&&f.from>f.to?M.tr('تاريخ البداية بعد تاريخ النهاية.','Start date is after end date.'):'';change();}
    el.onsubmit=async e=>{e.preventDefault();clearTimeout(timer);button.disabled=true;try{await API.refresh();update();document.dispatchEvent(new Event('records-changed'));}catch(error){el.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
    el.oninput=()=>{clearTimeout(timer);timer=setTimeout(update,180);};el.onchange=update;
    el.onreset=()=>{clearTimeout(timer);setTimeout(update,0);};
    document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{el.querySelectorAll('option[value]').forEach(o=>{if(o.value)o.textContent=W.status(o.value);});}));
    return {match:(item,text)=>matches(item,text,values()),el,setStatus:value=>{el.elements.status.value=value;}};
  }
  function createAdmin(parent,change){
    const wrap=document.createElement('div');wrap.className='admin-search';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='icon-btn admin-search-toggle';toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg><span class="sr-only"></span>';
    const form=document.createElement('form');form.className='admin-search-popover hidden';
    form.innerHTML='<input name="query" type="search" autocomplete="off"><button type="button" class="admin-search-clear" aria-label="Clear">×</button>';
    wrap.append(toggle,form);parent.append(wrap);
    const input=form.elements.query,clear=form.querySelector('.admin-search-clear');
    const labels=()=>{
      const role=M.session()?.role;
      const text=role==='admin'
        ? M.tr('بحث برقم الطلب أو العرض أو اسم العميل أو المورد','Search by request/offer number, customer or supplier name')
        : M.tr('بحث برقم الطلب أو العرض أو اسم المنتج','Search by request/offer number or product name');
      input.placeholder=text;input.setAttribute('aria-label',text);toggle.title=M.tr('بحث','Search');toggle.querySelector('.sr-only').textContent=M.tr('بحث','Search');
    };
    const update=()=>change();
    toggle.onclick=()=>{const open=form.classList.toggle('hidden')===false;toggle.setAttribute('aria-expanded',String(open));if(open)input.focus();};
    form.onsubmit=e=>{e.preventDefault();update();};
    input.oninput=update;
    clear.onclick=()=>{input.value='';update();input.focus();};
    input.onkeydown=e=>{if(e.key==='Escape'){form.classList.add('hidden');toggle.setAttribute('aria-expanded','false');toggle.focus();}};
    document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',labels));labels();
    return {match:(item,text)=>matches(item,text,{query:input.value}),el:wrap,query:()=>input.value};
  }
  window.Search={matches,create,createAdmin};
})();
