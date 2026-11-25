// Portal v2: the new client portal (a new home, and the apps in their own section of the sidebar).
// Two ways it's on:
//   - for every project on a site that sets PORTAL_V2=1 (the staging site, see docs/STAGING.md), via portalV2();
//   - per project, through the 'portal' stage in Admin settings → Releases (lib/portalVersionServer.ts).
// portalV2() on its own is only for things that stay staging-only for now (the brand panel in other apps).
export const portalV2 = () => process.env.PORTAL_V2 === '1';

export type AppKey = 'writer' | 'director' | 'designer' | 'photographer';
/** The apps in the order they arrive. `ready` ones open; the others show as Coming next in the sidebar. */
export const APPS: { key: AppKey; name: string; about: string; ready: boolean }[] = [
  { key: 'writer', name: 'Writer', about: 'Docs of on-brand copy, piece by piece', ready: true },
  { key: 'director', name: 'Director', about: 'Projects of short-form videos', ready: true },
  { key: 'designer', name: 'Designer', about: 'Files of designs, in any size', ready: false },
  { key: 'photographer', name: 'Photographer', about: 'Collections of on-brand images', ready: false }
];

// Portal versions. The studio always has a Main portal (what clients get) and, while one is being built, a Beta.
// Each client's beta access is Off, Studio only (the studio can try it on that client's portal, in Staging) or
// Client (that client's team gets it). When the beta is ready for everyone, an admin makes it the main portal in
// Admin settings → Releases, and the next version, once there's one in the code, becomes the beta.
// Code for a version checks the number it was built for: ctx.portal >= 2 for Portal 2, and so on.
export const PORTALS: { n: number; name: string; about: string }[] = [
  { n: 1, name: 'Portal 1', about: 'The first portal: Home, Guidelines, Showcase, Writer, Resources and Settings.' },
  { n: 2, name: 'Portal 2', about: 'A new home page, the guidelines with their own chapter list, and the apps (Writer, Director) in their own section of the sidebar.' }
];
export const LATEST_PORTAL = PORTALS[PORTALS.length - 1].n;
export const portalName = (n: number) => PORTALS.find((p) => p.n === n)?.name || `Portal ${n}`;
export type BetaAccess = 'off' | 'studio' | 'client';
export const BETA_ACCESS: { id: BetaAccess; label: string; about: string }[] = [
  { id: 'off', label: 'Off', about: 'Nobody sees the beta on this portal.' },
  { id: 'studio', label: 'Studio only', about: 'Lost Property can try it in Staging. The client keeps the main portal.' },
  { id: 'client', label: 'Client', about: 'The client’s team gets the beta.' }
];
