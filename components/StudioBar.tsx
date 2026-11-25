'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FolderKanban, Inbox, LogOut, Plus, Settings, UserRound, X } from 'lucide-react';
import { signOut } from '@/lib/auth/signOut';

// The studio on a phone: the same floating glass tab bar as the portals (styles: .gx in globals.css), with
// Projects, Requests, Admin and You, and a round + for a new project. Desktop never shows it.
export function StudioBar({ requests, admin, email }: { requests: number; admin: boolean; email: string }) {
  const path = usePathname(); const sp = useSearchParams();
  const [me, setMe] = useState(false);
  const [min, setMin] = useState(false);
  const qs = sp.toString();
  useEffect(() => { setMe(false); }, [path, qs]);
  useEffect(() => { let last = scrollY; const f = () => { const y = scrollY; if (Math.abs(y - last) < 6) return; setMin(y > last && y > 120); last = y; }; addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f); }, []);
  useEffect(() => { document.documentElement.classList.toggle('gx-more', me); }, [me]);
  const req = path === '/studio' && sp.get('f') === 'requests';
  const tabs = [
    { href: '/studio', label: 'Projects', Ic: FolderKanban, on: (path === '/studio' && !req) || path.startsWith('/studio/projects') },
    { href: '/studio?f=requests', label: 'Requests', Ic: Inbox, on: req, n: requests },
    ...(admin ? [{ href: '/studio/admin', label: 'Admin', Ic: Settings, on: path.startsWith('/studio/admin') }] : [])
  ];
  return <>
    <div className={'gx sb' + (me ? ' open' : '') + (min && !me ? ' min' : '')} onClick={() => { if (min) setMin(false); }} style={{ ['--n' as string]: tabs.length + 1 }}>
      {me ? <div className="gx-card" role="dialog" aria-label="You">
        <div className="gx-head"><span className="gx-logo"><img src="/lp-logo.svg" alt="Lost Property" /></span><button type="button" className="gx-x" onClick={() => setMe(false)} aria-label="Close"><X size={17} strokeWidth={1.8} aria-hidden /></button></div>
        <div className="gx-scroll"><div className="gx-list">
          <div className="gx-row"><UserRound size={18} strokeWidth={1.6} aria-hidden /><span className="gx-me">{email}</span></div>
          <form action={signOut}><button type="submit" className="gx-row"><LogOut size={18} strokeWidth={1.6} aria-hidden />Log out</button></form>
        </div><p className="gx-how">On a phone you can review, comment and edit the words. Layout, imports and files are on a bigger screen.</p></div>
      </div> : null}
      <nav className="gx-tabs" aria-label="Studio">
        {tabs.map((t) => <Link key={t.label} href={t.href} className={'gx-tab' + (!me && t.on ? ' on' : '')} aria-current={t.on ? 'page' : undefined}><t.Ic size={22} strokeWidth={1.6} aria-hidden />{t.n ? <i className="gx-badge">{t.n}</i> : null}<span>{t.label}</span></Link>)}
        <button type="button" className={'gx-tab' + (me ? ' on' : '')} onClick={(e) => { e.stopPropagation(); setMe(!me); }} aria-expanded={me}><UserRound size={22} strokeWidth={1.6} aria-hidden /><span>You</span></button>
      </nav>
    </div>
    <Link href="/studio/new" className={'gx-ask' + (min && !me ? ' min' : '')} aria-label="New project"><Plus size={24} strokeWidth={1.7} aria-hidden /></Link>
    {me ? <div className="gx-scrim" onClick={() => setMe(false)} /> : null}
  </>;
}
