import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mig.mplatform',
  appName: 'IMSG',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
