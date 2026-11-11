'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowUp, BookOpen, Clock, Download, Palette, Paperclip, PenLine, Plus, Square, Trash2, Type, X, ImageIcon, type LucideIcon } from 'lucide-react';
import { AskAnswer, AskMark, CopyAnswer } from '@/components/portal/AskAnswer';
import type { AskCatalog } from '@/lib/portal/askCatalog';

type Msg = { role: 'user' | 'assistant'; content: string; context?: string | null; failed?: boolean; images?: string[] };
type Pic = { url: string; type: 'image/jpeg' | 'image/png'; data: string };
/** A picture made small enough to send (longest side 1568px), as base64 */
async function shrink(file: File): Promise<Pic | null> {
  if (!file.type.startsWith('image/')) return null;
  const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return null;
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const png = file.type === 'image/png' && c.width * c.height < 1_000_000;
  const url = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
  return { url, type: png ? 'image/png' : 'image/jpeg', data: url.split(',')[1] };
}
type Conv = { id: string; title: string; context: string | null; updated_at: string };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const STEPS = ['Reading the guidelines', 'Checking the rules', 'Finding the right files', 'Writing'];

// Ask, always at the bottom of the screen: a conversation with the brand, like using Claude. It knows which page
// you're on, shows what it's doing while it works, answers with the real colours, logos, downloads and pages as
// cards, and saves each conversation to you.
export function AskDock({ slug, client, aiConnected, canConnect, studioAi }: { slug: string; client: string; aiConnected: boolean; canConnect: boolean; studioAi?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conv, setConv] = useState<string | null>(null);
  const [history, setHistory] = useState<Conv[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<AskCatalog | null>(null);
  const [landed, setLanded] = useState(false);
  const [pics, setPics] = useState<Pic[]>([]);
  const fileIn = useRef<HTMLInputElement>(null);
  async function addPics(files: FileList | File[]) { const got = (await Promise.all([...files].slice(0, 4).map(shrink))).filter(Boolean) as Pic[]; if (got.length) { setPics((p) => [...p, ...got].slice(0, 4)); setOpen(true); } }
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const stick = useRef(true);
  const here = path.includes('/guidelines/') ? 'this chapter' : path.includes('/resources') ? 'the resources' : `the ${client} brand`;
  const hidden = path.includes('/tools/'); // tools have their own chat panel

  // The cards answers can show, fetched once the panel opens
  useEffect(() => { if (open && !cat && aiConnected) fetch(`/api/p/${slug}/ask`).then((r) => (r.ok ? r.json() : null)).then((c) => c && setCat(c)).catch(() => {}); }, [open, cat, aiConnected, slug]);
  // Follow the answer as it arrives, unless the reader has scrolled up
  useEffect(() => { const el = log.current; if (el && stick.current) el.scrollTo({ top: el.scrollHeight }); }, [msgs, busy]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  // What Ask is doing, until the first words arrive
  useEffect(() => { if (!busy) return; setStep(0); const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 2)), 1400); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = '0px'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }, [text]);

  async function send(q: string) {
    if ((!q.trim() && !pics.length) || busy) return;
    if (!q.trim()) q = 'Give me feedback on this against the guidelines.';
    const sent = pics; setPics([]);
    setOpen(true); setView('chat'); stick.current = true;
    const next: Msg[] = [...msgs.filter((m) => !m.failed), { role: 'user', content: q.trim(), images: sent.map((x) => x.url) }];
    setMsgs([...next, { role: 'assistant', content: '' }]); setText(''); setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const r = await fetch(`/api/p/${slug}/chat`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), path, conversationId: conv || undefined, images: sent.length ? sent.map((x) => ({ type: x.type, data: x.data })) : undefined }) });
      if (!r.ok || !r.body) { const t = await r.text().catch(() => ''); setMsgs([...next, { role: 'assistant', content: r.status === 402 ? 'AI isn’t connected for this portal yet.' : t || 'Something went wrong. Try again.', failed: true }]); return; }
      setConv(r.headers.get('X-Conversation-Id'));
      next[next.length - 1].context = decodeURIComponent(r.headers.get('X-Context') || '');
      const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMsgs([...next, { role: 'assistant', content: acc }]); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: 'The connection dropped. Try again.', failed: true }; return c; });
    } finally { setBusy(false); abort.current = null; setLanded(true); setTimeout(() => setLanded(false), 1400); }
  }
  const stop = () => abort.current?.abort();
  async function showHistory() { setView('history'); setHistory(null); const r = await fetch(`/api/p/${slug}/conversations`); setHistory(r.ok ? (await r.json()).conversations : []); }
  async function openConv(id: string) { const r = await fetch(`/api/p/${slug}/conversations/${id}`); if (!r.ok) return; setMsgs((await r.json()).messages); setConv(id); setView('chat'); }
  async function delConv(id: string) { await fetch(`/api/p/${slug}/conversations/${id}`, { method: 'DELETE' }); setHistory((h) => (h || []).filter((c) => c.id !== id)); if (conv === id) { setConv(null); setMsgs([]); } }
  const newChat = () => { stop(); setConv(null); setMsgs([]); setView('chat'); input.current?.focus(); };

  const starters: [LucideIcon, string][] = path.includes('/guidelines/')
    ? [[BookOpen, 'Summarise this chapter'], [Palette, 'What are the exact values I need here?'], [ImageIcon, 'Show me an example of this done well']]
    : [[ImageIcon, 'Which logo should I use on a dark background?'], [Palette, 'Show me the brand colours'], [PenLine, 'Help me choose a headline'], [Type, 'What are the typefaces and where do I get them?'], [Download, 'Where do I download the logo files?']];

  if (hidden) return null;
  const last = msgs[msgs.length - 1];
  return (
    <div className={'dock ak' + (open ? ' open' : '')}>
      {open ? <div className="ak-panel" role="dialog" aria-label={`Ask about ${client}`}>
        <div className="ak-top">
          <AskMark state={busy && !msgs[msgs.length - 1]?.content ? 'scan' : 'rest'} />
          <strong>{view === 'history' ? 'Your conversations' : 'Ask'}</strong>
          {view === 'chat' ? <span className="mute ak-here">About {here}</span> : null}
          {studioAi ? <span className="dock-studio" title="You’re previewing as the studio, so Ask runs on Lost Property’s AI. Clients use their own key.">Studio preview · Lost Property AI</span> : null}
          <span style={{ flex: 1 }} />
          <button className="ak-tb" onClick={newChat} aria-label="New conversation" data-tip="New"><Plus {...I} /></button>
          <button className={'ak-tb' + (view === 'history' ? ' on' : '')} onClick={() => (view === 'history' ? setView('chat') : showHistory())} aria-label="Your conversations" data-tip="History"><Clock {...I} /></button>
          <button className="ak-tb" onClick={() => setOpen(false)} aria-label="Close" data-tip="Close · Esc"><X {...I} /></button>
        </div>
        {view === 'history' ? <div className="ak-log">
          {history === null ? <p className="mute">Loading…</p> : !history.length ? <p className="mute">Nothing yet. Your questions are saved here, just for you.</p> : history.map((c) => <div key={c.id} className="dock-h"><button onClick={() => openConv(c.id)}><span>{c.title || 'Untitled'}</span><span className="mute">{c.context ? `${c.context} · ` : ''}{new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></button><button className="ak-tb" aria-label="Delete conversation" onClick={() => delConv(c.id)}><Trash2 {...I} /></button></div>)}
        </div> : <div className="ak-log" ref={log} aria-live="polite" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
          {!aiConnected ? <div className="ak-empty"><AskMark /><p>AI isn’t connected yet.</p><p className="mute">{canConnect ? <Link href={`/p/${slug}/settings`}>Connect your Anthropic account in Settings</Link> : 'Your admin can connect it in Settings.'}</p></div>
            : !msgs.length ? <div className="ak-empty"><AskMark /><p className="ak-hello">What do you need for {client}?</p><p className="mute">Ask about the guidelines, or for the right colours, logos and files. Answers show the real thing.</p><div className="ak-starters">{starters.map(([Ic, s]) => <button key={s} className="ak-chip" onClick={() => send(s)}><Ic {...I} />{s}</button>)}</div></div>
            : msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="ak-u">{m.images?.length ? <div className="ak-pics">{m.images.map((u, k) => <img key={k} src={u} alt="" />)}</div> : null}<div className="ak-ub">{m.content}</div>{m.context ? <span className="mute ak-ctx">on {m.context}</span> : null}</div>
              : <div key={i} className={'ak-a' + (m.failed ? ' failed' : '')}>
                  <AskMark state={i !== msgs.length - 1 ? 'rest' : busy ? (m.content ? 'contour' : 'scan') : landed ? 'pulse' : 'rest'} />
                  <div className="ak-a-body">
                    {!m.content && busy && i === msgs.length - 1 ? <p className="ak-step" key={step}>{STEPS[step]}<span className="ak-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p>
                      : <AskAnswer text={m.content} cat={cat} streaming={busy && i === msgs.length - 1} />}
                    {m.content && !(busy && i === msgs.length - 1) && !m.failed ? <div className="ak-acts"><CopyAnswer text={m.content} /></div> : null}
                    {m.failed ? <div className="ak-acts"><button className="ak-act" onClick={() => { const q = [...msgs].reverse().find((x) => x.role === 'user'); if (q) { setMsgs(msgs.slice(0, -2)); send(q.content); } }}>Try again</button></div> : null}
                  </div>
                </div>)}
        </div>}
      </div> : null}
      <form className="ak-bar" onSubmit={(e) => { e.preventDefault(); send(text); }} onDragOver={(e) => { if (aiConnected && e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (!aiConnected || !e.dataTransfer.files.length) return; e.preventDefault(); addPics(e.dataTransfer.files); }} onClick={() => { if (!open && msgs.length) setOpen(true); }}>
        {!open ? <AskMark state={busy ? 'scan' : 'rest'} /> : null}
        {pics.length ? <div className="ak-attach">{pics.map((p, k) => <span key={k} className="ak-thumb"><img src={p.url} alt="" /><button type="button" onClick={(e) => { e.stopPropagation(); setPics((x) => x.filter((_, j) => j !== k)); }} aria-label="Remove picture"><X size={11} strokeWidth={2.5} aria-hidden /></button></span>)}</div> : null}
        <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addPics(e.target.files); e.target.value = ''; }} />
        {aiConnected ? <button type="button" className="ak-clip" onClick={(e) => { e.stopPropagation(); fileIn.current?.click(); }} aria-label="Add a picture for feedback" data-tip="Add a picture for feedback"><Paperclip size={16} strokeWidth={1.75} aria-hidden /></button> : null}
        <label className="sr" htmlFor="dock-q">Ask about {here}</label>
        <textarea id="dock-q" ref={input} rows={1} onPaste={(e) => { const f = [...e.clipboardData.files].filter((x) => x.type.startsWith('image/')); if (f.length && aiConnected) { e.preventDefault(); addPics(f); } }} className="ak-in" placeholder={aiConnected ? `Ask about ${here}…` : 'Ask isn’t connected yet'} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { if (msgs.length) setOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} disabled={!aiConnected} />
        {busy ? <button type="button" className="ak-send stop" onClick={stop} aria-label="Stop"><Square size={12} strokeWidth={0} fill="currentColor" aria-hidden /></button>
          : <button className="ak-send" disabled={!aiConnected || (!text.trim() && !pics.length)} aria-label="Send"><ArrowUp size={16} strokeWidth={2} aria-hidden /></button>}
      </form>
      {open && last?.role === 'assistant' && !busy ? <span className="sr" role="status">Answer ready</span> : null}
    </div>
  );
}
