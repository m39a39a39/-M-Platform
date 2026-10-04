import './guest.js';

let hasWebSession=false;
try{hasWebSession=!!sessionStorage.getItem('m-platform.session.v1');}catch{}
const accountRoute=['/customer','/customer.html','/supplier','/supplier.html','/login.html','/reset-password.html','/register-customer.html','/register-supplier.html'].includes(location.pathname);
const nativeRuntime=location.protocol==='capacitor:'||location.protocol==='ionic:'||location.hostname==='localhost'&&location.protocol!=='https:';

if(nativeRuntime||accountRoute||hasWebSession)await import('./app.js');
