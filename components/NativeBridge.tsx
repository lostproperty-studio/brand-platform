'use client';
import { useEffect } from 'react';

// Inside the iOS app (mobile/) the page talks to the phone through Capacitor's bridge, which the app adds to every
// page. On the web this does nothing. No Capacitor packages are bundled: the plugins are reached through the bridge.
type Plugin = Record<string, (...a: unknown[]) => Promise<unknown>> & { addListener: (e: string, f: (x: never) => void) => Promise<unknown> };
type Cap = { isNativePlatform?: () => boolean; Plugins: Record<string, Plugin | undefined> };
const cap = () => (globalThis as { Capacitor?: Cap }).Capacitor;

export function NativeBridge() {
  useEffect(() => {
    const C = cap(); if (!C?.isNativePlatform?.()) return;
    const { App, Browser, PushNotifications, Haptics } = C.Plugins;
    // Universal links (a sign-in email, a link to a portal page) open here, in the app
    App?.addListener('appUrlOpen', ((e: { url: string }) => { try { const u = new URL(e.url); if (u.host === location.host) location.assign(u.pathname + u.search + u.hash); } catch { /* not a link */ } }) as never);
    // Links to other sites, and files to download, open in a Safari sheet over the app instead of replacing it
    const click = (ev: MouseEvent) => {
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null; if (!a || ev.defaultPrevented) return;
      const href = a.href; if (!/^https?:/.test(href)) return;
      const other = new URL(href).host !== location.host;
      if (other || a.target === '_blank' || a.hasAttribute('download')) { ev.preventDefault(); Browser?.open({ url: href, presentationStyle: 'popover' }); }
    };
    document.addEventListener('click', click, true);
    // A light tap on the tab bar, like a native tab bar
    const tap = (ev: Event) => { if ((ev.target as Element | null)?.closest?.('.pt-tab')) Haptics?.selectionChanged?.().catch(() => {}); };
    document.addEventListener('pointerdown', tap, true);
    // Notifications: asked once someone is signed in and inside a portal or the studio, never on the sign-in page
    if (PushNotifications && /^\/(p|studio)\//.test(location.pathname + '/')) {
      PushNotifications.addListener('registration', ((t: { value: string }) => { fetch('/api/app/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t.value, platform: 'ios' }) }).catch(() => {}); }) as never);
      PushNotifications.addListener('pushNotificationActionPerformed', ((a: { notification?: { data?: { path?: string } } }) => { const p = a.notification?.data?.path; if (p?.startsWith('/')) location.assign(p); }) as never);
      (PushNotifications.checkPermissions() as Promise<{ receive: string }>).then(async (s) => {
        let r = s.receive;
        if (r === 'prompt' || r === 'prompt-with-rationale') r = ((await PushNotifications.requestPermissions()) as { receive: string }).receive;
        if (r === 'granted') await PushNotifications.register();
      }).catch(() => {});
    }
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('pointerdown', tap, true); };
  }, []);
  return null;
}
