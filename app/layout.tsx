import './globals.css';
import type { Metadata, Viewport } from 'next';
import { NativeBridge } from '@/components/NativeBridge';

export const metadata: Metadata = { title: 'Brand Platform · Lost Property', description: 'Client brand portals and AI-ready brand kits by Lost Property.', appleWebApp: { capable: true, title: 'Platform', statusBarStyle: 'default' }, icons: { icon: '/app/icon-192.png', apple: '/app/apple-touch-icon.png' }, applicationName: 'Platform' };
// viewport-fit=cover lets the phone layout reach the screen's edges and pad itself with the safe areas
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };
// The iOS app (mobile/) loads the platform with "LPPlatformApp" in its user agent: mark the page so it can look native
// Opened from the Home Screen (or the iOS app): mark the page so it looks and behaves like an app
const inApp = "try{if(/LPPlatformApp/.test(navigator.userAgent)||navigator.standalone||matchMedia('(display-mode: standalone)').matches)document.documentElement.classList.add('in-app')}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><script dangerouslySetInnerHTML={{ __html: inApp }} /></head><body>{children}<NativeBridge /></body></html>;
}
