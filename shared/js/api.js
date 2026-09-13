/* Browser keeps only a projected, in-memory snapshot. Supabase tokens are HttpOnly cookies. */
(() => {
  let snapshot={accounts:[],requests:[],quotes:[],publicOffers:[],interests:[],settings:{},user:null};
  let saving=false;
  async function request(path,body){
    const response=await fetch('/api/'+path,{credentials:'same-origin',method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok){
      if(response.status===429)throw Error('تم إرسال محاولات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مرة واحدة فقط / Too many attempts. Wait one minute and try once.');
      throw Error(data.error||'تعذر الاتصال بالخادم / Server unavailable');
    }
    return data;
  }
  async function refresh(){snapshot=await request('state');return snapshot;}
  const metadata=new Set(['id','displayNo','version','createdAt','updatedAt','customerId','supplierId','customerName','supplierName','history','moderationHistory']);
  async function storeImage(src){return src?.startsWith('data:')?(await request('uploads',{source:src})).src:src;}
  async function save(next){
    if(saving)throw Error('عملية حفظ جارية / Save in progress');saving=true;
    try{
      const jobs=[];
      for(const collection of ['requests','quotes','publicOffers','interests']){
        for(const item of next[collection]||[]){
          const old=snapshot[collection].find(x=>x.id===item.id),patch={};
          for(const [k,v] of Object.entries(item))if(!metadata.has(k)&&JSON.stringify(v)!==JSON.stringify(old?.[k]))patch[k]=v;
          if(!Object.keys(patch).length)continue;
          jobs.push({collection,id:item.id,version:old?.version||0,patch,redactionConfirmed:!!document.getElementById('redactIdentity')?.checked&&!!document.getElementById('redactContact')?.checked});
        }
      }
      const settingsChanged=JSON.stringify(next.settings)!==JSON.stringify(snapshot.settings);
      if(jobs.length+(settingsChanged?1:0)>1)throw Error('احفظ عنصرًا واحدًا في كل مرة / Save one item at a time');
      for(const job of jobs){if(job.patch.images)job.patch.images=await Promise.all(job.patch.images.map(storeImage));await request('mutations',job);}
      if(settingsChanged){const {_version,...data}=next.settings;data.logo=await storeImage(data.logo);await request('settings',{version:snapshot.settings._version,data});}
      await refresh();
    }finally{saving=false;}
  }
  window.API={request,refresh,save,state:()=>structuredClone(snapshot),session:()=>snapshot.user};
  window.addEventListener('unhandledrejection',e=>{
    e.preventDefault();const message=e.reason?.message||'تعذر إكمال العملية / Operation failed';
    const target=[...document.querySelectorAll('.form-error')].find(el=>el.getClientRects().length);
    if(target)target.textContent=message;else if(window.M)M.toast('تعذر التنفيذ','Action failed',message,message);
  });
})();
