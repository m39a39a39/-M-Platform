const form=document.getElementById('resetForm'),message=document.getElementById('message');
const hash=new URLSearchParams(location.hash.replace(/^#/,'')),query=new URLSearchParams(location.search);
const type=hash.get('type')||query.get('type');
const token=hash.get('access_token')||query.get('access_token')||'';
if(type!=='recovery'||token.length<20){
 form.hidden=true;message.textContent='رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا من إدارة المتجر.';
}
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
  message.textContent='تم تغيير كلمة المرور. يمكنك الآن تسجيل دخول الإدارة.';
 }catch(error){message.textContent=error.message||'تعذر الاتصال. حاول مجددًا.';button.disabled=false;}
});
