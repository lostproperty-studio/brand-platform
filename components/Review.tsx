'use client';
import { useEffect, useState } from 'react';
import { fallbackSection, planForAnswer, SECTIONS, type ReviewQuestion, type SectionId } from '@/lib/review/questions';
import { kebab, nameProblems, suggestName } from '@/lib/review/names';

export type Item = {
  id: string; ord: number; chapter: string; kind: 'asset' | 'value' | 'rule' | 'conflict' | 'issue' | 'question';
  title: string; found: string; proposal: string; input: 'confirm' | 'choice' | 'multi' | 'text'; options: string[]; recommend: string;
  node_id: string | null; preview: string | null; swatches: { hex: string; label: string }[];
  status: 'open' | 'accepted' | 'changed' | 'answered' | 'skipped' | 'delegated'; answer: string; note: string;
};
type Ctx = { frame: string; box: { x: number; y: number; w: number; h: number } };
const CHAPTER_NAMES: Record<string, string> = { setup: 'Handover', logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice', templates: 'Templates' };
const done = (i: Item) => i.status !== 'open';

// The review, in sections: final assets, file names, wording and rules, styling consistency, missing rules,
// housekeeping. Inside each section it's one plain question at a time, then what will happen, which you accept.
export function Review({ initial, figmaKey, scanId }: { initial: Item[]; figmaKey: string; scanId: string }) {
  const [items, setItems] = useState(initial);
  const [qs, setQs] = useState<Record<string, ReviewQuestion> | null>(null);
  const [ctx, setCtx] = useState<Record<string, Ctx>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [client, setClient] = useState('');
  const [later, setLater] = useState<string[]>([]);
  const [view, setView] = useState<'flow' | 'all'>('flow');
  const [focus, setFocus] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId | null>(null);
  const [namesOk, setNamesOk] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    try { setNamesOk(localStorage.getItem('lp-names-' + scanId) === '1'); } catch { /* ignore */ }
    fetch(`/api/scans/${scanId}/prepare`, { method: 'POST' }).then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); setQs({}); return; }
      setQs(j.questions || {}); setCtx(j.contexts || {}); setUrls(j.urls || {}); setClient(j.client || '');
      if (j.items) setItems(j.items);
    }).catch(() => setQs({}));
  }, [scanId]);

  async function save(id: string, patch: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) {
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const r = await fetch(`/api/review/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!r.ok) setErr('Couldn’t save that answer. Check your connection and try again.');
  }

  const q = (i: Item) => qs?.[i.id];
  const sec = (i: Item): SectionId => (i.kind === 'asset' ? 'assets' : q(i)?.section || fallbackSection(i));
  const prio = (i: Item) => q(i)?.priority ?? 2;
  const assets = items.filter((i) => i.kind === 'asset');
  const inSection = (id: SectionId) => (id === 'labels' ? assets.filter((i) => i.status !== 'skipped') : items.filter((i) => sec(i) === id));
  const openCount = (id: SectionId) => (id === 'labels' ? (namesOk ? 0 : inSection('labels').length ? 1 : 0) : inSection(id).filter((i) => !done(i)).length);
  const firstOpen = SECTIONS.find((x) => openCount(x.id) > 0)?.id ?? 'assets';
  const current = section ?? firstOpen;
  const nextSection = SECTIONS.slice(SECTIONS.findIndex((x) => x.id === current) + 1).find((x) => openCount(x.id) > 0);

  if (!qs) return <div className="rq-wrap"><div className="rq-empty"><p className="rq-q">Getting your review ready…</p><p className="mute">I’m sorting what I found into a few short sections, and checking the file for styling that’s nearly consistent.</p><div className="pg-bar" aria-hidden><i style={{ width: '60%', transition: 'width 30s ease-out' }} /></div></div></div>;
  if (view === 'all') return <AllList items={items} qs={qs} onBack={() => setView('flow')} onReopen={(id) => { const it = items.find((x) => x.id === id); save(id, { status: 'open' }); setFocus(id); if (it) setSection(sec(it)); setView('flow'); }} />;

  const meta = SECTIONS.find((x) => x.id === current)!;
  const list = inSection(current);
  const queue = list.filter((i) => (prio(i) < 3 || i.id === focus) && !done(i)).sort((a, b) => (Number(b.id === focus) - Number(a.id === focus)) || (later.indexOf(a.id) - later.indexOf(b.id)) || prio(a) - prio(b) || a.ord - b.ord);
  const quick = list.filter((i) => prio(i) === 3 && i.id !== focus);
  const item = queue[0];
  const answered = list.filter(done).length;

  return (
    <div className="rq-wrap">
      <nav className="rs-nav" aria-label="Review sections">
        {SECTIONS.map((x, k) => { const n = inSection(x.id).length, o = openCount(x.id); return (
          <button key={x.id} className={'rs-step' + (x.id === current ? ' on' : '') + (n && !o ? ' done' : '')} aria-current={x.id === current ? 'step' : undefined} onClick={() => { setSection(x.id); setFocus(null); }}>
            <span className="rs-n">{n && !o ? '✓' : k + 1}</span><span className="rs-t">{x.title}</span><span className="rs-c">{!n ? 'Nothing to check' : o ? (x.id === 'labels' ? `${n} files` : `${o} to check`) : 'Done'}</span>
          </button>); })}
        <button className="btn rs-all" onClick={() => setView('all')}>See everything</button>
      </nav>
      {err ? <p role="alert">{err}</p> : null}

      <header className="rs-head">
        <p className="rq-kicker">Section {SECTIONS.findIndex((x) => x.id === current) + 1} of {SECTIONS.length}{current !== 'labels' && list.length ? ` · ${answered} of ${list.length} done` : ''}</p>
        <h2 className="rs-h">{meta.title}</h2>
        <p className="mute" style={{ margin: 0 }}>{meta.blurb}</p>
        {current !== 'labels' && list.length ? <div className="pg-bar" aria-hidden><i style={{ width: `${(answered / list.length) * 100}%` }} /></div> : null}
      </header>

      {current === 'labels'
        ? <Labels scanId={scanId} client={client} items={inSection('labels')} removed={assets.filter((i) => i.status === 'skipped')} figmaKey={figmaKey}
            onSave={save} onAdd={(it) => setItems((l) => [...l, it])} confirmed={namesOk}
            onConfirm={() => { setNamesOk(true); try { localStorage.setItem('lp-names-' + scanId, '1'); } catch { /* ignore */ } }}
            next={nextSection ? () => setSection(nextSection.id) : undefined} nextTitle={nextSection?.title} />
        : !list.length ? <SectionDone text="Nothing to check here. The file looked clear." next={nextSection} onNext={() => nextSection && setSection(nextSection.id)} />
        : item ? <Question key={item.id} item={item} q={q(item)!} ctx={item.node_id ? ctx[item.node_id] : undefined} urls={urls} figmaKey={figmaKey}
            onDone={(patch) => { if (item.id === focus) setFocus(null); save(item.id, patch); }} onLater={() => setLater((l) => [...l.filter((x) => x !== item.id), item.id])} />
        : quick.some((i) => !done(i)) ? <AllDone quick={quick} qs={qs} onAcceptAll={() => quick.filter((i) => !done(i)).forEach((i) => save(i.id, { status: 'accepted' }))} onAll={() => setView('all')} />
        : <SectionDone text={`${meta.title}: done.`} next={nextSection} onNext={() => nextSection && setSection(nextSection.id)} />}

      <p className="mute rq-foot">You can do the sections in any order, and stop at any point. Anything you don’t get to uses my suggestion.</p>
    </div>
  );
}

function SectionDone({ text, next, onNext }: { text: string; next?: { title: string }; onNext: () => void }) {
  return <div className="rq-empty"><p className="rq-q">{text}</p>{next ? <div className="row"><button className="btn solid" onClick={onNext}>Next: {next.title}</button></div> : <p className="mute">That’s every section. Build or rebuild the kit to put your answers in.</p>}</div>;
}

// File names: every final asset with its preview and file name, checked against the naming system.
export function Labels({ scanId, client, items, removed, figmaKey, onSave, onAdd, confirmed, onConfirm, next, nextTitle }: { scanId: string; client: string; items: Item[]; removed: Item[]; figmaKey: string; onSave: (id: string, p: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) => void; onAdd: (i: Item) => void; confirmed: boolean; onConfirm: () => void; next?: () => void; nextTitle?: string }) {
  const nameOf = (i: Item) => (i.answer && /\.(svg|png)$/.test(i.answer) ? i.answer : i.proposal.match(/[a-z0-9-]+\.(svg|png)/)?.[0] || suggestName(client || 'brand', i.title));
  const names = items.map(nameOf);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; type: string; w: number; h: number; slide: string }[] | null>(null);
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const setName = (i: Item, v: string) => onSave(i.id, { answer: v.trim(), status: i.status === 'open' ? 'accepted' : i.status === 'skipped' ? 'accepted' : i.status });
  const fixAll = () => items.forEach((i) => { if (nameProblems(client, nameOf(i), names).length) setName(i, suggestName(client, i.title)); });
  async function search(e: React.FormEvent) { e.preventDefault(); setFound(null); const r = await fetch(`/api/scans/${scanId}/layers?q=${encodeURIComponent(q)}`); setFound(r.ok ? (await r.json()).layers : []); }
  async function add(body: Record<string, string>) {
    setMsg('Adding…');
    const r = await fetch(`/api/scans/${scanId}/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t add that.'); return; }
    if (j.item) onAdd(j.item); setMsg('Added.'); setLink('');
  }
  const problemCount = items.filter((i) => nameProblems(client, nameOf(i), names).length).length;
  return (
    <div className="lb">
      <div className="lb-sys"><p style={{ margin: 0 }}>The naming system</p><p className="mute" style={{ margin: 0 }}><code>{kebab(client || 'client')}-asset-variant-colour.svg</code>, all lowercase, words joined by hyphens. For example <code>{kebab(client || 'client')}-logo-horizontal-black.svg</code>. Each file comes as SVG and PNG.</p>{problemCount ? <div className="row"><button className="btn solid" onClick={fixAll}>Fix {problemCount} name{problemCount > 1 ? 's' : ''} for me</button></div> : null}</div>
      <div className="lb-list">
        {items.map((i) => { const n = nameOf(i), probs = nameProblems(client, n, names); return (
          <div key={i.id} className={'lb-row' + (probs.length ? ' warn' : '')}>
            <div className="lb-prev">{i.preview ? <img src={i.preview} alt="" /> : <span className="mute">No preview</span>}</div>
            <div className="lb-main">
              <label className="sr" htmlFor={`n-${i.id}`}>File name for {i.title}</label>
              <input id={`n-${i.id}`} className="in lb-name" defaultValue={n} key={n} onBlur={(e) => e.target.value.trim() !== n && setName(i, e.target.value)} />
              <p className="mute" style={{ margin: 0 }}>{probs.length ? <span className="lb-prob">Should {probs.join('; ')}.</span> : 'Looks right.'} From “{i.title}”{i.node_id ? <> · <a href={`https://www.figma.com/design/${figmaKey}/?node-id=${i.node_id.replace(':', '-')}`} target="_blank" rel="noopener">Figma ↗</a></> : null}</p>
            </div>
            <button className="btn" onClick={() => onSave(i.id, { status: 'skipped' })}>Remove</button>
          </div>); })}
        {!items.length ? <p className="mute">No final assets yet. Confirm some in Final assets, or add them below.</p> : null}
      </div>

      <div className="lb-add">
        <p style={{ margin: 0 }}>Missing something?</p>
        <form className="row" onSubmit={search}><label className="sr" htmlFor="lb-q">Find a layer in Figma by name</label><input id="lb-q" className="in" style={{ flex: 1, minWidth: 180 }} placeholder="Find a layer by name, e.g. symbol" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn" disabled={q.trim().length < 2}>Find</button></form>
        {found ? (found.length ? <div className="lb-found">{found.map((l) => <div key={l.id} className="tm-row"><div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0 }}>{l.name}</p><p className="mute" style={{ margin: 0 }}>{l.w} × {l.h} · on “{l.slide}”</p></div><button className="btn" onClick={() => add({ nodeId: l.id })}>Add</button></div>)}</div> : <p className="mute" style={{ margin: 0 }}>No layers with that name.</p>) : null}
        <form className="row" onSubmit={(e) => { e.preventDefault(); add({ link }); }}><label className="sr" htmlFor="lb-l">Or paste a Figma link to the layer</label><input id="lb-l" className="in" style={{ flex: 1, minWidth: 180 }} placeholder="Or paste a Figma link to the layer (Copy link to selection)" value={link} onChange={(e) => setLink(e.target.value)} /><button className="btn" disabled={!link.includes('node-id')}>Add</button></form>
        {msg ? <p className="mute" role="status" style={{ margin: 0 }}>{msg}</p> : null}
      </div>

      {removed.length ? <details><summary className="mute">Removed ({removed.length})</summary><div className="lb-list" style={{ marginTop: 8 }}>{removed.map((i) => <div key={i.id} className="lb-row"><div className="lb-prev">{i.preview ? <img src={i.preview} alt="" /> : null}</div><div className="lb-main"><p style={{ margin: 0 }}>{i.title}</p></div><button className="btn" onClick={() => onSave(i.id, { status: 'accepted' })}>Put back</button></div>)}</div></details> : null}

      <div className="row">{confirmed ? <span className="mute">Names confirmed.</span> : <button className="btn solid" disabled={!items.length || problemCount > 0} onClick={onConfirm}>{problemCount ? `Fix ${problemCount} name${problemCount > 1 ? 's' : ''} first` : 'These names are right'}</button>}{next ? <button className="btn" onClick={next}>Next: {nextTitle}</button> : null}</div>
    </div>
  );
}

export function Question({ item: i, q, ctx, urls, figmaKey, onDone, onLater }: { item: Item; q: ReviewQuestion; ctx?: Ctx; urls: Record<string, string>; figmaKey: string; onDone: (p: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) => void; onLater: () => void }) {
  const [stage, setStage] = useState<'ask' | 'explain' | 'plan'>('ask');
  const [plan, setPlan] = useState<{ text: string; patch: Partial<Pick<Item, 'status' | 'answer' | 'note'>> } | null>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>(i.input === 'multi' ? (i.recommend ? i.recommend.split(/,\s*/) : []) : []);
  const [thinking, setThinking] = useState(false);
  const choice = i.input === 'choice' || i.input === 'multi';
  const freeText = i.input === 'text';

  const propose = (text: string, patch: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) => { setPlan({ text, patch: { ...patch, note: text } }); setStage('plan'); };
  async function explain() {
    const t = text.trim(); if (!t) return;
    setThinking(true);
    const r = await fetch(`/api/review/${i.id}/interpret`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ explanation: t, question: q.question }) }).then((x) => x.json()).catch(() => ({}));
    setThinking(false);
    propose(r.plan || planForAnswer(i, t), { status: freeText ? 'answered' : 'changed', answer: t });
  }
  const yes = () => propose(q.yes || (i.proposal ? `I’ll use this: ${i.proposal}` : 'I’ll use it as found.'), { status: 'accepted', answer: '' });
  const no = () => (q.no && !q.noNeedsDetail ? propose(q.no, { status: i.kind === 'asset' ? 'skipped' : 'changed', answer: 'no' }) : setStage('explain'));

  return (
    <article className="rq">
      <div className="rq-visual">
        {ctx && urls[ctx.frame] ? <figure className="rq-ctx">
          <div className="rq-ctx-img"><img src={urls[ctx.frame]} alt="Where this is on the Figma page" /><span className="rq-hl" style={{ left: `${ctx.box.x}%`, top: `${ctx.box.y}%`, width: `${Math.max(ctx.box.w, 2)}%`, height: `${Math.max(ctx.box.h, 2)}%` }} /></div>
          <figcaption className="mute">Where it is in Figma{i.node_id ? <> · <a href={`https://www.figma.com/design/${figmaKey}/?node-id=${i.node_id.replace(':', '-')}`} target="_blank" rel="noopener">Open ↗</a></> : null}</figcaption>
        </figure> : null}
        {i.preview ? <div className="rq-el"><img src={i.preview} alt={i.title} /></div> : null}
        {i.swatches?.length ? <div className="rq-sw">{i.swatches.map((s) => <span key={s.hex + s.label}><i style={{ background: s.hex }} />{s.hex}</span>)}</div> : null}
        {!ctx && !i.preview && !i.swatches?.length ? <div className="rq-el empty"><span className="mute">{CHAPTER_NAMES[i.chapter] || i.chapter}</span></div> : null}
      </div>

      <div className="rq-body">
        <p className="rq-kicker">{CHAPTER_NAMES[i.chapter] || i.chapter}</p>
        <h2 className="rq-q">{q.question}</h2>
        {q.why ? <p className="mute rq-why">{q.why}</p> : null}
        {i.kind === 'rule' && i.proposal && stage === 'ask' ? <blockquote className="rq-quote">{i.proposal}</blockquote> : null}

        {stage === 'ask' ? <>
          {choice ? <div className="rq-choices" role="group" aria-label="Options">
            {i.options.map((o) => { const on = picked.includes(o); return <button key={o} className={'rq-choice' + (on ? ' on' : '')} aria-pressed={on} onClick={() => (i.input === 'multi' ? setPicked(on ? picked.filter((x) => x !== o) : [...picked, o]) : propose(planForAnswer(i, o), { status: 'answered', answer: o }))}>{o}{o === i.recommend ? <span className="rq-sug">my suggestion</span> : null}</button>; })}
            {i.input === 'multi' ? <div className="row"><button className="btn solid" disabled={!picked.length} onClick={() => propose(planForAnswer(i, picked.join('\n')), { status: 'answered', answer: picked.join('\n') })}>Continue</button></div> : null}
          </div>
          : freeText ? <div className="rq-explain">
            <textarea className="ta" autoFocus placeholder="Type your answer" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row"><button className="btn solid" disabled={!text.trim() || thinking} onClick={explain}>{thinking ? 'Thinking…' : 'Continue'}</button></div>
          </div>
          : <div className="rq-answers"><button className="rq-a" onClick={yes}>Yes</button><button className="rq-a ghost" onClick={no}>No</button><button className="rq-a link" onClick={() => setStage('explain')}>It’s something else…</button></div>}
        </> : null}

        {stage === 'explain' ? <div className="rq-explain">
          <label className="mute" htmlFor={`ex-${i.id}`}>Tell me what it is, or what it should be</label>
          <textarea id={`ex-${i.id}`} className="ta" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row"><button className="btn solid" disabled={!text.trim() || thinking} onClick={explain}>{thinking ? 'Thinking…' : 'Continue'}</button><button className="btn" onClick={() => setStage('ask')}>Back</button></div>
        </div> : null}

        {stage === 'plan' && plan ? <div className="rq-plan">
          <p className="rq-kicker">Here’s what I’ll do</p>
          <p className="rq-plan-t">{plan.text}</p>
          <div className="row"><button className="btn solid" autoFocus onClick={() => onDone(plan.patch)}>Sounds good</button><button className="btn" onClick={() => { setStage('ask'); setPlan(null); }}>Change my answer</button></div>
        </div> : null}

        {stage !== 'plan' ? <button className="rq-later" onClick={onLater}>Not sure yet, ask me later</button> : null}
      </div>
    </article>
  );
}

function AllDone({ quick, qs, onAcceptAll, onAll }: { quick: Item[]; qs: Record<string, ReviewQuestion>; onAcceptAll: () => void; onAll: () => void }) {
  const pending = quick.filter((i) => !done(i));
  return <div className="rq-empty">
    <p className="rq-q">{pending.length ? 'The main decisions are done.' : 'All done.'}</p>
    {pending.length ? <>
      <p className="mute">These are small things I’m confident about. Have a quick look, then accept them together.</p>
      <ul className="rq-quick">{pending.map((i) => <li key={i.id}><span>{qs[i.id]?.question || i.title}</span>{qs[i.id]?.yes ? <span className="mute">{qs[i.id]!.yes}</span> : null}</li>)}</ul>
      <div className="row"><button className="btn solid" onClick={onAcceptAll}>Looks right, accept all</button><button className="btn" onClick={onAll}>Go through them one by one</button></div>
    </> : <p className="mute">Everything is answered. Build or rebuild the kit to put your answers in.</p>}
  </div>;
}

function AllList({ items, qs, onBack, onReopen }: { items: Item[]; qs: Record<string, ReviewQuestion>; onBack: () => void; onReopen: (id: string) => void }) {
  return <div className="rq-wrap">
    <div className="rq-top"><p className="rq-kicker">Everything I found ({items.length})</p><button className="btn solid" onClick={onBack}>Back to questions</button></div>
    <div className="rq-list">{items.map((i) => <div key={i.id} className="rq-li">
      <span className={'rq-dot' + (done(i) ? ' on' : '')} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0 }}>{qs[i.id]?.question || i.title}</p><p className="mute" style={{ margin: 0 }}>{done(i) ? (i.note || (i.answer ? `Answer: ${i.answer}` : i.status === 'skipped' ? 'Not needed' : 'Accepted')) : 'Not answered yet · uses my suggestion'}</p></div>
      {done(i) ? <button className="btn" onClick={() => onReopen(i.id)}>Change</button> : <button className="btn" onClick={() => onReopen(i.id)}>Answer</button>}
    </div>)}</div>
  </div>;
}
