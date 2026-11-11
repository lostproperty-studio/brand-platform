'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { History, RotateCcw, X } from 'lucide-react';
import { compose, isEmpty, type GuidePatch } from '@/lib/guidePatch';
import { CHAPTER, type Sel } from '@/components/GuideDock';

// Working together, as in Figma: who's here (coloured roundels in the top bar), where they are (their chapter, what
// they've selected, their cursor), and their edits as they make them. All of it goes over one private Realtime
// channel per project; saving is separate (patches, see lib/guidePatch) so nothing depends on everyone being online.

export type Me = { id: string; name: string; avatar?: string | null };
export type Peer = { k: string; id: string; name: string; avatar?: string | null; color: string; ch?: string; sel?: Sel | null };
type Cursor = { k: string; ch?: string; block?: string | null; fx: number; fy: number; t: number };
export type Incoming = { patch: GuidePatch; urls?: Record<string, string>; from: string; name: string };

const COLOURS = ['#E5484D', '#0090FF', '#30A46C', '#F76B15', '#8E4EC6', '#D6409F', '#12A594', '#FFB224', '#3E63DD', '#AB4ABA'];
export const colourFor = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLOURS[h % COLOURS.length]; };
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

let client: SupabaseClient | null = null;
function browser() {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

/** The page element for what someone has selected */
export function nodeFor(m: Sel): Element | null {
  const bl = document.querySelector(`.ve-blocks [data-block="${m.block}"]`) as HTMLElement | null;
  if (m.block === CHAPTER) return document.querySelector(`.ve-chhead ${m.el === 'title' ? '.pt-display' : m.el === 'lede' ? '.pt-lede' : '.mute'}`);
  if (!bl) return null;
  if (m.item !== undefined) return (m.el?.includes('.') ? bl.querySelector(`[data-item="${m.item}"] [data-el="${m.el.split('.')[1]}"]`) : null) || bl.querySelector(`[data-item="${m.item}"]`) || bl;
  if (m.el) return bl.querySelector(m.el === 'heading' ? '[data-part="head"] .gb-h, [data-part="head"] h2, [data-part="head"] h3' : m.el === 'eyebrow' ? '.gb-eb' : `[data-part="${m.el}"]`) || bl;
  return bl;
}

export function useCollab({ projectId, me, ch, sel, onPatch, onReload, onResync }: {
  projectId: string; me?: Me | null; ch: string; sel: Sel | null;
  onPatch: (x: Incoming) => void; onReload: () => void; onResync: () => void;
}) {
  const key = useRef(Math.random().toString(36).slice(2, 10));
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [status, setStatus] = useState<'connecting' | 'live' | 'off'>('connecting');
  const chan = useRef<RealtimeChannel | null>(null);
  const cb = useRef({ onPatch, onReload, onResync }); cb.current = { onPatch, onReload, onResync };
  const here = useRef({ ch, sel }); here.current = { ch, sel };
  const joined = useRef(false);

  const track = useCallback(() => {
    const c = chan.current; if (!c || !me || !joined.current) return;
    c.track({ k: key.current, id: me.id, name: me.name, avatar: me.avatar || null, color: colourFor(me.id), ch: here.current.ch, sel: here.current.sel }).catch(() => {});
  }, [me]);

  useEffect(() => {
    if (!me || !process.env.NEXT_PUBLIC_SUPABASE_URL) { setStatus('off'); return; }
    const sb = browser();
    let c: RealtimeChannel | null = null, gone = false, everJoined = false, wasDown = false;
    const join = async (priv: boolean) => {
      if (gone) return;
      if (priv) { try { await sb.realtime.setAuth(); } catch { /* signed out */ } }
      c = sb.channel(`guide:${projectId}`, { config: { private: priv, presence: { key: key.current }, broadcast: { self: false } } });
      c.on('presence', { event: 'sync' }, () => {
        const st = c!.presenceState<Peer>();
        const list = Object.values(st).flat().filter((p) => p.k !== key.current) as Peer[];
        setPeers(list);
        setCursors((cs) => Object.fromEntries(Object.entries(cs).filter(([k]) => list.some((p) => p.k === k))));
      })
        .on('broadcast', { event: 'cur' }, ({ payload }) => { const p = payload as Cursor; setCursors((cs) => ({ ...cs, [p.k]: { ...p, t: Date.now() } })); })
        .on('broadcast', { event: 'patch' }, ({ payload }) => cb.current.onPatch(payload as Incoming))
        .on('broadcast', { event: 'reload' }, () => cb.current.onReload())
        .on('broadcast', { event: 'resync' }, () => cb.current.onResync())
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') { everJoined = true; joined.current = true; chan.current = c; setStatus('live'); track(); if (wasDown) { wasDown = false; cb.current.onResync(); } }
          else if (s === 'CHANNEL_ERROR' && priv && !everJoined) {
            // Private channels need the 0008 migration; until then, join an ordinary one
            const old = c; c = null; if (old) sb.removeChannel(old); join(false);
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { joined.current = false; wasDown = true; if (!gone) setStatus('off'); }
        });
    };
    join(true);
    return () => { gone = true; joined.current = false; chan.current = null; if (c) sb.removeChannel(c); };
  }, [projectId, me, track]);

  // Where you are, whenever it changes
  useEffect(() => { const t = setTimeout(track, 120); return () => clearTimeout(t); }, [ch, sel, track]);

  // Edits go out in small batches, a few times a second
  const out = useRef<{ patch: GuidePatch | null; urls: Record<string, string>; t: ReturnType<typeof setTimeout> | null }>({ patch: null, urls: {}, t: null });
  const sendPatch = useCallback((patch: GuidePatch, urls: Record<string, string>) => {
    if (isEmpty(patch) || !me) return;
    const o = out.current;
    o.patch = compose(o.patch, patch); Object.assign(o.urls, urls);
    if (o.t) return;
    o.t = setTimeout(() => {
      o.t = null; const p = o.patch, u = o.urls; o.patch = null; o.urls = {};
      const c = chan.current; if (!c || !p || !joined.current) return;
      const payload: Incoming = { patch: p, urls: u, from: key.current, name: me.name };
      // Very large changes (a whole chapter brought in) are too big to send; others reload once it's saved
      if (JSON.stringify(payload).length > 200_000) { pendingResync.current = true; return; }
      c.send({ type: 'broadcast', event: 'patch', payload }).catch(() => { pendingResync.current = true; });
    }, 70);
  }, [me]);
  const pendingResync = useRef(false);
  /** After a save: if anything was too big to send live, others fetch the saved guide */
  const saved = useCallback(() => { if (!pendingResync.current) return; pendingResync.current = false; chan.current?.send({ type: 'broadcast', event: 'resync', payload: {} }).catch(() => {}); }, []);
  const reloadOthers = useCallback(() => { chan.current?.send({ type: 'broadcast', event: 'reload', payload: {} }).catch(() => {}); }, []);

  // Your cursor, relative to the section it's over, so it lands in the right place on any screen size
  const lastCur = useRef(0);
  const moveCursor = useCallback((e: MouseEvent | null) => {
    const c = chan.current; if (!c || !joined.current) return;
    const now = Date.now(); if (e && now - lastCur.current < 45) return; lastCur.current = now;
    if (!e) { c.send({ type: 'broadcast', event: 'cur', payload: { k: key.current, ch: here.current.ch, block: null, fx: -1, fy: -1 } }).catch(() => {}); return; }
    const bl = (e.target as HTMLElement).closest?.('.ve-blocks [data-block]') as HTMLElement | null;
    const box = (bl || document.querySelector('.ve-main')) as HTMLElement | null; if (!box) return;
    const r = box.getBoundingClientRect();
    c.send({ type: 'broadcast', event: 'cur', payload: { k: key.current, ch: here.current.ch, block: bl?.dataset.block || null, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height } }).catch(() => {});
  }, []);

  return { peers, cursors, status, sendPatch, saved, reloadOthers, moveCursor, key: key.current };
}

/** Everyone in the guidelines: one roundel per person, newest on the left, as in Figma's top right */
export function Roundels({ me, peers, chapters, go }: { me?: Me | null; peers: Peer[]; chapters: { id: string; title: string }[]; go: (p: Peer) => void }) {
  const people = [...new Map(peers.map((p) => [p.id, p])).values()].filter((p) => p.id !== me?.id);
  const where = (p: Peer) => (p.ch === '__home' ? 'Home page' : chapters.find((c) => c.id === p.ch)?.title || '');
  const face = (p: { name: string; avatar?: string | null; color: string }, cls = '') => <span className={'rd ' + cls} style={{ background: p.color, ['--rd' as string]: p.color }}>{p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : initials(p.name)}</span>;
  return <div className="rd-row" aria-label={people.length ? `${people.length + 1} people in these guidelines` : 'Only you are here'}>
    {people.slice(0, 5).map((p) => <button key={p.id} type="button" className="rd-btn" onClick={() => go(p)} data-tip={`${p.name}${where(p) ? ' · ' + where(p) : ''} · click to go there`} aria-label={`${p.name}, in ${where(p) || 'the guidelines'}. Go there`}>{face(p)}</button>)}
    {people.length > 5 ? <span className="rd rd-more" data-tip={people.slice(5).map((p) => p.name).join(', ')}>+{people.length - 5}</span> : null}
    {me ? <span className="rd-btn" data-tip={`${me.name} (you)`}>{face({ ...me, color: colourFor(me.id) }, 'rd-me')}</span> : null}
  </div>;
}

/** Other people's cursors and selections, drawn over the canvas in their colour */
export function PeerLayer({ peers, cursors, ch }: { peers: Peer[]; cursors: Record<string, Cursor>; ch: string }) {
  const [, tick] = useState(0);
  const visible = peers.filter((p) => p.ch === ch);
  useEffect(() => {
    if (!visible.length) return;
    let raf = 0; const loop = () => { tick((n) => n + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible.length]);
  if (!visible.length) return null;
  const now = Date.now();
  return <div className="pl" aria-hidden>
    {visible.map((p) => {
      const n = p.sel ? nodeFor(p.sel) : null;
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return null;
      return <div key={'s' + p.k} className="pl-sel" style={{ left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4, ['--c' as string]: p.color }}><span className="pl-tag">{p.name}</span></div>;
    })}
    {visible.map((p) => {
      const c = cursors[p.k];
      if (!c || c.fx < 0 || c.ch !== ch || now - c.t > 60_000) return null;
      const box = c.block ? document.querySelector(`.ve-blocks [data-block="${c.block}"]`) : document.querySelector('.ve-main');
      if (!box) return null;
      const r = box.getBoundingClientRect();
      const x = r.left + c.fx * r.width, y = r.top + c.fy * r.height;
      return <div key={'c' + p.k} className="pl-cur" style={{ transform: `translate(${x}px, ${y}px)`, ['--c' as string]: p.color }}>
        <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1.5 1.5 L1.5 16.5 L5.6 12.6 L8.4 18.6 L11 17.4 L8.3 11.6 L14 11.4 Z" fill="var(--c)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        <span className="pl-name">{p.name.split(' ')[0]}</span>
      </div>;
    })}
  </div>;
}

type Version = { id: string; created_at: string; author?: string | null; author_name: string | null; label: string | null };
/** Version history: every few minutes of work is kept, plus named versions. Restore any of them. */
export function HistoryPanel({ projectId, onClose, onRestored }: { projectId: string; onClose: () => void; onRestored: (guide: unknown) => void }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/guide/versions`); const j = await r.json().catch(() => ({}));
    setList(j.versions || []); setErr(j.error || '');
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const when = (s: string) => { const d = new Date(s); const today = new Date().toDateString() === d.toDateString(); return (today ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  async function saveName() {
    if (!name.trim()) return; setBusy('name');
    const r = await fetch(`/api/projects/${projectId}/guide/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: name.trim() }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setErr(j.error || 'Couldn’t save the version.'); return; }
    setName(''); load();
  }
  async function restore(v: Version) {
    if (!confirm(`Restore the version from ${when(v.created_at)}? Everyone editing sees it straight away. What's there now is kept as a version, so you can go back.`)) return;
    setBusy(v.id);
    const r = await fetch(`/api/projects/${projectId}/guide/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: v.id }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setErr(j.error || 'Couldn’t restore it.'); return; }
    onRestored(j.guide); load();
  }
  return <aside className="vh" aria-label="Version history">
    <header className="vh-h"><History size={16} strokeWidth={1.75} aria-hidden /><strong>Version history</strong><button type="button" className="tb-btn" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={1.75} aria-hidden /></button></header>
    <div className="vh-name"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this version, e.g. Sent to client" onKeyDown={(e) => e.key === 'Enter' && saveName()} maxLength={80} /><button type="button" className="btn" disabled={!name.trim() || busy === 'name'} onClick={saveName}>Save</button></div>
    {err ? <p className="vh-note">{err}</p> : null}
    {!list ? <p className="vh-note">Loading…</p> : !list.length && !err ? <p className="vh-note">Versions appear here as you work: one every few minutes, and whenever someone else picks up.</p> : null}
    <ol className="vh-list">{(list || []).map((v, i) => <li key={v.id} className={v.label ? 'named' : ''}>
      <span className="vh-dot" style={{ background: v.author ? colourFor(v.author) : '#999' }} />
      <span className="vh-t"><b>{v.label || (i === 0 ? 'Latest version' : when(v.created_at))}</b><span>{v.label || i === 0 ? when(v.created_at) + ' · ' : ''}{v.author_name || 'Someone'}</span></span>
      {i > 0 || v.label ? <button type="button" className="btn ic" disabled={!!busy} onClick={() => restore(v)}><RotateCcw size={14} strokeWidth={1.75} aria-hidden />{busy === v.id ? 'Restoring…' : 'Restore'}</button> : null}
    </li>)}</ol>
  </aside>;
}
