'use client';
import { useEffect, useMemo, useState } from 'react';
import { planForAnswer, type ReviewQuestion } from '@/lib/review/questions';

export type Item = {
  id: string; ord: number; chapter: string; kind: 'asset' | 'value' | 'rule' | 'conflict' | 'issue' | 'question';
  title: string; found: string; proposal: string; input: 'confirm' | 'choice' | 'multi' | 'text'; options: string[]; recommend: string;
  node_id: string | null; preview: string | null; swatches: { hex: string; label: string }[];
  status: 'open' | 'accepted' | 'changed' | 'answered' | 'skipped' | 'delegated'; answer: string; note: string;
};
type Ctx = { frame: string; box: { x: number; y: number; w: number; h: number } };
const CHAPTER_NAMES: Record<string, string> = { setup: 'Handover', logo: 'Logo', type: 'Typography', colour: 'Colour', layout: 'Grid & layout', imagery: 'Imagery', voice: 'Tone of voice', templates: 'Templates' };
const BATCH = 5;
const done = (i: Item) => i.status !== 'open';

// The review, one decision at a time: a plain question, then what will happen, which you accept.
// Most important first, in small batches; minor confirmations come last and can be accepted together.
export function Review({ initial, figmaKey, scanId }: { initial: Item[]; figmaKey: string; scanId: string }) {
  const [items, setItems] = useState(initial);
  const [qs, setQs] = useState<Record<string, ReviewQuestion> | null>(null);
  const [ctx, setCtx] = useState<Record<string, Ctx>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [later, setLater] = useState<string[]>([]);
  const [view, setView] = useState<'flow' | 'all'>('flow');
  const [focus, setFocus] = useState<string | null>(null);
  const [breakSeen, setBreakSeen] = useState(-1);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/scans/${scanId}/prepare`, { method: 'POST' }).then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); setQs({}); return; }
      setQs(j.questions || {}); setCtx(j.contexts || {}); setUrls(j.urls || {});
    }).catch(() => setQs({}));
  }, [scanId]);

  async function save(id: string, patch: Partial<Pick<Item, 'status' | 'answer' | 'note'>>) {
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const r = await fetch(`/api/review/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!r.ok) setErr('Couldn’t save that answer. Check your connection and try again.');
  }

  // Order: priority 1 then 2 (in batches of five), skipped-for-now at the end; priority 3 are quick confirms
  const q = (i: Item) => qs?.[i.id];
  const prio = (i: Item) => q(i)?.priority ?? 2;
  const queue = useMemo(() => items.filter((i) => prio(i) < 3 || i.id === focus).sort((a, b) => (Number(b.id === focus) - Number(a.id === focus)) || (later.indexOf(a.id) - later.indexOf(b.id)) || prio(a) - prio(b) || a.ord - b.ord), [items, qs, later, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const quickAll = items.filter((i) => prio(i) === 3 && i.id !== focus);
  const quick = quickAll;
  const open = queue.filter((i) => !done(i));
  const answeredMain = queue.length - open.length;
  const batchNo = Math.floor(answeredMain / BATCH);
  const batchTotal = Math.max(1, Math.ceil(queue.length / BATCH));
  const inBatch = answeredMain % BATCH;
  const current = open[0];

  if (!qs) return <div className="rq-wrap"><div className="rq-empty"><p className="rq-q">Getting your questions ready…</p><p className="mute">I’m turning what I found into a few simple decisions, most important first.</p><div className="pg-bar" aria-hidden><i style={{ width: '60%', transition: 'width 20s ease-out' }} /></div></div></div>;

  if (view === 'all') return <AllList items={items} qs={qs} onBack={() => setView('flow')} onReopen={(id) => { save(id, { status: 'open' }); setFocus(id); setView('flow'); }} />;

  return (
    <div className="rq-wrap">
      <div className="rq-top">
        <div>
          <p className="rq-kicker">{current ? `Batch ${Math.min(batchNo + 1, batchTotal)} of ${batchTotal} · ${Math.min(inBatch + 1, BATCH)} of ${Math.min(BATCH, queue.length - batchNo * BATCH)}` : 'Main decisions done'}</p>
          <div className="pg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={answeredMain} aria-label="Review progress"><i style={{ width: `${queue.length ? (answeredMain / queue.length) * 100 : 100}%` }} /></div>
        </div>
        <button className="btn" onClick={() => setView('all')}>See everything</button>
      </div>
      {err ? <p role="alert">{err}</p> : null}

      {current ? (inBatch === 0 && answeredMain > 0 && breakSeen !== answeredMain && current.id !== focus
        ? <BatchBreak left={open.length} next={open.slice(0, 3).map((i) => q(i)?.question || i.title)} onGo={() => setBreakSeen(answeredMain)} />
        : <Question key={current.id} item={current} q={q(current)!} ctx={current.node_id ? ctx[current.node_id] : undefined} urls={urls} figmaKey={figmaKey}
            onDone={(patch) => { if (current.id === focus) { setFocus(null); setBreakSeen(answeredMain + 1); } save(current.id, patch); }} onLater={() => setLater((l) => [...l.filter((x) => x !== current.id), current.id])} />)
        : <AllDone quick={quick} qs={qs} onAcceptAll={() => quick.filter((i) => !done(i)).forEach((i) => save(i.id, { status: 'accepted' }))} onAll={() => setView('all')} />}

      <p className="mute rq-foot">Anything you don’t get to uses my suggestion, and you can come back to it any time from the project’s Review tab.</p>
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

function BatchBreak({ left, next, onGo }: { left: number; next: string[]; onGo: () => void }) {
  return <div className="rq-empty">
    <p className="rq-q">Batch done. Nice.</p>
    <p className="mute">{left} more decision{left === 1 ? '' : 's'} to go. Next up:</p>
    <ul className="rq-next">{next.map((n) => <li key={n}>{n}</li>)}</ul>
    <div className="row"><button className="btn solid" onClick={onGo}>Next batch</button><span className="mute">Or stop here. My suggestions cover the rest until you’re back.</span></div>
  </div>;
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
