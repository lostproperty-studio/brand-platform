// Portal v2: the new client portal (a new home, and the apps in their own section of the sidebar). It's built on
// the feature/portal-v2 branch and runs on the staging site, which sets PORTAL_V2=1. Anywhere else it stays off, so
// merging the code changes nothing for clients until it's switched on. See docs/STAGING.md.
export const portalV2 = () => process.env.PORTAL_V2 === '1';

export type AppKey = 'writer' | 'director' | 'designer' | 'photographer';
/** The apps in the order they arrive. `ready` ones open; the others show as Coming next in the sidebar. */
export const APPS: { key: AppKey; name: string; about: string; ready: boolean }[] = [
  { key: 'writer', name: 'Writer', about: 'Docs of on-brand copy, piece by piece', ready: true },
  { key: 'director', name: 'Director', about: 'Projects of short-form videos', ready: true },
  { key: 'designer', name: 'Designer', about: 'Files of designs, in any size', ready: false },
  { key: 'photographer', name: 'Photographer', about: 'Collections of on-brand images', ready: false }
];
