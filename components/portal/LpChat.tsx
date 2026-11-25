'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, MessageSquare, PenLine, Shapes } from 'lucide-react';
import { LpAppIcon } from '@/components/panel/LpAppIcon';

// The Ask bar's other side: talking to the Lost Property team. Each conversation is a ticket the team answers in
// the studio's Slack; their replies arrive here. Used by AskDock (the bar) and Settings (the tickets list).

export type LpThread = { id: string; kind: string; title: string; status: string; mine: boolean; name: string; created_at: string; last_message_at: string | null; preview: string };
export type LpMessage = { id: string; author: 'client' | 'lp'; name: string; body: string; created_at: string; mine: boolean };
export const LP_STATUS: Record<string, string> = { open: 'Sent', in_progress: 'In progress', done: 'Done', declined: 'Not going ahead' };
export const LP_KIND: Record<string, string> = { chat: 'Chat', edit: 'Change to the guidelines', asset: 'New or updated asset', feedback: 'Feedback', session: 'Session', domain: 'Own domain', access: 'Access', other: 'Something else' };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const when = (iso: string) => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

/** Opens the Ask bar on the Lost Property side, optionally on one conversation, or the session booking */
export const openLpChat = (id?: string) => window.dispatchEvent(new CustomEvent('lp-chat', { detail: id || '' }));
export const openLpSession = () => window.dispatchEvent(new CustomEvent('lp-session'));

export function useLpChat(slug: string, active: boolean) {
  const [view, setView] = useState<'thread' | 'list'>('thread');
  const [list, setList] = useState<LpThread[] | null>(null);
  const [current, setCurrent] = useState<{ id: string; title: string; status: string; kind: string } | null>(null);
  const [messages, setMessages] = useState<LpMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('chat');
  const [err, setErr] = useState('');
  const cur = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/p/${slug}/lp/${id}`, { cache: 'no-store' });
    if (!r.ok || cur.current !== id) return;
    const t = await r.json();
    setCurrent({ id: t.id, title: t.title, status: t.status, kind: t.kind }); setMessages(t.messages);
  }, [slug]);
  const showList = useCallback(async () => {
    setView('list'); setList(null);
    const r = await fetch(`/api/p/${slug}/lp`, { cache: 'no-store' });
    setList(r.ok ? (await r.json()).threads : []);
  }, [slug]);
  const open = useCallback((id: string) => { cur.current = id; setView('thread'); setMessages([]); setCurrent(null); load(id); }, [load]);
  const fresh = useCallback(() => { cur.current = null; setCurrent(null); setMessages([]); setView('thread'); setKind('chat'); setErr(''); }, []);

  // Replies from the team arrive while the conversation is open
  useEffect(() => {
    if (!active || view !== 'thread' || !current) return;
    const t = setInterval(() => cur.current && load(cur.current), 8000);
    return () => clearInterval(t);
  }, [active, view, current, load]);

  async function send(body: string) {
    const text = body.trim(); if (!text || busy) return false;
    setBusy(true); setErr('');
    const mine: LpMessage = { id: `tmp-${Date.now()}`, author: 'client', name: '', body: text, created_at: new Date().toISOString(), mine: true };
    setMessages((m) => [...m, mine]); setView('thread');
    try {
      if (cur.current) {
        const r = await fetch(`/api/p/${slug}/lp/${cur.current}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) });
        if (!r.ok) throw new Error(await r.text());
        const t = await r.json(); setMessages(t.messages); setCurrent({ id: t.id, title: t.title, status: t.status, kind: t.kind });
      } else {
        const r = await fetch(`/api/p/${slug}/lp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, kind }) });
        if (!r.ok) throw new Error(await r.text());
        const { id } = await r.json(); cur.current = id; await load(id);
      }
      return true;
    } catch (e) { setErr((e as Error).message || 'That didn’t send. Try again.'); setMessages((m) => m.filter((x) => x.id !== mine.id)); return false; }
    finally { setBusy(false); }
  }
  return { view, list, current, messages, busy, kind, setKind, err, send, open, fresh, showList, setView };
}
export type LpChatState = ReturnType<typeof useLpChat>;

const STARTS: { kind: string; label: string; Ic: typeof PenLine; hint: string }[] = [
  { kind: 'edit', label: 'A change to the guidelines', Ic: PenLine, hint: 'What should change, and where?' },
  { kind: 'asset', label: 'A new asset', Ic: Shapes, hint: 'What do you need, and when for?' },
  { kind: 'feedback', label: 'Feedback on our work', Ic: MessageSquare, hint: 'Tell us about it, and add a link if you can' }
];
export const lpPlaceholder = (s: LpChatState) => (s.current ? 'Reply to Lost Property…' : STARTS.find((x) => x.kind === s.kind)?.hint || 'Message the Lost Property team…');

/** What fills the Ask panel on the Lost Property side: a conversation, its empty start, or the list of tickets */
export function LpLog({ s, client }: { s: LpChatState; client: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.messages.length]);
  if (s.view === 'list') return <div className="lpc-list">
    {s.list === null ? <p className="mute">Loading…</p> : !s.list.length ? <p className="mute">No conversations yet.</p> : s.list.map((t) => <button key={t.id} type="button" className="lpc-ticket" onClick={() => s.open(t.id)}>
      <span className="lpc-tt"><span>{t.title}</span><span className={'lpc-st ' + t.status}>{LP_STATUS[t.status] || t.status}</span></span>
      <span className="mute lpc-tm">{LP_KIND[t.kind] || 'Request'}{t.name && !t.mine ? ` · ${t.name}` : ''} · {when(t.last_message_at || t.created_at)}</span>
      {t.preview ? <span className="lpc-pv">{t.preview}</span> : null}
    </button>)}
  </div>;
  if (!s.messages.length) return <div className="ak-empty lpc-empty">
    <LpAppIcon size={40} />
    <p className="ak-hello">Talk to the Lost Property team</p>
    <p className="mute">Your message goes straight to the studio, and anyone on the team can pick it up. We usually reply within a working day.</p>
    <div className="ak-starters">
      {STARTS.map(({ kind, label, Ic }) => <button key={kind} type="button" className={'ak-chip' + (s.kind === kind ? ' on' : '')} onClick={() => { s.setKind(s.kind === kind ? 'chat' : kind); (document.getElementById('dock-q') as HTMLTextAreaElement | null)?.focus(); }}><Ic {...I} />{label}</button>)}
      <button type="button" className="ak-chip" onClick={openLpSession}><CalendarDays {...I} />Book a session</button>
    </div>
  </div>;
  return <div className="lpc-thread">
    {s.current ? <div className="lpc-head"><span>{s.current.title}</span><span className={'lpc-st ' + s.current.status}>{LP_STATUS[s.current.status] || s.current.status}</span></div> : null}
    {s.messages.map((m) => m.author === 'client'
      ? <div key={m.id} className="ak-u"><div className="ak-ub">{m.body}</div>{!m.mine && m.name ? <span className="mute ak-ctx">{m.name}</span> : null}</div>
      : <div key={m.id} className="lpc-a"><LpAppIcon size={24} /><div><p className="lpc-who">{m.name || 'Lost Property'} <span className="mute">· {when(m.created_at)}</span></p><div className="lpc-body">{m.body}</div></div></div>)}
    {s.messages.length && s.messages.every((m) => m.author === 'client') ? <p className="mute lpc-wait">Sent to the Lost Property team{client ? ` for ${client}` : ''}. Their reply will appear here, and you’ll find it in Settings → Lost Property.</p> : null}
    {s.err ? <p className="lpc-err" role="alert">{s.err}</p> : null}
    <div ref={end} />
  </div>;
}
