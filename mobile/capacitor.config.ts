import type { CapacitorConfig } from '@capacitor/cli';

// LP Platform for iOS: a native shell around the live brand platform. The app opens the platform itself (server.url),
// so every change to the platform reaches the app without a new release. The pages see "LPPlatformApp" in the user
// agent and switch to their native look (app/layout.tsx marks <html class="in-app">).
// Build for staging with `npm run staging`, for live with `npm run live`.
// Staging until the app's changes (feature/portal-v2) are live; then make the live platform the default
const url = process.env.LP_URL || 'https://staging.platform.lostproperty.studio';
const host = new URL(url).host;

const config: CapacitorConfig = {
  appId: 'studio.lostproperty.platform',
  appName: 'LP Platform',
  webDir: 'www',
  server: { url, allowNavigation: [host, '*.supabase.co'], errorPath: 'offline.html' },
  ios: {
    contentInset: 'never',
    appendUserAgent: 'LPPlatformApp/1.0',
    backgroundColor: '#ffffff',
    scrollEnabled: true,
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#ffffff', showSpinner: false, launchAutoHide: true },
    StatusBar: { style: 'LIGHT', overlaysWebView: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] }
  }
};
export default config;
