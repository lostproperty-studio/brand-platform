'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';

type Msg = { role: 'user' | 'assistant'; content: string };
const STARTERS = ['What’s the minimum size for the logo?', 'Which colours can I use for body text?', 'Can I put the logo on a photo?', 'Write a short Instagram caption in our tone of voice'];

// Brand chat, streamed. Runs on the client's own Anthropic key.
export function Ask({ slug, client, aiConnected, canConnect }: { slug: string; client: string; aiConnected: boolean; canConnect: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const next = [...msgs, { role: 'user' as const, content: q.trim() }];
    setMsgs([...next, { role: 'assistant', content: '' }]); setText(''); setBusy(true);
    const r = await fetch(`/api/p/${slug}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) });
    if (!r.ok || !r.body) { const t = await r.text().catch(() => ''); setMsgs([...next, { role: 'assistant', content: r.status === 402 ? 'AI isn’t connected for this portal yet.' : t || 'Something went wrong. Try again.' }]); setBusy(false); return; }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMsgs([...next, { role: 'assistant', content: acc }]); end.current?.scrollIntoView({ block: 'end' }); }
    setBusy(false);
  }

  if (!aiConnected) return <div className="card"><p style={{ margin: 0 }}>AI isn’t connected yet.</p><p className="mute" style={{ margin: '4px 0 0' }}>{canConnect ? <>Ask uses your own Anthropic account, so you control the cost. <Link href={`/p/${slug}/settings`}>Connect it in Settings</Link>.</> : 'Your admin can connect it in Settings.'}</p></div>;
  return (
    <div className="ask">
      {!msgs.length ? <div className="row">{STARTERS.map((s) => <button key={s} className="btn" onClick={() => send(s)}>{s}</button>)}</div> : null}
      <div className="ask-log" aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={'ask-m ' + m.role}><p className="mute">{m.role === 'user' ? 'You' : `${client} guidelines`}</p><div className="ask-t">{m.content || (busy ? '…' : '')}</div></div>)}
        <div ref={end} />
      </div>
      <form className="ask-in" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr" htmlFor="ask-q">Your question</label>
        <input id="ask-q" className="in" placeholder={`Ask about the ${client} brand`} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn solid" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </div>
  );
}
