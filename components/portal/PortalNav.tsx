'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/portal/AppIcon';
import type { AppKey } from '@/lib/portalVersion';
import { BookOpen, ChevronLeft, Clapperboard, FolderDown, GalleryHorizontalEnd, House, LayoutGrid, PanelLeftClose, PanelLeftOpen, PenLine, Settings, Share, Sparkles, SquarePlus, X } from 'lucide-react';

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
export type NavApp = { key: AppKey; name: string; ready: boolean; teaser?: string };

export function PortalNav({ slug, client, logoUrl, miniUrl, chapters, showSettings, showShowcase, showWriter, showcaseName, features = [], apps = [], rail = false }: { rail?: boolean; apps?: NavApp[]; features?: NavFeature[]; showcaseName?: string; slug: string; client: string; logoUrl: string | null; miniUrl?: string | null; chapters: { id: string; title: string }[]; showSettings: boolean; showShowcase: boolean; showWriter?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [min, setMin] = useState(false);
  const [how, setHow] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => { setOpen(false); setMore(false); setMin(false); }, [path]);
  // iPhone Safari, not yet on the Home Screen: offer the steps to install it
  useEffect(() => { const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone; setCanInstall(ios && !standalone); }, []);
  // The tab bar shrinks to the current tab while scrolling down, and comes back on the way up (like iOS)
  useEffect(() => {
    let last = scrollY;
    const f = () => { const y = scrollY; if (Math.abs(y - last) < 6) return; setMin(y > last && y > 120); last = y; };
    addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('gx-more', more); }, [more]);
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
        <button className="pt-burger" aria-expanded={open} aria-controls="pt-nav" onClick={() => setOpen(!open)}><span className="sr">{open ? 'Close the menu' : 'Menu'}</span>{open ? <X size={16} strokeWidth={1.75} aria-hidden /> : <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden><path d="M0 .5h14M0 7.5h14" stroke="currentColor" /></svg>}</button>
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
              : <Link key={a.key} href={`${base}/preview/${a.key}`} className={'pt-it pt-app off' + (path.startsWith(`${base}/preview/${a.key}`) ? ' on' : '')} onClick={() => setOpen(false)} data-tip={tips ? `${a.name}, coming soon: ${a.teaser || ''}` : undefined} title={tips ? undefined : a.teaser} aria-label={`${a.name}, coming soon`}><AppIcon app={a.key} size={18} still /><span className="pt-it-t">{a.name}</span><span className="pt-badge">Soon</span></Link>; })}
        </> : null}
      </nav>
      <div className="pt-foot">
        {rail ? null : <button type="button" className="pt-fold" onClick={() => fold(!closed)} aria-label={closed ? 'Open the sidebar' : 'Close the sidebar'} data-tip={closed ? 'Open the sidebar' : undefined}>{closed ? <PanelLeftOpen {...I} /> : <PanelLeftClose {...I} />}<span className="pt-it-t">Close sidebar</span></button>}
        <a className="pt-credit" href="https://lostproperty.studio" target="_blank" rel="noopener" aria-label="Designed and built by Lost Property Studio" data-tip={tips ? 'Designed and built by Lost Property Studio' : undefined}>
          <span className="pt-credit-by">Designed and built by</span>
          <span className="pt-credit-lp"><img src="/lp-logo.svg" alt="" /><span>Lost Property Studio</span></span>
        </a>
      </div>
      {/* Phones and the installed app: a floating glass tab bar. "More" grows it into a card with everything else;
          the round button beside it opens Ask. It shrinks to the current tab while you scroll down. */}
      <div className={'gx' + (more ? ' open' : '') + (min && !more ? ' min' : '')} onClick={() => { if (min) setMin(false); }}>
        {more ? <div className="gx-card" role="dialog" aria-label="More">
          <div className="gx-head">
            <span className="gx-logo">{logoUrl ? <img src={logoUrl} alt={client} /> : <strong>{client}</strong>}</span>
            <button type="button" className="gx-x" onClick={() => setMore(false)} aria-label="Close"><X size={17} strokeWidth={1.8} aria-hidden /></button>
          </div>
          <div className="gx-scroll">
            {apps.length ? <section><p className="gx-h">Apps</p><div className="gx-apps">{apps.map((a) => a.ready
              ? <Link key={a.key} href={`${base}/${a.key}`} className="gx-app"><span className="gx-app-i"><AppIcon app={a.key} size={26} still /></span><span>{a.name}</span></Link>
              : <Link key={a.key} href={`${base}/preview/${a.key}`} className="gx-app off" onClick={() => setMore(false)} aria-label={`${a.name}, coming soon`}><span className="gx-app-i"><AppIcon app={a.key} size={26} still /></span><span>{a.name}</span></Link>)}</div></section> : null}
            {chapters.length ? <section><p className="gx-h">Guidelines</p><div className="gx-list">{chapters.map((c, k) => { const h = `${base}/guidelines/${c.id.replace(/[:;]/g, '-')}`; return <Link key={c.id} href={h} className={'gx-row' + (path === h ? ' on' : '')}><span className="gx-n">{String(k + 1).padStart(2, '0')}</span>{c.title}</Link>; })}</div></section> : null}
            <section><div className="gx-list">
              {showShowcase ? <Link href={`${base}/showcase`} className={'gx-row' + (isOn(`${base}/showcase`) ? ' on' : '')}><GalleryHorizontalEnd size={18} strokeWidth={1.6} aria-hidden />{showcaseName || 'Showcase'}</Link> : null}
              {features.map((f) => { const Ic = ICONS[f.label]; return <Link key={f.path} href={`${base}/${f.path}`} className="gx-row"><Ic size={18} strokeWidth={1.6} aria-hidden />{f.label}{f.badge ? <span className={'pt-badge ' + f.badge.toLowerCase()}>{f.badge}</span> : null}</Link>; })}
              {showSettings ? <Link href={`${base}/settings`} className={'gx-row' + (isOn(`${base}/settings`) ? ' on' : '')}><Settings size={18} strokeWidth={1.6} aria-hidden />Settings</Link> : null}
              {canInstall ? <button type="button" className="gx-row" onClick={() => setHow(!how)}><SquarePlus size={18} strokeWidth={1.6} aria-hidden />Add {client} to your Home Screen</button> : null}
              {how ? <p className="gx-how">Tap <Share size={14} aria-label="Share" /> in Safari’s toolbar, then <b>Add to Home Screen</b>. It opens full screen, like an app.</p> : null}
            </div></section>
          </div>
        </div> : null}
        <nav className="gx-tabs" aria-label="Sections">
          {([['Home', base, House], ['Guidelines', `${base}/guidelines`, BookOpen], ['Resources', `${base}/resources`, FolderDown]] as const).map(([label, href, Ic]) =>
            <Link key={href} href={href} className={'gx-tab' + (!more && isOn(href) ? ' on' : '')} aria-current={isOn(href) ? 'page' : undefined}><Ic size={22} strokeWidth={1.6} aria-hidden /><span>{label}</span></Link>)}
          <button type="button" className={'gx-tab' + (more || (!['', '/guidelines', '/resources'].some((x) => x ? path.startsWith(base + x) : path === base)) ? ' on' : '')} onClick={(e) => { e.stopPropagation(); setMore(!more); }} aria-expanded={more}><LayoutGrid size={22} strokeWidth={1.6} aria-hidden /><span>More</span></button>
        </nav>
      </div>
      <button type="button" className={'gx-ask' + (min && !more ? ' min' : '')} onClick={() => { setMore(false); window.dispatchEvent(new CustomEvent('lp-ask', { detail: '' })); }} aria-label={`Ask about ${client}`}><Sparkles size={22} strokeWidth={1.6} aria-hidden /></button>
      {more ? <div className="gx-scrim" onClick={() => setMore(false)} /> : null}
      {/* Inside an app (Writer and the rest) on a phone: a slim bar back to the portal */}
      <Link href={base} className="gx-back"><ChevronLeft size={22} strokeWidth={1.8} aria-hidden />{logoUrl ? <img src={logoUrl} alt={client} /> : client}</Link>
    </aside>
  );
}
