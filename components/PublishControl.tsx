'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Globe, Loader2, Rocket } from 'lucide-react';

export type PublishState = {
  projectId: string; client: string; portalUrl: string; status: 'draft' | 'live' | 'archived';
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; fonts?: string[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = s.pending.length;
  const neverPublished = !s.live;
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
    router.refresh();
  }

  return <div className="pc" ref={box}>
    <button type="button" className={'pc-go' + (waiting ? ' hot' : '')} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
      {waiting && !neverPublished ? <span className="pc-n" aria-label={`${n} unpublished change${n === 1 ? '' : 's'}`}>{n}</span> : null}Publish
    </button>
    {open ? <div className="pc-card" role="dialog" aria-label="Publish">
      <div className="pc-row"><Globe {...I} /><a href={s.portalUrl} target="_blank" rel="noopener" className="pc-url">{s.portalUrl.replace(/^https?:\/\//, '')}</a></div>
      <div className="pc-row"><Clock {...I} />{s.live ? <span>{ago(s.live.at)} · by {s.live.by} · v{s.live.version}</span> : <span>Not published yet. {s.client} can’t see anything.</span>}</div>
      {n ? <div className="pc-pending">
        <p className="pc-k">{n} change{n === 1 ? '' : 's'} not published</p>
        <ul>{s.pending.slice(0, 6).map((c) => <li key={c.label}><span className="pc-dot" aria-hidden /><span className="pc-l">{c.label}</span><span className="mute">{c.who.join(', ')} · {ago(c.at)}</span></li>)}</ul>
      </div> : null}
      {msg ? <div className={'pc-msg' + (msg.bad ? ' bad' : '')} role="status"><p>{msg.text}{msg.fonts?.length ? ` (${msg.fonts.join(', ')})` : ''}</p>
        {msg.fonts ? <div className="pc-acts"><Link className="btn" href="?tab=typefaces" onClick={() => setOpen(false)}>Add licensed files</Link><button type="button" className="btn" onClick={() => publish(true)} disabled={busy}>Publish anyway</button></div> : null}
      </div> : null}
      {!s.canPublish ? <p className="pc-done mute">You can view this project but not publish it.</p>
        : waiting ? <button type="button" className="pc-big" onClick={() => publish()} disabled={busy}>{busy ? <Loader2 {...I} className="spin" /> : <Rocket {...I} />}{neverPublished ? `Publish to ${s.client}` : 'Publish changes'}</button>
        : <p className="pc-done"><Check {...I} />Latest published</p>}
      <Link className="pc-all" href="?tab=overview#versions" onClick={() => setOpen(false)}>All versions</Link>
    </div> : null}
  </div>;
}
