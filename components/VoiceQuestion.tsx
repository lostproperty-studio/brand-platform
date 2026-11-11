'use client';
import { useState } from 'react';
import { ArrowRight, Check, PenLine } from 'lucide-react';
import type { CoachQuestion } from '@/lib/voice';

// One question from the reading of the notes, in the format that suits it. Each answer becomes a line in the
// voice (which the Writer, Ask, the Claude skill and the connector all read).
const lean = (v: number, l: string, r: string) => v <= 15 ? `firmly ${l.toLowerCase()}` : v <= 35 ? `mostly ${l.toLowerCase()}, a little ${r.toLowerCase()}` : v < 65 ? `balanced between ${l.toLowerCase()} and ${r.toLowerCase()}` : v < 85 ? `mostly ${r.toLowerCase()}, a little ${l.toLowerCase()}` : `firmly ${r.toLowerCase()}`;

export function VoiceQuestion({ q, onAnswer, onSkip }: { q: CoachQuestion; onAnswer: (text: string) => void; onSkip: () => void }) {
  const [own, setOwn] = useState(false);
  const [ownText, setOwnText] = useState('');
  const [v, setV] = useState(50);
  const [keep, setKeep] = useState<boolean[]>(() => (q.swaps || []).map(() => true));
  const [ban, setBan] = useState<string[]>([]);
  const type = q.type || 'choice';
  const hint = { choice: 'Which sounds most like the brand?', slider: 'Where does the voice sit?', pick: 'Which word is ours?', swap: 'Keep the swaps that are right.', never: 'Tick the ones to never use.' }[type];
  return <div className="vs-ques">
    <p className="vs-ques-q">{q.question}</p>
    {q.why ? <p className="vs-help mute">{q.why}</p> : null}
    <p className="vs-help mute">{hint}</p>

    {type === 'choice' ? <div className="vs-opts">{(q.options || []).map((o, k) => <button key={k} type="button" className="vs-opt" onClick={() => onAnswer(o)}><span>{o}</span><span className="vs-opt-a"><Check size={13} strokeWidth={2} aria-hidden />Feels right</span></button>)}</div> : null}

    {type === 'slider' ? <div className="vq-sl">
      <div className="vq-sl-l"><span className={v < 50 ? 'on' : ''}>{q.left}</span><span className={v > 50 ? 'on' : ''}>{q.right}</span></div>
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label={`${q.left} to ${q.right}`} />
      <p className="vq-sl-v">{lean(v, q.left || '', q.right || '').replace(/^./, (c) => c.toUpperCase())}</p>
      <div className="vs-card-a"><button type="button" className="btn solid" onClick={() => onAnswer(`${q.left} or ${q.right}: ${lean(v, q.left || '', q.right || '')}.`)}><Check size={14} strokeWidth={2} aria-hidden />Set</button></div>
    </div> : null}

    {type === 'pick' ? <div className="vq-pick">
      {[q.a!, q.b!].map((w, k) => <button key={k} type="button" className="vq-word" onClick={() => onAnswer(`“${w}”, not “${k ? q.a : q.b}”`)}>{w}</button>)}
    </div> : null}

    {type === 'swap' ? <div className="vq-swaps">
      {(q.swaps || []).map((s, k) => <label key={k} className={'vq-swap' + (keep[k] ? ' on' : '')}>
        <input type="checkbox" checked={keep[k]} onChange={() => setKeep((x) => x.map((y, j) => (j === k ? !y : y)))} />
        <span className="vq-from">{s.from}</span><ArrowRight size={13} strokeWidth={1.75} aria-hidden /><span className="vq-to">{s.to}</span>
      </label>)}
      <div className="vs-card-a"><button type="button" className="btn solid" disabled={!keep.some(Boolean)} onClick={() => onAnswer((q.swaps || []).filter((_, k) => keep[k]).map((s) => `“${s.to}” instead of “${s.from}”`).join('\n'))}><Check size={14} strokeWidth={2} aria-hidden />Keep {keep.filter(Boolean).length}</button></div>
    </div> : null}

    {type === 'never' ? <div className="vq-never">
      <div className="vq-chips">{(q.words || []).map((w) => { const on = ban.includes(w); return <button key={w} type="button" aria-pressed={on} className={'vq-chip' + (on ? ' on' : '')} onClick={() => setBan((x) => (on ? x.filter((y) => y !== w) : [...x, w]))}>{w}</button>; })}</div>
      <div className="vs-card-a"><button type="button" className="btn solid" disabled={!ban.length} onClick={() => onAnswer(ban.join(', '))}><Check size={14} strokeWidth={2} aria-hidden />Never use {ban.length || ''}</button></div>
    </div> : null}

    {own ? <div className="vs-own"><textarea className="in vs-in" autoFocus rows={3} placeholder="Say it your way" value={ownText} onChange={(e) => setOwnText(e.target.value)} />
      <div className="vs-card-a"><button type="button" className="btn solid" disabled={!ownText.trim()} onClick={() => onAnswer(ownText.trim())}>Save</button><button type="button" className="btn" onClick={() => setOwn(false)}>Cancel</button></div></div>
      : <div className="vs-card-a"><button type="button" className="btn" onClick={() => setOwn(true)}><PenLine size={13} strokeWidth={1.75} aria-hidden />{type === 'choice' ? 'None of these: write my own' : 'Answer in my own words'}</button><button type="button" className="btn" onClick={onSkip}>Skip</button></div>}
  </div>;
}
