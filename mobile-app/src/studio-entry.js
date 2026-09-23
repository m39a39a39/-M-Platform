import * as storefront from './storefront.js';
import * as admin from './admin-mobile.js';
window.MStorefront=storefront;window.MAdmin=admin;
import {session} from './session.js';
window.MStudioSession=session;
for(const file of ['domain.js','app.js','studio.js','live.js','unified.js','advanced.js']){
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/studio/'+file;script.onload=resolve;script.onerror=reject;document.body.append(script);});
}
