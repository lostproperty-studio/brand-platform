'use client';
import { useEffect, useState } from 'react';

type Req = { id: string; kind: string; title: string; details: string; status: string; reply: string; email: string | null; created_at: string; updated_at: string };
const KINDS: [string, string][] = [['edit', 'Change to the guidelines'], ['asset', 'New or updated asset'], ['domain', 'Host on our own domain'], ['access', 'Access or permissions'], ['other', 'Something else']];
const STATUS: Record<string, string> = { open: 'Sent', in_progress: 'In progress', done: 'Done', declined: 'Not going ahead' };

// Client admins ask Lost Property for changes; the studio replies and updates the status.
export function Requests({ slug }: { slug: string }) {
  const [list, setList] = useState<Req[] | null>(null);
  const [kind, setKind] = useState('edit');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch(`/api/p/${slug}/requests`).then((r) => (r.ok ? r.json() : { requests: [] })).then((j) => setList(j.requests)); }, [slug]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/p/${slug}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, title, details }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t send that.'); return; }
    setList(j.requests); setTitle(''); setDetails(''); setMsg('Sent to Lost Property. You’ll see their reply here.');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row"><label className="sr" htmlFor="rq-k">Type</label><select id="rq-k" className="in" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><label className="sr" htmlFor="rq-t">Title</label><input id="rq-t" className="in" required minLength={3} maxLength={140} placeholder={kind === 'domain' ? 'e.g. Host the guidelines at brand.tileyard.co.uk' : 'What do you need?'} value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 200 }} /></div>
        <label className="sr" htmlFor="rq-d">Details</label><textarea id="rq-d" className="ta" placeholder="Anything that helps: links, deadlines, who it’s for" value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="row"><button className="btn solid" disabled={title.trim().length < 3}>Send to Lost Property</button><span className="mute" role="status">{msg}</span></div>
      </form>
      {list?.length ? <div className="tm-list">{list.map((r) => <div key={r.id} className="tm-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0 }}>{r.title}</p><p className="mute" style={{ margin: 0 }}>{KINDS.find(([k]) => k === r.kind)?.[1]} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{r.email ? ` · ${r.email}` : ''}</p>{r.reply ? <p style={{ margin: '6px 0 0' }}><span className="mute">Lost Property: </span>{r.reply}</p> : null}</div>
        <span className={'tag' + (r.status === 'done' ? ' live' : '')}>{STATUS[r.status]}</span>
      </div>)}</div> : null}
    </div>
  );
}
