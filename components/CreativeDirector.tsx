'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, ChevronDown, CornerDownRight, Crosshair, MessageSquare, Plus, Square, X } from 'lucide-react';
import { LpMark } from '@/components/portal/LpMark';
import type { Guide } from '@/lib/portal/guide';
import { guideMap, type BigNote, type Depth, type DetailNote, type Ref, type ReviewSession } from '@/lib/review/director';

// The creative director: a floating assistant in the editor. Start a session (direction, detail or both; the whole
// guide or one chapter), get notes with direction kept apart from proofing, jump to what each note is about,
// apply fixes, and talk it through. It coaches against the studio's standard and never writes strategy.

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const DEPTHS: { id: Depth; title: string; help: string }[] = [
  { id: 'big', title: 'Big picture', help: 'Direction: story, structure, gaps, headlines, guidance that’s hard to follow' },
  { id: 'detail', title: 'Detailed', help: 'Proofing: spelling, grammar, wording, house style, consistency' },
  { id: 'both', title: 'Both', help: 'Direction first, then every fix' }
];
const STEPS = ['Reading the guide', 'Holding it to the studio standard', 'Checking every sentence', 'Writing notes'];
type Msg = { role: 'user' | 'assistant'; content: string };

/** Short paragraphs and lists, with [[go:REF]] as chips that jump to the text */
function Said({ text, onGo, label }: { text: string; onGo: (ref: string) => void; label: (ref: string) => string }) {
  const line = (t: string, k: string): ReactNode[] => {
    const out: ReactNode[] = []; const re = /\[\[go:([^\]]+)\]\]|\[(C\d+(?:\.[A-Za-z0-9:-]+)+)\]|\*\*([^*]+)\*\*/g; let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); const ref = m[1] || m[2]; out.push(ref ? <button key={k + i++} type="button" className="cd-go" onClick={() => onGo(ref.trim())}><Crosshair size={11} strokeWidth={2} aria-hidden />{label(ref.trim())}</button> : <strong key={k + i++}>{m[3]}</strong>); last = re.lastIndex; }
    if (last < t.length) out.push(t.slice(last)); return out;
  };
  const blocks: ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={'l' + blocks.length}>{list.map((x, i) => <li key={i}>{line(x, `l${blocks.length}-${i}`)}</li>)}</ul>); list = []; } };
  text.split('\n').forEach((raw) => { const l = raw.replace(/^#{1,6}\s+/, '').trimEnd(); const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/); if (li) { list.push(li[1]); return; } flush(); if (l.trim()) blocks.push(<p key={'p' + blocks.length}>{line(l, 'p' + blocks.length)}</p>); });
  flush();
  return <div className="cd-said">{blocks}</div>;
}

export function CreativeDirector({ projectId, guide, chapterId, initial, goTo, apply, open, setOpen, onCount }: {
  projectId: string; guide: Guide; chapterId: string; initial?: ReviewSession | null; open: boolean; setOpen: (o: boolean) => void; onCount?: (n: number) => void;
  goTo: (ref: Ref) => void; apply: (ref: Ref, quote: string, suggestion: string) => boolean;
}) {
  const [s, setS] = useState<ReviewSession | null>(initial || null);
  const [setup, setSetup] = useState(!initial);
  const [depth, setDepth] = useState<Depth>('big');
  const [scope, setScope] = useState<string>('');
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'big' | 'detail' | 'questions'>('big');
  const [text, setText] = useState('');
  const [talking, setTalking] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapters = guide.chapters.filter((c) => !c.removed && !c.hidden);

  useEffect(() => { if (!busy) return; setStep(0); const t = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 5000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [s?.messages, talking]);

  // Notes dealt with and the conversation are saved with the session
  const save = (next: ReviewSession) => { setS(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { reviewSession: next } }) }).catch(() => {}); }, 600); };
  const close = (id: string, how: 'applied' | 'done' | 'dismissed') => s && save({ ...s, closed: { ...(s.closed || {}), [id]: how } });
  const reopen = (id: string) => { if (!s) return; const c = { ...(s.closed || {}) }; delete c[id]; save({ ...s, closed: c }); };
  // References: the session's, then the guide as it is now (for refs the conversation brings up)
  const refOf = (r: string): Ref | undefined => s?.refs[r] || guideMap(guide, s?.chapter || null).refs[r];
  const go = (r: string) => { const ref = refOf(r); if (ref) goTo(ref); };
  /** A reference as words: what it is, and the headline of the section it's in */
  const labelOf = (r: string) => {
    const ref = refOf(r); if (!ref) return r;
    const c = guide.chapters.find((x) => x.id === ref.chapter); const b = c?.blocks.find((x) => x.id === ref.block);
    const f = ref.field; const what = f === 'title' ? 'Chapter title' : f === 'lede' ? 'Introduction' : f === 'kicker' || f === 'eyebrow' || f === 'label' ? 'Label' : f === 'heading' ? 'Headline' : f.startsWith('cap:') ? 'Caption' : 'Text';
    const fi = ref.item && b ? (b.items || []).findIndex((x) => x.id === ref.item) : -1;
    const where = b ? (b.heading || b.eyebrow || '').replace(/\s+/g, ' ').trim() : c?.title || '';
    return [what + (fi >= 0 ? ` in frame ${fi + 1}` : ''), where && f !== 'title' ? where.slice(0, 26) + (where.length > 26 ? '…' : '') : ''].filter(Boolean).join(' · ');
  };

  async function start() {
    setBusy(true); setErr('');
    const r = await fetch(`/api/projects/${projectId}/guide/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'start', depth, chapter: scope || null, focus: focus.trim() || undefined }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok || !j.session) { setErr(j.error || 'The review couldn’t run just now. Try again.'); return; }
    setS(j.session); setSetup(false); setTab(depth === 'detail' ? 'detail' : 'big');
  }

  async function send(q: string) {
    if (!q.trim() || !s || talking) return;
    const thread: Msg[] = [...(s.messages || []), { role: 'user', content: q.trim() }];
    let cur: ReviewSession = { ...s, messages: [...thread, { role: 'assistant', content: '' }] };
    setS(cur); setText(''); setTalking(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/guide/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', messages: thread.slice(-30) }) });
      if (!r.ok || !r.body) throw new Error();
      const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true }); cur = { ...cur, messages: [...thread, { role: 'assistant', content: acc }] }; setS(cur); }
    } catch { cur = { ...cur, messages: [...thread, { role: 'assistant', content: 'The connection dropped. Try again.' }] }; }
    setTalking(false); save(cur);
  }
  const discuss = (n: BigNote) => { setOpen(true); send(`Let’s talk about “${n.title}”. ${n.question ? n.question + ' ' : ''}What would you do?`); };

  const big = s?.result.big || [], detail = s?.result.detail || [];
  const isClosed = (id: string) => !!s?.closed?.[id];
  const openBig = big.filter((n) => !isClosed(n.id)), openDetail = detail.filter((n) => !isClosed(n.id));
  const shownBig = showClosed ? big : openBig, shownDetail = showClosed ? detail : openDetail;
  const scopeName = (c?: string | null) => (c ? chapters.find((x) => x.id === c)?.title || 'One chapter' : 'Whole guide');
  const byChapter = (ns: DetailNote[]) => { const m = new Map<string, DetailNote[]>(); for (const n of ns) { const k = n.ref.split('.')[0]; m.set(k, [...(m.get(k) || []), n]); } return [...m]; };
  const chapterTitle = (C: string) => { const r = s && Object.entries(s.refs).find(([k]) => k.startsWith(C + '.'))?.[1]; return r ? chapters.find((c) => c.id === r.chapter)?.title || C : C; };

  useEffect(() => { onCount?.(openBig.length + openDetail.length); }, [openBig.length, openDetail.length, onCount]);
  if (!open) return null;

  return <div className="cd" role="dialog" aria-label="Review">
    <div className="cd-top">
      <span className="cd-mark"><LpMark state={busy ? 'scan' : talking ? 'contour' : 'rest'} /></span>
      <div className="cd-top-t"><strong>Review</strong>{s && !setup ? <span>{scopeName(s.chapter)} · {DEPTHS.find((d) => d.id === s.depth)?.title} · {new Date(s.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span> : <span>Reviews the guide against the studio standard</span>}</div>
      {s && !setup ? <button type="button" className="cd-ic" onClick={() => { setSetup(true); setScope(''); }} data-tip="New session" aria-label="Start a new session"><Plus {...I} /></button> : null}
      <button type="button" className="cd-ic" onClick={() => setOpen(false)} aria-label="Minimise"><ChevronDown {...I} /></button>
    </div>

    {setup || !s ? <div className="cd-body cd-setup">
      {busy ? <div className="cd-busy"><span className="cd-mark lg"><LpMark state="scan" /></span><p>{STEPS[step]}<span className="ak-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p><p className="mute">A thorough read takes a minute or two.</p></div> : <>
        <p className="cd-lede">Start a review session. I’ll read {scope ? 'the chapter' : 'the guide'}, hold it to the studio’s standard, and work through it with you.</p>
        <p className="cd-h">Feedback</p>
        <div className="cd-opts" role="radiogroup" aria-label="Kind of feedback">{DEPTHS.map((d) => <button key={d.id} type="button" role="radio" aria-checked={depth === d.id} className={'cd-opt' + (depth === d.id ? ' on' : '')} onClick={() => setDepth(d.id)}><b>{d.title}</b><span>{d.help}</span></button>)}</div>
        <p className="cd-h">Scope</p>
        <select className="cd-sel" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="What to review"><option value="">The whole guide</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.id === chapterId ? 'This chapter: ' : ''}{c.title}</option>)}</select>
        <p className="cd-h">Anything to focus on? <span>Optional</span></p>
        <textarea className="cd-ta" rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Is the logo chapter clear enough for a client’s in-house team?" />
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
        <div className="cd-row">{s ? <button type="button" className="btn" onClick={() => setSetup(false)}>Back to the last session</button> : null}<button type="button" className="btn solid" onClick={start}>Start review</button></div>
      </>}
    </div> : <div className="cd-body" ref={log}>
      <div className="cd-sum"><Said text={s.result.summary} onGo={go} label={labelOf} />{s.result.strengths.length ? <ul className="cd-good">{s.result.strengths.map((x, i) => <li key={i}><Check size={12} strokeWidth={2} aria-hidden />{x}</li>)}</ul> : null}</div>
      <div className="cd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'big'} className={tab === 'big' ? 'on' : ''} onClick={() => setTab('big')}>Direction <i>{openBig.length}</i></button>
        <button role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'on' : ''} onClick={() => setTab('detail')}>Details <i>{openDetail.length}</i></button>
        {s.result.questions.length ? <button role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'on' : ''} onClick={() => setTab('questions')}>Questions <i>{s.result.questions.length}</i></button> : null}
        <label className="cd-showall"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show done</label>
      </div>

      {tab === 'big' ? <div className="cd-list">
        {!shownBig.length ? <p className="cd-empty">{big.length ? 'All direction notes dealt with.' : s.depth === 'detail' ? 'This was a detailed session. Start a big-picture one for direction.' : 'No direction notes.'}</p> : null}
        {shownBig.map((n) => <article key={n.id} className={'cd-note' + (isClosed(n.id) ? ' closed' : '')}>
          <h4>{n.title}</h4>
          <Said text={n.steer} onGo={go} label={labelOf} />
          {n.why ? <p className="cd-why">{n.why}</p> : null}
          {n.question ? <p className="cd-q"><CornerDownRight {...I} />{n.question}</p> : null}
          <div className="cd-acts">
            {(n.refs || []).slice(0, 4).map((r) => <button key={r} type="button" className="cd-go" onClick={() => go(r)}><Crosshair size={11} strokeWidth={2} aria-hidden />{labelOf(r)}</button>)}
            <span style={{ flex: 1 }} />
            {isClosed(n.id) ? <button type="button" className="cd-a" onClick={() => reopen(n.id)}>Reopen</button> : <><button type="button" className="cd-a" onClick={() => discuss(n)}><MessageSquare {...I} />Discuss</button><button type="button" className="cd-a" onClick={() => close(n.id, 'done')}><Check {...I} />Done</button></>}
          </div>
        </article>)}
      </div> : null}

      {tab === 'detail' ? <div className="cd-list">
        {!shownDetail.length ? <p className="cd-empty">{detail.length ? 'All fixes dealt with.' : s.depth === 'big' ? 'This was a big-picture session. Start a detailed one for proofing.' : 'Nothing to fix.'}</p> : null}
        {byChapter(shownDetail).map(([C, ns]) => <Fragment key={C}>
          <p className="cd-ch">{chapterTitle(C)}</p>
          {ns.map((n) => <article key={n.id} className={'cd-fix' + (isClosed(n.id) ? ' closed' : '')}>
            <div className="cd-fix-top"><span className={'cd-kind k-' + n.kind.replace(' ', '-')}>{n.kind}</span><button type="button" className="cd-go" onClick={() => go(n.ref)}><Crosshair size={11} strokeWidth={2} aria-hidden />{labelOf(n.ref)}</button></div>
            <p className="cd-diff"><del>{n.quote}</del><ins>{n.suggestion}</ins></p>
            {n.note ? <p className="cd-why">{n.note}</p> : null}
            <div className="cd-acts">{isClosed(n.id) ? <><span className="cd-state">{s.closed?.[n.id] === 'applied' ? 'Applied' : 'Dismissed'}</span><button type="button" className="cd-a" onClick={() => reopen(n.id)}>Reopen</button></>
              : <><button type="button" className="cd-a solid" onClick={() => { const ref = refOf(n.ref); if (ref && apply(ref, n.quote, n.suggestion)) close(n.id, 'applied'); else setErr('That text has changed since the review, so the fix can’t be applied. Jump to it and edit by hand.'); }}><Check {...I} />Apply</button><button type="button" className="cd-a" onClick={() => close(n.id, 'dismissed')}><X {...I} />Dismiss</button></>}</div>
          </article>)}
        </Fragment>)}
        {openDetail.length > 1 ? <button type="button" className="cd-all" onClick={() => { let ok = 0; const closed = { ...(s.closed || {}) }; for (const n of openDetail) { const ref = refOf(n.ref); if (ref && apply(ref, n.quote, n.suggestion)) { closed[n.id] = 'applied'; ok++; } } save({ ...s, closed }); setErr(ok < openDetail.length ? `${openDetail.length - ok} couldn’t be applied because the text has changed.` : ''); }}>Apply all {openDetail.length} fixes</button> : null}
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
      </div> : null}

      {tab === 'questions' ? <div className="cd-list">{s.result.questions.map((q, i) => <button key={i} type="button" className="cd-qbtn" onClick={() => { setText(`On “${q}”: `); setTimeout(() => document.getElementById('cd-in')?.focus(), 0); }}><CornerDownRight {...I} />{q}</button>)}</div> : null}

      {(s.messages || []).length ? <div className="cd-thread">{(s.messages || []).map((m, i) => m.role === 'user' ? <div key={i} className="cd-u">{m.content}</div>
        : <div key={i} className="cd-a-msg"><span className="cd-mark sm"><LpMark state={talking && i === (s.messages || []).length - 1 ? (m.content ? 'contour' : 'scan') : 'rest'} /></span>{m.content ? <Said text={m.content} onGo={go} label={labelOf} /> : <p className="ak-step">Thinking<span className="ak-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p>}</div>)}</div> : null}
    </div>}

    {s && !setup ? <form className="cd-bar" onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <textarea id="cd-in" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask, push back, or tell me what you changed…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} aria-label="Message Review" />
      <button className="cd-send" disabled={!text.trim() || talking} aria-label="Send">{talking ? <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden /> : <ArrowUp size={15} strokeWidth={2} aria-hidden />}</button>
    </form> : null}
  </div>;
}
