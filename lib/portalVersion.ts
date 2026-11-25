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
