const form=document.getElementById('resetForm'),message=document.getElementById('message');
let type='',token='';
function readInviteLink(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,'')),query=new URLSearchParams(location.search);
 type=hash.get('type')||query.get('type')||'';
 token=hash.get('access_token')||query.get('access_token')||'';
 const valid=['invite','recovery'].includes(type)&&token.length>=20;
 form.hidden=!valid;
 const button=form.querySelector('button[type="submit"]');
 if(button)button.disabled=false;
 message.textContent=valid?'':'رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا من إدارة المتجر.';
}
readInviteLink();
// A second invitation opened in the same tab may change only the URL fragment.
window.addEventListener('hashchange',readInviteLink);
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const fd=new FormData(form),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||''),button=form.querySelector('button');
 if(password!==confirm){message.textContent='كلمتا المرور غير متطابقتين.';return;}
 if(password.length<8||password.length>128){message.textContent='يجب أن تحتوي كلمة المرور على 8 إلى 128 حرفًا.';return;}
 button.disabled=true;message.textContent='جارٍ تحديث كلمة المرور...';
 try{
  const response=await fetch('/api/v1/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:token,password})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error||'تعذر تغيير كلمة المرور.');
  form.hidden=true;history.replaceState(null,'','/reset-password.html');
  message.textContent=type==='invite'?'تم تفعيل حساب الإدارة وإنشاء كلمة المرور. يمكنك الآن تسجيل الدخول.':'تم تغيير كلمة المرور. يمكنك الآن تسجيل دخول الإدارة.';
 }catch(error){message.textContent=error.message||'تعذر الاتصال. حاول مجددًا.';button.disabled=false;}
});
