document.addEventListener('m:ready',()=>{
  const params=new URLSearchParams(location.search);
  let role=params.get('role')==='supplier'?'supplier':'client';
  const go=()=>{const u=M.session();const page=u.role==='client'?'customer':u.role==='supplier'?'supplier':'admin';const offer=params.get('offer');location.href=page+'.html'+(offer&&u.role==='client'?'?offer='+encodeURIComponent(offer)+'#market':'');};
  function setRole(value){role=value;document.querySelectorAll('[data-auth-role]').forEach(b=>b.classList.toggle('active',b.dataset.authRole===value));const link=document.getElementById('registerLink');if(link)link.href=`register-${role==='supplier'?'supplier':'customer'}.html`;}
  function signupCooldown(button,error){
    let seconds=60;
    button.disabled=true;
    const original=button.dataset.originalText||button.textContent;
    button.dataset.originalText=original;
    const tick=()=>{
      if(seconds<=0){button.disabled=false;button.textContent=original;return;}
      button.textContent=M.tr(`حاول بعد ${seconds} ثانية`,`Try again in ${seconds}s`);
      seconds-=1;
      setTimeout(tick,1000);
    };
    error.textContent=M.tr('تم إرسال محاولات تسجيل كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مرة واحدة فقط.','Too many signup attempts. Wait one minute, then try once.');
    tick();
  }
  document.querySelectorAll('[data-auth-role]').forEach(b=>b.onclick=()=>setRole(b.dataset.authRole));setRole(role);
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const button=e.submitter,error=document.getElementById('authError');button.disabled=true;error.textContent='';
    try{await API.request('auth/login',{email:document.getElementById('loginEmail').value,password:document.getElementById('loginPassword').value});await API.refresh();go();}catch(err){error.textContent=err.message;}finally{button.disabled=false;}
  });
  document.querySelectorAll('.register-form').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const button=e.submitter,error=form.querySelector('.form-error');button.disabled=true;error.textContent='';
    let cooldown=false;
    try{
      const result=await API.request('auth/register',{...Object.fromEntries(new FormData(form)),role:form.dataset.role});
      if(result.confirmationRequired){error.textContent=M.tr('راجع بريدك لتأكيد الحساب ثم سجل الدخول.','Check your email to verify your account, then sign in.');form.reset();}
      else{await API.refresh();go();}
    }catch(err){
      cooldown=err.message.includes('انتظر دقيقة')||err.message.includes('Wait one minute');
      if(cooldown)signupCooldown(button,error);else error.textContent=err.message;
    }finally{if(!cooldown)button.disabled=false;}
  }));
});
