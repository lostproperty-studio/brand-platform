'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Code2, Copy, ExternalLink, GripVertical, Image as ImageIcon, Plus, RectangleHorizontal, Columns2, Trash2, Upload, X, ArrowLeftRight } from 'lucide-react';
import { newRow, emptyFrame, type Showcase, type ShowcaseFrame, type ShowcaseRow } from '@/lib/showcase';
import { ShowcaseMedia } from '@/components/portal/ShowcaseFrame';

const uid = () => 'r-' + Math.random().toString(36).slice(2, 9);
const SAMPLE = `<style>body{display:grid;place-items:center;background:#111;color:#fff;font:600 8vw system-ui}</style>\n<div>Hello</div>`;
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
type Sel = { row: string; i?: number } | null;

// The showcase, edited like the guidelines: slides on the left (drag to reorder), the page in the middle, and the
// selected slide or frame's settings on the right. Two layouts only: one 3:2 frame across the full width, or two
// 3:4 frames side by side. A frame takes an image, an MP4 or a code snippet; drop a file straight onto it.
export function ShowcaseEditor({ projectId, slug, initial, initialUrls, colours = [] }: { projectId: string; slug: string; initial: Showcase; initialUrls: Record<string, string>; colours?: { name: string; hex: string }[] }) {
  const [s, setS] = useState(initial);
  const [urls, setUrls] = useState(initialUrls);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<Sel>(initial.rows[0] ? { row: initial.rows[0].id } : null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(s);
  const fileFor = useRef<{ row: string; i: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(next: Showcase) {
    setS(next); latest.current = next; setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { showcase: latest.current } }) });
      setMsg(r.ok ? 'Saved · publish to show the client' : 'Couldn’t save. Check your connection.');
    }, 600);
  }
  const rows = s.rows;
  const setRows = (r: ShowcaseRow[]) => commit({ ...latest.current, rows: r });
  const setRow = (id: string, p: Partial<ShowcaseRow>) => setRows(latest.current.rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setFrame = (id: string, i: number, p: Partial<ShowcaseFrame>) => setRows(latest.current.rows.map((r) => (r.id === id ? { ...r, frames: r.frames.map((f, k) => (k === i ? { ...f, ...p } : f)) } : r)));
  const insert = (at: number, layout: 'full' | 'half') => { const l = [...rows]; const r = newRow(layout); l.splice(at, 0, r); setRows(l); setSel({ row: r.id }); setTimeout(() => document.getElementById('sc-' + r.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };
  const moveTo = (id: string, before: string | null) => { const l = rows.filter((r) => r.id !== id); const r = rows.find((x) => x.id === id)!; const at = before ? l.findIndex((x) => x.id === before) : l.length; l.splice(at < 0 ? l.length : at, 0, r); setRows(l); };
  const shift = (id: string, d: number) => { const i = rows.findIndex((r) => r.id === id); const l = [...rows]; const [r] = l.splice(i, 1); l.splice(Math.max(0, Math.min(l.length, i + d)), 0, r); setRows(l); };
  function relayout(r: ShowcaseRow, layout: 'full' | 'half') {
    if (layout === r.layout) return;
    if (layout === 'half') return setRow(r.id, { layout, frames: [r.frames[0] || emptyFrame(), emptyFrame()] });
    const keep = r.frames.filter((f) => f.kind !== 'empty');
    if (keep.length > 1 && !confirm('A full-width slide holds one frame. Keep the first and move the second into a new slide below?')) return;
    const i = rows.indexOf(r); const l = [...rows];
    l.splice(i, 1, { ...r, layout, frames: [keep[0] || emptyFrame()] }, ...(keep[1] ? [{ id: uid(), layout: 'full' as const, frames: [keep[1]] }] : []));
    setRows(l); setSel({ row: r.id, i: 0 });
  }
  const remove = (r: ShowcaseRow) => { if (!r.frames.every((f) => f.kind === 'empty') && !confirm('Delete this slide?')) return; const i = rows.indexOf(r); const l = rows.filter((x) => x.id !== r.id); setRows(l); setSel(l[Math.max(0, i - 1)] ? { row: l[Math.max(0, i - 1)].id } : null); };

  async function upload(file: File | undefined, t: { row: string; i: number } | null) {
    if (!file || !t) return;
    const type = file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : '');
    if (!/^(image\/|video\/mp4)/.test(type)) { setMsg('Images (JPG, PNG, WebP, GIF, SVG) or MP4 only.'); return; }
    setMsg(`Uploading ${file.name}…`);
    const sg = await fetch(`/api/projects/${projectId}/showcase`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', name: file.name, type }) });
    const sj = await sg.json().catch(() => ({}));
    if (!sg.ok) { setMsg(sj.error || 'Couldn’t upload.'); return; }
    const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file);
    const up = await fetch(sj.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } });
    if (!up.ok) { setMsg(`Couldn’t upload ${file.name}.`); return; }
    const v = await fetch(`/api/projects/${projectId}/showcase`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'view', paths: [sj.path] }) });
    const vj = await v.json().catch(() => ({ urls: {} }));
    setUrls((u) => ({ ...u, ...vj.urls }));
    setFrame(t.row, t.i, { kind: type.startsWith('video') ? 'video' : 'image', path: sj.path, code: undefined });
  }
  const pick = (row: string, i: number) => { fileFor.current = { row, i }; input.current?.click(); };

  const selRow = sel ? rows.find((r) => r.id === sel.row) : undefined;
  const selFrame = selRow && sel?.i !== undefined ? selRow.frames[sel.i] : undefined;
  const mini = (f: ShowcaseFrame) => f.kind === 'image' && f.path && urls[f.path] ? <img src={urls[f.path]} alt="" /> : f.kind === 'video' ? <span className="sx-k">MP4</span> : f.kind === 'code' ? <span className="sx-k">Code</span> : null;

  return (
    <div className="sx">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4" hidden onChange={(e) => { upload(e.target.files?.[0], fileFor.current); e.target.value = ''; }} />

      <nav className="sx-side" aria-label="Slides">
        <p className="ve-label">Slides · drag to reorder</p>
        <ol className="sx-slides">{rows.map((r, k) => <li key={r.id} draggable onDragStart={() => setDrag(r.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => { if (drag && drag !== r.id) { e.preventDefault(); setOver(r.id); } }} onDrop={() => { if (drag && drag !== r.id) moveTo(drag, r.id); setDrag(null); setOver(null); }}
          className={'sx-slide' + (sel?.row === r.id ? ' on' : '') + (over === r.id ? ' over' : '')}>
          <button type="button" onClick={() => { setSel({ row: r.id }); document.getElementById('sc-' + r.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} aria-label={`Slide ${k + 1}, ${r.layout === 'full' ? 'full width 3:2' : 'half and half'}`}>
            <span className="sx-n">{String(k + 1).padStart(2, '0')}</span>
            <span className={'sx-thumb ' + r.layout}>{r.frames.map((f, i) => <span key={i} style={f.bg ? { background: f.bg } : undefined}>{mini(f)}</span>)}</span>
            <GripVertical size={13} strokeWidth={1.75} aria-hidden className="sx-grip" />
          </button>
        </li>)}</ol>
        <div className="sx-adds">
          <button type="button" className="btn ic" onClick={() => insert(rows.length, 'full')}><RectangleHorizontal {...I} />Full width 3:2</button>
          <button type="button" className="btn ic" onClick={() => insert(rows.length, 'half')}><Columns2 {...I} />Half and half</button>
        </div>
      </nav>

      <div className="sx-main">
        <div className="sx-bar"><a className="btn ic" href={`/p/${slug}/showcase`} target="_blank" rel="noopener"><ExternalLink {...I} />Preview as client</a><span className="mute" role="status">{msg || 'Changes save as you go.'}</span></div>
        <div className="sx-page">
          <div className="sx-head">
            <input className="sx-kicker" defaultValue={s.kicker ?? ''} placeholder="The brand at work" aria-label="Line above the title" onBlur={(e) => commit({ ...latest.current, kicker: e.target.value === '' ? undefined : e.target.value.trim() })} />
            <input className="sx-title" defaultValue={s.title || ''} placeholder="Showcase" aria-label="Title" onBlur={(e) => commit({ ...latest.current, title: e.target.value.trim() || undefined })} />
            <label className="sx-nav"><span className="mute">Name in the menu</span><input defaultValue={s.nav || ''} placeholder="Showcase" aria-label="Name in the menu" onBlur={(e) => commit({ ...latest.current, nav: e.target.value.trim() || undefined })} /></label>
            <textarea className="sx-intro" rows={2} defaultValue={s.intro || ''} placeholder="An introduction (optional)" aria-label="Introduction" onBlur={(e) => commit({ ...latest.current, intro: e.target.value.trim() || undefined })} />
          </div>
          {rows.map((r, ri) => <div key={r.id} id={'sc-' + r.id} className={'sx-row' + (sel?.row === r.id ? ' on' : '')} onMouseDown={() => { if (sel?.row !== r.id) setSel({ row: r.id }); }}>
            <span className="sx-row-tag">{String(ri + 1).padStart(2, '0')} · {r.layout === 'full' ? 'Full width 3:2' : 'Half and half'}</span>
            <div className={'sc-row ' + r.layout}>
              {r.frames.map((f, i) => { const key = `${r.id}:${i}`; const on = sel?.row === r.id && sel.i === i; return (
                <figure key={i} className={'sc-frame sx-frame' + (on ? ' on' : '')} onMouseDown={(e) => { e.stopPropagation(); setSel({ row: r.id, i }); }}>
                  <div className={'sc-media' + (f.kind === 'empty' ? ' sx-empty' : '') + (dropOn === key ? ' drop' : '')} style={f.bg ? { background: f.bg } : undefined}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropOn(key); } }} onDragLeave={() => setDropOn(null)}
                    onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDropOn(null); setSel({ row: r.id, i }); upload(e.dataTransfer.files[0], { row: r.id, i }); }}>
                    <ShowcaseMedia f={f} url={f.path ? urls[f.path] : undefined} />
                    {f.kind === 'empty' ? <div className="sx-empty-in"><Upload size={20} strokeWidth={1.5} aria-hidden /><span>Drop an image or MP4</span><span className="mute">{r.layout === 'full' ? '3:2' : '3:4'}</span></div> : null}
                  </div>
                  {f.caption ? <figcaption>{f.caption}</figcaption> : null}
                </figure>); })}
            </div>
          </div>)}
          {!rows.length ? <div className="sx-start"><p>Start with a full-width slide, then pairs of half and half.</p><div className="row"><button type="button" className="btn solid ic" onClick={() => insert(0, 'full')}><RectangleHorizontal {...I} />Full width 3:2</button><button type="button" className="btn ic" onClick={() => insert(0, 'half')}><Columns2 {...I} />Half and half</button></div></div>
            : <button type="button" className="sx-more" onClick={() => insert(rows.length, selRow?.layout === 'full' ? 'half' : 'full')}><Plus {...I} />Add a slide</button>}
        </div>
      </div>

      <aside className="dp sx-panel" aria-label="Design panel">
        {!selRow ? <section className="dp-sec"><p className="dp-tip">Select a slide or a frame to change it.</p></section> : <>
          <section className="dp-sec">
            <p className="dp-h">Slide {rows.indexOf(selRow) + 1}</p>
            <div className="sx-seg" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" aria-checked={selRow.layout === 'full'} className={selRow.layout === 'full' ? 'on' : ''} onClick={() => relayout(selRow, 'full')}><RectangleHorizontal {...I} />Full 3:2</button>
              <button type="button" role="radio" aria-checked={selRow.layout === 'half'} className={selRow.layout === 'half' ? 'on' : ''} onClick={() => relayout(selRow, 'half')}><Columns2 {...I} />Half and half</button>
            </div>
            <div className="sx-acts">
              {selRow.layout === 'half' ? <button type="button" className="btn ic" onClick={() => setRow(selRow.id, { frames: [selRow.frames[1], selRow.frames[0]] })}><ArrowLeftRight {...I} />Swap</button> : null}
              <button type="button" className="btn ic" onClick={() => shift(selRow.id, -1)} disabled={rows[0]?.id === selRow.id} aria-label="Move up"><ArrowUp {...I} /></button>
              <button type="button" className="btn ic" onClick={() => shift(selRow.id, 1)} disabled={rows[rows.length - 1]?.id === selRow.id} aria-label="Move down"><ArrowDown {...I} /></button>
              <button type="button" className="btn ic" onClick={() => { const l = [...rows]; const c = { ...selRow, id: uid() }; l.splice(rows.indexOf(selRow) + 1, 0, c); setRows(l); setSel({ row: c.id }); }}><Copy {...I} />Duplicate</button>
              <button type="button" className="btn ic sx-del" onClick={() => remove(selRow)} aria-label="Delete slide"><Trash2 {...I} /></button>
            </div>
            {sel?.i === undefined ? <p className="dp-tip" style={{ padding: 0 }}>Select a frame on the page to fill it.</p> : null}
          </section>
          {selFrame && sel?.i !== undefined ? <>
            <section className="dp-sec">
              <p className="dp-h">{selRow.layout === 'half' ? (sel.i === 0 ? 'Left frame' : 'Right frame') : 'Frame'} <span className="mute">· {selRow.layout === 'full' ? '3:2' : '3:4'}</span></p>
              <div className="sx-fill">
                <button type="button" className={'sx-kind' + (selFrame.kind === 'image' || selFrame.kind === 'video' ? ' on' : '')} onClick={() => pick(selRow.id, sel.i!)}><ImageIcon {...I} />{selFrame.kind === 'image' || selFrame.kind === 'video' ? 'Replace' : 'Image or MP4'}</button>
                <button type="button" className={'sx-kind' + (selFrame.kind === 'code' ? ' on' : '')} onClick={() => setFrame(selRow.id, sel.i!, { kind: 'code', code: selFrame.code || SAMPLE, path: undefined })}><Code2 {...I} />Code</button>
              </div>
              {selFrame.kind === 'code' ? <label className="sx-code"><span className="mute">HTML, CSS and JavaScript. Runs in a sandbox and fills the frame.</span><textarea key={sel.row + sel.i} className="in" spellCheck={false} rows={10} defaultValue={selFrame.code} onBlur={(e) => setFrame(selRow.id, sel.i!, { code: e.target.value })} /></label> : null}
              {selFrame.kind === 'image' || selFrame.kind === 'video' ? <div className="sx-seg" role="radiogroup" aria-label="Fit">
                <button type="button" role="radio" aria-checked={selFrame.fit !== 'contain'} className={selFrame.fit !== 'contain' ? 'on' : ''} onClick={() => setFrame(selRow.id, sel.i!, { fit: 'cover' })}>Fill</button>
                <button type="button" role="radio" aria-checked={selFrame.fit === 'contain'} className={selFrame.fit === 'contain' ? 'on' : ''} onClick={() => setFrame(selRow.id, sel.i!, { fit: 'contain' })}>Fit</button>
              </div> : null}
            </section>
            <section className="dp-sec">
              <p className="dp-h">Background</p>
              <div className="sx-sw">
                <button type="button" className={'sx-swatch none' + (!selFrame.bg ? ' on' : '')} onClick={() => setFrame(selRow.id, sel.i!, { bg: undefined })} aria-label="No background" />
                {colours.map((c) => <button key={c.hex} type="button" className={'sx-swatch' + (selFrame.bg?.toUpperCase() === c.hex.toUpperCase() ? ' on' : '')} style={{ background: c.hex }} onClick={() => setFrame(selRow.id, sel.i!, { bg: c.hex.toUpperCase() })} aria-label={c.name} title={`${c.name} ${c.hex}`} />)}
                <label className="sx-swatch custom" title="Another colour"><input type="color" value={selFrame.bg || '#ffffff'} onChange={(e) => setFrame(selRow.id, sel.i!, { bg: e.target.value.toUpperCase() })} aria-label="Another colour" /></label>
              </div>
            </section>
            <section className="dp-sec">
              <p className="dp-h">Caption</p>
              <input key={sel.row + sel.i} className="in" defaultValue={selFrame.caption || ''} placeholder="Optional" onBlur={(e) => setFrame(selRow.id, sel.i!, { caption: e.target.value.trim() || undefined })} />
              {selFrame.kind !== 'empty' ? <button type="button" className="btn ic" style={{ alignSelf: 'flex-start' }} onClick={() => setFrame(selRow.id, sel.i!, emptyFrame())}><X {...I} />Clear the frame</button> : null}
            </section>
          </> : null}
        </>}
      </aside>
    </div>
  );
}
