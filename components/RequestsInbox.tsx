'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FilePlus2, Globe, KeyRound, MessageSquare, PenLine, type LucideIcon } from 'lucide-react';
import { LogoThumb } from '@/components/LogoThumb';
import type { LogoThumb as Thumb } from '@/lib/projects/logoThumb';

export type InboxReq = { id: string; project_id: string; client: string; kind: string; title: string; details: string; status: string; reply: string; email: string | null; created_at: string };
const KIND: Record<string, [string, LucideIcon]> = { edit: ['Edit', PenLine], asset: ['New asset', FilePlus2], domain: ['Domain', Globe], access: ['Access', KeyRound], other: ['Other', MessageSquare] };
const STATUS: [string, string][] = [['open', 'New'], ['in_progress', 'In progress'], ['done', 'Done'], ['declined', 'Declined']];
const ago = (d: string) => { const h = (Date.now() - new Date(d).getTime()) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

// Every client request, across all projects, in one place
export function RequestsInbox({ initial, thumbs, compact = false }: { initial: InboxReq[]; thumbs: Record<string, Thumb>; compact?: boolean }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const save = async (r: InboxReq, patch: Partial<InboxReq>) => {
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    await fetch(`/api/projects/${r.project_id}/requests`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, ...patch }) });
  };
  const shown = compact ? list.filter((r) => r.status === 'open').slice(0, 4) : list;
  if (!shown.length) return compact ? null : <p className="mute">No requests. Client admins send them from their portal’s Settings.</p>;
  return (
    <ul className="rq">
      {shown.map((r) => { const [label, Ic] = KIND[r.kind] || KIND.other; return (
        <li key={r.id} className={'rq-item' + (r.status === 'open' ? ' new' : '')}>
          <span className="rq-thumb">{thumbs[r.project_id] ? <LogoThumb t={thumbs[r.project_id]} /> : null}</span>
          <div className="rq-main">
            <p className="rq-top"><Link href={`/studio/projects/${r.project_id}?tab=client`} className="rq-client">{r.client}</Link><span className="rq-kind"><Ic size={13} strokeWidth={1.75} aria-hidden />{label}</span><span className="mute">{r.email || 'A client'} · {ago(r.created_at)}</span></p>
            <button className="rq-title" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>{r.title}</button>
            {open === r.id ? <div className="rq-body">
              {r.details ? <p className="rq-details">{r.details}</p> : null}
              <textarea className="ta" placeholder="Reply (the client sees this in their Settings)" defaultValue={r.reply} onBlur={(e) => e.target.value !== r.reply && save(r, { reply: e.target.value })} aria-label={`Reply to ${r.title}`} />
            </div> : null}
          </div>
          <select className="fm-sel rq-status" aria-label={`Status of ${r.title}`} value={r.status} onChange={(e) => save(r, { status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </li>); })}
    </ul>
  );
}
