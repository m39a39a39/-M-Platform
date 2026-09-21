import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { createSession } from './session-core.js';

const key = 'm-platform.session.v1';
// On the web, keep credentials only for the current browser tab so refreshes do not sign the user out.
let webSession = null;
function webRead(){
  if(typeof sessionStorage==='undefined')return webSession;
  try{
    const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):webSession;
  }catch{return webSession;}
}
function webWrite(value){
  webSession=value;
  if(typeof sessionStorage==='undefined')return;
  try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}
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
