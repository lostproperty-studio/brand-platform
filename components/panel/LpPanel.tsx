'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PanelBrand, PanelHostApi, PanelImage, PanelLogo } from './types';
import './panel.css';
import { LpAppIcon } from './LpAppIcon';

// The LP panel: the same design for every client and in every app (Canva, Word, PowerPoint, Google Slides...).
// What's in it is the client's own brand; what it can do depends on the app (the host). No outside dependencies,
// because the Canva app bundle uses this file as it is.

type Tab = 'logos' | 'colours' | 'type' | 'images' | 'words' | 'ask';
const TABS: { id: Tab; label: string }[] = [
  { id: 'logos', label: 'Logos' }, { id: 'colours', label: 'Colours' }, { id: 'type', label: 'Type' },
  { id: 'images', label: 'Images' }, { id: 'words', label: 'Words' }, { id: 'ask', label: 'Ask' }
];

const Ico = ({ d, size = 14 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const I = {
  plus: 'M12 5v14M5 12h14', copy: 'M9 9h10v10H9zM5 15V5h10', out: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  send: 'M5 12h14M13 6l6 6-6 6', check: 'M5 12l5 5 9-10', info: 'M12 8h.01M11 12h1v5h1'
};

/** Readable text on a colour: dark on light grounds, white on dark */
const ink = (hex: string) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff'; };

export function LpPanel({ brand, host }: { brand: PanelBrand; host: PanelHostApi }) {
  const tabs = TABS.filter((t) => brand.show[t.id] && (t.id !== 'ask' || host.ask) && (t.id !== 'logos' || brand.logos.length) && (t.id !== 'images' || brand.images.length) && (t.id !== 'words' || brand.words.principles.length || brand.words.lines.length || brand.words.summary));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id || 'colours');
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (m: string) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2200); };
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); say(ok); } catch (e) { say((e as Error).message || 'That didn’t work'); } };
  const copy = (t: string, what = 'Copied') => run(() => host.copy(t), what);

  return (
    <div className="lpx">
      <header className="lpx-head">
        <div className="lpx-id"><LpAppIcon size={28} className="lpx-icon" /><div><p className="lpx-client">{brand.client}</p><p className="lpx-sub">Brand Panel</p></div></div>
        {host.openPortal ? <button type="button" className="lpx-icon" onClick={host.openPortal} title="Open the brand portal" aria-label="Open the brand portal"><Ico d={I.out} /></button> : null}
      </header>
      <nav className="lpx-tabs" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={'lpx-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      <main className="lpx-body">
        {tab === 'logos' ? <Logos logos={brand.logos} rules={brand.rules.logo} host={host} run={run} /> : null}
        {tab === 'colours' ? <section>
          <ul className="lpx-cols">{brand.colours.map((c) => <li key={c.hex + c.name}>
            <button type="button" className="lpx-col" onClick={() => copy(c.hex.toUpperCase(), `Copied ${c.hex.toUpperCase()}`)} title="Copy the hex value">
              <span className="lpx-chip" style={{ background: c.hex, color: ink(c.hex) }}><Ico d={I.copy} size={12} /></span>
              <span className="lpx-coltxt"><span className="lpx-name">{c.name}</span><span className="lpx-meta">{c.role}</span></span>
              <span className="lpx-hex">{c.hex.toUpperCase()}</span>
            </button></li>)}</ul>
          <Rules title="Using colour" rules={brand.rules.colour} />
        </section> : null}
        {tab === 'type' ? <section>
          <ul className="lpx-fonts">{brand.type.map((f) => <li key={f.role + f.name} className="lpx-font">
            <p className="lpx-meta">{f.role}</p><p className="lpx-fontname">{f.name}</p><p className="lpx-usage">{f.usage}</p>
            <button type="button" className="lpx-link" onClick={() => copy(f.name, `Copied ${f.name}`)}>Copy name</button>
          </li>)}</ul>
          <p className="lpx-note"><Ico d={I.info} size={12} /> {host.name === 'Canva' ? 'Use these from your Brand Kit. If they’re not there, ask your Canva admin to add them.' : 'If these aren’t in your font menu, ask your IT team to install them from the brand kit.'}</p>
          <Rules title="Using type" rules={brand.rules.type} />
        </section> : null}
        {tab === 'images' ? <Images images={brand.images} host={host} run={run} /> : null}
        {tab === 'words' ? <section className="lpx-words">
          {brand.words.summary ? <p className="lpx-lede">{brand.words.summary}</p> : null}
          {brand.words.principles.length ? <><h3 className="lpx-h">How we write</h3><ul className="lpx-list">{brand.words.principles.map((p) => <li key={p}>{p}</li>)}</ul></> : null}
          {brand.words.lines.length ? <><h3 className="lpx-h">Lines that have worked</h3><ul className="lpx-lines">{brand.words.lines.map((l) => <li key={l}>
            <p>{l}</p>
            <span className="lpx-acts">{host.insertText ? <button type="button" className="lpx-link" onClick={() => run(() => host.insertText!(l), 'Added')}>Add</button> : null}<button type="button" className="lpx-link" onClick={() => copy(l)}>Copy</button></span>
          </li>)}</ul></> : null}
        </section> : null}
        {tab === 'ask' && host.ask ? <Ask client={brand.client} ask={host.ask} /> : null}
      </main>
      <footer className="lpx-foot"><span>Lost Property</span>{host.openPortal ? <button type="button" className="lpx-link" onClick={host.openPortal}>Brand portal</button> : null}</footer>
      <div className={'lpx-toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast ? <><Ico d={I.check} size={12} /> {toast}</> : null}</div>
    </div>
  );
}

type Run = (fn: () => Promise<void>, ok: string) => void;

function Rules({ title, rules }: { title: string; rules: string[] }) {
  if (!rules.length) return null;
  return <details className="lpx-rules"><summary>{title}</summary><ul className="lpx-list">{rules.map((r) => <li key={r}>{r}</li>)}</ul></details>;
}

function Tile({ children, add, drag, label, dark, ratio }: { children: ReactNode; add?: () => void; drag?: (e: unknown) => void; label: string; dark?: boolean; ratio?: number }) {
  return <button type="button" className={'lpx-tile' + (dark ? ' dark' : '')} style={ratio ? { aspectRatio: String(ratio) } : undefined} onClick={add} draggable={!!drag} onDragStart={drag} disabled={!add} aria-label={`Add ${label}`} title={add ? `Add ${label}` : label}>
    {children}{add ? <span className="lpx-add"><Ico d={I.plus} size={12} /></span> : null}
  </button>;
}

function Logos({ logos, rules, host, run }: { logos: PanelLogo[]; rules: string[]; host: PanelHostApi; run: Run }) {
  const groups = useMemo(() => { const m = new Map<string, PanelLogo[]>(); for (const l of logos) m.set(l.group, [...(m.get(l.group) || []), l]); return [...m.entries()]; }, [logos]);
  return <section>
    {groups.map(([g, ls]) => <div key={g} className="lpx-group">
      {groups.length > 1 ? <h3 className="lpx-h">{g}</h3> : null}
      <div className="lpx-grid">{ls.map((l) => {
        const img = { url: l.url, name: l.name, format: l.format };
        return <figure key={l.id} className="lpx-fig">
          <Tile label={l.name} dark={l.onDark} add={host.insertImage ? () => run(() => host.insertImage!(img), `${l.name} added`) : undefined} drag={host.dragImage ? (e) => host.dragImage!(e, img) : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.url} alt={l.name} loading="lazy" draggable={false} />
          </Tile>
          <figcaption>{l.name}</figcaption>
        </figure>;
      })}</div>
    </div>)}
    <Rules title="Using the logo" rules={rules} />
  </section>;
}

function Images({ images, host, run }: { images: PanelImage[]; host: PanelHostApi; run: Run }) {
  const cols = useMemo(() => [...new Set(images.map((i) => i.collection))], [images]);
  const [col, setCol] = useState<string>('');
  const shown = col ? images.filter((i) => i.collection === col) : images;
  return <section>
    {cols.length > 1 ? <div className="lpx-chips">{['', ...cols].map((c) => <button key={c || 'all'} type="button" className={'lpx-chip-btn' + (col === c ? ' on' : '')} onClick={() => setCol(c)}>{c || 'All'}</button>)}</div> : null}
    <div className="lpx-masonry">{shown.map((im) => {
      const img = { url: im.url, name: im.name, format: 'jpg' as const, w: im.w, h: im.h };
      return <Tile key={im.id} label={im.name} ratio={im.w && im.h ? im.w / im.h : undefined} add={host.insertImage ? () => run(() => host.insertImage!(img), 'Image added') : undefined} drag={host.dragImage ? (e) => host.dragImage!(e, img) : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={im.url} alt={im.name} loading="lazy" draggable={false} className="cover" />
      </Tile>;
    })}</div>
  </section>;
}

function Ask({ client, ask }: { client: string; ask: NonNullable<PanelHostApi['ask']> }) {
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false);
  async function send(text = q) {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(next); setQ(''); setBusy(true);
    try { const a = await ask(t, msgs); setMsgs([...next, { role: 'assistant', content: a }]); }
    catch (e) { setMsgs([...next, { role: 'assistant', content: (e as Error).message || 'That didn’t work. Try again.' }]); }
    setBusy(false);
  }
  const starters = ['Which logo goes on a dark photo?', 'What colour should a headline be?', 'Write a short line for an event invite'];
  return <section className="lpx-ask">
    {msgs.length ? <ol className="lpx-msgs">{msgs.map((m, i) => <li key={i} className={m.role}>{m.content}</li>)}{busy ? <li className="assistant lpx-dots"><span /><span /><span /></li> : null}</ol>
      : <div className="lpx-start"><p className="lpx-lede">Ask anything about the {client} brand. Answers come from the guidelines.</p>{starters.map((s) => <button key={s} type="button" className="lpx-chip-btn" onClick={() => send(s)}>{s}</button>)}</div>}
    <form className="lpx-askbar" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the brand" aria-label="Ask about the brand" />
      <button type="submit" className="lpx-send" disabled={!q.trim() || busy} aria-label="Send"><Ico d={I.send} /></button>
    </form>
  </section>;
}
