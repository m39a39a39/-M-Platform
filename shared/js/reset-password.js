document.addEventListener('m:ready',()=>{
  const form=document.getElementById('resetPasswordForm'),error=document.getElementById('resetError'),success=document.getElementById('resetSuccess'),button=document.getElementById('resetPasswordBtn'),login=document.getElementById('resetLoginLink');
  const params=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=params.get('access_token')||'';
  const valid=params.get('type')==='recovery'&&token.length>=20;
  if(!valid){
    error.textContent=M.tr('رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من صفحة تسجيل الدخول.','This password reset link is invalid or expired. Request a new link from the sign-in page.');
    form.querySelectorAll('input,button[type="submit"]').forEach(el=>el.disabled=true);
    login.classList.remove('hidden');
    return;
  }
  history.replaceState(null,'',location.pathname);
  form.addEventListener('submit',async e=>{
    e.preventDefault();error.textContent='';success.textContent='';
    const password=document.getElementById('newPassword').value,confirm=document.getElementById('confirmPassword').value;
    if(password.length<8){error.textContent=M.tr('كلمة المرور يجب أن تكون 8 أحرف على الأقل.','Password must be at least 8 characters.');return;}
    if(password!==confirm){error.textContent=M.tr('كلمتا المرور غير متطابقتين.','Passwords do not match.');return;}
    button.disabled=true;
    try{
      const response=await fetch('/api/auth/reset',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({password})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||M.tr('تعذر تغيير كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.','Could not change the password. Request a new link and try again.'));
      document.getElementById('newPassword').value='';document.getElementById('confirmPassword').value='';
      form.querySelectorAll('input,button[type="submit"]').forEach(el=>el.disabled=true);
      success.textContent=M.tr('تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.','Your password has been changed successfully. You can now sign in with the new password.');
      login.classList.remove('hidden');
    }catch(err){error.textContent=err.message;button.disabled=false;}
  });
});
