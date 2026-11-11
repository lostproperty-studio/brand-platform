'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bold, Check, ChevronDown, Heading2, Heading3, Italic, Link2, List, ListOrdered, PenLine, Quote, Redo2, Sparkles, Undo2, X } from 'lucide-react';
import { VOICE_FIELDS, voiceMissing, voiceReady, voiceTitle, type VoiceProfile } from '@/lib/voice';

// The studio's voice document, as simple as a Substack draft: the chapter's title, then the notes from the voice
// work (workshop notes, the thinking, examples). Beside it, the questions an AI needs answered to write on brand,
// with progress. The notes can be sorted into the answers (taken from the notes only, never invented); each
// suggestion arrives as a card to keep or dismiss.
const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
type WrState = 'off' | 'on-pending' | 'live' | 'off-pending';
const WR_LABEL: Record<WrState, string> = { off: 'Off for the client', 'on-pending': 'On · publish to go live', live: 'Live for the client', 'off-pending': 'Still live · publish to turn off' };
const WR_TEXT: Record<WrState, string> = {
  off: 'Clients don’t see the Writer. You can try it as the client at any time, even while the voice is in progress.',
  'on-pending': 'Switched on. Clients get it, in their sidebar, the next time you publish.',
  live: 'Clients have the Writer in their sidebar, working from the voice as last published.',
  'off-pending': 'Switched off here, but clients still have it until you publish.'
};

export function VoiceStudio({ projectId, slug, initial, hasGuide, hasChapter, liveWriter, published }: { projectId: string; slug: string; initial: VoiceProfile; hasGuide: boolean; hasChapter: boolean; liveWriter: boolean; published: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<VoiceProfile>(initial);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [ownText, setOwnText] = useState('');
  const coach = v.coach;
  const [busy, setBusy] = useState<'sort' | 'chapter' | null>(null);
  const ed = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(v); latest.current = v;

  useEffect(() => { if (ed.current && initial.notes) ed.current.innerHTML = initial.notes; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function put(patch: Partial<VoiceProfile>) {
    const next = { ...latest.current, ...patch, updatedAt: new Date().toISOString() };
    setV(next); latest.current = next; setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { voice: latest.current } }) }).catch(() => null);
      setMsg(r?.ok ? 'Saved' : 'Couldn’t save. Trying again when you next type.');
    }, 700);
  }
  const field = (id: string, text: string) => put({ fields: { ...(latest.current.fields || {}), [id]: text } });
  const cmd = (c: string, arg?: string) => { ed.current?.focus(); document.execCommand(c, false, arg); put({ notes: ed.current?.innerHTML || '' }); };
  const block = (tag: string) => { const cur = document.queryCommandValue('formatBlock').toLowerCase(); cmd('formatBlock', cur === tag ? 'p' : tag); };

  async function sort() {
    setBusy('sort'); setMsg('');
    if (timer.current) { clearTimeout(timer.current); await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { voice: latest.current } }) }).catch(() => {}); }
    const r = await fetch(`/api/projects/${projectId}/voice/understand`, { method: 'POST' }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(null);
    if (!r?.ok || !j?.coach) { setMsg(j?.error || (r ? `Couldn’t read the notes (error ${r.status}). Try again.` : 'Couldn’t reach the platform. Check your connection.')); return; }
    put({ coach: j.coach });
  }
  // The reading: keep what it codified, or answer its questions; each answer goes into the voice
  const setCoach = (c: NonNullable<VoiceProfile['coach']>) => put({ coach: c });
  function settleCod(id: string, text: string) { if (!coach) return; const fields = { ...(latest.current.fields || {}), [id]: text.trim() }; put({ fields, coach: { ...coach, codified: coach.codified.filter((x) => x.field !== id) } }); }
  function dropCod(id: string) { if (coach) setCoach({ ...coach, codified: coach.codified.filter((x) => x.field !== id) }); }
  function keepAll() { if (!coach) return; const fields = { ...(latest.current.fields || {}) }; for (const c of coach.codified) fields[c.field] = c.text.trim(); put({ fields, coach: { ...coach, codified: [] } }); }
  function answer(id: string, text: string) { if (!coach) return; const prev = latest.current.fields?.[id]?.trim(); const fields = { ...(latest.current.fields || {}), [id]: prev ? `${prev}\n${text}` : text }; put({ fields, coach: { ...coach, questions: coach.questions.filter((x) => x.field !== id) } }); }
  function skip(id: string) { if (coach) setCoach({ ...coach, questions: coach.questions.filter((x) => x.field !== id) }); }
  async function chapter() {
    setBusy('chapter');
    if (timer.current) { clearTimeout(timer.current); await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { voice: latest.current } }) }); }
    const r = await fetch(`/api/projects/${projectId}/voice/chapter`, { method: 'POST' }); const j = await r.json().catch(() => ({}));
    setBusy(null); setMsg(r.ok ? (j.added ? `Added “${voiceTitle(latest.current)}” to the guidelines. Edit it like any chapter.` : `Updated “${voiceTitle(latest.current)}” in the guidelines.`) : j.error || 'Couldn’t add the chapter.');
    if (r.ok) router.refresh();
  }

  const answered = VOICE_FIELDS.length - voiceMissing(v).length;
  const ready = voiceReady(v);
  const missingCore = voiceMissing(v).filter((f) => f.core).map((f) => f.label.toLowerCase());
  // Whether clients have the Writer: what's switched on here, against what they have from the last publish
  const wrOn = !!v.writer && ready;
  const wrState: WrState = wrOn ? (liveWriter ? 'live' : 'on-pending') : liveWriter ? 'off-pending' : 'off';
  return <div className="vs">
    <div className="vs-bar" role="toolbar" aria-label="Formatting" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
      <button type="button" onClick={() => cmd('undo')} aria-label="Undo"><Undo2 {...I} /></button>
      <button type="button" onClick={() => cmd('redo')} aria-label="Redo"><Redo2 {...I} /></button>
      <span className="vs-sep" />
      <button type="button" onClick={() => block('h2')} aria-label="Heading"><Heading2 {...I} /></button>
      <button type="button" onClick={() => block('h3')} aria-label="Subheading"><Heading3 {...I} /></button>
      <button type="button" onClick={() => cmd('bold')} aria-label="Bold"><Bold {...I} /></button>
      <button type="button" onClick={() => cmd('italic')} aria-label="Italic"><Italic {...I} /></button>
      <button type="button" onClick={() => { const u = prompt('Link to'); if (u && /^https?:\/\//.test(u)) cmd('createLink', u); }} aria-label="Link"><Link2 {...I} /></button>
      <span className="vs-sep" />
      <button type="button" onClick={() => block('blockquote')} aria-label="Quote"><Quote {...I} /></button>
      <button type="button" onClick={() => cmd('insertUnorderedList')} aria-label="Bulleted list"><List {...I} /></button>
      <button type="button" onClick={() => cmd('insertOrderedList')} aria-label="Numbered list"><ListOrdered {...I} /></button>
      <span className="vs-status mute" role="status">{msg}</span>
    </div>

    <div className="vs-grid">
      <article className="vs-doc">
        <p className="vs-kicker">The guidelines chapter</p>
        <input className="vs-title" value={v.title ?? ''} placeholder="Tone of voice" onChange={(e) => put({ title: e.target.value })} aria-label="Chapter title" maxLength={60} />
        <p className="vs-sub mute">Call it what this client calls it: tone of voice, verbal identity, how we write. Below, everything from the voice work: workshop notes, the thinking, examples. The Writer, Ask and the Claude skill all read it.</p>
        <div ref={ed} className="vs-ed" contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Voice notes" data-ph="Start writing, or paste in the voice work…"
          onInput={() => put({ notes: ed.current?.innerHTML || '' })}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); cmd('bold'); } if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); cmd('italic'); } }} />
      </article>

      <aside className="vs-side" aria-label="What the AI needs">
        <section className={'vs-wr ' + wrState} aria-label="The Writer for the client">
          <div className="vs-wr-top">
            <span className="vs-wr-ic"><PenLine size={16} strokeWidth={1.75} aria-hidden /></span>
            <div className="vs-wr-t"><strong>Writer</strong><span className="vs-wr-badge">{WR_LABEL[wrState]}</span></div>
            <button type="button" role="switch" aria-checked={wrOn} aria-label="Writer on for the client" className={'vs-switch' + (wrOn ? ' on' : '')} disabled={!ready && !wrOn} onClick={() => put({ writer: !wrOn })}><span /></button>
          </div>
          <p className="vs-wr-p">{WR_TEXT[wrState]}{!ready ? ` To switch it on for the client, the voice still needs: ${missingCore.join(', ')}.` : ''}</p>
          <div className="vs-wr-a">
            <a className="btn ic" href={`/p/${slug}/writer`} target="_blank" rel="noopener"><PenLine size={14} strokeWidth={1.75} aria-hidden />{wrOn && ready ? 'See it as the client' : 'Try it as the client'}</a>
            {wrState === 'on-pending' || wrState === 'off-pending' ? <a className="btn" href={`/studio/projects/${projectId}?tab=overview`}>Publish on the Overview</a> : null}
          </div>
        </section>
        <div className="vs-side-h">
          <p><strong>{ready ? 'Ready for the Writer' : 'What the AI needs'}</strong><span className="mute">{answered} of {VOICE_FIELDS.length} answered</span></p>
          <div className="vs-prog" aria-hidden><span style={{ width: `${(answered / VOICE_FIELDS.length) * 100}%` }} /></div>
        </div>

        {busy === 'sort' ? <div className="vs-card vs-reading" role="status"><p className="vs-card-h"><Sparkles size={13} strokeWidth={1.75} aria-hidden />Reading your notes</p><span className="wr-shim" /><span className="wr-shim s" /><span className="wr-shim" /><p className="vs-help mute">This takes up to a minute.</p></div>
          : !coach ? <div className="vs-start">
            <p>Write or paste the voice work on the left. I’ll read it, tell you how I understand it, and ask only what’s still missing.</p>
            <button type="button" className="btn solid ic" onClick={sort} disabled={!!busy}><Sparkles {...I} />Read my notes</button>
          </div> : <>
            <div className="vs-card vs-sum">
              <p className="vs-card-h"><Sparkles size={13} strokeWidth={1.75} aria-hidden />How I read it</p>
              <p className="vs-card-t">{coach.summary}</p>
              <button type="button" className="ve-linkbtn vs-again" onClick={sort} disabled={!!busy}>Read the notes again</button>
            </div>

            {coach.codified.length ? <section className="vs-group">
              <div className="vs-group-h"><p>From your notes</p><button type="button" className="ve-linkbtn" onClick={() => keepAll()}>Keep all</button></div>
              {coach.codified.map((c) => { const f = VOICE_FIELDS.find((x) => x.id === c.field)!; return <div key={c.field} className="vs-cod">
                <p className="vs-cod-h">{f.label}</p>
                {editing === c.field ? <textarea className="in vs-in" autoFocus defaultValue={c.text} rows={Math.min(10, c.text.split('\n').length + 2)} onBlur={(e) => { settleCod(c.field, e.target.value); setEditing(null); }} />
                  : <p className="vs-cod-t">{c.text}</p>}
                <div className="vs-card-a">
                  <button type="button" className="btn solid" onClick={() => settleCod(c.field, c.text)}><Check size={14} strokeWidth={2} aria-hidden />Keep</button>
                  <button type="button" className="btn" onClick={() => setEditing(c.field)}>Edit</button>
                  <button type="button" className="btn" onClick={() => dropCod(c.field)} aria-label={`Dismiss ${f.label}`}><X size={14} strokeWidth={2} aria-hidden /></button>
                </div>
              </div>; })}
            </section> : null}

            {coach.questions.length ? <section className="vs-group">
              <div className="vs-group-h"><p>{coach.questions.length === 1 ? 'One question' : `${coach.questions.length} questions`}</p></div>
              {coach.questions.map((q) => <div key={q.field} className="vs-ques">
                <p className="vs-ques-q">{q.question}</p>
                {q.why ? <p className="vs-help mute">{q.why}</p> : null}
                <p className="vs-help mute">Which feels right?</p>
                <div className="vs-opts">{q.options.map((o, k) => <button key={k} type="button" className="vs-opt" onClick={() => answer(q.field, o)}><span>{o}</span><span className="vs-opt-a"><Check size={13} strokeWidth={2} aria-hidden />Feels right</span></button>)}</div>
                {own === q.field ? <div className="vs-own"><textarea className="in vs-in" autoFocus rows={3} placeholder="Say it your way" value={ownText} onChange={(e) => setOwnText(e.target.value)} />
                  <div className="vs-card-a"><button type="button" className="btn solid" disabled={!ownText.trim()} onClick={() => { answer(q.field, ownText.trim()); setOwn(null); setOwnText(''); }}>Save</button><button type="button" className="btn" onClick={() => setOwn(null)}>Cancel</button></div></div>
                  : <div className="vs-card-a"><button type="button" className="btn" onClick={() => { setOwn(q.field); setOwnText(''); }}><PenLine size={13} strokeWidth={1.75} aria-hidden />None of these: write my own</button><button type="button" className="btn" onClick={() => skip(q.field)}>Skip</button></div>}
              </div>)}
            </section> : null}

            {!coach.codified.length && !coach.questions.length ? <p className="vs-help mute">Nothing more to ask. Edit any answer below.</p> : null}
          </>}

        <details className="vs-all">
          <summary>All answers <span className="mute">· edit any of them</span></summary>
          <ol className="vs-qs">{VOICE_FIELDS.map((f) => {
            const val = v.fields?.[f.id] || '', on = open === f.id;
            return <li key={f.id} className={'vs-q' + (val.trim() ? ' done' : '') + (on ? ' open' : '')}>
              <button type="button" className="vs-q-h" onClick={() => setOpen(on ? null : f.id)} aria-expanded={on}>
                <span className="vs-dot">{val.trim() ? <Check size={11} strokeWidth={2.5} aria-hidden /> : null}</span>
                <span className="vs-q-t">{f.label}{f.core && !val.trim() ? <em>Needed for the Writer</em> : null}</span>
                <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="vs-chev" />
              </button>
              {on ? <div className="vs-q-b"><p className="vs-ask">{f.ask}</p>
                <textarea className="in vs-in" value={val} onChange={(e) => field(f.id, e.target.value)} placeholder={`e.g. ${f.eg}`} rows={Math.min(10, Math.max(3, val.split('\n').length + 1))} /></div> : null}
            </li>;
          })}</ol>
        </details>

        <div className="vs-actions">
          <button type="button" className="btn ic" onClick={chapter} disabled={!!busy || !hasGuide} title={hasGuide ? undefined : 'Build the guidelines first'}>{busy === 'chapter' ? 'Working…' : hasChapter ? `Update “${voiceTitle(v)}” in the guidelines` : `Add “${voiceTitle(v)}” to the guidelines`}</button>
          <p className="vs-help mute">Clients see changes to the voice once you publish.</p>
        </div>
      </aside>
    </div>
  </div>;
}
