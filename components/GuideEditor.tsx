'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Guide } from '@/lib/portal/guide';

// Studio editing of the client guidelines: rebuild from Figma, rename chapters, write an intro, hide chapters or pages.
export function GuideEditor({ projectId, slug, guide: initial, content, thumbs }: { projectId: string; slug: string; guide: Guide | null; content: Record<string, unknown>; thumbs: Record<string, string> }) {
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function rebuild() {
    setBusy(true); setMsg('Reading Figma and exporting every page. This takes a minute or two…');
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? `Built ${j.chapters} chapters from ${j.frames} Figma frames${j.colours ? `, ${j.colours} colours found` : ''}.` : 'The build failed: ' + (j.error || r.status));
    router.refresh();
  }
  async function save(next: Guide) {
    setGuide(next);
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { ...content, guide: next } }) });
    setMsg(r.ok ? 'Saved. Publish to show the changes to the client.' : 'Couldn’t save.');
  }
  const editCh = (id: string, patch: Partial<Guide['chapters'][number]>, persist = false) => {
    if (!guide) return;
    const next = { ...guide, chapters: guide.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
    if (persist) save(next); else setGuide(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
      <div className="row">
        <button className="btn solid" disabled={busy} onClick={rebuild}>{guide ? 'Rebuild from Figma' : 'Build guidelines from Figma'}</button>
        <a className="btn" href={`/p/${slug}/guidelines`}>Preview as client</a>
        <span className="mute" role="status">{msg}</span>
      </div>
      <p className="mute" style={{ margin: 0 }}>Each row of frames on the Figma page becomes a chapter, shown exactly as designed, with the review’s rules underneath. Rebuilding picks up Figma changes and keeps your titles, intros and hidden pages.</p>
      {guide?.chapters.map((c, i) => (
        <section key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: c.hidden ? 0.55 : 1 }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="mute" style={{ width: 22 }}>{String(i + 1).padStart(2, '0')}</span>
            <input className="in" aria-label="Chapter title" value={c.title} onChange={(e) => editCh(c.id, { title: e.target.value })} onBlur={() => save(guide)} style={{ fontSize: 15 }} />
            <button className="btn" onClick={() => editCh(c.id, { hidden: !c.hidden }, true)}>{c.hidden ? 'Show chapter' : 'Hide chapter'}</button>
          </div>
          <textarea className="ta" aria-label={`Introduction for ${c.title}`} placeholder="Introduction shown under the title (optional)" value={c.lede} onChange={(e) => editCh(c.id, { lede: e.target.value })} onBlur={() => save(guide)} style={{ minHeight: 44 }} />
          {c.frames.length ? <div className="ge-frames">{c.frames.map((f) => (
            <button key={f.nodeId} className={'ge-frame' + (f.hidden ? ' off' : '')} onClick={() => editCh(c.id, { frames: c.frames.map((x) => (x.nodeId === f.nodeId ? { ...x, hidden: !x.hidden } : x)) }, true)} aria-pressed={!f.hidden} aria-label={`${f.hidden ? 'Show' : 'Hide'} page ${f.nodeId}`}>
              {thumbs[f.path] ? <img src={thumbs[f.path]} alt="" loading="lazy" /> : null}<span>{f.hidden ? 'Hidden' : 'Shown'}</span>
            </button>))}</div> : <p className="mute" style={{ margin: 0 }}>Rules only (no Figma page for this topic).</p>}
          <p className="mute" style={{ margin: 0 }}>{c.rules.length} rule{c.rules.length === 1 ? '' : 's'} from the review</p>
        </section>
      ))}
      {guide ? <p className="mute">Built {new Date(guide.generatedAt).toLocaleString('en-GB')} from “{guide.page}” in {guide.file}.</p> : null}
    </div>
  );
}
