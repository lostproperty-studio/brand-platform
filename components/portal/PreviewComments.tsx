'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Check, MessageSquarePlus, RotateCcw, Trash2, X } from 'lucide-react';
import { initials, when, type PortalComment } from '@/lib/comments';

// Comments on the studio preview of a client's portal. Switch on Comment, click anything to pin a note to it, and the
// team sees who said what, when, here and in the guidelines editor. Resolve when it's dealt with. Clients never see
// any of this: it only loads in the studio's preview.
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
type Draft = { block: string | null; chapter: string | null; x: number; y: number };

/** The section under a point, and where in it (0..1), so a pin stays put as the page reflows */
function anchorAt(el: Element | null, cx: number, cy: number): Draft {
  const wrap = el?.closest('[data-b]') as HTMLElement | null;
  const box = (wrap?.firstElementChild as HTMLElement | null) || (document.querySelector('.pt-main') as HTMLElement | null);
  const chapter = (document.querySelector('[data-chapter]') as HTMLElement | null)?.dataset.chapter || null;
  if (!box) return { block: null, chapter, x: 0.5, y: 0.5 };
  const r = box.getBoundingClientRect();
  return { block: wrap?.dataset.b || null, chapter, x: Math.min(1, Math.max(0, (cx - r.left) / (r.width || 1))), y: Math.min(1, Math.max(0, (cy - r.top) / (r.height || 1))) };
}
function placeOf(c: { block: string | null; x: number; y: number }) {
  const wrap = c.block ? document.querySelector(`[data-b="${CSS.escape(c.block)}"]`) : null;
  const box = (wrap?.firstElementChild as HTMLElement | null) || (!c.block ? document.querySelector('.pt-main') as HTMLElement | null : null);
  if (!box) return null;
  const r = box.getBoundingClientRect();
  return { left: r.left + c.x * r.width, top: r.top + c.y * r.height };
}

export function PreviewComments({ projectId }: { projectId: string }) {
  const path = usePathname().replace(/^\/p\/[^/]+/, '') || '/';
  const [list, setList] = useState<PortalComment[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const api = `/api/projects/${projectId}/comments`;

  const load = useCallback(async () => {
    const r = await fetch(api).catch(() => null); const j = r ? await r.json().catch(() => ({})) : {};
    setList(j.comments || []); setMe(j.me || null); if (j.error) setErr(j.error);
  }, [api]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); const f = () => load(); window.addEventListener('focus', f); return () => { clearInterval(t); window.removeEventListener('focus', f); }; }, [load]);
  // Pins follow the page as it scrolls, reflows and loads images
  useEffect(() => {
    let raf = 0; const go = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => tick((n) => n + 1)); };
    window.addEventListener('scroll', go, true); window.addEventListener('resize', go);
    const ro = new ResizeObserver(go); ro.observe(document.body);
    return () => { window.removeEventListener('scroll', go, true); window.removeEventListener('resize', go); ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  // Comment mode: the next click anywhere on the page pins a note there, instead of following links
  const onRef = useRef(on); onRef.current = on;
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!onRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest('.pc-ui, .pt-side, .dock.ak, .pt-preview')) return;
      e.preventDefault(); e.stopPropagation();
      setDraft(anchorAt(t, e.clientX, e.clientY)); setText(''); setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]');
      if (e.key === 'Escape') { setDraft(null); setOpen(null); setOn(false); }
      if (!typing && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) setOn((v) => !v);
    };
    document.addEventListener('click', click, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('pc-mode', on); }, [on]);

  async function post() {
    if (!draft || !text.trim()) return;
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ...draft, body: text.trim() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'The comment didn’t save. Try again.'); return; }
    setList((l) => [...l, j.comment]); setDraft(null); setText(''); setOn(false); setOpen(j.comment.id);
  }
  async function change(id: string, body: Record<string, unknown>) {
    const r = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'That didn’t work. Try again.'); return; }
    if (j.removed) { setList((l) => l.filter((c) => c.id !== id)); setOpen(null); return; }
    setList((l) => l.map((c) => (c.id === id ? j.comment : c)));
  }

  const here = list.filter((c) => c.path === path);
  const shown = here.filter((c) => showDone || !c.resolved_at);
  const openCount = here.filter((c) => !c.resolved_at).length;
  const num = (c: PortalComment) => here.indexOf(c) + 1;
  const cur = list.find((c) => c.id === open);
  const pinAt = (p: { left: number; top: number }) => ({ left: Math.min(window.innerWidth - 340, p.left + 18), top: Math.min(window.innerHeight - 260, Math.max(12, p.top - 12)) });

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="pc-ui">
    {shown.map((c) => { const p = placeOf(c); if (!p) return null; return <button key={c.id} type="button" className={'pc-pin' + (c.resolved_at ? ' done' : '') + (open === c.id ? ' on' : '')} style={{ left: p.left, top: p.top }} onClick={() => { setOpen(open === c.id ? null : c.id); setDraft(null); setReply(''); }} aria-label={`Comment ${num(c)} by ${c.author_name}`}>{c.resolved_at ? <Check size={12} strokeWidth={2.5} aria-hidden /> : num(c)}</button>; })}

    {draft ? (() => { const p = placeOf(draft); if (!p) return null; return <>
      <span className="pc-pin draft" style={{ left: p.left, top: p.top }} aria-hidden>+</span>
      <form className="pc-card" style={pinAt(p)} onSubmit={(e) => { e.preventDefault(); post(); }}>
        <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Leave a comment for the team…" aria-label="Comment" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
        <div className="pc-row"><span className="mute">Only the studio sees comments</span><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn solid" disabled={!text.trim()}>Comment</button></div>
      </form>
    </>; })() : null}

    {cur ? (() => { const p = placeOf(cur); if (!p) return null; return <div className="pc-card" style={pinAt(p)} role="dialog" aria-label="Comment">
      <div className="pc-head"><span className="pc-av">{initials(cur.author_name)}</span><span><b>{cur.author_name}</b><span className="mute">{when(cur.created_at)}</span></span>
        <span style={{ flex: 1 }} />
        <button type="button" className="pc-ic" onClick={() => change(cur.id, { resolved: !cur.resolved_at })} aria-label={cur.resolved_at ? 'Reopen' : 'Resolve'} title={cur.resolved_at ? 'Reopen' : 'Resolve'}>{cur.resolved_at ? <RotateCcw {...I} /> : <Check {...I} />}</button>
        {cur.author === me ? <button type="button" className="pc-ic" onClick={() => confirm('Delete this comment?') && change(cur.id, { remove: true })} aria-label="Delete" title="Delete"><Trash2 {...I} /></button> : null}
        <button type="button" className="pc-ic" onClick={() => setOpen(null)} aria-label="Close"><X {...I} /></button></div>
      <p className="pc-body">{cur.body}</p>
      {cur.replies.map((r, i) => <div key={i} className="pc-reply"><p className="pc-meta"><b>{r.author_name}</b> <span className="mute">{when(r.at)}</span></p><p className="pc-body">{r.body}</p></div>)}
      {cur.resolved_at ? <p className="pc-done"><Check size={12} strokeWidth={2.5} aria-hidden />Resolved by {cur.resolved_by} {when(cur.resolved_at)}</p> : null}
      <form className="pc-row" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { change(cur.id, { reply: reply.trim() }); setReply(''); } }}>
        <input className="in" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" /><button className="btn" disabled={!reply.trim()}>Reply</button>
      </form>
    </div>; })() : null}

    <div className="pc-bar">
      <button type="button" className={'pc-go' + (on ? ' on' : '')} onClick={() => { setOn(!on); setDraft(null); }} aria-pressed={on} title="Comment (C)"><MessageSquarePlus {...I} />{on ? 'Click anything to comment' : 'Comment'}</button>
      {here.length ? <button type="button" className="pc-count" onClick={() => setShowDone(!showDone)} aria-pressed={showDone} title={showDone ? 'Hide resolved' : 'Show resolved'}>{openCount} open{here.length - openCount ? ` · ${showDone ? 'hide' : 'show'} ${here.length - openCount} resolved` : ''}</button> : null}
    </div>
    {err ? <p className="pc-err" role="alert">{err}<button type="button" onClick={() => setErr('')} aria-label="Dismiss">×</button></p> : null}
  </div>, document.body);
}
