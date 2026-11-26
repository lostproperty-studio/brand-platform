'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { colourFor, initials } from '@/components/Collab';
import type { Op } from '@/lib/apps/docSync';

// Working on a file together in the portal apps: who's in it (roundels in the top bar), which block each person is
// in (a name label on it, and the block is theirs until they leave it), and their edits as they make them.
// One private Realtime channel per file (file:<id>), which only people who can open the file may join.

export type LiveMe = { id: string; name: string };
export type LivePeer = { k: string; id: string; name: string; color: string; at: string | null };

let client: SupabaseClient | null = null;
const browser = () => (client ||= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));

export function useLiveFile<S>({ fileId, me, at, onOps, getState, onState }: {
  fileId: string; me: LiveMe | null; at: string | null;
  onOps: (ops: Op[]) => void; getState: () => S; onState: (s: S) => void;
}) {
  const key = useRef(Math.random().toString(36).slice(2, 10));
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'off'>('connecting');
  const chan = useRef<RealtimeChannel | null>(null);
  const cb = useRef({ onOps, getState, onState }); cb.current = { onOps, getState, onState };
  const where = useRef(at); where.current = at;
  const edited = useRef(false);

  const track = useCallback(() => {
    const c = chan.current; if (!c || !me) return;
    c.track({ k: key.current, id: me.id, name: me.name, color: colourFor(me.id), at: where.current }).catch(() => {});
  }, [me]);

  useEffect(() => {
    if (!me || !process.env.NEXT_PUBLIC_SUPABASE_URL) { setStatus('off'); return; }
    const sb = browser();
    let c: RealtimeChannel | null = null, gone = false, ever = false;
    const join = async (priv: boolean) => {
      if (gone) return;
      if (priv) { try { await sb.realtime.setAuth(); } catch { /* signed out */ } }
      c = sb.channel(`file:${fileId}`, { config: { private: priv, presence: { key: key.current }, broadcast: { self: false } } });
      c.on('presence', { event: 'sync' }, () => setPeers((Object.values(c!.presenceState<LivePeer>()).flat() as LivePeer[]).filter((p) => p.k !== key.current)))
        .on('broadcast', { event: 'ops' }, ({ payload }) => cb.current.onOps((payload as { ops: Op[] }).ops))
        // Someone just opened it: the person who's been here longest sends them the doc as it is right now
        .on('broadcast', { event: 'hello' }, ({ payload }) => {
          const st = c!.presenceState<LivePeer>(); const ks = Object.values(st).flat().map((p) => (p as LivePeer).k).filter((k) => k !== (payload as { k: string }).k).sort();
          if (ks[0] !== key.current) return;
          const state = cb.current.getState(); if (JSON.stringify(state).length > 200_000) return;
          c!.send({ type: 'broadcast', event: 'state', payload: { to: (payload as { k: string }).k, state } }).catch(() => {});
        })
        .on('broadcast', { event: 'state' }, ({ payload }) => { const p = payload as { to: string; state: S }; if (p.to === key.current && !edited.current) cb.current.onState(p.state); })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            const first = !ever; ever = true; chan.current = c; setStatus('live'); track();
            if (first) c!.send({ type: 'broadcast', event: 'hello', payload: { k: key.current } }).catch(() => {});
          } else if (s === 'CHANNEL_ERROR' && !ever && retries < 2) {
            // Only ever the private channel (checked against who may open the file): try again a couple of times, as
            // a fresh sign-in token can take a moment. Never fall back to a public channel, which anyone could join.
            retries++; const old = c; c = null; if (old) sb.removeChannel(old); setTimeout(() => join(true), 1500 * retries);
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { chan.current = null; if (!gone) setStatus('off'); }
        });
    };
    let retries = 0;
    join(true);
    return () => { gone = true; chan.current = null; if (c) sb.removeChannel(c); };
  }, [fileId, me, track]);

  useEffect(() => { const t = setTimeout(track, 80); return () => clearTimeout(t); }, [at, track]);

  // Edits go out in small batches, many times a second
  const out = useRef<{ ops: Op[]; t: ReturnType<typeof setTimeout> | null }>({ ops: [], t: null });
  const send = useCallback((ops: Op[]) => {
    if (!ops.length) return;
    edited.current = true;
    const o = out.current; o.ops.push(...ops);
    if (o.t) return;
    o.t = setTimeout(() => {
      o.t = null; const batch = o.ops; o.ops = [];
      chan.current?.send({ type: 'broadcast', event: 'ops', payload: { ops: batch } }).catch(() => {});
    }, 60);
  }, []);

  return { peers, status, send };
}

/** Everyone in the file, as roundels: you first, then the others */
export function LiveFaces({ me, peers }: { me: LiveMe | null; peers: LivePeer[] }) {
  const others = [...new Map(peers.map((p) => [p.id, p])).values()].filter((p) => p.id !== me?.id);
  if (!others.length) return null;
  const all = [...(me ? [{ id: me.id, name: me.name, color: colourFor(me.id), you: true }] : []), ...others.map((p) => ({ id: p.id, name: p.name, color: p.color, you: false }))];
  return <span className="lv-faces" aria-label={`${others.length + 1} people in this doc`}>
    {all.slice(0, 5).map((p) => <span key={p.id} className="lv-face" style={{ background: p.color }} title={p.you ? `${p.name} (you)` : `${p.name} is here`}>{initials(p.name)}</span>)}
    {all.length > 5 ? <span className="lv-face more">+{all.length - 5}</span> : null}
  </span>;
}

/** The name labels: each person's name on the block they're in, and that block is theirs until they leave it */
export function useHeldBlocks(root: string, peers: LivePeer[], me: LiveMe | null, deps: unknown) {
  useEffect(() => {
    const box = document.querySelector(root); if (!box) return;
    box.querySelectorAll('[data-held-by]').forEach((el) => { el.removeAttribute('data-held-by'); (el as HTMLElement).style.removeProperty('--held'); el.removeAttribute('inert'); });
    for (const p of peers) {
      if (!p.at || p.id === me?.id) continue;
      const el = box.querySelector(`[data-block="${CSS.escape(p.at)}"]`) as HTMLElement | null; if (!el) continue;
      el.setAttribute('data-held-by', p.name.split(' ')[0]);
      el.style.setProperty('--held', p.color);
      // Hold it, so two people don't type over each other (unless it's where you are too)
      if (!el.contains(document.activeElement)) el.setAttribute('inert', '');
    }
  }, [root, peers, me, deps]);
}

/** Which block you're in: the nearest [data-block] around what has focus, inside the editor */
export function useFocusBlock(root: string) {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const on = () => {
      const a = document.activeElement as HTMLElement | null;
      const box = document.querySelector(root);
      const b = a && box?.contains(a) ? (a.closest('[data-block]') as HTMLElement | null) : null;
      setAt(b?.dataset.block || null);
    };
    const off = () => setTimeout(on, 0);
    document.addEventListener('focusin', on); document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, [root]);
  return at;
}
