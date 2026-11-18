import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danfosal.app',
  appName: 'Danfosal App',
  webDir: 'www',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    // Live updates of the screens (www/app/updates.js, Finding #78): self-hosted only. Capgo's own
    // service is off - no automatic checks, no statistics, no channels - so the plugin talks only
    // to the URLs updates.js gives it (the release on GitHub). A new APK drops downloaded screens.
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      resetWhenUpdate: true,
      autoDeletePrevious: true,
      autoDeleteFailed: true,
      appReadyTimeout: 15000
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1f2937",
      showSpinner: false
    }
  }
};

export default config;
