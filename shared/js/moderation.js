/* Display helpers only. The API independently authorizes every operation. */
(() => {
  const actions={
    block:['حظر الحساب','Block account'],unblock:['إلغاء الحظر','Unblock account'],
    suspend:['تعليق الطلب','Suspend request'],resume:['إعادة التفعيل','Resume request'],
    delete:['نقل إلى المحذوفات','Move to trash'],restore:['استعادة','Restore']
  };
  const bucket=kind=>({account:'accounts',request:'requests',quote:'quotes',public:'publicOffers'})[kind];
  function accountActive(id,s=M.state()) {const a=s.accounts.find(x=>x.id===id);return !a?.blockedAt&&!a?.deletedAt;}
  function userActive(){const u=M.session();return !!u&&accountActive(u.id);}
  function requestVisible(r,s=M.state()){return !!r&&!r.deletedAt&&!s.accounts.find(a=>a.id===r.customerId)?.deletedAt;}
  function requestOpen(r,s=M.state()){return requestVisible(r,s)&&!r.suspendedAt&&accountActive(r.customerId,s);}
  function offerVisible(o,s=M.state()){
    return !!o&&!o.deletedAt&&!s.accounts.find(a=>a.id===o.supplierId)?.deletedAt&&(o.supplierId===M.session()?.id||!o.requestId||requestVisible(s.requests.find(r=>r.id===o.requestId),s));
  }
  function offerOpen(o,s=M.state()){
    return offerVisible(o,s)&&accountActive(o.supplierId,s)&&(!o.requestId||requestOpen(s.requests.find(r=>r.id===o.requestId),s));
  }
  function stateLabel(x){return x.deletedAt?'deleted':x.blockedAt?'blocked':x.suspendedAt?'suspended':x.status||'active';}
  async function apply(kind,id,action,reason){
    await API.request('moderation',{kind,id,action,reason});
    await API.refresh();
  }
  function buttons(kind,x){
    if(M.session()?.role!=='admin'||x.role==='admin')return '';
    const list=x.deletedAt?['restore']:kind==='account'?[x.blockedAt?'unblock':'block','delete']:kind==='request'?[x.suspendedAt?'resume':'suspend','delete']:['delete'];
    return '<div class="invite-actions moderation-actions">'+list.filter(a=>M.can(['delete','restore'].includes(a)?'trash':'moderate')).map(a=>'<button type="button" class="btn '+(a==='delete'?'btn-danger':'btn-outline')+' btn-sm" data-moderate="'+a+'" data-kind="'+kind+'" data-id="'+W.escape(x.id)+'">'+M.tr(...actions[a])+'</button>').join('')+'</div>';
  }
  function log(x){return '<ul class="history-list">'+(x.moderationHistory||[]).map(h=>'<li>'+W.escape(W.date(h.at))+' — '+M.tr(...actions[h.action])+'<p>'+W.escape(h.reason)+'</p></li>').join('')+'</ul>';}
  function guard(){if(userActive())return true;M.toast('الحساب موقوف','Account disabled','لا يمكن تنفيذ هذا الإجراء.','This action is unavailable.');return false;}
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-moderate]');if(!b||M.session()?.role!=='admin')return;
    const {id,kind,moderate:action}=b.dataset,item=M.state()[bucket(kind)]?.find(x=>x.id===id);if(!item)return;
    const title=M.tr(...actions[action]),name=item.name||item.product||item.id;
    W.modal(title,'<p>'+W.escape(name)+' — #'+W.escape(id)+'</p><p>'+M.tr('سيُحفظ السجل. الحذف قابل للاستعادة ولا يحذف الطلبات المرتبطة نهائيًا.','History is retained. Deletion is recoverable; linked records are not permanently erased.')+'</p><form id="moderationConfirm"><label for="moderationReason">'+M.tr('سبب الإجراء (إلزامي)','Reason (required)')+'</label><textarea id="moderationReason" required maxlength="1000"></textarea><p class="form-error" id="moderationError"></p><button class="btn btn-primary" type="submit">'+M.tr('تأكيد','Confirm')+'</button> <button type="button" class="btn btn-outline" id="moderationCancel">'+M.tr('إلغاء','Cancel')+'</button></form>');
    document.getElementById('moderationCancel').onclick=()=>document.getElementById('workflowDialog').remove();
    document.getElementById('moderationConfirm').onsubmit=async event=>{
      event.preventDefault();try{await apply(kind,id,action,document.getElementById('moderationReason').value);}catch{document.getElementById('moderationError').textContent=M.tr('تعذر التنفيذ. تأكد من السبب وحالة العنصر ومساحة التخزين.','Unable to apply. Check reason, item status and storage.');return;}
      document.getElementById('workflowDialog').remove();
      document.dispatchEvent(new Event('records-changed'));
    };
  });
  // A second tab cannot keep a deleted session active.
  window.addEventListener('storage',()=>{const u=M.session();if(u&&M.state().accounts.find(a=>a.id===u.id)?.deletedAt){M.setSession(null);location.replace('login.html');}});
  window.R={accountActive,userActive,requestVisible,requestOpen,offerVisible,offerOpen,stateLabel,apply,buttons,log,guard,bucket};
})();
