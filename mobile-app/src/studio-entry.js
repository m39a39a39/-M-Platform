import {session} from './session.js';
window.MStudioSession=session;
for(const file of ['domain.js','app.js','studio.js','live.js']){
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/studio/'+file;script.onload=resolve;script.onerror=reject;document.body.append(script);});
}
