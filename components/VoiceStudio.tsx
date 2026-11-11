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

export function VoiceStudio({ projectId, slug, initial, hasGuide, hasChapter }: { projectId: string; slug: string; initial: VoiceProfile; hasGuide: boolean; hasChapter: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<VoiceProfile>(initial);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(voiceMissing(initial).find((f) => f.core)?.id || null);
  const [sugg, setSugg] = useState<Record<string, string>>({});
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
    setBusy('sort'); setMsg('Reading your notes…');
    if (timer.current) { clearTimeout(timer.current); await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { voice: latest.current } }) }); }
    const r = await fetch(`/api/projects/${projectId}/voice/sort`, { method: 'POST' }); const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(j.error || 'Couldn’t read the notes.'); return; }
    const n = Object.keys(j.suggestions || {}).length;
    setSugg(j.suggestions || {}); setMsg(n ? `${n} answers found in your notes. Keep or dismiss each one.` : 'Nothing new in the notes for the empty questions.');
    if (n) setOpen(Object.keys(j.suggestions)[0]);
  }
  async function chapter() {
    setBusy('chapter');
    if (timer.current) { clearTimeout(timer.current); await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { voice: latest.current } }) }); }
    const r = await fetch(`/api/projects/${projectId}/voice/chapter`, { method: 'POST' }); const j = await r.json().catch(() => ({}));
    setBusy(null); setMsg(r.ok ? (j.added ? `Added “${voiceTitle(latest.current)}” to the guidelines. Edit it like any chapter.` : `Updated “${voiceTitle(latest.current)}” in the guidelines.`) : j.error || 'Couldn’t add the chapter.');
    if (r.ok) router.refresh();
  }

  const answered = VOICE_FIELDS.length - voiceMissing(v).length;
  const ready = voiceReady(v);
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
        <div className="vs-side-h">
          <p><strong>What the AI needs</strong><span className="mute">{answered} of {VOICE_FIELDS.length} answered</span></p>
          <div className="vs-prog" aria-hidden><span style={{ width: `${(answered / VOICE_FIELDS.length) * 100}%` }} /></div>
          <button type="button" className="btn ic" onClick={sort} disabled={!!busy}><Sparkles {...I} />{busy === 'sort' ? 'Reading the notes…' : 'Find answers in my notes'}</button>
          <p className="vs-help mute">Takes answers from your notes only. It never writes the voice for you.</p>
        </div>
        <ol className="vs-qs">{VOICE_FIELDS.map((f) => {
          const val = v.fields?.[f.id] || '', on = open === f.id, s = sugg[f.id];
          return <li key={f.id} className={'vs-q' + (val.trim() ? ' done' : '') + (on ? ' open' : '')}>
            <button type="button" className="vs-q-h" onClick={() => setOpen(on ? null : f.id)} aria-expanded={on}>
              <span className="vs-dot">{val.trim() ? <Check size={11} strokeWidth={2.5} aria-hidden /> : null}</span>
              <span className="vs-q-t">{f.label}{f.core && !val.trim() ? <em>Needed for the Writer</em> : null}{s ? <em className="new">Suggestion</em> : null}</span>
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="vs-chev" />
            </button>
            {on ? <div className="vs-q-b">
              <p className="vs-ask">{f.ask}</p>
              {s ? <div className="vs-card" role="group" aria-label="Suggestion from your notes">
                <p className="vs-card-h"><Sparkles size={13} strokeWidth={1.75} aria-hidden />From your notes</p>
                <p className="vs-card-t">{s}</p>
                <div className="vs-card-a"><button type="button" className="btn solid" onClick={() => { field(f.id, s); setSugg(({ [f.id]: _x, ...rest }) => rest); }}><Check size={14} strokeWidth={2} aria-hidden />Keep</button>
                  <button type="button" className="btn" onClick={() => setSugg(({ [f.id]: _x, ...rest }) => rest)}><X size={14} strokeWidth={2} aria-hidden />Dismiss</button></div>
              </div> : null}
              <textarea className="in vs-in" value={val} onChange={(e) => field(f.id, e.target.value)} placeholder={`e.g. ${f.eg}`} rows={Math.min(10, Math.max(3, val.split('\n').length + 1))} />
            </div> : null}
          </li>;
        })}</ol>
        <div className="vs-actions">
          <button type="button" className="btn ic" onClick={chapter} disabled={!!busy || !hasGuide} title={hasGuide ? undefined : 'Build the guidelines first'}>{busy === 'chapter' ? 'Working…' : hasChapter ? `Update “${voiceTitle(v)}” in the guidelines` : `Add “${voiceTitle(v)}” to the guidelines`}</button>
          <label className={'vs-toggle' + (ready ? '' : ' off')}><input type="checkbox" checked={!!v.writer && ready} disabled={!ready} onChange={(e) => put({ writer: e.target.checked })} />
            <span><PenLine size={14} strokeWidth={1.75} aria-hidden /> The Writer for the client{ready ? '' : ': answer the questions marked “Needed for the Writer” first'}</span></label>
          {v.writer && ready ? <a className="mute vs-link" href={`/p/${slug}/writer`} target="_blank" rel="noopener">Open the Writer in the portal</a> : null}
          <p className="vs-help mute">Clients see changes here once you publish.</p>
        </div>
      </aside>
    </div>
  </div>;
}
