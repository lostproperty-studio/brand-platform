'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type Msg = { role: 'user' | 'assistant'; content: string; context?: string | null };
type Conv = { id: string; title: string; context: string | null; updated_at: string };

// Ask, always at the bottom of the screen. It knows which page you're on, and saves each conversation to you.
export function AskDock({ slug, client, aiConnected, canConnect, studioAi }: { slug: string; client: string; aiConnected: boolean; canConnect: boolean; studioAi?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conv, setConv] = useState<string | null>(null);
  const [history, setHistory] = useState<Conv[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const here = path.includes('/guidelines/') ? 'this chapter' : path.includes('/tools/') ? 'this tool' : path.includes('/resources') ? 'the resources' : `the ${client} brand`;
  const hidden = path.includes('/tools/'); // tools have their own chat panel

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    setOpen(true); setView('chat');
    const next: Msg[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs([...next, { role: 'assistant', content: '' }]); setText(''); setBusy(true);
    const r = await fetch(`/api/p/${slug}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), path, conversationId: conv || undefined }) });
    if (!r.ok || !r.body) { const t = await r.text().catch(() => ''); setMsgs([...next, { role: 'assistant', content: r.status === 402 ? 'AI isn’t connected for this portal yet.' : t || 'Something went wrong. Try again.' }]); setBusy(false); return; }
    setConv(r.headers.get('X-Conversation-Id'));
    const ctxLabel = decodeURIComponent(r.headers.get('X-Context') || '');
    next[next.length - 1].context = ctxLabel;
    const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMsgs([...next, { role: 'assistant', content: acc }]); }
    setBusy(false);
  }
  async function showHistory() { setView('history'); const r = await fetch(`/api/p/${slug}/conversations`); if (r.ok) setHistory((await r.json()).conversations); }
  async function openConv(id: string) { const r = await fetch(`/api/p/${slug}/conversations/${id}`); if (!r.ok) return; setMsgs((await r.json()).messages); setConv(id); setView('chat'); }
  async function delConv(id: string) { await fetch(`/api/p/${slug}/conversations/${id}`, { method: 'DELETE' }); setHistory((h) => h.filter((c) => c.id !== id)); if (conv === id) { setConv(null); setMsgs([]); } }
  const newChat = () => { setConv(null); setMsgs([]); setView('chat'); input.current?.focus(); };

  if (hidden) return null;
  return (
    <div className={'dock' + (open ? ' open' : '')}>
      {open ? <div className="dock-panel" role="dialog" aria-label="Ask">
        <div className="dock-top">
          <strong>Ask</strong>
          <span className="mute">{view === 'history' ? 'Your conversations' : `About ${here}`}</span>
          {studioAi ? <span className="dock-studio" title="You’re previewing as the studio, so Ask runs on Lost Property’s AI. Clients use their own key.">Studio preview · Lost Property AI</span> : null}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={newChat}>New</button>
          <button className="btn" onClick={() => (view === 'history' ? setView('chat') : showHistory())}>{view === 'history' ? 'Back' : 'History'}</button>
          <button className="btn" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>
        {view === 'history' ? <div className="dock-log">
          {!history.length ? <p className="mute">Nothing yet. Your questions are saved here, just for you.</p> : history.map((c) => <div key={c.id} className="dock-h"><button onClick={() => openConv(c.id)}><span>{c.title || 'Untitled'}</span><span className="mute">{c.context ? `${c.context} · ` : ''}{new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></button><button className="fm-x" aria-label="Delete conversation" onClick={() => delConv(c.id)}>×</button></div>)}
        </div> : <div className="dock-log" ref={log} aria-live="polite">
          {!aiConnected ? <p className="mute">AI isn’t connected yet. {canConnect ? <Link href={`/p/${slug}/settings`}>Connect your Anthropic account in Settings</Link> : 'Your admin can connect it in Settings.'}</p>
            : !msgs.length ? <div className="dock-starters">{(path.includes('/guidelines/') ? ['Summarise this chapter', 'What are the exact values I need here?', 'What’s the most common mistake with this?'] : ['What’s the minimum size for the logo?', 'Which colours can I use for body text?', 'Write a short Instagram caption in our tone of voice']).map((s) => <button key={s} className="btn" onClick={() => send(s)}>{s}</button>)}</div>
            : msgs.map((m, i) => <div key={i} className={'ask-m ' + m.role}><p className="mute">{m.role === 'user' ? `You${m.context ? ' · on ' + m.context : ''}` : `${client} guidelines`}</p><div className="ask-t">{m.content || (busy ? '…' : '')}</div></div>)}
        </div>}
      </div> : null}
      <form className="dock-bar" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr" htmlFor="dock-q">Ask about {here}</label>
        <input id="dock-q" ref={input} className="dock-in" placeholder={`Ask about ${here}…`} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { if (msgs.length) setOpen(true); }} disabled={!aiConnected && !open} />
        {!aiConnected ? <button type="button" className="btn" onClick={() => setOpen(!open)}>Ask</button> : <button className="btn solid" disabled={busy || !text.trim()}>{busy ? '…' : 'Ask'}</button>}
      </form>
    </div>
  );
}
