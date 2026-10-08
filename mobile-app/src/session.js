import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { createSession } from './session-core.js';

const key = 'm-platform.session.v1';
// Web sessions persist across browser restarts and tabs. sessionStorage remains a
// one-release migration fallback for sessions created by older deployments.
let webSession = null;
function parseStored(raw){
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
function webRead(){
  let value=null;
  try{value=parseStored(localStorage.getItem(key));}catch{}
  if(value){webSession=value;return value;}
  try{
    value=parseStored(sessionStorage.getItem(key));
    if(value){
      webSession=value;
      try{localStorage.setItem(key,JSON.stringify(value));sessionStorage.removeItem(key);}catch{}
      return value;
    }
  }catch{}
  return webSession;
}
function webWrite(value){
  webSession=value;
  let persisted=false;
  try{
    if(value)localStorage.setItem(key,JSON.stringify(value));
    else localStorage.removeItem(key);
    persisted=true;
  }catch{}
  try{
    if(value&&!persisted)sessionStorage.setItem(key,JSON.stringify(value));
    else sessionStorage.removeItem(key);
  }catch{}
}

async function nativeGet() {
  try {
    const { value } = await SecureStoragePlugin.get({ key });
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      // Corrupted/legacy payload: remove only our session key and continue as signed out.
      await SecureStoragePlugin.remove({ key }).catch(() => {});
      return null;
    }
  } catch (error) {
    // On iOS this plugin rejects get() when the requested key does not exist.
    // A missing session is a normal signed-out state, not a secure-storage failure.
    const message = String(error?.message || error || '').toLowerCase();
    if (
      message.includes('does not exist') ||
      message.includes('not exist') ||
      message.includes('not found') ||
      message.includes('specified key') ||
      message.includes('item with given key')
    ) return null;
    throw error;
  }
}

const storage = {
  async get() {
    if (!Capacitor.isNativePlatform()) return webRead();
    return nativeGet();
  },
  async set(value) {
    if (!Capacitor.isNativePlatform()) {
      webWrite(value);
      return;
    }
    const result = await SecureStoragePlugin.set({ key, value: JSON.stringify(value) });
    if (result?.value === false) throw new Error('Secure storage write failed');
  },
  async remove() {
    webWrite(null);
    if (!Capacitor.isNativePlatform()) return;
    try {
      const result = await SecureStoragePlugin.remove({ key });
      if (result?.value === false) throw new Error('Secure storage removal failed');
    } catch (error) {
      // Removing an already-missing key is idempotent and should not break logout/startup.
      const message = String(error?.message || error || '').toLowerCase();
      if (
        message.includes('does not exist') ||
        message.includes('not exist') ||
        message.includes('not found') ||
        message.includes('specified key') ||
        message.includes('item with given key')
      ) return;
      throw error;
    }
  }
};

export const session = createSession({ storage });

if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
  window.addEventListener('storage', event => {
    if (event.key !== key || event.storageArea !== localStorage) return;
    // A different tab rotated credentials, changed account, or signed out.
    // Reloading is deliberate: it cancels account-specific UI work before the
    // shared session is restored, preventing stale data from another account.
    location.reload();
  });
}
