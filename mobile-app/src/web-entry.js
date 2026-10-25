import './ios-select-fix.css';
import './ios-select-fix.js';
// The storefront is guest-only. The studio HTML is the sole administrator portal.
const legacyPortals=new Set(['/customer','/customer.html','/supplier','/supplier.html','/register-customer.html','/register-supplier.html']);
if(legacyPortals.has(location.pathname)){
 location.replace('/');
}else if(location.pathname==='/login.html'){
 location.replace('/admin.html');
}else{
 await import('./guest.js');
}
