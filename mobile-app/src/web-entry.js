import './ios-select-fix.css';
import './ios-select-fix.js';
// The storefront is guest-only. The studio HTML is the sole administrator portal.
const legacyPortals=new Set(['/customer','/customer.html','/supplier','/supplier.html','/register-customer.html','/register-supplier.html']);
// Supabase may use its Site URL if a custom invite redirect is not allowlisted.
const inviteFragment=new URLSearchParams(location.hash.replace(/^#/,''));
if(['invite','recovery'].includes(inviteFragment.get('type'))&&inviteFragment.get('access_token')){
 location.replace('/reset-password.html'+location.hash);
}else if(legacyPortals.has(location.pathname)){
 location.replace('/');
}else if(location.pathname==='/login.html'){
 location.replace('/admin.html');
}else{
 await import('./guest.js');
}
