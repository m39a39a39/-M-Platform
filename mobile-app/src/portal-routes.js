// Only the administration portal remains; historical customer and supplier
// records are preserved for existing admin business records.
export const portalPaths=Object.freeze({admin:'/admin.html'});
const screens=['overview','requests','settings','notifications','conversations'];
export function portalRole(pathname){
 return ['/admin','/admin.html','/studio.html'].includes(String(pathname).replace(/\/$/,''))?'admin':null;
}
export function portalScreen(role,search=''){
 if(role!=='admin')return 'overview';
 let screen=new URLSearchParams(search).get('screen');
 if(screen==='account')screen='settings';
 return screens.includes(screen)?screen:'overview';
}
export function portalUrl(role,screen='overview'){
 if(role!=='admin')return '/';
 return screens.includes(screen)&&screen!=='overview'?'/admin.html?screen='+encodeURIComponent(screen):'/admin.html';
}
export function portalRedirect(role,pathname,search='',native=false){
 if(native||role!=='admin')return null;
 const path=String(pathname).replace(/\/$/,'');
 return portalRole(path)&&path==='/admin.html'?null:portalUrl('admin',portalScreen('admin',search));
}
