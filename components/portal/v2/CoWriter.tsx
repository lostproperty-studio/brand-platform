'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, RefreshCw, Sparkles, Undo2, X } from 'lucide-react';
import { saveExample } from '@/components/portal/v2/WriterKnows';

// The Writer as a co-writer, on the page. As you write, the next line appears faintly ahead of you (Tab keeps it,
// carry on typing to ignore it). Select words, or tap ✦ beside the line you're on, for three other ways to say that
// line, with steers like Shorter or Warmer. An empty piece gets three ways to start. It never writes the piece for you.

type Line = { text: string; why: string };
const STEERS: [string, string][] = [['Shorter', 'shorter'], ['Warmer', 'warmer'], ['Plainer', 'plainer and more direct'], ['Bolder', 'bolder'], ['More specific', 'more specific and concrete']];
const ON_KEY = 'lp-cowriter';

export function useCoWriterOn(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => { try { setOn(localStorage.getItem(ON_KEY) !== 'off'); } catch { /* storage off */ } const f = () => { try { setOn(localStorage.getItem(ON_KEY) !== 'off'); } catch { /* */ } }; addEventListener('lp-cowriter', f); return () => removeEventListener('lp-cowriter', f); }, []);
  return [on, (v) => { try { localStorage.setItem(ON_KEY, v ? 'on' : 'off'); } catch { /* */ } setOn(v); dispatchEvent(new Event('lp-cowriter')); }];
}

/** The sentence around a point in the text (to the nearest . ! ? or line break) */
function sentenceAt(t: string, at: number): [number, number] {
  let s = at; while (s > 0 && !/[.!?\n]/.test(t[s - 1])) s--; while (s < t.length && /\s/.test(t[s])) s++;
  let e = at; while (e < t.length && !/[.!?\n]/.test(t[e])) e++; if (e < t.length && /[.!?]/.test(t[e])) e++;
  return [s, Math.max(s, e)];
}

export function CoText({ value, onChange, slug, brief, tone, template, placeholder, onSelectText, onPause, say, tips }: {
  value: string; onChange: (v: string) => void; slug: string; brief: string; tone: number; template?: string; placeholder: string; onSelectText?: (t: string) => void;
  /** Called when you leave the text (the Writer reads it for facts then) */ onPause?: (text: string) => void; say?: (t: string) => void;
  /** Tips that take turns in the empty field, faintly */ tips?: string[];
}) {
  const [on] = useCoWriterOn();
  const ta = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLElement>(null);
  const caretEl = useRef<HTMLElement>(null);
  const [ghost, setGhost] = useState('');
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [focus, setFocus] = useState(false);
  const [pop, setPop] = useState<{ s: number; e: number; lines: Line[] | null; busy: boolean; steer?: string; err?: string } | null>(null);
  const [starts, setStarts] = useState<{ lines: Line[] | null; busy: boolean; err?: string } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  const [cpos, setCpos] = useState<{ y: number } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // An empty field: its prompt, then tips taking turns
  const [tip, setTip] = useState(-1);
  useEffect(() => { if (value || !tips?.length) { setTip(-1); return; } const t = setInterval(() => setTip((n) => (n + 1 >= tips.length ? -1 : n + 1)), 4200); return () => clearInterval(t); }, [value, tips]);

  const call = useCallback(async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ mode: 'coach', brief: brief.trim() || 'A piece of copy', tone, template, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The Writer didn’t answer. Try again.');
    return j;
  }, [slug, brief, tone, template]);

  // The next line, a moment after you stop typing at the end of the piece
  useEffect(() => {
    setGhost(''); abort.current?.abort();
    if (!on || !focus || caret !== value.length || value.trim().length < 12 || sel) return;
    const t = setTimeout(async () => {
      const c = new AbortController(); abort.current = c;
      try { const j = await call({ action: 'next', text: value }, c.signal); if (!c.signal.aborted && j.next) setGhost(/^\s/.test(j.next) || /\s$/.test(value) || !value ? j.next : ' ' + j.next); } catch { /* quiet: it's only a suggestion */ }
    }, 1300);
    return () => clearTimeout(t);
  }, [value, caret, focus, on, sel, call]);

  const track = () => { const el = ta.current; if (!el) return; setCaret(el.selectionStart); setSel(el.selectionEnd - el.selectionStart > 1 ? [el.selectionStart, el.selectionEnd] : null); if (onSelectText) onSelectText(el.value.slice(el.selectionStart, el.selectionEnd).trim().slice(0, 300)); };
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
  useLayoutEffect(grow, [value]);
  // Where to show the bubble: over the selected words, or beside the line the caret is on
  useLayoutEffect(() => {
    const b = box.current?.getBoundingClientRect();
    if (b && mark.current && (sel || pop)) { const r = mark.current.getClientRects()[0] || mark.current.getBoundingClientRect(); setPos({ x: Math.max(0, Math.min(r.left - b.left, b.width - (pop ? 460 : 360))), y: r.top - b.top, h: r.height }); } else setPos(null);
    if (b && caretEl.current) { const r = caretEl.current.getBoundingClientRect(); setCpos({ y: r.top - b.top }); } else setCpos(null);
  }, [sel, pop, value, caret, ghost]);

  const rework = async (s: number, e: number, steer?: string) => {
    setPop({ s, e, lines: null, busy: true, steer }); setGhost('');
    try { const j = await call({ action: 'alts', text: value, line: value.slice(s, e), steer }); setPop({ s, e, lines: j.lines || [], busy: false, steer }); }
    catch (x) { setPop({ s, e, lines: null, busy: false, steer, err: (x as Error).message }); }
  };
  const swap = (l: Line) => {
    if (!pop) return; setUndo(value);
    const v = value.slice(0, pop.s) + l.text + value.slice(pop.e);
    onChange(v); setPop(null); setSel(null);
    requestAnimationFrame(() => { const el = ta.current; if (el) { const n = pop.s + l.text.length; el.focus(); el.setSelectionRange(n, n); } });
  };
  const openers = async () => {
    setStarts({ lines: null, busy: true });
    try { const j = await call({ action: 'open', text: '' }); setStarts({ lines: j.lines || [], busy: false }); } catch (x) { setStarts({ lines: null, busy: false, err: (x as Error).message }); }
  };
  // Asked for straight away from the helper bar, rather than waiting for a pause
  const [asking, setAsking] = useState(false);
  const nextNow = async () => {
    setAsking(true); abort.current?.abort(); const c = new AbortController(); abort.current = c;
    try { const j = await call({ action: value.trim() ? 'next' : 'open', text: value }, c.signal); if (j.next) setGhost(/^\s/.test(j.next) || /\s$/.test(value) || !value ? j.next : ' ' + j.next); else if (j.lines) setStarts({ lines: j.lines, busy: false }); } catch { /* */ }
    setAsking(false); ta.current?.focus();
  };
  const accept = () => { if (!ghost) return; const v = value + ghost; onChange(v); setGhost(''); requestAnimationFrame(() => { const el = ta.current; if (el) { el.setSelectionRange(v.length, v.length); } }); };
  const caretLine = caret !== null && !sel && !pop && focus && value.trim() ? sentenceAt(value, Math.max(0, Math.min(caret, value.length - 1))) : null;

  // The mirror behind the text: the same words, so the ghost line and the bubble line up with them
  const ms = pop ? pop.s : sel?.[0] ?? -1, me = pop ? pop.e : sel?.[1] ?? -1;
  const mirror = ms >= 0
    ? <>{value.slice(0, ms)}<mark ref={mark}>{value.slice(ms, me)}</mark>{value.slice(me)}</>
    : caretLine ? <>{value.slice(0, caretLine[0])}<span ref={caretEl}>{value.slice(caretLine[0], caretLine[1]) || '​'}</span>{value.slice(caretLine[1])}{ghost ? <span className="co-ghost">{ghost}</span> : null}</>
      : <>{value}{ghost ? <span className="co-ghost">{ghost}</span> : null}</>;

  return <div className="co" ref={box}>
    <div className="co-mirror w2-text" aria-hidden>{mirror}{'​'}</div>
    <textarea ref={ta} className={'co-ta w2-text' + (tip >= 0 ? ' tip' : '')} value={value} placeholder={tip >= 0 && tips ? `Tip: ${tips[tip]}` : placeholder} rows={1} spellCheck
      onChange={(e) => { onChange(e.target.value); setUndo(null); setPop(null); }} onSelect={track} onKeyUp={track} onMouseUp={track}
      onFocus={() => { setFocus(true); track(); }} onBlur={() => { setTimeout(() => setFocus(false), 150); onPause?.(value); }}
      onKeyDown={(e) => {
        if (e.key === 'Tab' && ghost) { e.preventDefault(); accept(); }
        else if (e.key === 'Escape') { setGhost(''); setPop(null); }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); const el = e.currentTarget; const [s, en] = el.selectionEnd - el.selectionStart > 1 ? [el.selectionStart, el.selectionEnd] : sentenceAt(value, el.selectionStart); if (value.slice(s, en).trim()) rework(s, en); }
      }} />
    {on && (focus || asking) && !pop ? <div className="co-bar" onMouseDown={(e) => e.preventDefault()}>
      {ghost ? <><span className="co-bar-t"><Sparkles size={12} aria-hidden />A next line from the Writer</span><button type="button" className="on" onClick={accept}><kbd>Tab</kbd>Keep it</button><button type="button" onClick={() => setGhost('')}><kbd>Esc</kbd>No thanks</button></>
        : <><button type="button" onClick={nextNow} disabled={asking}><Sparkles size={12} aria-hidden />{asking ? 'Thinking…' : value.trim() ? 'Suggest a next line' : 'Suggest a first line'}</button>
          {caretLine ? <button type="button" onClick={() => rework(caretLine[0], caretLine[1])}>Other ways to say this line<kbd>⌘J</kbd></button> : null}
          <span className="co-bar-t">or select words to rework them</span></>}
    </div> : null}
    {/* ✦ beside the line you're on */}
    {on && caretLine && cpos && !ghost ? <button type="button" className="co-spark" style={{ top: cpos.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => rework(caretLine[0], caretLine[1])} aria-label="Other ways to say this line" title="Other ways to say this line (⌘J)"><Sparkles size={14} strokeWidth={1.8} aria-hidden /></button> : null}
    {/* Selected words: rework them */}
    {sel && !pop && pos ? <div className="co-bub" style={{ left: pos.x, top: pos.y - 44 }} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" className="co-main" onClick={() => rework(sel[0], sel[1])}><Sparkles size={13} strokeWidth={1.9} aria-hidden />Other ways</button>
      {STEERS.slice(0, 3).map(([l, s]) => <button type="button" key={l} onClick={() => rework(sel[0], sel[1], s)}>{l}</button>)}
      <span className="co-sep" />
      <button type="button" onClick={async () => { const ok = await saveExample(slug, value.slice(sel[0], sel[1]).trim(), template); say?.(ok ? 'Saved as an example. The Writer learns from it.' : 'That didn’t save. Try again.'); }} aria-label="Save as an example the Writer learns from" title="Save as an example the Writer learns from"><Heart size={13} aria-hidden /></button>
    </div> : null}
    {pop && pos ? <div className="co-pop" style={{ left: pos.x, top: pos.y + pos.h + 8 }} onMouseDown={(e) => e.preventDefault()} role="dialog" aria-label="Other ways to say it">
      <div className="co-pop-h"><Sparkles size={13} strokeWidth={1.9} aria-hidden /><span>{pop.steer ? `${pop.steer[0].toUpperCase()}${pop.steer.slice(1)}` : 'Other ways to say it'}</span><button type="button" className="co-x" onClick={() => setPop(null)} aria-label="Close"><X size={13} aria-hidden /></button></div>
      {pop.busy ? <div className="co-wait">{[0, 1, 2].map((k) => <i key={k} style={{ animationDelay: `${k * 120}ms` }} />)}</div> : null}
      {pop.err ? <p className="co-err">{pop.err}</p> : null}
      {pop.lines?.map((l, k) => <button type="button" key={k} className="co-alt" onClick={() => swap(l)} style={{ animationDelay: `${k * 70}ms` }}><span className="co-alt-t">{l.text}</span><span className="co-alt-w">{l.why}</span><ArrowRight size={14} className="co-go" aria-hidden /></button>)}
      {!pop.busy ? <div className="co-steers">{STEERS.map(([l, s]) => <button type="button" key={l} className={pop.steer === s ? 'on' : ''} onClick={() => rework(pop.s, pop.e, s)}>{l}</button>)}<button type="button" onClick={() => rework(pop.s, pop.e, pop.steer)} aria-label="Try again" title="Try again"><RefreshCw size={12} aria-hidden /></button></div> : null}
    </div> : null}
    {undo !== null ? <button type="button" className="co-undo" onClick={() => { onChange(undo); setUndo(null); }}><Undo2 size={12} aria-hidden />Undo the swap</button> : null}
    {/* An empty piece: ways to start */}
    {!value.trim() && on ? <div className="co-start">
      {!starts ? <button type="button" className="co-startb" onClick={openers}><Sparkles size={14} strokeWidth={1.8} aria-hidden />Start me off</button> : null}
      {starts?.busy ? <div className="co-wait">{[0, 1, 2].map((k) => <i key={k} style={{ animationDelay: `${k * 120}ms` }} />)}</div> : null}
      {starts?.err ? <p className="co-err">{starts.err}</p> : null}
      {starts?.lines?.map((l, k) => <button type="button" key={k} className="co-alt" style={{ animationDelay: `${k * 70}ms` }} onClick={() => { onChange(l.text); setStarts(null); requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(l.text.length, l.text.length); } }); }}><span className="co-alt-t">{l.text}</span><span className="co-alt-w">{l.why}</span><ArrowRight size={14} className="co-go" aria-hidden /></button>)}
      {starts && !starts.busy ? <button type="button" className="co-link" onClick={openers}><RefreshCw size={12} aria-hidden />Three more</button> : null}
    </div> : null}
  </div>;
}
