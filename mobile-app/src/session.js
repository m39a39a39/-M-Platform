import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { createSession } from './session-core.js';

const key = 'm-platform.session.v1';
// Never use the plugin's unencrypted web/localStorage fallback for credentials.
let webSession = null;
const storage = {
  async get() {
    if (!Capacitor.isNativePlatform()) return webSession;
    const keys = await SecureStoragePlugin.keys();
    if (!keys.value.includes(key)) return null;
    const { value } = await SecureStoragePlugin.get({key});
    try { return JSON.parse(value); } catch { await this.remove(); return null; }
  },
  async set(value) {
    if (!Capacitor.isNativePlatform()) { webSession = value; return; }
    await SecureStoragePlugin.set({key,value:JSON.stringify(value)});
  },
  async remove() {
    webSession = null;
    if (Capacitor.isNativePlatform()) {
      const keys = await SecureStoragePlugin.keys();
      if (keys.value.includes(key)) await SecureStoragePlugin.remove({key});
    }
  }
};
export const session = createSession({storage});
