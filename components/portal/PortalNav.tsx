'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Portal navigation: Home, Guidelines (with its chapters), Resources, Settings. Collapses to a menu on phones.
export function PortalNav({ slug, client, logoUrl, chapters, showSettings }: { slug: string; client: string; logoUrl: string | null; chapters: { id: string; title: string }[]; showSettings: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/p/${slug}`;
  const items = [
    ['Home', base], ['Guidelines', `${base}/guidelines`], ['Resources', `${base}/resources`],
    ...(showSettings ? [['Settings', `${base}/settings`]] : [])
  ] as const;
  const isOn = (href: string) => (href === base ? path === base : path.startsWith(href) || (href.endsWith('/resources') && path.startsWith(`${base}/tools`)));
  return (
    <aside className={'pt-side' + (open ? ' open' : '')}>
      <div className="pt-brand">
        <Link href={base} className="pt-logo" aria-label={`${client} home`}>{logoUrl ? <img src={logoUrl} alt={client} /> : <span>{client}</span>}</Link>
        <button className="pt-burger" aria-expanded={open} aria-controls="pt-nav" onClick={() => setOpen(!open)}><span className="sr">Menu</span><svg width="14" height="8" viewBox="0 0 14 8" aria-hidden><path d="M0 .5h14M0 7.5h14" stroke="currentColor" /></svg></button>
      </div>
      <nav id="pt-nav" className="pt-nav" aria-label="Portal">
        {items.map(([label, href], i) => <div key={href}>
          <Link href={href} className={'pt-it' + (isOn(href) ? ' on' : '')} aria-current={isOn(href) ? 'page' : undefined} onClick={() => setOpen(false)}><span className="pt-n">{String(i + 1).padStart(2, '0')}</span>{label}</Link>
          {label === 'Guidelines' && path.startsWith(href) ? <div className="pt-sub">{chapters.map((c, k) => { const h = `${href}/${c.id.replace(/[:;]/g, '-')}`; const on = path === h; return <Link key={c.id} href={h} className={'pt-subit' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => setOpen(false)}><span className="pt-n">{String(k + 1).padStart(2, '0')}</span>{c.title}</Link>; })}</div> : null}
        </div>)}
      </nav>
      <p className="pt-foot mute">{client} brand guidelines</p>
      <p className="pt-credit">Designed and built by <img src="/lp-logo.svg" alt="" /> Lost Property Studio</p>
    </aside>
  );
}
