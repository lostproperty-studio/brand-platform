'use client';
import { useMemo, useState } from 'react';

export type Item = {
  id: string; ord: number; chapter: string; kind: 'asset' | 'value' | 'rule' | 'conflict' | 'issue' | 'question';
  title: string; found: string; proposal: string; input: 'confirm' | 'choice' | 'multi' | 'text'; options: string[]; recommend: string;
  node_id: string | null; preview: string | null; swatches: { hex: string; label: string }[];
  status: 'open' | 'accepted' | 'changed' | 'answered' | 'skipped' | 'delegated'; answer: string; note: string;
};
const KIND: Record<Item['kind'], string> = { asset: 'Asset', value: 'Value read', rule: 'Needs a number', conflict: 'Conflict', issue: 'Issue', question: 'Question' };
const STATUS: Record<Item['status'], string> = { open: 'Open', accepted: 'Accepted', changed: 'Changed', answered: 'Answered', skipped: 'Not needed', delegated: 'Left to Claude' };
const CHAPTER_NAMES: Record<string, string> = { setup: 'Handover', logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice', templates: 'Templates' };
const resolved = (i: Item) => i.status !== 'open';
const flagged = (i: Item) => i.kind === 'conflict' || i.kind === 'rule';
const HEX = /^#[0-9A-Fa-f]{6}$/;

// The review: everything the scan found plus the gaps, one chapter at a time. Every change saves straight away.
export function Review({ initial, figmaKey }: { initial: Item[]; figmaKey: string }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'open' | 'flag'>('all');
  const chapters = useMemo(() => [...new Set(items.map((i) => i.chapter))], [items]);
  const [ch, setCh] = useState(chapters[0] || '');
  const [saving, setSaving] = useState('');

  async function save(id: string, patch: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setSaving('Saving…');
    const r = await fetch(`/api/review/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    setSaving(r.ok ? 'Saved' : 'Couldn’t save, try again');
    if (r.ok) setTimeout(() => setSaving(''), 1400);
  }

  let list = filter === 'all' ? items.filter((i) => i.chapter === ch) : items;
  if (filter === 'open') list = list.filter((i) => !resolved(i));
  if (filter === 'flag') list = list.filter(flagged);
  const idx = chapters.indexOf(ch);
  const done = items.filter(resolved).length;

  return (
    <div className="rv">
      <div className="rv-top">
        <div><p className="mute">Resolved</p><strong className="rv-count">{done} / {items.length}</strong><div className="rv-tiles" aria-hidden>{items.map((i) => <i key={i.id} className={'rv-t' + (resolved(i) ? ' done' : flagged(i) ? ' flag' : '')} />)}</div></div>
        <div className="rv-filters">
          {(['all', 'open', 'flag'] as const).map((f) => <button key={f} className={'btn' + (filter === f ? ' solid' : '')} onClick={() => setFilter(f)}>{f === 'all' ? 'Everything' : f === 'open' ? 'Still open' : 'Conflicts & missing numbers'}</button>)}
          <span className="mute">{saving}</span>
        </div>
      </div>
      <div className="rv-grid">
        <nav className="rv-rail" aria-label="Review chapters">
          {chapters.map((c) => { const l = items.filter((i) => i.chapter === c); return (
            <button key={c} className={'rv-ch' + (filter === 'all' && c === ch ? ' on' : '')} onClick={() => { setCh(c); setFilter('all'); }}>
              <span className="rv-ch-r"><span>{CHAPTER_NAMES[c] || c}</span><span className="mute">{l.filter(resolved).length}/{l.length}</span></span>
              <span className="rv-tiles sm" aria-hidden>{l.map((i) => <i key={i.id} className={'rv-t' + (resolved(i) ? ' done' : flagged(i) ? ' flag' : '')} />)}</span>
            </button>); })}
        </nav>
        <div className="rv-list">
          <h2 className="rv-chh">{filter === 'all' ? CHAPTER_NAMES[ch] || ch : filter === 'open' ? 'Still open' : 'Conflicts and missing numbers'}</h2>
          {list.map((i) => <Card key={i.id} item={i} figmaKey={figmaKey} save={save} />)}
          {!list.length ? <p className="mute">Nothing left in this view.</p> : null}
          {filter === 'all' ? <div className="rv-nav">{idx > 0 ? <button className="btn" onClick={() => setCh(chapters[idx - 1])}>← {CHAPTER_NAMES[chapters[idx - 1]] || chapters[idx - 1]}</button> : <span />}{idx < chapters.length - 1 ? <button className="btn" onClick={() => setCh(chapters[idx + 1])}>{CHAPTER_NAMES[chapters[idx + 1]] || chapters[idx + 1]} →</button> : null}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Card({ item: i, figmaKey, save }: { item: Item; figmaKey: string; save: (id: string, p: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(i.answer);
  const [note, setNote] = useState(i.note);
  const sel = i.input === 'multi' ? i.answer.split('\n').filter(Boolean) : [i.answer];
  const pick = (o: string) => {
    if (i.input === 'multi') { const s = new Set(sel); if (s.has(o)) s.delete(o); else s.add(o); const v = [...s].join('\n'); save(i.id, { status: v ? 'answered' : 'open', answer: v }); }
    else { const on = i.answer === o; save(i.id, { status: on ? 'open' : 'answered', answer: on ? '' : o }); }
  };
  return (
    <article className={'rv-card' + (i.preview ? '' : ' noimg') + (resolved(i) ? ' res' : '')}>
      <div className="rv-body">
        <div className="rv-meta"><span className={'rv-kind k-' + i.kind}>{KIND[i.kind]}</span>{i.node_id ? <a className="rv-fig" href={`https://www.figma.com/design/${figmaKey}/?node-id=${i.node_id.replace(':', '-')}`} target="_blank" rel="noopener">Open in Figma ↗</a> : null}<span className={'rv-st' + (resolved(i) ? ' done' : '')}>{STATUS[i.status]}</span></div>
        <h3 className="rv-h">{i.title}</h3>
        <div className="rv-pair"><div><p className="mute">Found in Figma</p><p>{i.found}</p></div>{i.proposal ? <div><p className="mute">For the kit</p><p>{i.proposal}</p></div> : null}</div>
        {i.swatches?.length ? <div className="rv-sw">{i.swatches.filter((s) => HEX.test(s.hex)).map((s) => <span key={s.hex + s.label}><i style={{ background: s.hex }} />{s.hex} {s.label}</span>)}</div> : null}
        <div className="rv-ctl">
          {i.input === 'confirm' ? <div className="row">
            <button className={'btn' + (i.status === 'accepted' ? ' solid' : '')} onClick={() => { setEditing(false); save(i.id, { status: 'accepted', answer: '' }); }}>{i.status === 'accepted' ? '✓ Accepted' : 'Accept'}</button>
            <button className={'btn' + (i.status === 'changed' ? ' solid' : '')} onClick={() => setEditing(true)}>Change it</button>
            <button className={'btn' + (i.status === 'skipped' ? ' solid' : '')} onClick={() => { setEditing(false); save(i.id, { status: 'skipped' }); }}>Not needed</button>
          </div> : null}
          {i.input === 'choice' || i.input === 'multi' ? <div className="row" role="group" aria-label="Options">{i.options.map((o) => <button key={o} className={'rv-opt' + (sel.includes(o) ? ' on' : '')} aria-pressed={sel.includes(o)} onClick={() => pick(o)}>{o}{o === i.recommend ? <span className="rv-sug">suggested</span> : null}</button>)}</div> : null}
          {i.input === 'text' || editing ? <>
            <textarea className="ta" aria-label="Your answer" placeholder={i.input === 'text' ? 'Type your answer' : 'What should it be instead?'} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="row"><button className="btn solid" onClick={() => { const v = draft.trim(); setEditing(false); if (i.input === 'text') save(i.id, { status: v ? 'answered' : 'open', answer: v }); else if (v) save(i.id, { status: 'changed', answer: v }); }}>{i.input === 'text' ? (i.answer ? 'Update' : 'Save') : 'Save change'}</button>{editing ? <button className="btn" onClick={() => setEditing(false)}>Cancel</button> : null}</div>
          </> : null}
          {i.input === 'confirm' && !editing && i.status === 'changed' && i.answer ? <p className="rv-ans">{i.answer}</p> : null}
          <div className="row">
            {i.input !== 'confirm' ? <button className={'btn' + (i.status === 'delegated' ? ' solid' : '')} onClick={() => save(i.id, { status: 'delegated' })}>{i.status === 'delegated' ? '✓ Left to Claude' : 'Leave it to Claude'}</button> : null}
            <input className="in" style={{ flex: 1, minWidth: 160 }} aria-label={`Note on ${i.title}`} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== i.note) save(i.id, { note }); }} />
          </div>
        </div>
      </div>
      {i.preview ? <div className="rv-prev"><img src={i.preview} alt={i.title} loading="lazy" /></div> : null}
    </article>
  );
}
