// Portal addresses: platform.lostproperty.studio/<slug>. These first parts of a path belong to the platform itself.
export const RESERVED = new Set(['p', 'dict', 'studio', 'api', 'login', 'logout', 'auth', 'join', 'admin', 'settings', '_next', 'fonts', 'static', 'public', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'lp-logo.svg', 'health', 'www', 'new']);
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'client';
export const validSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(s) && !RESERVED.has(s);
