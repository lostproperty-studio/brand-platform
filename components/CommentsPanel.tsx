'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Crosshair, ExternalLink, RotateCcw, X } from 'lucide-react';
import { initials, when, type PortalComment } from '@/lib/comments';

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** The studio's comments on the portal preview, kept fresh. Shared by the editor's panel and its section badges. */
export function useComments(projectId: string) {
  const [list, setList] = useState<PortalComment[]>([]);
  const [err, setErr] = useState('');
  const api = `/api/projects/${projectId}/comments`;
  const load = useCallback(async () => {
    const r = await fetch(api).catch(() => null); const j = r ? await r.json().catch(() => ({})) : {};
    if (Array.isArray(j.comments)) setList(j.comments); setErr(j.error || '');
  }, [api]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); const f = () => load(); window.addEventListener('focus', f); return () => { clearInterval(t); window.removeEventListener('focus', f); }; }, [load]);
  const change = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'That didn’t work. Try again.'); return; }
    setList((l) => (j.removed ? l.filter((c) => c.id !== id) : l.map((c) => (c.id === id ? j.comment : c))));
  };
  return { list, err, change, load };
}

/** Comments in the editor: who left them, when, and where; jump to the section, reply, resolve */
export function CommentsPanel({ comments, slug, where, onJump, onClose, only }: {
  comments: ReturnType<typeof useComments>; slug: string;
  /** Words for where a comment is: chapter and section */ where: (c: PortalComment) => string;
  onJump: (c: PortalComment) => void; onClose: () => void;
  /** Just the comments on one section */ only?: string | null;
}) {
  const [showDone, setShowDone] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  const all = comments.list.filter((c) => !only || c.block === only);
  const open = all.filter((c) => !c.resolved_at), done = all.filter((c) => c.resolved_at);
  const card = (c: PortalComment) => <article key={c.id} className={'cm-card' + (c.resolved_at ? ' done' : '')}>
    <div className="pc-head"><span className="pc-av">{initials(c.author_name)}</span><span><b>{c.author_name}</b><span className="mute">{when(c.created_at)}</span></span><span style={{ flex: 1 }} />
      <button type="button" className="pc-ic" onClick={() => onJump(c)} aria-label="Show the section" title="Show the section"><Crosshair {...I} /></button>
      <a className="pc-ic" href={`/p/${slug}${c.path}`} target="_blank" rel="noopener" aria-label="Open in the preview" title="Open in the preview"><ExternalLink {...I} /></a>
      <button type="button" className="pc-ic" onClick={() => comments.change(c.id, { resolved: !c.resolved_at })} aria-label={c.resolved_at ? 'Reopen' : 'Resolve'} title={c.resolved_at ? 'Reopen' : 'Resolve'}>{c.resolved_at ? <RotateCcw {...I} /> : <Check {...I} />}</button>
    </div>
    <p className="cm-where mute">{where(c)}</p>
    <p className="pc-body">{c.body}</p>
    {c.replies.map((r, i) => <div key={i} className="pc-reply"><p className="pc-meta"><b>{r.author_name}</b> <span className="mute">{when(r.at)}</span></p><p className="pc-body">{r.body}</p></div>)}
    {c.resolved_at ? <p className="pc-done"><Check size={12} strokeWidth={2.5} aria-hidden />Resolved by {c.resolved_by} {when(c.resolved_at)}</p>
      : <form className="pc-row" onSubmit={(e) => { e.preventDefault(); const t = (reply[c.id] || '').trim(); if (t) { comments.change(c.id, { reply: t }); setReply((r) => ({ ...r, [c.id]: '' })); } }}>
        <input className="in" value={reply[c.id] || ''} onChange={(e) => setReply((r) => ({ ...r, [c.id]: e.target.value }))} placeholder="Reply…" aria-label="Reply" /><button className="btn" disabled={!(reply[c.id] || '').trim()}>Reply</button>
      </form>}
  </article>;
  return <aside className="vh cm" aria-label="Comments">
    <div className="vh-h"><strong>Comments{only ? ' on this section' : ''}</strong><span className="mute">{open.length} open</span><button type="button" className="pc-ic" onClick={onClose} aria-label="Close"><X {...I} /></button></div>
    <div className="cm-list">
      {comments.err ? <p className="vh-note">{comments.err}</p> : null}
      {!all.length && !comments.err ? <p className="vh-note">No comments yet. Open the <a href={`/p/${slug}`} target="_blank" rel="noopener">portal preview</a>, switch on Comment, and click anything to leave one.</p> : null}
      {open.map(card)}
      {done.length ? <button type="button" className="cm-toggle" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {done.length} resolved</button> : null}
      {showDone ? done.map(card) : null}
    </div>
  </aside>;
}
