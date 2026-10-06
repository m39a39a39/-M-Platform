import './guest.js';

let hasWebSession=false;
for(const store of [globalThis.localStorage,globalThis.sessionStorage]){
  if(hasWebSession||!store)continue;
  try{hasWebSession=!!store.getItem('m-platform.session.v1');}catch{}
}

const accountRoute=['/customer','/customer.html','/supplier','/supplier.html','/login.html','/reset-password.html','/register-customer.html','/register-supplier.html'].includes(location.pathname);
const nativeRuntime=location.protocol==='capacitor:'||location.protocol==='ionic:'||location.protocol==='file:';

if(!accountRoute&&!nativeRuntime&&!hasWebSession){
  window.addEventListener('mplatform:register',event=>{
    const role=event.detail?.role==='supplier'?'supplier':'client';
    location.assign((role==='supplier'?'/supplier.html':'/customer.html')+'?auth=register');
  });
}else{
  await import('./app.js');
}
