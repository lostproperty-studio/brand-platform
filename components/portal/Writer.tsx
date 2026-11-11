'use client';
import { useRef, useState } from 'react';
import { Check, ChevronDown, Copy, MessageSquareText, PenLine, Plus, RefreshCw, Sparkles, X } from 'lucide-react';

// The Writer: a page to write on, with the conditions above it (what it's for, who it's for, how functional or
// expressive, how long, how many options, which parts) and suggestions arriving as cards beside it. Keep one
// and it goes onto the page; dismiss the rest. Or write your own and have it reviewed against the voice.
type El = 'headline' | 'subheading' | 'body' | 'caption' | 'cta';
const ELS: { id: El; label: string }[] = [{ id: 'headline', label: 'Headline' }, { id: 'subheading', label: 'Subheading' }, { id: 'body', label: 'Body' }, { id: 'caption', label: 'Caption' }, { id: 'cta', label: 'Call to action' }];
const USES = ['Website', 'Social post', 'Email', 'Advert', 'Campaign', 'Signage', 'Packaging', 'Press release', 'Product description', 'Presentation', 'Internal', 'Other'];
const LENGTHS = [{ id: 'line', label: 'A line' }, { id: 'short', label: 'Short' }, { id: 'medium', label: 'A paragraph' }, { id: 'long', label: 'Long' }] as const;
const COUNTS = [1, 3, 5, 10, 20];
type Option = Partial<Record<El, string>> & { why?: string; over?: El[]; id: string };
type Note = { kind: 'good' | 'fix'; quote?: string; rule?: string; note: string; fix?: string; id: string };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function Writer({ slug, client, audiences, aiConnected, canConnect, note }: { slug: string; client: string; audiences: string[]; aiConnected: boolean; canConnect: boolean; note?: string }) {
  const [useCase, setUseCase] = useState('Website');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState(50);
  const [length, setLength] = useState<(typeof LENGTHS)[number]['id']>('short');
  const [limit, setLimit] = useState<{ n: number; unit: 'chars' | 'words' } | null>(null);
  const [count, setCount] = useState(3);
  const [els, setEls] = useState<El[]>(['headline', 'body']);
  const [options, setOptions] = useState<Option[]>([]);
  const [review, setReview] = useState<{ summary: string; notes: Note[] } | null>(null);
  const [busy, setBusy] = useState<'write' | 'review' | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const doc = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const text = () => (doc.current?.innerText || '').trim();

  async function run(mode: 'write' | 'review', like?: Option) {
    const brief = text();
    setErr(''); setBusy(mode);
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, brief, useCase, audience: audience || undefined, tone, length, limit: limit?.n ? limit : undefined, count: like ? Math.min(count, 5) : count, elements: els, like: like ? Object.fromEntries(els.filter((e) => like[e]).map((e) => [e, like[e]!])) : undefined }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) { setErr(j.error || 'Something went wrong. Try again.'); return; }
    if (mode === 'write') setOptions((o) => [...(j.options || []).map((x: Option) => ({ ...x, id: uid() })), ...o]);
    else setReview({ summary: j.review?.summary || '', notes: (j.review?.notes || []).map((n: Note) => ({ ...n, id: uid() })) });
  }
  // Keep an option: it goes onto the page in its hierarchy
  function keep(o: Option) {
    const html = ELS.filter((e) => o[e.id]).map((e) => e.id === 'headline' ? `<h2>${esc(o[e.id]!)}</h2>` : e.id === 'subheading' ? `<h3>${esc(o[e.id]!)}</h3>` : e.id === 'caption' ? `<p class="wr-cap">${esc(o[e.id]!)}</p>` : e.id === 'cta' ? `<p class="wr-cta">${esc(o[e.id]!)}</p>` : o[e.id]!.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')).join('');
    if (doc.current) { doc.current.insertAdjacentHTML('beforeend', (empty ? '' : '<hr>') + html); setEmpty(false); }
    setOptions((x) => x.filter((y) => y.id !== o.id));
  }
  const plain = (o: Option) => ELS.filter((e) => o[e.id]).map((e) => o[e.id]).join('\n\n');
  async function copy(id: string, t: string) { try { await navigator.clipboard.writeText(t); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } }
  function applyFix(n: Note) {
    if (!doc.current || !n.quote || !n.fix) return;
    const html = doc.current.innerHTML, q = esc(n.quote);
    if (html.includes(q)) { doc.current.innerHTML = html.replace(q, esc(n.fix)); setReview((r) => r && { ...r, notes: r.notes.filter((x) => x.id !== n.id) }); }
  }
  const toggleEl = (e: El) => setEls((x) => (x.includes(e) ? (x.length > 1 ? x.filter((y) => y !== e) : x) : ELS.map((y) => y.id).filter((y) => y === e || x.includes(y))));
  const n = (o: Option, e: El) => limit?.n ? (limit.unit === 'chars' ? o[e]!.length : o[e]!.trim().split(/\s+/).length) : null;

  if (!aiConnected) return <div className="wr-off"><PenLine size={22} strokeWidth={1.5} aria-hidden /><h1 className="pt-display">Writer</h1><p className="mute">The Writer uses your own AI connection. {canConnect ? <a href={`/p/${slug}/settings`}>Connect it in Settings</a> : 'Ask an admin on your team to connect it in Settings.'}</p></div>;

  return <div className="wr">
    <header className="wr-head">
      <h1 className="pt-display">Writer</h1>
      <p className="mute">Copy in the {client} voice. Write a brief or a first go on the page, set the conditions, and choose from the options.</p>
      {note ? <p className="wr-note-studio" role="note">{note}</p> : null}
    </header>

    <div className="wr-conds" role="group" aria-label="Conditions">
      <label className="wr-pill"><span>For</span><select value={useCase} onChange={(e) => setUseCase(e.target.value)}>{USES.map((u) => <option key={u}>{u}</option>)}</select><ChevronDown size={13} aria-hidden /></label>
      <label className="wr-pill"><span>Audience</span><select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="">Anyone</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select><ChevronDown size={13} aria-hidden /></label>
      <label className="wr-pill wr-tone"><span>Functional</span><input type="range" min={0} max={100} step={10} value={tone} onChange={(e) => setTone(Number(e.target.value))} aria-label="Functional to expressive" /><span>Expressive</span></label>
      <div className="wr-seg" role="radiogroup" aria-label="Length">{LENGTHS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={length === l.id} className={length === l.id ? 'on' : ''} onClick={() => setLength(l.id)}>{l.label}</button>)}</div>
      <label className="wr-pill"><span>Limit</span><input type="number" min={1} max={5000} placeholder="None" value={limit?.n ?? ''} onChange={(e) => setLimit(e.target.value ? { n: Number(e.target.value), unit: limit?.unit || 'chars' } : null)} className="wr-num" />
        <select value={limit?.unit || 'chars'} onChange={(e) => setLimit({ n: limit?.n || 100, unit: e.target.value as 'chars' | 'words' })}><option value="chars">characters</option><option value="words">words</option></select></label>
      <label className="wr-pill"><span>Options</span><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={13} aria-hidden /></label>
    </div>
    <div className="wr-els" role="group" aria-label="What to write">{ELS.map((e) => <button key={e.id} type="button" aria-pressed={els.includes(e.id)} className={'wr-chip' + (els.includes(e.id) ? ' on' : '')} onClick={() => toggleEl(e.id)}>{els.includes(e.id) ? <Check size={13} strokeWidth={2.2} aria-hidden /> : <Plus size={13} strokeWidth={2} aria-hidden />}{e.label}</button>)}</div>

    <div className="wr-grid">
      <section className="wr-sheet">
        <div ref={doc} className="wr-doc" contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Your page" data-ph="What do you want to say? Write a brief, notes, or a first go at it."
          onInput={() => setEmpty(!text())} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run('write'); } }} />
        <div className="wr-go">
          <button type="button" className="wr-btn" onClick={() => run('write')} disabled={!!busy || empty}><Sparkles {...I} />{busy === 'write' ? 'Writing…' : `Write ${count} option${count > 1 ? 's' : ''}`}</button>
          <button type="button" className="btn ic" onClick={() => run('review')} disabled={!!busy || empty}><MessageSquareText {...I} />{busy === 'review' ? 'Reading…' : 'Review my copy'}</button>
          <span className="mute wr-hint">⌘ Enter to write</span>
        </div>
        {err ? <p className="wr-err" role="alert">{err}</p> : null}
      </section>

      <aside className="wr-cards" aria-label="Suggestions" aria-live="polite">
        {busy === 'write' ? <div className="wr-card wr-wait"><span className="wr-shim" /><span className="wr-shim s" /><span className="wr-shim" /></div> : null}
        {review ? <div className="wr-card wr-rev">
          <div className="wr-card-top"><p className="wr-k">Review</p><button type="button" className="wr-x" onClick={() => setReview(null)} aria-label="Dismiss the review"><X {...I} /></button></div>
          {review.summary ? <p className="wr-sum">{review.summary}</p> : null}
          {review.notes.map((nt) => <div key={nt.id} className={'wr-note ' + nt.kind}>
            <p className="wr-note-h">{nt.kind === 'good' ? 'On brand' : 'Change'}{nt.rule ? <span> · {nt.rule}</span> : null}<button type="button" className="wr-x" onClick={() => setReview((r) => r && { ...r, notes: r.notes.filter((x) => x.id !== nt.id) })} aria-label="Dismiss"><X size={13} strokeWidth={1.75} aria-hidden /></button></p>
            {nt.quote ? <p className="wr-q">“{nt.quote}”</p> : null}
            <p>{nt.note}</p>
            {nt.fix ? <p className="wr-fix">{nt.fix}{nt.quote ? <button type="button" className="btn" onClick={() => applyFix(nt)}>Apply</button> : null}</p> : null}
          </div>)}
        </div> : null}
        {options.map((o, k) => <article key={o.id} className="wr-card wr-opt">
          <div className="wr-card-top"><p className="wr-k">Option {options.length - k}</p><button type="button" className="wr-x" onClick={() => setOptions((x) => x.filter((y) => y.id !== o.id))} aria-label="Dismiss"><X {...I} /></button></div>
          {ELS.filter((e) => o[e.id]).map((e) => <div key={e.id} className={'wr-el wr-' + e.id}>
            {e.id === 'body' ? o.body!.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p>{o[e.id]}</p>}
            {limit?.n ? <span className={'wr-n' + ((n(o, e.id) ?? 0) > limit.n ? ' over' : '')}>{n(o, e.id)}/{limit.n}</span> : null}
          </div>)}
          {o.why ? <p className="wr-why">{o.why}</p> : null}
          <div className="wr-acts">
            <button type="button" className="btn solid" onClick={() => keep(o)}><Check size={14} strokeWidth={2} aria-hidden />Use</button>
            <button type="button" className="btn" onClick={() => copy(o.id, plain(o))}><Copy size={14} strokeWidth={1.75} aria-hidden />{copied === o.id ? 'Copied' : 'Copy'}</button>
            <button type="button" className="btn" onClick={() => run('write', o)} disabled={!!busy}><RefreshCw size={14} strokeWidth={1.75} aria-hidden />More like this</button>
          </div>
        </article>)}
        {!options.length && !review && busy !== 'write' ? <div className="wr-empty"><Sparkles size={18} strokeWidth={1.5} aria-hidden /><p>Options appear here as cards. Use one to put it on the page, or dismiss it.</p></div> : null}
      </aside>
    </div>
  </div>;
}
