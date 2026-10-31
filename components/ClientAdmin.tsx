'use client';
import { useRef, useState } from 'react';

type Req = { id: string; kind: string; title: string; details: string; status: string; reply: string; email: string | null; created_at: string };
const STATUS: [string, string][] = [['open', 'New'], ['in_progress', 'In progress'], ['done', 'Done'], ['declined', 'Not going ahead']];

// Studio inbox for one client's requests.
export function StudioRequests({ projectId, initial }: { projectId: string; initial: Req[] }) {
  const [list, setList] = useState(initial);
  const save = async (r: Req, patch: Partial<Req>) => {
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    await fetch(`/api/projects/${projectId}/requests`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, ...patch }) });
  };
  if (!list.length) return <p className="mute" style={{ margin: 0 }}>No requests yet. Client admins send them from their portal’s Settings.</p>;
  return <div className="tm-list">{list.map((r) => <div key={r.id} className="tm-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
    <div className="row" style={{ width: '100%' }}><strong style={{ fontWeight: 500, flex: 1 }}>{r.title}</strong><select className="fm-sel" aria-label="Status" value={r.status} onChange={(e) => save(r, { status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    <p className="mute" style={{ margin: 0 }}>{r.kind} · {r.email || 'unknown'} · {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
    {r.details ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.details}</p> : null}
    <textarea className="ta" style={{ minHeight: 36 }} placeholder="Reply (the client sees this)" defaultValue={r.reply} onBlur={(e) => e.target.value !== r.reply && save(r, { reply: e.target.value })} aria-label="Reply" />
  </div>)}</div>;
}

type Look = { style: 'client' | 'lp'; background: 'light' | 'dark' | 'brand'; message: string };
// How the client's sign-in page looks, with a live preview of the real page.
export function LoginLookEditor({ projectId, slug, initial }: { projectId: string; slug: string; initial: Look }) {
  const [look, setLook] = useState(initial);
  const [msg, setMsg] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const save = async (next: Look) => {
    setLook(next); setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}/login`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    setMsg(r.ok ? 'Saved' : 'Couldn’t save'); if (r.ok && frame.current) frame.current.src = `/login/${slug}?preview=${Date.now()}`;
  };
  return (
    <div className="ll">
      <div className="ll-ctl">
        <div className="cv-f"><span className="mute">Branding</span><div className="row">
          <button className={'btn' + (look.style === 'client' ? ' solid' : '')} onClick={() => save({ ...look, style: 'client' })}>Client’s brand, Lost Property credit</button>
          <button className={'btn' + (look.style === 'lp' ? ' solid' : '')} onClick={() => save({ ...look, style: 'lp' })}>Lost Property</button>
        </div></div>
        {look.style === 'client' ? <div className="cv-f"><span className="mute">Background</span><div className="row">{(['light', 'dark', 'brand'] as const).map((b) => <button key={b} className={'btn' + (look.background === b ? ' solid' : '')} onClick={() => save({ ...look, background: b })}>{b === 'light' ? 'White' : b === 'dark' ? 'Black' : 'Brand colour'}</button>)}</div></div> : null}
        <div className="cv-f"><label className="mute" htmlFor="ll-m">Welcome message (optional)</label><input id="ll-m" className="in" maxLength={240} defaultValue={look.message} placeholder="e.g. Everything you need to use the Tileyard brand" onBlur={(e) => e.target.value !== look.message && save({ ...look, message: e.target.value })} /></div>
        <p className="mute" style={{ margin: 0 }}>Clients land here when they open their portal link signed out. <a href={`/login/${slug}`} target="_blank" rel="noopener">Open it ↗</a> <span role="status">{msg}</span></p>
      </div>
      <div className="ll-prev"><iframe ref={frame} src={`/login/${slug}?preview=1`} title="Client sign-in page preview" /></div>
    </div>
  );
}
