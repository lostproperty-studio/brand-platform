'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Msg = { role: 'user' | 'assistant'; content: string };
type Creation = { id: string; title: string; data: { values?: Record<string, unknown>; storage?: Record<string, string> }; updated_at: string };

// Runs an uploaded HTML tool inside the portal, with a panel to drive it by chat and to save your work.
export function ToolRunner({ slug, toolId, name, html, aiEnabled, aiConnected, canConnect, head }: { slug: string; toolId: string; name: string; html: string; aiEnabled: boolean; aiConnected: boolean; canConnect: boolean; head: React.ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<number, (d: Record<string, unknown>) => void>());
  const seq = useRef(0);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'chat' | 'saved'>(aiEnabled ? 'chat' : 'saved');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [saved, setSaved] = useState<Creation[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const storageKey = `lp-tool-${toolId}`;
  // The side panel (AI and saved versions) can be closed so the tool takes the whole width
  const [panel, setPanel] = useState(true);
  useEffect(() => { try { const v = localStorage.getItem('lp-tool-panel'); if (v === '0' || window.innerWidth < 1000) setPanel(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanel((v) => { try { localStorage.setItem('lp-tool-panel', v ? '0' : '1'); } catch { /* ignore */ } return !v; });

  // Messages from the tool: replies to our requests, and its browser storage (kept for this person on this device)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.lp) return;
      if (e.data.lp === 'ready') { setReady(true); try { const s = localStorage.getItem(storageKey); if (s) frame.current?.contentWindow?.postMessage({ lp: 'storage-init', data: JSON.parse(s) }, '*'); } catch { /* storage unavailable */ } }
      if (e.data.lp === 'storage') { try { localStorage.setItem(storageKey, JSON.stringify(e.data.data)); } catch { /* ignore */ } }
      const cb = pending.current.get(e.data.req); if (cb) { pending.current.delete(e.data.req); cb(e.data); }
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [storageKey]);
  const ask = useCallback((lp: string, extra: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((ok, fail) => {
    const req = ++seq.current; pending.current.set(req, ok);
    frame.current?.contentWindow?.postMessage({ lp, req, ...extra }, '*');
    setTimeout(() => { if (pending.current.has(req)) { pending.current.delete(req); fail(new Error('The tool didn’t respond.')); } }, 4000);
  }), []);

  const loadSaved = useCallback(async () => { const r = await fetch(`/api/p/${slug}/creations?tool=${toolId}`); if (r.ok) setSaved((await r.json()).creations); }, [slug, toolId]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function run() {
    const q = prompt.trim(); if (!q || busy) return;
    setPrompt(''); setBusy(true);
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...next, { role: 'assistant', content: 'Working on it…' }]);
    try {
      const c = await ask('controls') as { controls: unknown[]; headings: string[] };
      const r = await fetch(`/api/p/${slug}/tools/${toolId}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: q, controls: c.controls, headings: c.headings, history: msgs.slice(-10), conversationId: conv || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 402 ? 'AI isn’t connected for this portal yet.' : j.error || 'That didn’t work.');
      setConv(j.conversationId);
      // Apply one step at a time so tools that redraw between changes keep up
      const errs: string[] = [];
      for (const a of j.actions || []) { const res = await ask('apply', { actions: [a] }) as { errors?: string[] }; errs.push(...(res.errors || [])); await new Promise((w) => setTimeout(w, 60)); }
      setMsgs([...next, { role: 'assistant', content: j.message + (errs.length ? ` (${errs.length} change${errs.length > 1 ? 's' : ''} couldn’t be applied.)` : '') }]);
    } catch (e) { setMsgs([...next, { role: 'assistant', content: (e as Error).message }]); }
    setBusy(false);
  }

  async function save(asNew: boolean) {
    const title = asNew || !current ? window.prompt('Name this version', `${name} ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`) : saved.find((s) => s.id === current)?.title;
    if (!title) return;
    const v = await ask('values') as { values: Record<string, unknown>; storage: Record<string, string> };
    const r = await fetch(`/api/p/${slug}/creations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: asNew ? undefined : current || undefined, toolId, title, data: { values: v.values, storage: v.storage } }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setCurrent(j.id); loadSaved(); setTab('saved'); } else alert(j.error || 'Couldn’t save.');
  }
  async function restore(c: Creation) { await ask('restore', { values: c.data.values || {}, storage: c.data.storage }); setCurrent(c.id); }
  async function remove(c: Creation) { if (!confirm(`Delete “${c.title}”?`)) return; await fetch(`/api/p/${slug}/creations/${c.id}`, { method: 'DELETE' }); if (current === c.id) setCurrent(null); loadSaved(); }

  return (
    <div className="tl-full">
    <header className="tl-bar">
      {head}
      <span style={{ flex: 1 }} />
      {saved.length ? <span className="mute tl-desc">{saved.length} saved</span> : null}
      <button className={'btn' + (panel ? ' solid' : '')} aria-expanded={panel} aria-controls="tr-panel" onClick={togglePanel}>{aiEnabled ? (panel ? 'Hide AI & saved' : 'AI & saved') : (panel ? 'Hide saved' : 'Saved')}</button>
    </header>
    <div className={'tr' + (panel ? '' : ' closed')}>
      <div className="tr-stage">
        <iframe ref={frame} title={name} srcDoc={html} sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals" allow="clipboard-write" />
      </div>
      <aside id="tr-panel" className="tr-panel" aria-label={`${name} assistant`} hidden={!panel}>
        <div className="row tr-tabs" role="tablist">
          {aiEnabled ? <button role="tab" aria-selected={tab === 'chat'} className={'btn' + (tab === 'chat' ? ' solid' : '')} onClick={() => setTab('chat')}>Make it with AI</button> : null}
          <button role="tab" aria-selected={tab === 'saved'} className={'btn' + (tab === 'saved' ? ' solid' : '')} onClick={() => setTab('saved')}>My saved ({saved.length})</button>
        </div>
        {tab === 'chat' ? <>
          <div className="tr-log" aria-live="polite">
            {!aiConnected ? <p className="mute">AI isn’t connected yet. {canConnect ? <Link href={`/p/${slug}/settings`}>Connect your Anthropic account</Link> : 'Your admin can connect it in Settings.'} You can still use the tool by hand.</p>
              : !msgs.length ? <p className="mute">Describe what you need and the tool fills itself in, following the brand rules. For example: “Start a 3:4 Instagram post that launches our new reception space.”</p>
              : msgs.map((m, i) => <div key={i} className={'ask-m ' + m.role}><div className="ask-t">{m.content}</div></div>)}
          </div>
          <form className="tr-in" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <label className="sr" htmlFor="tr-p">What should it make?</label>
            <textarea id="tr-p" className="ta" rows={3} placeholder="What should it make?" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!aiConnected || !ready} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }} />
            <button className="btn solid" disabled={!aiConnected || !ready || busy || !prompt.trim()}>{busy ? 'Working…' : 'Make it'}</button>
          </form>
        </> : <div className="tr-log">
          <div className="row"><button className="btn solid" disabled={!ready} onClick={() => save(!current)}>{current ? 'Save changes' : 'Save this version'}</button>{current ? <button className="btn" onClick={() => save(true)}>Save as new</button> : null}</div>
          <p className="mute" style={{ margin: 0 }}>Saved versions are yours only. Your team can’t see them.</p>
          {saved.map((c) => <div key={c.id} className="dock-h"><button onClick={() => restore(c)} aria-current={current === c.id}><span>{c.title}{current === c.id ? ' · open' : ''}</span><span className="mute">{new Date(c.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></button><button className="fm-x" aria-label={`Delete ${c.title}`} onClick={() => remove(c)}>×</button></div>)}
        </div>}
      </aside>
    </div>
    </div>
  );
}
