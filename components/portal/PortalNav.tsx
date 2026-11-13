'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, FolderDown, GalleryHorizontalEnd, House, PanelLeftClose, PanelLeftOpen, PenLine, Settings } from 'lucide-react';

// Portal navigation: Home, Guidelines (with its chapters), Showcase, Resources, Settings, each with an icon.
// Open, it shows the full logo, icons and names; closed, the small logo (or the social avatar) and the icons only.
// The choice is remembered. On phones it's a bar with a menu.
const ICONS = { Home: House, Guidelines: BookOpen, Showcase: GalleryHorizontalEnd, Writer: PenLine, Resources: FolderDown, Settings } as const;
const KEY = 'pt-side-closed';
const I = { size: 18, strokeWidth: 1.6, 'aria-hidden': true } as const;

export function PortalNav({ slug, client, logoUrl, miniUrl, chapters, showSettings, showShowcase, showWriter, showcaseName }: { showcaseName?: string; slug: string; client: string; logoUrl: string | null; miniUrl?: string | null; chapters: { id: string; title: string }[]; showSettings: boolean; showShowcase: boolean; showWriter?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => { try { setClosed(localStorage.getItem(KEY) === '1'); } catch { /* storage blocked */ } }, []);
  const fold = (v: boolean) => { setClosed(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage blocked */ } };
  const base = `/p/${slug}`;
  const items = [
    ['Home', base], ['Guidelines', `${base}/guidelines`], ...(showShowcase ? [[showcaseName || 'Showcase', `${base}/showcase`] as const] : []), ...(showWriter ? [['Writer', `${base}/writer`] as const] : []), ['Resources', `${base}/resources`],
    ...(showSettings ? [['Settings', `${base}/settings`]] : [])
  ] as const;
  const isOn = (href: string) => (href === base ? path === base : path.startsWith(href) || (href.endsWith('/resources') && path.startsWith(`${base}/tools`)));
  const mini = miniUrl || logoUrl;
  return (
    <aside className={'pt-side' + (open ? ' open' : '') + (closed ? ' mini' : '')}>
      <div className="pt-brand">
        <Link href={base} className="pt-logo" aria-label={`${client} home`}>
          <span className="pt-logo-full">{logoUrl ? <img src={logoUrl} alt={client} /> : <span>{client}</span>}</span>
          <span className="pt-logo-sm" aria-hidden>{mini ? <img className="pt-logo-mini" src={mini} alt="" /> : <span className="pt-logo-init">{client.slice(0, 1)}</span>}</span>
        </Link>
        <button className="pt-burger" aria-expanded={open} aria-controls="pt-nav" onClick={() => setOpen(!open)}><span className="sr">Menu</span><svg width="14" height="8" viewBox="0 0 14 8" aria-hidden><path d="M0 .5h14M0 7.5h14" stroke="currentColor" /></svg></button>
      </div>
      <nav id="pt-nav" className="pt-nav" aria-label="Portal">
        {items.map(([label, href]) => { const Ic = ICONS[label as keyof typeof ICONS]; return <div key={href}>
          <Link href={href} className={'pt-it' + (isOn(href) ? ' on' : '')} aria-current={isOn(href) ? 'page' : undefined} onClick={() => setOpen(false)} data-tip={closed ? label : undefined} aria-label={closed ? label : undefined}>
            <Ic {...I} /><span className="pt-it-t">{label}</span>
          </Link>
          {label === 'Guidelines' && path.startsWith(href) ? <div className="pt-sub">{chapters.map((c, k) => { const h = `${href}/${c.id.replace(/[:;]/g, '-')}`; const on = path === h; return <Link key={c.id} href={h} className={'pt-subit' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => setOpen(false)}><span className="pt-n">{String(k + 1).padStart(2, '0')}</span>{c.title}</Link>; })}</div> : null}
        </div>; })}
      </nav>
      <div className="pt-foot">
        <button type="button" className="pt-fold" onClick={() => fold(!closed)} aria-label={closed ? 'Open the sidebar' : 'Close the sidebar'} data-tip={closed ? 'Open the sidebar' : undefined}>{closed ? <PanelLeftOpen {...I} /> : <PanelLeftClose {...I} />}<span className="pt-it-t">Close sidebar</span></button>
        <a className="pt-credit" href="https://lostproperty.studio" target="_blank" rel="noopener" aria-label="Designed and built by Lost Property Studio" data-tip={closed ? 'Designed and built by Lost Property Studio' : undefined}>
          <span className="pt-credit-by">Designed and built by</span>
          <span className="pt-credit-lp"><img src="/lp-logo.svg" alt="" /><span>Lost Property Studio</span></span>
        </a>
      </div>
    </aside>
  );
}
