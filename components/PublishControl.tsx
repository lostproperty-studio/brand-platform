'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, ExternalLink, Globe, Layers, Loader2, Lock, Rocket } from 'lucide-react';

export type PublishState = {
  projectId: string; slug: string; client: string; portalUrl: string; status: 'draft' | 'live' | 'archived';
  /** Staging: the portal versions this client can be seen on */
  staging: { main: string; beta: string | null; betaAccess: 'off' | 'studio' | 'client' };
  live: { version: string; at: string; by: string } | null;
  /** Changes waiting to go live, one line per area */
  pending: { label: string; who: string[]; at: string }[];
  canPublish: boolean;
};

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000, m = s / 60, h = m / 60, dd = h / 24;
  if (s < 60) return 'just now';
  if (m < 60) return `${Math.round(m)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  if (dd < 30) return `${Math.round(dd)}d ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Publishing, always in reach at the top of the project: the button says whether there's anything to publish, and
// opens a card with what clients see now (who published it and when) and what's waiting to go live.
export function PublishControl({ s }: { s: PublishState }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // What's waiting, kept current: the editors save without reloading the page, so ask again every 20 seconds while
  // the page is showing, when you come back to it, and when the card opens
  const [now, setNow] = useState({ live: s.live, pending: s.pending });
  useEffect(() => { setNow({ live: s.live, pending: s.pending }); }, [s.live, s.pending]);
  const refresh = useCallback(() => {
    if (document.hidden) return;
    fetch(`/api/projects/${s.projectId}/changes`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setNow({ live: j.live, pending: j.pending }); }).catch(() => {});
  }, [s.projectId]);
  useEffect(() => {
    const t = setInterval(refresh, 20000);
    addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(t); removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [refresh]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);
  const [tab, setTab] = useState<'staging' | 'production'>('production');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; fonts?: string[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = now.pending.length;
  const neverPublished = !now.live;
  const waiting = neverPublished || n > 0;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const c = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    addEventListener('keydown', k); addEventListener('mousedown', c);
    return () => { removeEventListener('keydown', k); removeEventListener('mousedown', c); };
  }, [open]);

  async function publish(allowTrialFonts = false) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/projects/${s.projectId}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowTrialFonts }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409 && j.code === 'trial_fonts') { setMsg({ text: 'Some typefaces are still trial files, so the client would see trial fonts.', bad: true, fonts: (j.fonts || []).map((f: { name?: string; label: string }) => f.name || f.label) }); return; }
    if (!r.ok) { setMsg({ text: j.error || (typeof j === 'string' ? j : 'Publishing didn’t work. Try again.'), bad: true }); return; }
    setMsg({ text: j.kit && !j.kit.ok ? `Published. The GitHub kit didn’t update: ${j.kit.error}` : 'Published. Clients see it now.', bad: !!(j.kit && !j.kit.ok) });
    router.refresh(); refresh();
  }

  return <div className="pub" ref={box}>
    <button type="button" className={'pub-go' + (waiting ? ' hot' : '')} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
      {waiting && !neverPublished ? <span className="pub-n" aria-label={`${n} unpublished change${n === 1 ? '' : 's'}`}>{n}</span> : null}Publish
    </button>
    {open ? <div className="pub-card" role="dialog" aria-label="Publish">
      <div className="pub-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'staging'} className={tab === 'staging' ? 'on' : ''} onClick={() => setTab('staging')}>Staging</button>
        <button type="button" role="tab" aria-selected={tab === 'production'} className={tab === 'production' ? 'on' : ''} onClick={() => setTab('production')}>Production</button>
      </div>
      {tab === 'staging' ? <>
        <div className="pub-row"><Lock {...I} /><span>Private to Lost Property</span></div>
        <div className="pub-row"><Clock {...I} /><span>Always your latest changes{n ? ` · ${n} not in Production yet` : neverPublished ? ' · nothing in Production yet' : ' · same as Production'}</span></div>
        <div className="pub-row"><Layers {...I} /><span>{s.staging.main}{s.staging.beta ? ` · beta ${s.staging.beta} ${s.staging.betaAccess === 'off' ? 'off for this client' : s.staging.betaAccess === 'client' ? 'given to the client' : 'for the studio'}` : ''}</span></div>
        <a className="pub-big" href={`/api/p/${s.slug}/staging?portal=main`}><ExternalLink {...I} />Open Staging</a>
        {s.staging.beta && s.staging.betaAccess !== 'off' ? <a className="pub-sub" href={`/api/p/${s.slug}/staging?portal=beta`}>Open Staging on {s.staging.beta} (beta)</a> : null}
        <Link className="pub-all" href="?tab=settings#portal" onClick={() => setOpen(false)}>Portal version settings</Link>
      </> : <>
        <div className="pub-row"><Globe {...I} /><a href={s.portalUrl} target="_blank" rel="noopener" className="pub-url">{s.portalUrl.replace(/^https?:\/\//, '')}</a></div>
        <div className="pub-row"><Clock {...I} />{now.live ? <span>{ago(now.live.at)} · by {now.live.by} · v{now.live.version}</span> : <span>Not published yet. {s.client} can’t see anything.</span>}</div>
        {n ? <div className="pub-pending">
          <p className="pub-k">{n} change{n === 1 ? '' : 's'} not published</p>
          <ul>{now.pending.slice(0, 6).map((c) => <li key={c.label}><span className="pub-dot" aria-hidden /><span className="pub-l">{c.label}</span><span className="mute">{c.who.join(', ')} · {ago(c.at)}</span></li>)}</ul>
        </div> : null}
        {msg ? <div className={'pub-msg' + (msg.bad ? ' bad' : '')} role="status"><p>{msg.text}{msg.fonts?.length ? ` (${msg.fonts.join(', ')})` : ''}</p>
          {msg.fonts ? <div className="pub-acts"><Link className="btn" href="?tab=typefaces" onClick={() => setOpen(false)}>Add licensed files</Link><button type="button" className="btn" onClick={() => publish(true)} disabled={busy}>Publish anyway</button></div> : null}
        </div> : null}
        {!s.canPublish ? <p className="pub-done mute">You can view this project but not publish it.</p>
          : waiting ? <button type="button" className="pub-big" onClick={() => publish()} disabled={busy}>{busy ? <Loader2 {...I} className="spin" /> : <Rocket {...I} />}{neverPublished ? `Publish to ${s.client}` : 'Publish changes'}</button>
          : <p className="pub-done"><Check {...I} />Latest published</p>}
        <Link className="pub-all" href="?tab=overview#versions" onClick={() => setOpen(false)}>All versions</Link>
      </>}
    </div> : null}
  </div>;
}
