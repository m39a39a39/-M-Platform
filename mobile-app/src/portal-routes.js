export const portalPaths = Object.freeze({client:'/customer.html',supplier:'/supplier.html',admin:'/admin.html'});
const screens={client:['home','requests','offers','notifications','account'],supplier:['home','orders','requests','offers','notifications','account'],admin:['overview','orders','settings','notifications','conversations']};
export function portalRole(pathname){
  const path=String(pathname).replace(/\/$/,'');
  if(['/customer','/customer.html'].includes(path))return 'client';
  if(['/supplier','/supplier.html'].includes(path))return 'supplier';
  if(['/admin','/admin.html','/studio.html'].includes(path))return 'admin';
  return null;
}
export function portalScreen(role,search=''){
  let screen=new URLSearchParams(search).get('screen');
  if(role==='admin'&&screen==='account')screen='settings';
  return screens[role]?.includes(screen)?screen:role==='admin'?'overview':'home';
}
export function portalUrl(role,screen='home'){
  const base=portalPaths[role]||'/';
  return screens[role]?.includes(screen)&&!['home','overview'].includes(screen)?base+'?screen='+encodeURIComponent(screen):base;
}
// The authenticated server profile determines the portal, never the requested URL.
export function portalRedirect(role,pathname,search='',native=false){
  if(native||!portalPaths[role])return null;
  const requested=portalRole(pathname),query=new URLSearchParams(search);
  if(requested&&requested!==role)return portalPaths[role];
  if(requested===role)return pathname===portalPaths[role]?null:portalPaths[role]+search;
  const shopping=['product','category','page','q'].some(key=>query.has(key));
  if(role==='client'&&shopping)return null;
  return portalUrl(role,portalScreen(role,search));
}
