'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Compass, CornerDownRight, Crosshair, History, MessageSquare, Plus, RotateCw, ScanText, SpellCheck2, Square, X } from 'lucide-react';
import { LpMark } from '@/components/portal/LpMark';
import type { Guide } from '@/lib/portal/guide';
import { guideMap, type BigNote, type Depth, type DetailNote, type Ref, type ReviewSession } from '@/lib/review/director';
import { applyForm, findInconsistencies, type ConsistencyGroup } from '@/lib/review/consistency';

// Review: a floating assistant in the editor. Each time it opens it starts fresh, on the chapter you're in (or what
// you've selected), with three things it can do: a big-picture read, a proofread, or a consistency check for words
// written more than one way. Earlier sessions are kept in its history, to pick up where you left off. It coaches
// against the studio's standard and never writes strategy.

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const STEPS = ['Reading the guide', 'Holding it to the studio standard', 'Checking every sentence', 'Writing notes'];
const ACTIONS = [
  { id: 'big' as const, title: 'Big picture', help: 'Story, structure and gaps', Icon: Compass },
  { id: 'detail' as const, title: 'Proofread', help: 'Spelling, grammar and house style', Icon: SpellCheck2 },
  { id: 'consistency' as const, title: 'Consistency', help: 'Words written two ways, like lockup and lock-up', Icon: ScanText }
];
const sid = () => 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const firstSentences = (t: string, n = 2) => { const m = t.match(new RegExp(`^(?:[^.!?]*[.!?]\\s*){1,${n}}`)); return m ? m[0].trim() : t; };
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

export function CreativeDirector({ projectId, guide, chapterId, history: initialHistory = [], known = [], goTo, apply, rewrite, open, setOpen, onCount, focusOn }: {
  projectId: string; guide: Guide; chapterId: string; open: boolean; setOpen: (o: boolean) => void; onCount?: (n: number) => void;
  /** Earlier sessions, newest first */ history?: ReviewSession[];
  /** How the brand writes its own words: the dictionary, names, vocabulary */ known?: string[];
  /** What's selected in the editor: Review helps with just that */ focusOn?: { label: string; refs: string[] } | null;
  goTo: (ref: Ref) => void; apply: (ref: Ref, quote: string, suggestion: string) => boolean;
  rewrite: (ref: Ref, f: (text: string) => string | null) => boolean;
}) {
  const [history, setHistory] = useState<ReviewSession[]>(initialHistory);
  const [s, setS] = useState<ReviewSession | null>(null);
  const [view, setView] = useState<'home' | 'session' | 'history'>('home');
  const [scope, setScope] = useState<string>(chapterId);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'big' | 'detail'>('big');
  const [ni, setNi] = useState(0);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [talking, setTalking] = useState(false);
  const [pickFor, setPickFor] = useState<Record<string, string>>({});
  const log = useRef<HTMLDivElement>(null);
  // A floating window: drag it by its title bar; where you leave it is remembered on this computer
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => { try { const v = JSON.parse(localStorage.getItem('lp-review-pos') || 'null'); return v && typeof v.x === 'number' ? v : null; } catch { return null; } });
  const dragWin = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const box = (e.currentTarget as HTMLElement).closest('.cd') as HTMLElement; const r = box.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    const mv = (ev: PointerEvent) => { last = { x: Math.max(8, Math.min(window.innerWidth - r.width - 8, ev.clientX - dx)), y: Math.max(8, Math.min(window.innerHeight - 80, ev.clientY - dy)) }; setPos(last); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); try { localStorage.setItem('lp-review-pos', JSON.stringify(last)); } catch { /* not kept */ } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); e.preventDefault();
  };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapters = guide.chapters.filter((c) => !c.removed && !c.hidden);
  const chapterName = (c?: string | null) => (c ? chapters.find((x) => x.id === c)?.title || 'One chapter' : 'Whole guide');

  // Every time it opens: a new window, about where you are now. Earlier sessions are in the history.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) { setS(null); setView('home'); setScope(chapterId); setErr(''); setText(''); setNi(0); setMore(false); }
    wasOpen.current = open;
  }, [open, chapterId]);
  // Moving to another chapter while on the start screen follows you there
  useEffect(() => { if (view === 'home' && !busy) setScope((sc) => (sc ? chapterId : sc)); }, [chapterId, view, busy]);
  useEffect(() => { if (!busy) return; setStep(0); const t = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 5000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [s?.messages?.length, talking]);

  // The history is saved with the project: newest first, the last 30 sessions
  const persist = (list: ReviewSession[]) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { reviewSessions: list } }) }).catch(() => {}); }, 600); };
  const save = (next: ReviewSession) => {
    setS(next);
    setHistory((h) => { const list = [{ ...next, messages: (next.messages || []).slice(-60) }, ...h.filter((x) => x.id !== next.id)].slice(0, 30); persist(list); return list; });
  };
  const close = (id: string, how: 'applied' | 'done' | 'dismissed') => s && save({ ...s, closed: { ...(s.closed || {}), [id]: how } });
  const reopen = (id: string) => { if (!s) return; const c = { ...(s.closed || {}) }; delete c[id]; save({ ...s, closed: c }); };
  // References: the session's, then the guide as it is now (for refs the conversation brings up)
  const refOf = (r: string): Ref | undefined => s?.refs[r] || guideMap(guide, s?.chapter || null).refs[r] || guideMap(guide, null).refs[r];
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
  const blank = (kind: ReviewSession['kind'], title: string, chapter: string | null): ReviewSession => ({ id: sid(), kind, title, at: new Date().toISOString(), depth: 'big', chapter, result: { summary: '', strengths: [], big: [], detail: [], questions: [] }, refs: {}, closed: {}, messages: [] });

  async function review(depth: Depth) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/projects/${projectId}/guide/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'start', depth, chapter: scope || null }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok || !j.session) { setErr(j.error || 'The review couldn’t run just now. Try again.'); return; }
    const next: ReviewSession = { ...j.session, id: sid(), kind: 'review', title: `${depth === 'detail' ? 'Proofread' : 'Big picture'} · ${chapterName(scope || null)}` };
    save(next); setView('session'); setTab(depth === 'detail' ? 'detail' : 'big'); setNi(0); setMore(false);
  }
  function check(chapter: string | null = scope || null, keep?: ReviewSession) {
    const map = guideMap(guide, chapter);
    const groups = findInconsistencies(map.texts, known);
    // Checking again keeps what was already chosen for words still found
    const prev = new Map((keep?.consistency || []).map((x) => [x.key, x]));
    const merged = groups.map((x) => { const p = prev.get(x.key); return p?.state === 'skipped' ? { ...x, state: p.state } : x; });
    const base = keep || blank('consistency', `Consistency · ${chapterName(chapter)}`, chapter);
    save({ ...base, at: new Date().toISOString(), refs: map.refs, consistency: [...merged, ...(keep?.consistency || []).filter((x) => x.state === 'fixed' && !groups.some((g) => g.key === x.key))] });
    setView('session');
  }
  /** Use one form everywhere in this session's scope */
  function pickForm(gr: ConsistencyGroup, to: string) {
    if (!s) return;
    const refs = [...new Set(gr.forms.filter((f) => f.form !== to).flatMap((f) => f.refs))];
    let changed = 0;
    for (const r of refs) { const ref = s.refs[r] || refOf(r); if (ref && rewrite(ref, (t) => applyForm(t, gr, to))) changed++; }
    save({ ...s, consistency: (s.consistency || []).map((x) => (x.key === gr.key ? { ...x, chosen: to, state: 'fixed' } : x)) });
    setErr(changed < refs.length ? `${refs.length - changed} place${refs.length - changed === 1 ? '' : 's'} had already changed, so ${refs.length - changed === 1 ? 'it was' : 'they were'} left as ${refs.length - changed === 1 ? 'it is' : 'they are'}.` : '');
  }
  const skip = (gr: ConsistencyGroup) => s && save({ ...s, consistency: (s.consistency || []).map((x) => (x.key === gr.key ? { ...x, state: 'skipped' } : x)) });

  /** What the session has found, for the conversation */
  const brief = (x: ReviewSession | null) => {
    if (!x) return '';
    if (x.kind === 'consistency') return (x.consistency || []).map((g) => `- ${g.forms.map((f) => `${f.form} (${f.count})`).join(' / ')}: ${g.state === 'fixed' ? `now "${g.chosen}" everywhere` : g.state === 'skipped' ? 'left as it is' : `open, suggested "${g.recommend}" (${g.why})`}`).join('\n');
    if (!x.result.summary) return '';
    return `${x.depth === 'detail' ? 'Proofread' : x.depth === 'big' ? 'Big-picture review' : 'Review'} of ${chapterName(x.chapter)}.\nSummary: ${x.result.summary}\n${x.result.big.map((n) => `- [${x.closed?.[n.id] || 'open'}] ${n.title}: ${n.steer}`).join('\n')}${x.result.detail.length ? `\n${x.result.detail.length} detail fixes, ${Object.keys(x.closed || {}).filter((k) => k.startsWith('d')).length} dealt with.` : ''}`;
  };
  async function send(q: string, about?: string[]) {
    if (!q.trim() || talking) return;
    // From the start screen, a question starts a conversation about where you are
    const base: ReviewSession = s || blank('chat', q.trim().replace(/\s+/g, ' ').slice(0, 60), scope || null);
    setView('session');
    const thread: Msg[] = [...(base.messages || []), { role: 'user', content: q.trim() }];
    let cur: ReviewSession = { ...base, messages: [...thread, { role: 'assistant', content: '' }] };
    setS(cur); setText(''); setTalking(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/guide/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', messages: thread.slice(-30), selection: about ?? focusOn?.refs, chapter: base.chapter ?? null, notes: brief(base).slice(0, 12000) || undefined }) });
      if (!r.ok || !r.body) throw new Error();
      const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true }); cur = { ...cur, messages: [...thread, { role: 'assistant', content: acc }] }; setS(cur); }
    } catch { cur = { ...cur, messages: [...thread, { role: 'assistant', content: 'The connection dropped. Try again.' }] }; }
    setTalking(false); save(cur);
  }
  const discuss = (n: BigNote) => send(`Let’s talk about “${n.title}”. ${n.question ? n.question + ' ' : ''}What would you do?`);
  const ask = (q: string) => send(q);

  const big = s?.result.big || [], detail = s?.result.detail || [];
  const isClosed = (id: string) => !!s?.closed?.[id];
  const openBig = big.filter((n) => !isClosed(n.id)), openDetail = detail.filter((n) => !isClosed(n.id));
  const groups = s?.consistency || [];
  const openGroups = groups.filter((g) => !g.state);
  const openCount = (x: ReviewSession) => x.kind === 'consistency' ? (x.consistency || []).filter((g) => !g.state).length : x.result.big.filter((n) => !x.closed?.[n.id]).length + x.result.detail.filter((n) => !x.closed?.[n.id]).length;
  const byChapter = (ns: DetailNote[]) => { const m = new Map<string, DetailNote[]>(); for (const n of ns) { const k = n.ref.split('.')[0]; m.set(k, [...(m.get(k) || []), n]); } return [...m]; };
  const chapterTitle = (C: string) => { const r = s && Object.entries(s.refs).find(([k]) => k.startsWith(C + '.'))?.[1]; return r ? chapters.find((c) => c.id === r.chapter)?.title || C : C; };
  const note = openBig[Math.min(ni, Math.max(0, openBig.length - 1))];

  const latest = s || history[0];
  const badge = latest ? openCount(latest) : 0;
  useEffect(() => { onCount?.(badge); }, [badge, onCount]);
  if (!open) return null;

  const when = (iso: string) => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const KindIcon = ({ k }: { k?: ReviewSession['kind'] }) => k === 'consistency' ? <ScanText {...I} /> : k === 'chat' ? <MessageSquare {...I} /> : <Compass {...I} />;

  return <div className={'cd' + (pos ? ' moved' : '')} role="dialog" aria-label="Review" style={pos ? { left: pos.x, top: pos.y } : undefined}>
    <div className="cd-top" onPointerDown={dragWin} title="Drag to move">
      {view !== 'home' ? <button type="button" className="cd-ic" onClick={() => { setView('home'); setS(null); setErr(''); }} aria-label="Back to the start" data-tip="New"><ArrowLeft {...I} /></button> : <span className="cd-mark"><LpMark state={busy ? 'scan' : talking ? 'contour' : 'rest'} /></span>}
      <div className="cd-top-t"><strong>{view === 'history' ? 'History' : view === 'session' && s ? s.title || 'Review' : 'Review'}</strong>{view === 'session' && s ? <span>{(s.title || '').includes(chapterName(s.chapter)) ? '' : chapterName(s.chapter) + ' · '}{when(s.at)}</span> : null}</div>
      <button type="button" className={'cd-ic' + (view === 'history' ? ' on' : '')} onClick={() => setView(view === 'history' ? (s ? 'session' : 'home') : 'history')} aria-label="Earlier sessions" aria-pressed={view === 'history'} data-tip="History"><History {...I} /></button>
      <button type="button" className="cd-ic" onClick={() => setOpen(false)} aria-label="Minimise"><ChevronDown {...I} /></button>
    </div>

    {view === 'history' ? <div className="cd-body">
      <button type="button" className="cd-new" onClick={() => { setS(null); setView('home'); }}><Plus {...I} />New session</button>
      {!history.length ? <p className="cd-empty">Nothing yet. Sessions you start are kept here.</p> : <ul className="cd-hist">{history.map((x) => { const n = openCount(x); return <li key={x.id}>
        <button type="button" className={s?.id === x.id ? 'on' : ''} onClick={() => { setS(x); setView('session'); setTab(x.depth === 'detail' ? 'detail' : 'big'); setNi(0); setMore(false); setErr(''); }}>
          <span className="cd-hist-ic"><KindIcon k={x.kind} /></span>
          <span className="cd-hist-t"><b>{x.title || (x.result.summary ? 'Review' : 'Conversation')}</b><span>{chapterName(x.chapter)} · {when(x.at)}{x.messages?.length ? ` · ${Math.ceil(x.messages.length / 2)} message${x.messages.length > 2 ? 's' : ''}` : ''}</span></span>
          {n ? <i className="cd-hist-n">{n}</i> : x.kind !== 'chat' ? <Check size={13} strokeWidth={2} className="cd-hist-ok" aria-label="All done" /> : null}
        </button>
      </li>; })}</ul>}
    </div> : null}

    {view === 'home' ? <div className="cd-body cd-home">
      {busy ? <div className="cd-busy"><span className="cd-mark lg"><LpMark state="scan" /></span><p>{STEPS[step]}<span className="ak-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p><p className="mute">A thorough read takes a minute or two.</p></div> : <>
        <div className="cd-where">
          <span>Looking at</span>
          <div className="cd-seg" role="radiogroup" aria-label="What to look at">
            <button type="button" role="radio" aria-checked={!!scope} className={scope ? 'on' : ''} onClick={() => setScope(chapterId)}>{chapterName(chapterId)}</button>
            <button type="button" role="radio" aria-checked={!scope} className={!scope ? 'on' : ''} onClick={() => setScope('')}>Whole guide</button>
          </div>
        </div>
        {focusOn && focusOn.refs.length ? <div className="cd-focus">
          <span className="cd-focus-t"><Crosshair size={12} strokeWidth={2} aria-hidden />{focusOn.label}</span>
          <div className="cd-focus-acts">{[['Tighten the wording', 'Tighten the wording of this, keeping the meaning. Show the before and after.'], ['Suggest a headline', 'Suggest three headlines for this that claim or count, in house style.'], ['Proofread this', 'Proofread this: spelling, grammar, punctuation and house style. List the fixes.']].map(([l, q]) => <button key={l} type="button" className="cd-chip" disabled={talking} onClick={() => send(q, focusOn.refs)}>{l}</button>)}</div>
        </div> : null}
        <div className="cd-acts3">{ACTIONS.map(({ id, title, help, Icon }) => <button key={id} type="button" className="cd-act3" onClick={() => (id === 'consistency' ? check() : review(id))}>
          <span className="cd-act3-ic"><Icon size={16} strokeWidth={1.75} aria-hidden /></span><span><b>{title}</b><span>{help}</span></span><ArrowRight size={14} strokeWidth={1.75} aria-hidden className="cd-act3-go" />
        </button>)}</div>
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
        {history.length ? <button type="button" className="cd-resume" onClick={() => { const x = history[0]; setS(x); setView('session'); setTab(x.depth === 'detail' ? 'detail' : 'big'); setNi(0); }}><History size={12} strokeWidth={1.75} aria-hidden />Carry on: {history[0].title || 'last session'}</button> : null}
      </>}
    </div> : null}

    {view === 'session' && s ? <div className="cd-body" ref={log}>
      {s.kind === 'consistency' ? <div className="cd-list">
        <div className="cd-cons-top">
          <p>{openGroups.length ? <>{openGroups.length} word{openGroups.length === 1 ? '' : 's'} written more than one way. Pick the one to use and it changes everywhere.</> : groups.length ? 'All sorted. Every word is written one way.' : 'Everything’s consistent. No word is written two ways.'}</p>
          <button type="button" className="cd-ic" onClick={() => check(s.chapter ?? null, s)} aria-label="Check again" data-tip="Check again"><RotateCw {...I} /></button>
        </div>
        {openGroups.map((gr) => { const to = pickFor[gr.key] || gr.recommend; const n = gr.forms.filter((f) => f.form !== to).reduce((a, f) => a + f.count, 0); return <article key={gr.key} className="cd-cons">
          <p className="cd-cons-k">{gr.type === 'joined' ? 'Joined, hyphenated or spaced' : gr.type === 'spelling' ? 'UK or US spelling' : 'Capital letter'}</p>
          <div className="cd-forms" role="radiogroup" aria-label="Which to use">{gr.forms.map((f) => <span key={f.form} className={'cd-form' + (to === f.form ? ' on' : '')}>
            <button type="button" role="radio" aria-checked={to === f.form} onClick={() => setPickFor((p) => ({ ...p, [gr.key]: f.form }))}>{to === f.form ? <Check size={12} strokeWidth={2.25} aria-hidden /> : null}{f.form}<i>{f.count}</i></button>
            <button type="button" className="cd-form-go" onClick={() => go(f.refs[0])} aria-label={`Show where “${f.form}” is used`} data-tip="Show where"><Crosshair size={11} strokeWidth={2} aria-hidden /></button>
          </span>)}</div>
          <p className="cd-why">{to === gr.recommend ? <>Suggested: {gr.why}</> : <>You picked “{to}”. Suggested was “{gr.recommend}”: {gr.why.toLowerCase()}</>}</p>
          <div className="cd-acts"><button type="button" className="cd-a solid" onClick={() => pickForm(gr, to)}><Check {...I} />Use “{to}” · {n} change{n === 1 ? '' : 's'}</button><button type="button" className="cd-a" onClick={() => skip(gr)}>Leave as is</button><button type="button" className="cd-a" onClick={() => ask(`In this guide, should it be ${gr.forms.map((f) => `“${f.form}”`).join(' or ')}? Which is right for the brand, and why?`)}><MessageSquare {...I} />Ask</button></div>
        </article>; })}
        {groups.some((g) => g.state) ? <details className="cd-donegrp"><summary>{groups.filter((g) => g.state).length} sorted</summary>{groups.filter((g) => g.state).map((g) => <p key={g.key}>{g.state === 'fixed' ? <><Check size={12} strokeWidth={2} aria-hidden /> “{g.chosen}” everywhere</> : <><X size={12} strokeWidth={2} aria-hidden /> {g.forms.map((f) => f.form).join(' / ')} left as is</>}</p>)}</details> : null}
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
      </div> : null}

      {s.kind !== 'consistency' && s.kind !== 'chat' && s.result.summary ? <>
        <div className="cd-sum"><Said text={more ? s.result.summary : firstSentences(s.result.summary)} onGo={go} label={labelOf} />
          {more && s.result.strengths.length ? <ul className="cd-good">{s.result.strengths.map((x, i) => <li key={i}><Check size={12} strokeWidth={2} aria-hidden />{x}</li>)}</ul> : null}
          {s.result.summary !== firstSentences(s.result.summary) || s.result.strengths.length ? <button type="button" className="cd-link" onClick={() => setMore(!more)}>{more ? 'Less' : 'What’s working, and more'}</button> : null}
        </div>
        {big.length && detail.length ? <div className="cd-seg cd-seg-w" role="tablist">
          <button role="tab" aria-selected={tab === 'big'} className={tab === 'big' ? 'on' : ''} onClick={() => setTab('big')}>Direction <i>{openBig.length}</i></button>
          <button role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'on' : ''} onClick={() => setTab('detail')}>Fixes <i>{openDetail.length}</i></button>
        </div> : null}

        {(tab === 'big' || !detail.length) && big.length ? (note ? <article className="cd-note cd-one">
          <div className="cd-one-top"><span>{Math.min(ni, openBig.length - 1) + 1} of {openBig.length}</span><span className="cd-dots" aria-hidden>{openBig.map((x, i) => <i key={x.id} className={i === Math.min(ni, openBig.length - 1) ? 'on' : ''} />)}</span></div>
          <h4>{note.title}</h4>
          <Said text={note.steer} onGo={go} label={labelOf} />
          {note.question ? <p className="cd-q"><CornerDownRight {...I} />{note.question}</p> : null}
          {note.why ? <details className="cd-whyd"><summary>Why it matters</summary><p className="cd-why">{note.why}</p></details> : null}
          {(note.refs || []).filter((r) => !note.steer.includes(r)).length ? <div className="cd-acts">{(note.refs || []).filter((r) => !note.steer.includes(r)).slice(0, 3).map((r) => <button key={r} type="button" className="cd-go" onClick={() => go(r)}><Crosshair size={11} strokeWidth={2} aria-hidden />{labelOf(r)}</button>)}</div> : null}
          <div className="cd-acts cd-one-acts">
            <button type="button" className="cd-a" onClick={() => discuss(note)}><MessageSquare {...I} />Discuss</button>
            <span style={{ flex: 1 }} />
            {openBig.length > 1 ? <button type="button" className="cd-a" onClick={() => setNi((ni + 1) % openBig.length)}>Later</button> : null}
            <button type="button" className="cd-a solid" onClick={() => close(note.id, 'done')}><Check {...I} />Done</button>
          </div>
        </article> : <p className="cd-empty cd-alldone"><Check size={14} strokeWidth={2} aria-hidden />All the direction notes are dealt with.</p>) : null}

        {(tab === 'detail' || !big.length) && detail.length ? <div className="cd-list">
          {!openDetail.length ? <p className="cd-empty cd-alldone"><Check size={14} strokeWidth={2} aria-hidden />All fixes dealt with.</p> : <>
            {openDetail.length > 1 ? <div className="cd-fixbar"><span>{openDetail.length} fixes</span><button type="button" className="cd-a solid" onClick={() => { let ok = 0; const closed = { ...(s.closed || {}) }; for (const n of openDetail) { const ref = refOf(n.ref); if (ref && apply(ref, n.quote, n.suggestion)) { closed[n.id] = 'applied'; ok++; } } save({ ...s, closed }); setErr(ok < openDetail.length ? `${openDetail.length - ok} couldn’t be applied because the text has changed.` : ''); }}><Check {...I} />Apply all</button></div> : null}
            {byChapter(openDetail).map(([C, ns]) => <Fragment key={C}>
              {!s.chapter ? <p className="cd-ch">{chapterTitle(C)}</p> : null}
              {ns.map((n) => <article key={n.id} className="cd-fix cd-fix-s">
                <button type="button" className="cd-fix-d" onClick={() => go(n.ref)} title={`${n.kind}${n.note ? ': ' + n.note : ''} · ${labelOf(n.ref)}`}><del>{n.quote}</del><ins>{n.suggestion}</ins></button>
                <div className="cd-fix-b">
                  <button type="button" className="cd-ic" onClick={() => { const ref = refOf(n.ref); if (ref && apply(ref, n.quote, n.suggestion)) close(n.id, 'applied'); else setErr('That text has changed since the review, so the fix can’t be applied. Jump to it and edit by hand.'); }} aria-label="Apply" data-tip="Apply"><Check {...I} /></button>
                  <button type="button" className="cd-ic" onClick={() => close(n.id, 'dismissed')} aria-label="Dismiss" data-tip="Dismiss"><X {...I} /></button>
                </div>
              </article>)}
            </Fragment>)}
          </>}
          {detail.length - openDetail.length ? <button type="button" className="cd-link" onClick={() => { const c = { ...(s.closed || {}) }; for (const n of detail) if (c[n.id] === 'dismissed') delete c[n.id]; save({ ...s, closed: c }); }}>Bring back dismissed fixes</button> : null}
          {err ? <p className="cd-err" role="alert">{err}</p> : null}
        </div> : null}

        {!big.length && !detail.length ? <p className="cd-empty cd-alldone"><Check size={14} strokeWidth={2} aria-hidden />Nothing to change.</p> : null}
        {s.result.questions.length ? <details className="cd-qs"><summary>{s.result.questions.length} question{s.result.questions.length === 1 ? '' : 's'} for you</summary>{s.result.questions.map((q, i) => <button key={i} type="button" className="cd-qbtn" onClick={() => { setText(`On “${q}”: `); setTimeout(() => document.getElementById('cd-in')?.focus(), 0); }}><CornerDownRight {...I} />{q}</button>)}</details> : null}
      </> : null}

      {(s.messages || []).length ? <div className="cd-thread">{(s.messages || []).map((m, i) => m.role === 'user' ? <div key={i} className="cd-u">{m.content}</div>
        : <div key={i} className="cd-a-msg"><span className="cd-mark sm"><LpMark state={talking && i === (s.messages || []).length - 1 ? (m.content ? 'contour' : 'scan') : 'rest'} /></span>{m.content ? <Said text={m.content} onGo={go} label={labelOf} /> : <p className="ak-step">Thinking<span className="ak-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p>}</div>)}</div> : null}
    </div> : null}

    {view !== 'history' && !busy ? <form className="cd-bar" onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <textarea id="cd-in" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={focusOn?.refs.length && view === 'home' ? `Ask about ${focusOn.label.toLowerCase()}…` : view === 'home' ? `Or ask anything about ${scope ? 'this chapter' : 'the guide'}…` : 'Ask, push back, or tell me what you changed…'} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} aria-label="Message Review" />
      <button className="cd-send" disabled={!text.trim() || talking} aria-label="Send">{talking ? <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden /> : <ArrowUp size={15} strokeWidth={2} aria-hidden />}</button>
    </form> : null}
  </div>;
}
