'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Block, BlockKind, BlockMedia, Guide, GuideChapter } from '@/lib/portal/guide';
import { GuideBlock } from '@/components/portal/GuideBlock';
import { TimedProgress } from '@/components/Progress';

const KINDS: [BlockKind, string][] = [['cover', 'Cover'], ['text', 'Text'], ['split', 'Text + image'], ['media', 'Images'], ['swatches', 'Colour swatches']];
const uid = () => Math.random().toString(36).slice(2, 10);

// Studio editing of the client guidelines. Each Figma slide is rebuilt as a block; edit its words, images,
// colours and layout here. Edited and added blocks are kept when you rebuild from Figma.
export function GuideEditor({ projectId, slug, guide: initial, content, thumbs, fontCss }: { projectId: string; slug: string; guide: Guide | null; content: Record<string, unknown>; thumbs: Record<string, string>; fontCss: string }) {
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [urls, setUrls] = useState(thumbs);
  const [chId, setChId] = useState(initial?.chapters[0]?.id || '');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(guide);
  useEffect(() => { setGuide(initial); setUrls(thumbs); }, [initial, thumbs]);

  async function rebuild() {
    setBusy(true); setMsg('');
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? `Rebuilt ${j.chapters} chapters from ${j.frames} Figma slides. Your edits were kept.` : 'The rebuild failed: ' + (j.error || r.status));
    router.refresh();
  }
  // Autosave shortly after the last change
  function commit(next: Guide) {
    setGuide(next); latest.current = next; setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { ...content, guide: latest.current } }) });
      setMsg(r.ok ? 'Saved · publish to show the client' : 'Couldn’t save. Check your connection.');
    }, 700);
  }
  const ch = guide?.chapters.find((c) => c.id === chId);
  const setCh = (patch: Partial<GuideChapter>) => guide && commit({ ...guide, chapters: guide.chapters.map((c) => (c.id === chId ? { ...c, ...patch } : c)) });
  const setBlocks = (blocks: Block[]) => setCh({ blocks });
  const editBlock = (id: string, patch: Partial<Block>) => ch && setBlocks(ch.blocks.map((b) => (b.id === id ? { ...b, ...patch, edited: true } : b)));
  const move = (i: number, d: number) => { if (!ch) return; const l = [...ch.blocks]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setBlocks(l); };
  const addBlock = (kind: BlockKind) => { if (!ch) return; const b: Block = { id: 'b-' + uid(), kind, heading: kind === 'swatches' ? 'Colours' : 'New section', body: '', media: [], swatches: kind === 'swatches' ? [{ name: 'Colour', hex: '#000000' }] : undefined, cols: kind === 'media' ? 2 : undefined, side: kind === 'split' ? 'right' : undefined, edited: true }; setBlocks([...ch.blocks, b]); setOpen(b.id); };
  const addChapter = () => { if (!guide) return; const c: GuideChapter = { id: 'custom-' + uid(), key: null, title: 'New chapter', kicker: '', lede: '', edited: true, blocks: [], rules: [] }; commit({ ...guide, chapters: [...guide.chapters, c] }); setChId(c.id); };
  const moveCh = (d: number) => { if (!guide || !ch) return; const l = [...guide.chapters]; const i = l.indexOf(ch); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; commit({ ...guide, chapters: l }); };

  async function upload(file: File): Promise<BlockMedia | null> {
    const dims = await new Promise<{ w: number; h: number }>((ok) => { const img = new Image(); img.onload = () => ok({ w: img.naturalWidth || 1200, h: img.naturalHeight || 800 }); img.onerror = () => ok({ w: 1200, h: 800 }); img.src = URL.createObjectURL(file); });
    const fd = new FormData(); fd.set('file', file);
    setMsg('Uploading…');
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Upload failed.'); return null; }
    setUrls((u) => ({ ...u, [j.path]: j.url })); setMsg('');
    return { path: j.path, w: dims.w, h: dims.h, kind: file.type === 'image/svg+xml' ? 'graphic' : 'photo' };
  }

  if (!guide) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p className="mute" style={{ margin: 0 }}>Reads the Figma page and rebuilds every slide as responsive web content: headings, text, images, colour swatches. You can edit everything afterwards.</p>
      <div className="row"><button className="btn solid" disabled={busy} onClick={rebuild}>Build guidelines from Figma</button><span className="mute">{msg}</span></div>
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={90} running={busy} />
    </div>
  );

  return (
    <div className="ge">
      <style>{fontCss}</style>
      <div className="ge-bar">
        <button className="btn solid" disabled={busy} onClick={rebuild}>Rebuild from Figma</button>
        <a className="btn" href={`/p/${slug}/guidelines`} target="_blank" rel="noopener">Preview as client ↗</a>
        <span className="mute" role="status">{msg}</span>
      </div>
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={Math.max(45, guide.chapters.reduce((n, c) => n + c.blocks.length, 0) * 2)} running={busy} />
      <div className="ge-grid">
        <nav className="ge-chs" aria-label="Chapters">
          {guide.chapters.map((c, i) => <button key={c.id} className={'ge-ch' + (c.id === chId ? ' on' : '') + (c.hidden ? ' off' : '')} onClick={() => { setChId(c.id); setOpen(null); }}><span className="mute">{String(i + 1).padStart(2, '0')}</span>{c.title}{c.hidden ? <span className="mute"> · hidden</span> : null}</button>)}
          <button className="btn" style={{ marginTop: 8 }} onClick={addChapter}>+ Chapter</button>
        </nav>
        {ch ? <div className="ge-main">
          <div className="card ge-chhead">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="in" aria-label="Chapter title" value={ch.title} onChange={(e) => setCh({ title: e.target.value, edited: true })} style={{ fontSize: 16 }} />
              <button className="btn" onClick={() => moveCh(-1)} aria-label="Move chapter up">↑</button>
              <button className="btn" onClick={() => moveCh(1)} aria-label="Move chapter down">↓</button>
              <button className="btn" onClick={() => setCh({ hidden: !ch.hidden })}>{ch.hidden ? 'Show chapter' : 'Hide chapter'}</button>
              {ch.id.startsWith('custom-') ? <button className="btn" onClick={() => { if (confirm('Delete this chapter?')) { commit({ ...guide, chapters: guide.chapters.filter((c) => c.id !== ch.id) }); setChId(guide.chapters[0]?.id || ''); } }}>Delete</button> : null}
            </div>
            <div className="ge-two">
              <div className="cv-f"><label className="mute" htmlFor="ge-k">Label above the title</label><input id="ge-k" className="in" value={ch.kicker} onChange={(e) => setCh({ kicker: e.target.value, edited: true })} /></div>
              <div className="cv-f"><label className="mute" htmlFor="ge-l">Introduction</label><textarea id="ge-l" className="ta" style={{ minHeight: 30 }} value={ch.lede} onChange={(e) => setCh({ lede: e.target.value, edited: true })} /></div>
            </div>
            {ch.rules.length ? <p className="mute" style={{ margin: 0 }}>{ch.rules.length} rule{ch.rules.length === 1 ? '' : 's'} from the review show under this chapter. Edit them in the Review tab.</p> : null}
          </div>

          {ch.blocks.map((b, i) => (
            <div key={b.id} className={'ge-block' + (b.hidden ? ' off' : '')}>
              <div className="ge-btools">
                <span className="tag">{KINDS.find(([k]) => k === b.kind)?.[1]}</span>
                {b.source ? <span className="mute">{b.edited ? 'Edited · kept on rebuild' : 'From Figma'}</span> : <span className="mute">Added in the studio</span>}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? 'Done' : 'Edit'}</button>
                <button className="btn" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="btn" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="btn" onClick={() => editBlock(b.id, { hidden: !b.hidden })}>{b.hidden ? 'Show' : 'Hide'}</button>
                {b.original ? <button className={'btn' + (b.showOriginal ? ' solid' : '')} onClick={() => editBlock(b.id, { showOriginal: !b.showOriginal })} title="Show the Figma slide as a picture instead">Slide image</button> : null}
                {b.source && b.edited ? <button className="btn" onClick={() => { if (confirm('Discard your edits? The block refreshes from Figma on the next rebuild.')) setBlocks(ch.blocks.map((x) => (x.id === b.id ? { ...x, edited: false } : x))); }}>Reset</button> : null}
                {!b.source ? <button className="btn" onClick={() => setBlocks(ch.blocks.filter((x) => x.id !== b.id))}>Delete</button> : null}
              </div>
              <div className="ge-prev pt">{b.hidden ? <p className="mute" style={{ padding: 12, margin: 0 }}>Hidden from the client{b.heading ? `: ${b.heading}` : ''}</p> : <GuideBlock b={b} urls={urls} headingLevel={3} />}</div>
              {open === b.id ? <BlockForm b={b} urls={urls} onChange={(p) => editBlock(b.id, p)} upload={upload} /> : null}
            </div>
          ))}
          <div className="row"><span className="mute">Add a section:</span>{KINDS.filter(([k]) => k !== 'cover').map(([k, l]) => <button key={k} className="btn" onClick={() => addBlock(k)}>+ {l}</button>)}</div>
        </div> : null}
      </div>
      <p className="mute">Built {new Date(guide.generatedAt).toLocaleString('en-GB')} from “{guide.page}” in {guide.file}.</p>
    </div>
  );
}

function BlockForm({ b, urls, onChange, upload }: { b: Block; urls: Record<string, string>; onChange: (p: Partial<Block>) => void; upload: (f: File) => Promise<BlockMedia | null> }) {
  const media = b.media || [];
  const setMedia = (m: BlockMedia[]) => onChange({ media: m });
  const sw = b.swatches || [];
  return (
    <div className="ge-form">
      <div className="ge-two">
        <div className="cv-f"><label className="mute">Layout</label><select className="in" value={b.kind} onChange={(e) => onChange({ kind: e.target.value as BlockKind, side: e.target.value === 'split' ? b.side || 'right' : b.side })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {b.kind === 'split' ? <div className="cv-f"><label className="mute">Image side</label><div className="row">{(['left', 'right'] as const).map((s) => <button key={s} className={'btn' + ((b.side || 'right') === s ? ' solid' : '')} onClick={() => onChange({ side: s })}>{s === 'left' ? 'Left' : 'Right'}</button>)}</div></div>
          : b.kind === 'media' ? <div className="cv-f"><label className="mute">Columns</label><div className="row">{[1, 2, 3, 4].map((n) => <button key={n} className={'btn' + ((b.cols || 2) === n ? ' solid' : '')} onClick={() => onChange({ cols: n })}>{n}</button>)}</div></div> : <span />}
      </div>
      <div className="cv-f"><label className="mute">Small label</label><input className="in" value={b.eyebrow || ''} onChange={(e) => onChange({ eyebrow: e.target.value || undefined })} /></div>
      <div className="cv-f"><label className="mute">Heading</label><textarea className="ta" style={{ minHeight: 36 }} value={b.heading || ''} onChange={(e) => onChange({ heading: e.target.value || undefined })} /></div>
      <div className="cv-f"><label className="mute">Text <span>(blank line for a new paragraph)</span></label><textarea className="ta" style={{ minHeight: 110 }} value={b.body || ''} onChange={(e) => onChange({ body: e.target.value || undefined })} /></div>
      <div className="ge-two">
        <ColourField label="Background" value={b.bg} onChange={(v) => onChange({ bg: v })} />
        <ColourField label="Text colour" value={b.ink} onChange={(v) => onChange({ ink: v })} />
      </div>

      {b.kind === 'swatches' ? <div className="cv-f">
        <label className="mute">Swatches</label>
        {sw.map((s, k) => <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="color" aria-label="Colour" value={/^#[0-9A-F]{6}$/i.test(s.hex) ? s.hex : '#000000'} onChange={(e) => onChange({ swatches: sw.map((x, j) => (j === k ? { ...x, hex: e.target.value.toUpperCase() } : x)) })} />
          <input className="in" aria-label="Name" value={s.name} onChange={(e) => onChange({ swatches: sw.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
          <input className="in" aria-label="Hex" style={{ width: 110 }} value={s.hex} onChange={(e) => onChange({ swatches: sw.map((x, j) => (j === k ? { ...x, hex: e.target.value.toUpperCase() } : x)) })} />
          <input className="in" aria-label="Note, e.g. CMYK or Pantone" placeholder="CMYK / Pantone" value={s.note || ''} onChange={(e) => onChange({ swatches: sw.map((x, j) => (j === k ? { ...x, note: e.target.value || undefined } : x)) })} />
          <button className="fm-x" aria-label={`Remove ${s.name}`} onClick={() => onChange({ swatches: sw.filter((_, j) => j !== k) })}>×</button>
        </div>)}
        <div className="row"><button className="btn" onClick={() => onChange({ swatches: [...sw, { name: 'Colour', hex: '#000000' }] })}>+ Swatch</button></div>
      </div> : null}

      <div className="cv-f">
        <label className="mute">Images</label>
        {media.map((m, k) => <div key={m.path} className="ge-media">
          {urls[m.path] ? <img src={urls[m.path]} alt="" /> : <span className="mute">missing</span>}
          <input className="in" aria-label="Caption" placeholder="Caption (optional)" value={m.caption || ''} onChange={(e) => setMedia(media.map((x, j) => (j === k ? { ...x, caption: e.target.value || undefined } : x)))} />
          <select className="fm-sel" aria-label="Image fit" value={m.kind} onChange={(e) => setMedia(media.map((x, j) => (j === k ? { ...x, kind: e.target.value as BlockMedia['kind'] } : x)))}><option value="photo">Photo</option><option value="graphic">Graphic</option></select>
          <button className="btn" onClick={() => { const l = [...media]; if (k > 0) { [l[k - 1], l[k]] = [l[k], l[k - 1]]; setMedia(l); } }} aria-label="Move image earlier">↑</button>
          <label className="btn">Replace<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const up = await upload(f); if (up) setMedia(media.map((x, j) => (j === k ? { ...up, caption: x.caption } : x))); }} /></label>
          <button className="fm-x" aria-label="Remove image" onClick={() => setMedia(media.filter((_, j) => j !== k))}>×</button>
        </div>)}
        <div className="row">
          <label className="btn">+ Add image<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const up = await upload(f); if (up) setMedia([...media, up]); }} /></label>
          {b.kind === 'cover' || b.backdrop ? <>
            <label className="btn">{b.backdrop ? 'Replace background image' : 'Add background image'}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const up = await upload(f); if (up) onChange({ backdrop: up }); }} /></label>
            {b.backdrop ? <button className="btn" onClick={() => onChange({ backdrop: undefined })}>Remove background</button> : null}
          </> : null}
        </div>
      </div>
    </div>
  );
}

function ColourField({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <div className="cv-f"><label className="mute">{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="color" aria-label={label} value={value && /^#[0-9A-F]{6}$/i.test(value) ? value : '#FFFFFF'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input className="in" aria-label={`${label} hex`} placeholder="Automatic" value={value || ''} onChange={(e) => onChange(e.target.value.toUpperCase() || undefined)} />
        {value ? <button className="btn" onClick={() => onChange(undefined)}>Auto</button> : null}
      </div>
    </div>
  );
}
