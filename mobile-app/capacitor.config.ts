import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mig.mplatform',
  appName: 'M Platform',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
