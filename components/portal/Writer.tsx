'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, Check, ChevronDown, Copy, Heart, ImagePlus, MessageSquareText, PenLine, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { CUSTOM_PARTS, TEMPLATE_GROUPS, WRITER_TEMPLATES, countOf, templateById, type WriterPart } from '@/lib/writerTemplates';
import { KIND_LABEL, type KnowledgeEntry } from '@/lib/voiceKnowledge';

// The Writer: pick where the copy is going (a Google ad, an Instagram caption, an email…) and it brings that
// destination's parts and character limits. Write a brief or a first go on the page, set who it's for and how
// functional or expressive, and choose from options that arrive as cards: use one, copy it, ask for more like it,
// or dismiss it. Or have your own copy reviewed. The Writer's knowledge is where the team adds what's worked.
type Val = string | string[];
type Option = Record<string, Val> & { id: string; why?: string };
type Note = { kind: 'good' | 'fix'; quote?: string; rule?: string; note: string; fix?: string; id: string };
const LENGTHS = [{ id: 'line', label: 'A line' }, { id: 'short', label: 'Short' }, { id: 'medium', label: 'A paragraph' }, { id: 'long', label: 'Long' }] as const;
const COUNTS = [1, 3, 5, 10, 20];
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const limitLabel = (p: WriterPart) => (p.limit ? `${p.soft ? '~' : ''}${p.limit}${p.unit === 'words' ? ' words' : ''}` : '');

export function Writer({ slug, client, audiences, aiConnected, canConnect, note }: { slug: string; client: string; audiences: string[]; aiConnected: boolean; canConnect: boolean; note?: string }) {
  const [tplId, setTplId] = useState('hero');
  const tpl = templateById(tplId);
  const [off, setOff] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>(['headline', 'body']);
  const [customLimit, setCustomLimit] = useState<number | ''>('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState(50);
  const [length, setLength] = useState<(typeof LENGTHS)[number]['id']>('short');
  const [count, setCount] = useState(3);
  const [options, setOptions] = useState<Option[]>([]);
  const [review, setReview] = useState<{ summary: string; notes: Note[] } | null>(null);
  const [busy, setBusy] = useState<'write' | 'review' | null>(null);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [brain, setBrain] = useState(false);
  const [kCount, setKCount] = useState<number | null>(null);
  const doc = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const text = () => (doc.current?.innerText || '').trim();
  useEffect(() => { fetch(`/api/p/${slug}/writer/knowledge`).then((r) => r.json()).then((j) => setKCount(j.entries?.length ?? 0)).catch(() => {}); }, [slug]);

  // The parts for this template (or the ones chosen for "Something else")
  const parts: WriterPart[] = useMemo(() => tpl.id === 'custom'
    ? CUSTOM_PARTS.filter((p) => custom.includes(p.key)).map((p) => (customLimit ? { ...p, limit: Number(customLimit) } : p))
    : tpl.parts.filter((p) => !off.includes(p.key)), [tpl, off, custom, customLimit]);
  const showLength = parts.some((p) => p.body && !p.limit);
  useEffect(() => { setOff([]); if (tpl.length) setLength(tpl.length); if (tpl.parts.some((p) => p.count && p.count > 3)) setCount(1); }, [tplId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(mode: 'write' | 'review', like?: Option) {
    setErr(''); setBusy(mode);
    const body = { mode, brief: text(), template: tpl.id === 'custom' ? undefined : tpl.label, templateNote: tpl.note, parts, audience: audience || undefined, tone, length, count: like ? Math.min(count, 5) : count,
      like: like ? Object.fromEntries(parts.filter((p) => like[p.key]).map((p) => [p.key, like[p.key]])) : undefined };
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) { setErr(j.error || 'Something went wrong. Try again.'); return; }
    if (mode === 'write') setOptions((o) => [...(j.options || []).map((x: Option) => ({ ...x, id: uid() })), ...o]);
    else setReview({ summary: j.review?.summary || '', notes: (j.review?.notes || []).map((n: Note) => ({ ...n, id: uid() })) });
  }
  const asList = (v?: Val) => (Array.isArray(v) ? v : v ? [v] : []);
  // Use an option: it goes onto the page, each part labelled
  function keep(o: Option) {
    const html = parts.filter((p) => o[p.key]).map((p) => {
      const vals = asList(o[p.key]);
      const inner = vals.length > 1 ? `<ol>${vals.map((v) => `<li>${esc(v)}</li>`).join('')}</ol>` : p.body ? vals[0].split(/\n{2,}/).map((x) => `<p>${esc(x)}</p>`).join('') : `<p class="wr-${p.key === 'headline' || p.key === 'title' ? 'h' : 'p'}">${esc(vals[0])}</p>`;
      return `<p class="wr-lab">${esc(p.label)}</p>${inner}`;
    }).join('');
    if (doc.current) { doc.current.insertAdjacentHTML('beforeend', (empty ? '' : '<hr>') + html); setEmpty(false); }
    setOptions((x) => x.filter((y) => y.id !== o.id));
  }
  const plain = (o: Option) => parts.filter((p) => o[p.key]).map((p) => `${p.label}\n${asList(o[p.key]).join('\n')}`).join('\n\n');
  async function copy(id: string, t: string) { try { await navigator.clipboard.writeText(t); setFlash('c' + id); setTimeout(() => setFlash(null), 1500); } catch { /* clipboard blocked */ } }
  async function like(o: Option) {
    const r = await fetch(`/api/p/${slug}/writer/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'liked', text: plain(o), where: tpl.id === 'custom' ? undefined : tpl.label }) }).catch(() => null);
    if (r?.ok) { setFlash('l' + o.id); setKCount((n) => (n ?? 0) + 1); setTimeout(() => setFlash(null), 1800); }
  }
  function applyFix(n: Note) {
    if (!doc.current || !n.quote || !n.fix) return;
    const html = doc.current.innerHTML, q = esc(n.quote);
    if (html.includes(q)) { doc.current.innerHTML = html.replace(q, esc(n.fix)); setReview((r) => r && { ...r, notes: r.notes.filter((x) => x.id !== n.id) }); }
  }

  if (!aiConnected) return <div className="wr-off"><PenLine size={22} strokeWidth={1.5} aria-hidden /><h1 className="pt-display">Writer</h1><p className="mute">The Writer uses your own AI connection. {canConnect ? <a href={`/p/${slug}/settings`}>Connect it in Settings</a> : 'Ask an admin on your team to connect it in Settings.'}</p></div>;

  return <div className="wr">
    <header className="wr-head">
      <div className="wr-head-t"><h1 className="pt-display">Writer</h1>
        <button type="button" className="wr-brain" onClick={() => setBrain(true)}><Brain {...I} />Writer’s knowledge{kCount ? <span className="wr-badge">{kCount}</span> : null}</button></div>
      <p className="mute">Copy in the {client} voice. Choose where it’s going, write a brief or a first go on the page, and choose from the options.</p>
      {note ? <p className="wr-note-studio" role="note">{note}</p> : null}
    </header>

    <div className="wr-conds" role="group" aria-label="Conditions">
      <div className="wr-for">
        <button type="button" className="wr-pill wr-for-btn" onClick={() => setPickOpen(!pickOpen)} aria-expanded={pickOpen}><span>For</span><strong>{tpl.label}</strong><ChevronDown size={13} aria-hidden /></button>
        {pickOpen ? <TemplatePicker current={tpl.id} onPick={(id) => { setTplId(id); setPickOpen(false); }} onClose={() => setPickOpen(false)} /> : null}
      </div>
      <label className="wr-pill"><span>Audience</span><select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="">Anyone</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select><ChevronDown size={13} aria-hidden /></label>
      <label className="wr-pill wr-tone"><span>Functional</span><input type="range" min={0} max={100} step={10} value={tone} onChange={(e) => setTone(Number(e.target.value))} aria-label="Functional to expressive" /><span>Expressive</span></label>
      {showLength ? <div className="wr-seg" role="radiogroup" aria-label="Length">{LENGTHS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={length === l.id} className={length === l.id ? 'on' : ''} onClick={() => setLength(l.id)}>{l.label}</button>)}</div> : null}
      <label className="wr-pill"><span>Options</span><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={13} aria-hidden /></label>
    </div>
    <div className="wr-els" role="group" aria-label="What to write">
      {(tpl.id === 'custom' ? CUSTOM_PARTS : tpl.parts).map((p) => { const on = tpl.id === 'custom' ? custom.includes(p.key) : !off.includes(p.key);
        return <button key={p.key} type="button" aria-pressed={on} className={'wr-chip' + (on ? ' on' : '')} title={p.hint} onClick={() => {
          if (tpl.id === 'custom') setCustom((x) => (x.includes(p.key) ? (x.length > 1 ? x.filter((y) => y !== p.key) : x) : CUSTOM_PARTS.map((y) => y.key).filter((y) => y === p.key || x.includes(y))));
          else setOff((x) => (x.includes(p.key) ? x.filter((y) => y !== p.key) : tpl.parts.length - x.length > 1 ? [...x, p.key] : x));
        }}>{on ? <Check size={13} strokeWidth={2.2} aria-hidden /> : <Plus size={13} strokeWidth={2} aria-hidden />}{p.label}{p.count && p.count > 1 ? <span className="wr-chip-n">×{p.count}</span> : null}{p.limit ? <span className="wr-chip-n">{limitLabel(p)}</span> : null}</button>; })}
      {tpl.id === 'custom' ? <label className="wr-pill wr-lim"><span>Limit</span><input type="number" min={1} max={5000} placeholder="None" value={customLimit} onChange={(e) => setCustomLimit(e.target.value ? Number(e.target.value) : '')} className="wr-num" /><span>characters</span></label> : null}
    </div>
    {tpl.note ? <p className="wr-tnote mute">{tpl.note}</p> : null}

    <div className="wr-grid">
      <section className="wr-sheet">
        <div ref={doc} className="wr-doc" contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Your page" data-ph="What do you want to say? Write a brief, notes, or a first go at it."
          onInput={() => setEmpty(!text())} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!empty) run('write'); } }} />
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
          {parts.filter((p) => o[p.key]).map((p) => { const vals = asList(o[p.key]); return <div key={p.key} className={'wr-el wr-part' + (p.key === 'headline' || p.key === 'title' ? ' big' : p.body ? ' body' : '')}>
            {parts.length > 1 || vals.length > 1 ? <p className="wr-lab">{p.label}</p> : null}
            {vals.length > 1 ? <ol className="wr-vals">{vals.map((v, i) => { const n = countOf(v, p.unit); return <li key={i}><span>{v}</span>{p.limit ? <span className={'wr-n' + (n > p.limit ? ' over' : '')}>{n}/{p.limit}</span> : null}</li>; })}</ol>
              : <>{p.body ? vals[0].split(/\n{2,}/).map((x, i) => <p key={i}>{x}</p>) : <p>{vals[0]}</p>}{p.limit ? (() => { const n = countOf(vals[0], p.unit); return <span className={'wr-n' + (n > p.limit! ? ' over' : '')}>{n}/{p.limit}{p.soft && n > p.limit! ? ' · gets cut off' : ''}</span>; })() : null}</>}
          </div>; })}
          {o.why ? <p className="wr-why">{o.why}</p> : null}
          <div className="wr-acts">
            <button type="button" className="btn solid" onClick={() => keep(o)}><Check size={14} strokeWidth={2} aria-hidden />Use</button>
            <button type="button" className="btn" onClick={() => copy(o.id, plain(o))}><Copy size={14} strokeWidth={1.75} aria-hidden />{flash === 'c' + o.id ? 'Copied' : 'Copy'}</button>
            <button type="button" className="btn" onClick={() => run('write', o)} disabled={!!busy}><RefreshCw size={14} strokeWidth={1.75} aria-hidden />More like this</button>
            <button type="button" className="btn" onClick={() => like(o)} aria-label="Add to the Writer’s knowledge as one we love" data-tip="Teach the Writer: we love this one"><Heart size={14} strokeWidth={1.75} aria-hidden />{flash === 'l' + o.id ? 'Saved' : ''}</button>
          </div>
        </article>)}
        {!options.length && !review && busy !== 'write' ? <div className="wr-empty"><Sparkles size={18} strokeWidth={1.5} aria-hidden /><p>Options appear here as cards. Use one to put it on the page, or dismiss it.</p></div> : null}
      </aside>
    </div>
    {brain ? <Knowledge slug={slug} client={client} onClose={() => setBrain(false)} onCount={setKCount} where={tpl.id === 'custom' ? '' : tpl.label} /> : null}
  </div>;
}

function TemplatePicker({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; const c = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.wr-for-btn')) onClose(); }; window.addEventListener('keydown', k); window.addEventListener('mousedown', c); return () => { window.removeEventListener('keydown', k); window.removeEventListener('mousedown', c); }; }, [onClose]);
  const list = WRITER_TEMPLATES.filter((t) => !q || (t.label + ' ' + t.group).toLowerCase().includes(q.toLowerCase()));
  const sum = (t: (typeof WRITER_TEMPLATES)[number]) => t.parts.length ? t.parts.map((p) => `${p.label}${p.count && p.count > 1 ? ` ×${p.count}` : ''}${p.limit ? ` ${limitLabel(p)}` : ''}`).join(' · ') : 'Choose the parts yourself';
  return <div ref={box} className="wr-pick" role="dialog" aria-label="Where it’s going">
    <label className="wr-pick-s"><Search size={14} strokeWidth={1.75} aria-hidden /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. Google, email, poster" /></label>
    <div className="wr-pick-l">{TEMPLATE_GROUPS.map((g) => { const ts = list.filter((t) => t.group === g); return ts.length ? <section key={g}><p className="wr-pick-g">{g}</p>
      <div className="wr-pick-grid">{ts.map((t) => <button key={t.id} type="button" className={'wr-tpl' + (t.id === current ? ' on' : '')} onClick={() => onPick(t.id)}><strong>{t.label}</strong><span>{sum(t)}</span></button>)}</div>
    </section> : null; })}{!list.length ? <p className="mute" style={{ padding: 12 }}>Nothing matches. Try “Something else”.</p> : null}</div>
  </div>;
}

type Pic = { url: string; type: 'image/jpeg' | 'image/png'; data: string };
async function shrink(file: File): Promise<Pic | null> {
  if (!file.type.startsWith('image/')) return null;
  const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return null;
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.86);
  return { url, type: 'image/jpeg', data: url.split(',')[1] };
}

// The Writer's knowledge: what's performed well, what the team loves, what didn't land. Everything added here
// teaches the Writer, Ask and the Claude skill straight away.
function Knowledge({ slug, client, onClose, onCount, where: where0 }: { slug: string; client: string; onClose: () => void; onCount: (n: number) => void; where: string }) {
  const [list, setList] = useState<KnowledgeEntry[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [kind, setKind] = useState<KnowledgeEntry['kind']>('worked');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [where, setWhere] = useState(where0);
  const [pics, setPics] = useState<Pic[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const load = () => fetch(`/api/p/${slug}/writer/knowledge`).then((r) => r.json()).then((j) => { setList(j.entries || []); setMine(j.mine || []); onCount((j.entries || []).length); }).catch(() => setList([]));
  useEffect(() => { load(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function add(files: FileList | File[]) { const got = (await Promise.all([...files].slice(0, 3).map(shrink))).filter(Boolean) as Pic[]; setPics((p) => [...p, ...got].slice(0, 3)); }
  async function submit() {
    if (!text.trim() && !pics.length) return;
    setBusy(true); setMsg(pics.length ? 'Reading the picture…' : '');
    const r = await fetch(`/api/p/${slug}/writer/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text: text.trim() || undefined, note: note.trim() || undefined, where: where || undefined, images: pics.length ? pics.map((x) => ({ type: x.type, data: x.data })) : undefined }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setMsg(j.error || 'Couldn’t add that.'); return; }
    setText(''); setNote(''); setPics([]); setMsg('Added. The Writer will use it from now on.'); load();
  }
  async function remove(id: string) { await fetch(`/api/p/${slug}/writer/knowledge?id=${id}`, { method: 'DELETE' }); load(); }
  return createPortal(<div className="sh-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="sh" role="dialog" aria-modal="true" aria-label="Writer’s knowledge">
      <header className="sh-h"><h2>Writer’s knowledge</h2><button type="button" className="sh-x" onClick={onClose} aria-label="Close"><X size={18} strokeWidth={1.75} aria-hidden /></button></header>
      <div className="sh-b">
        <p className="mute" style={{ margin: 0 }}>Teach the Writer what works for {client}: lines and pieces that performed well, ones you love, and ones that didn’t land. It learns from them straight away, and so do Ask and your Claude skill. The {client} voice still sets the rules.</p>
        <div className="kn-add" onPaste={(e) => { const f = [...e.clipboardData.files].filter((x) => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); add(f); } }} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); add(e.dataTransfer.files); } }}>
          <div className="wr-seg kn-kind" role="radiogroup" aria-label="What it is">{(['worked', 'liked', 'missed'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
          <textarea className="in" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the words: a headline, a post, an email that did well…" />
          {pics.length ? <div className="ak-attach" style={{ order: 0 }}>{pics.map((p, k) => <span key={k} className="ak-thumb"><img src={p.url} alt="" /><button type="button" onClick={() => setPics((x) => x.filter((_, j) => j !== k))} aria-label="Remove picture"><X size={11} strokeWidth={2.5} aria-hidden /></button></span>)}</div> : null}
          <div className="kn-row">
            <select className="in" value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Where it was used"><option value="">Where it was used</option>{WRITER_TEMPLATES.filter((t) => t.id !== 'custom').map((t) => <option key={t.id}>{t.label}</option>)}<option>Other</option></select>
            <input className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'missed' ? 'Why it didn’t land (optional)' : 'Why it worked, e.g. 2× click rate (optional)'} />
          </div>
          <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
          <div className="kn-row">
            <button type="button" className="btn ic" onClick={() => fileIn.current?.click()}><ImagePlus {...I} />Add a picture</button>
            <span className="mute kn-tip">Or paste or drop one. Its words are read and kept; the picture isn’t stored.</span>
            <button type="button" className="btn solid" disabled={busy || (!text.trim() && !pics.length)} onClick={submit}>{busy ? 'Adding…' : 'Add to knowledge'}</button>
          </div>
          {msg ? <p className="mute" role="status" style={{ margin: 0 }}>{msg}</p> : null}
        </div>
        {!list ? <p className="mute">Loading…</p> : !list.length ? <p className="mute">Nothing yet. The first thing you add starts teaching it.</p> : <ul className="kn-list">{list.map((e) => <li key={e.id} className={'kn-it ' + e.kind}>
          <p className="kn-it-h"><span className="kn-kind-b">{KIND_LABEL[e.kind]}</span>{e.where ? <span className="mute">{e.where}</span> : null}<span className="mute">{e.by} · {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            {mine.includes(e.id) ? <button type="button" className="wr-x" onClick={() => remove(e.id)} aria-label="Remove"><Trash2 size={13} strokeWidth={1.75} aria-hidden /></button> : null}</p>
          <p className="kn-it-t">{e.text}</p>{e.note ? <p className="kn-it-n mute">{e.note}</p> : null}
        </li>)}</ul>}
      </div>
    </aside>
  </div>, document.body);
}
