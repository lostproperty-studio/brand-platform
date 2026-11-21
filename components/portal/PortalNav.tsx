'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/portal/AppIcon';
import type { AppKey } from '@/lib/portalVersion';
import { BookOpen, Clapperboard, FolderDown, GalleryHorizontalEnd, House, LayoutGrid, PanelLeftClose, PanelLeftOpen, PenLine, Settings, X } from 'lucide-react';

// Portal navigation: Home, Guidelines (with its chapters), Showcase, Resources, Settings, each with an icon.
// Open, it shows the full logo, icons and names; closed, the small logo (or the social avatar) and the icons only.
// The choice is remembered. On phones it's a bar with a menu. Gated features (lib/featureStages.ts) arrive as `features`,
// after the Writer, with a Labs or Beta badge until they're live.
const ICONS = { Home: House, Guidelines: BookOpen, Showcase: GalleryHorizontalEnd, Writer: PenLine, Director: Clapperboard, Resources: FolderDown, Settings } as const;
const KEY = 'pt-side-closed';
// Portal v2 (rail): always a slim icon rail; each icon names itself on hover.
const I = { size: 18, strokeWidth: 1.6, 'aria-hidden': true } as const;

export type NavFeature = { label: keyof typeof ICONS; path: string; badge: string | null };
/** Portal v2: the apps, in their own section under the portal's pages */
export type NavApp = { key: AppKey; name: string; ready: boolean };

export function PortalNav({ slug, client, logoUrl, miniUrl, chapters, showSettings, showShowcase, showWriter, showcaseName, features = [], apps = [], rail = false }: { rail?: boolean; apps?: NavApp[]; features?: NavFeature[]; showcaseName?: string; slug: string; client: string; logoUrl: string | null; miniUrl?: string | null; chapters: { id: string; title: string }[]; showSettings: boolean; showShowcase: boolean; showWriter?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  useEffect(() => { setOpen(false); setAppsOpen(false); }, [path]);
  const [folded, setClosed] = useState(false);
  useEffect(() => { try { setClosed(localStorage.getItem(KEY) === '1'); } catch { /* storage blocked */ } }, []);
  const fold = (v: boolean) => { setClosed(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage blocked */ } };
  const closed = rail || folded;
  const tips = closed;
  const base = `/p/${slug}`;
  const items = [
    ['Home', base], ['Guidelines', `${base}/guidelines`], ...(showShowcase ? [[showcaseName || 'Showcase', `${base}/showcase`] as const] : []), ...(showWriter ? [['Writer', `${base}/writer`] as const] : []), ...features.map((f) => [f.label, `${base}/${f.path}`] as const), ['Resources', `${base}/resources`],
    ...(showSettings ? [['Settings', `${base}/settings`]] : [])
  ] as const;
  const isOn = (href: string) => (href === base ? path === base : path.startsWith(href) || (href.endsWith('/resources') && path.startsWith(`${base}/tools`)));
  const mini = miniUrl || logoUrl;
  return (
    <aside className={'pt-side' + (open ? ' open' : '') + (closed ? ' mini' : '') + (rail ? ' rail' : '')}>
      <div className="pt-brand">
        <Link href={base} className="pt-logo" aria-label={`${client} home`}>
          <span className="pt-logo-full">{logoUrl ? <img src={logoUrl} alt={client} /> : <span>{client}</span>}</span>
          <span className="pt-logo-sm" aria-hidden>{mini ? <img className="pt-logo-mini" src={mini} alt="" /> : <span className="pt-logo-init">{client.slice(0, 1)}</span>}</span>
        </Link>
        <button className="pt-burger" aria-expanded={open} aria-controls="pt-nav" onClick={() => setOpen(!open)}><span className="sr">Menu</span><svg width="14" height="8" viewBox="0 0 14 8" aria-hidden><path d="M0 .5h14M0 7.5h14" stroke="currentColor" /></svg></button>
      </div>
      <nav id="pt-nav" className="pt-nav" aria-label="Portal">
        {items.map(([label, href]) => { const Ic = ICONS[label as keyof typeof ICONS]; return <div key={href}>
          <Link href={href} className={'pt-it' + (isOn(href) ? ' on' : '')} aria-current={isOn(href) ? 'page' : undefined} onClick={() => setOpen(false)} data-tip={tips ? label : undefined} aria-label={closed ? label : undefined}>
            <Ic {...I} /><span className="pt-it-t">{label}</span>{(() => { const b = features.find((f) => f.label === label)?.badge; return b ? <span className={'pt-badge ' + b.toLowerCase()}>{b}</span> : null; })()}
          </Link>
          {label === 'Guidelines' && path.startsWith(href) ? <div className="pt-sub">{chapters.map((c, k) => { const h = `${href}/${c.id.replace(/[:;]/g, '-')}`; const on = path === h; return <Link key={c.id} href={h} className={'pt-subit' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => setOpen(false)}><span className="pt-n">{String(k + 1).padStart(2, '0')}</span>{c.title}</Link>; })}</div> : null}
        </div>; })}
        {apps.length ? <>
          <p className="pt-nav-h">Apps</p>
          {apps.map((a) => { const href = `${base}/${a.key}`; const on = a.ready && path.startsWith(href);
            return a.ready
              ? <Link key={a.key} href={href} className={'pt-it pt-app' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => setOpen(false)} data-tip={tips ? a.name : undefined} aria-label={closed ? a.name : undefined}><AppIcon app={a.key} size={18} /><span className="pt-it-t">{a.name}</span></Link>
              : <span key={a.key} className="pt-it pt-app off" data-tip={tips ? `${a.name}: coming next` : undefined} aria-disabled><AppIcon app={a.key} size={18} still /><span className="pt-it-t">{a.name}</span><span className="pt-badge">Next</span></span>; })}
        </> : null}
      </nav>
      <div className="pt-foot">
        {rail ? null : <button type="button" className="pt-fold" onClick={() => fold(!closed)} aria-label={closed ? 'Open the sidebar' : 'Close the sidebar'} data-tip={closed ? 'Open the sidebar' : undefined}>{closed ? <PanelLeftOpen {...I} /> : <PanelLeftClose {...I} />}<span className="pt-it-t">Close sidebar</span></button>}
        <a className="pt-credit" href="https://lostproperty.studio" target="_blank" rel="noopener" aria-label="Designed and built by Lost Property Studio" data-tip={tips ? 'Designed and built by Lost Property Studio' : undefined}>
          <span className="pt-credit-by">Designed and built by</span>
          <span className="pt-credit-lp"><img src="/lp-logo.svg" alt="" /><span>Lost Property Studio</span></span>
        </a>
      </div>
      {/* Phones (and the iOS app): a tab bar along the bottom, like a native app */}
      <nav className="pt-tabs" aria-label="Sections">
        {([['Home', base, House], ['Guidelines', `${base}/guidelines`, BookOpen], ['Resources', `${base}/resources`, FolderDown]] as const).map(([label, href, Ic]) =>
          <Link key={href} href={href} className={'pt-tab' + (isOn(href) ? ' on' : '')} aria-current={isOn(href) ? 'page' : undefined}><Ic size={22} strokeWidth={1.6} aria-hidden /><span>{label}</span></Link>)}
        {apps.some((a) => a.ready)
          ? <button type="button" className={'pt-tab' + (appsOpen || apps.some((a) => path.startsWith(`${base}/${a.key}`)) ? ' on' : '')} onClick={() => setAppsOpen(!appsOpen)} aria-expanded={appsOpen}><LayoutGrid size={22} strokeWidth={1.6} aria-hidden /><span>Apps</span></button>
          : showSettings ? <Link href={`${base}/settings`} className={'pt-tab' + (isOn(`${base}/settings`) ? ' on' : '')}><Settings size={22} strokeWidth={1.6} aria-hidden /><span>Settings</span></Link> : null}
      </nav>
      {appsOpen ? <>
        <div className="pt-scrim" onClick={() => setAppsOpen(false)} />
        <div className="pt-appsheet" role="dialog" aria-label="Apps">
          <div className="pt-appsheet-h"><strong>Apps</strong><button type="button" className="pt-x" onClick={() => setAppsOpen(false)} aria-label="Close"><X size={18} aria-hidden /></button></div>
          <div className="pt-appgrid">{apps.map((a) => a.ready
            ? <Link key={a.key} href={`${base}/${a.key}`} className="pt-appc"><span className="pt-appc-i"><AppIcon app={a.key} size={26} still /></span><span>{a.name}</span></Link>
            : <span key={a.key} className="pt-appc off"><span className="pt-appc-i"><AppIcon app={a.key} size={26} still /></span><span>{a.name}</span><span className="mute">Coming next</span></span>)}</div>
        </div>
      </> : null}
    </aside>
  );
}
