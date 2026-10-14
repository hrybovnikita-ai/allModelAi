import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.allmodelai.app',
  appName: 'AllModelAI',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
    scheme: 'AllModelAI',
    backgroundColor: '#080b12',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#080b12',
    allowMixedContent: true,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#080b12',
    },
    Browser: {
      toolbarColor: '#080b12',
    },
  },
};

export default config;
