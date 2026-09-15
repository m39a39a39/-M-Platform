import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

const API='https://m-platform-tan.vercel.app';
let accessToken=null;
let refreshToken=null;
let currentUser=null;
let appConfig=null;
let lang='ar';

const copy={
  ar:{tagline:'اطلب ما تحتاجه، وقارن العروض بثقة.',secure:'دخول آمن',loginTitle:'تسجيل الدخول',loginSubtitle:'استخدم نفس حسابك الموجود على المنصة.',email:'البريد الإلكتروني',password:'كلمة المرور',login:'تسجيل الدخول',welcome:'مرحبًا',notifications:'الإشعارات',logout:'تسجيل الخروج',loading:'جارٍ تسجيل الدخول...',failed:'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',clientAction:'طلباتي والعروض',supplierAction:'طلبات الأسعار',adminAction:'لوحة الإدارة',customer:'عميل',supplier:'مورد',admin:'إدارة'},
  en:{tagline:'Request what you need, and compare offers with confidence.',secure:'Secure access',loginTitle:'Sign in',loginSubtitle:'Use the same account you already have on the platform.',email:'Email address',password:'Password',login:'Sign in',welcome:'Welcome',notifications:'Notifications',logout:'Sign out',loading:'Signing in...',failed:'Unable to sign in. Check your email and password.',clientAction:'My requests & offers',supplierAction:'RFQ invitations',adminAction:'Admin dashboard',customer:'Customer',supplier:'Supplier',admin:'Admin'}
};

const $=id=>document.getElementById(id);
const setMessage=text=>{$('message').textContent=text||'';};
const t=key=>copy[lang][key]||key;

function applyLanguage(){
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  $('langBtn').textContent=lang==='ar'?'EN':'AR';
  if(currentUser)renderHome(currentUser);
}

async function request(path,{method='GET',body,auth=false}={}){
  const headers={'X-M-Client':'native'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(auth&&accessToken)headers.Authorization=`Bearer ${accessToken}`;
  let response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401&&auth&&refreshToken){
    const refreshed=await fetch(API+'/api/v1/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-M-Client':'native'},body:JSON.stringify({refreshToken})});
    if(refreshed.ok){
      const data=await refreshed.json();
      accessToken=data.tokens?.accessToken||null;
      refreshToken=data.tokens?.refreshToken||refreshToken;
      if(accessToken){
        headers.Authorization=`Bearer ${accessToken}`;
        response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      }
    }
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}

async function login(email,password){
  const data=await request('/api/v1/auth/login',{method:'POST',body:{email,password}});
  accessToken=data.tokens?.accessToken||null;
  refreshToken=data.tokens?.refreshToken||null;
  currentUser=data.user||null;
  if(!accessToken||!refreshToken||!currentUser)throw new Error('Missing native session');
  return currentUser;
}

function clearSession(){
  accessToken=null;refreshToken=null;currentUser=null;
  $('homeView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  $('loginForm').reset();setMessage('');
}

function renderHome(user){
  $('userName').textContent=user.name||user.company||user.email||'M Platform';
  const roleKey=user.role==='client'?'customer':user.role;
  $('roleLabel').textContent=t(roleKey);
  $('primaryAction').textContent=user.role==='client'?t('clientAction'):user.role==='supplier'?t('supplierAction'):t('adminAction');
  $('loginView').classList.add('hidden');
  $('homeView').classList.remove('hidden');
}

function primaryTarget(role){
  if(role==='client')return 'mplatform://customer/requests';
  if(role==='supplier')return 'mplatform://supplier/requests';
  return 'mplatform://admin';
}

async function openDeepLink(url){
  if(!url)return;
  // Placeholder router for the next mobile screens. Keeping navigation centralized
  // means push notifications and internal buttons use the same route handling.
  console.info('Deep link',url);
  if(url.includes('/notifications'))setMessage(lang==='ar'?'سيتم فتح مركز الإشعارات في المرحلة التالية.':'Notification center will open in the next stage.');
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();setMessage(t('loading'));$('loginBtn').disabled=true;
  try{
    const user=await login($('email').value.trim(),$('password').value);
    setMessage('');renderHome(user);
  }catch(error){
    console.error(error);setMessage(t('failed'));
  }finally{$('loginBtn').disabled=false;}
});

$('langBtn').addEventListener('click',async()=>{
  lang=lang==='ar'?'en':'ar';
  await Preferences.set({key:'language',value:lang});
  applyLanguage();
});

$('logoutBtn').addEventListener('click',async()=>{
  try{if(accessToken)await request('/api/v1/auth/logout',{method:'POST',body:{},auth:true});}catch{}
  clearSession();
});

$('primaryAction').addEventListener('click',()=>openDeepLink(primaryTarget(currentUser?.role)));
$('notificationsBtn').addEventListener('click',()=>openDeepLink('mplatform://notifications'));

App.addListener('appUrlOpen',event=>openDeepLink(event.url));

(async function boot(){
  const saved=await Preferences.get({key:'language'});lang=saved.value==='en'?'en':'ar';applyLanguage();
  try{appConfig=await request('/api/v1/app-config');console.info('App config loaded',appConfig.apiVersion);}catch(error){console.error('App config',error);}
})();
