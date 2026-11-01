'use client';
import { useEffect, useRef, useState } from 'react';
import { newRow, emptyFrame, type Showcase, type ShowcaseFrame, type ShowcaseRow } from '@/lib/showcase';
import { ShowcaseMedia } from '@/components/portal/ShowcaseFrame';

const uid = () => 'r-' + Math.random().toString(36).slice(2, 9);
const SAMPLE = `<style>body{display:grid;place-items:center;background:#111;color:#fff;font:600 8vw system-ui}</style>\n<div>Hello</div>`;

// The studio's showcase editor: the page as the client sees it, built row by row. Full-width 3:2 rows or two
// 3:4 frames side by side; each frame takes an image, an MP4 or a code snippet. Saves as you go.
export function ShowcaseEditor({ projectId, slug, initial, initialUrls }: { projectId: string; slug: string; initial: Showcase; initialUrls: Record<string, string> }) {
  const [s, setS] = useState(initial);
  const [urls, setUrls] = useState(initialUrls);
  const [msg, setMsg] = useState('');
  const [codeAt, setCodeAt] = useState<string | null>(null);
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
  const setRows = (r: ShowcaseRow[]) => commit({ ...s, rows: r });
  const setRow = (id: string, p: Partial<ShowcaseRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setFrame = (id: string, i: number, p: Partial<ShowcaseFrame>) => setRows(rows.map((r) => (r.id === id ? { ...r, frames: r.frames.map((f, k) => (k === i ? { ...f, ...p } : f)) } : r)));
  const move = (i: number, d: number) => { const l = [...rows]; const [r] = l.splice(i, 1); l.splice(Math.max(0, Math.min(l.length, i + d)), 0, r); setRows(l); };
  const insert = (at: number, layout: 'full' | 'half') => { const l = [...rows]; l.splice(at, 0, newRow(layout)); setRows(l); };
  function relayout(r: ShowcaseRow, layout: 'full' | 'half') {
    if (layout === r.layout) return;
    if (layout === 'half') return setRow(r.id, { layout, frames: [r.frames[0] || emptyFrame(), emptyFrame()] });
    const keep = r.frames.filter((f) => f.kind !== 'empty');
    if (keep.length > 1 && !confirm('A full-width row holds one frame. Keep the first and move the second into a new row below?')) return;
    const i = rows.indexOf(r); const l = [...rows];
    l.splice(i, 1, { ...r, layout, frames: [keep[0] || emptyFrame()] }, ...(keep[1] ? [{ id: uid(), layout: 'full' as const, frames: [keep[1]] }] : []));
    setRows(l);
  }

  async function upload(file?: File) {
    const t = fileFor.current; if (!file || !t) return;
    const type = file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : '');
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

  const adder = (at: number) => <div className="se-add"><button onClick={() => insert(at, 'full')}>+ Full width 3:2</button><button onClick={() => insert(at, 'half')}>+ Two 3:4</button></div>;

  return (
    <div className="se">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="row"><a className="btn" href={`/p/${slug}/showcase`} target="_blank" rel="noopener">Preview as client ↗</a><span className="mute" role="status">{msg || 'Changes save as you go.'}</span></div>
      <div className="se-head">
        <label className="sr" htmlFor="se-t">Title</label><input id="se-t" className="in se-title" defaultValue={s.title || ''} placeholder="Showcase" onBlur={(e) => commit({ ...s, title: e.target.value.trim() || undefined })} />
        <label className="sr" htmlFor="se-i">Introduction</label><textarea id="se-i" className="in se-intro" rows={2} defaultValue={s.intro || ''} placeholder="An introduction (optional)" onBlur={(e) => commit({ ...s, intro: e.target.value.trim() || undefined })} />
      </div>
      {adder(0)}
      {rows.map((r, ri) => (
        <div key={r.id}>
          <div className="se-row">
            <div className="se-bar">
              <div className="ve-seg"><button className={r.layout === 'full' ? 'on' : ''} onClick={() => relayout(r, 'full')}>Full 3:2</button><button className={r.layout === 'half' ? 'on' : ''} onClick={() => relayout(r, 'half')}>Two 3:4</button></div>
              {r.layout === 'half' ? <button className="btn" onClick={() => setRow(r.id, { frames: [r.frames[1], r.frames[0]] })}>Swap</button> : null}
              <span className="ve-sep" />
              <button className="btn" disabled={ri === 0} onClick={() => move(ri, -1)} aria-label="Move row up">↑</button>
              <button className="btn" disabled={ri === rows.length - 1} onClick={() => move(ri, 1)} aria-label="Move row down">↓</button>
              <button className="btn" onClick={() => { const l = [...rows]; l.splice(ri + 1, 0, { ...r, id: uid() }); setRows(l); }}>Duplicate</button>
              <button className="btn" onClick={() => { if (r.frames.every((f) => f.kind === 'empty') || confirm('Delete this row?')) setRows(rows.filter((x) => x.id !== r.id)); }}>Delete</button>
            </div>
            <div className={'sc-row ' + r.layout}>
              {r.frames.map((f, i) => {
                const key = `${r.id}:${i}`;
                return (
                  <figure key={i} className="sc-frame se-frame">
                    <div className={'sc-media' + (f.kind === 'empty' ? ' se-empty' : '')} style={f.bg ? { background: f.bg } : undefined}>
                      <ShowcaseMedia f={f} url={f.path ? urls[f.path] : undefined} />
                      {f.kind === 'empty' ? <div className="se-empty-in"><span>{r.layout === 'full' ? '3:2' : '3:4'}</span><div className="row"><button className="btn solid" onClick={() => pick(r.id, i)}>Image or MP4</button><button className="btn" onClick={() => { setFrame(r.id, i, { kind: 'code', code: f.code || SAMPLE }); setCodeAt(key); }}>Code</button></div></div>
                        : <div className="se-tools">
                          <button onClick={() => pick(r.id, i)}>Replace</button>
                          {f.kind === 'code' ? <button onClick={() => setCodeAt(codeAt === key ? null : key)}>{codeAt === key ? 'Close code' : 'Edit code'}</button> : <button onClick={() => setFrame(r.id, i, { fit: f.fit === 'contain' ? 'cover' : 'contain' })}>{f.fit === 'contain' ? 'Fill' : 'Fit'}</button>}
                          <label title="Background colour">Bg<input type="color" value={f.bg || '#ffffff'} onChange={(e) => setFrame(r.id, i, { bg: e.target.value.toUpperCase() })} aria-label="Background colour" /></label>
                          <button onClick={() => { setFrame(r.id, i, emptyFrame()); setCodeAt(null); }}>Clear</button>
                        </div>}
                    </div>
                    {codeAt === key && f.kind === 'code' ? <div className="se-code"><label className="ve-label" htmlFor={`code-${key}`}>HTML, CSS and JavaScript. Runs in a sandbox and fills the frame.</label><textarea id={`code-${key}`} className="in" spellCheck={false} rows={10} defaultValue={f.code} onBlur={(e) => setFrame(r.id, i, { code: e.target.value })} /></div> : null}
                    <label className="sr" htmlFor={`cap-${key}`}>Caption</label>
                    <input id={`cap-${key}`} className="se-cap" defaultValue={f.caption || ''} placeholder="Caption (optional)" onBlur={(e) => setFrame(r.id, i, { caption: e.target.value.trim() || undefined })} />
                  </figure>
                );
              })}
            </div>
          </div>
          {adder(ri + 1)}
        </div>
      ))}
      {!rows.length ? <p className="mute">No rows yet. Start with a full-width 3:2 frame, then pairs of 3:4.</p> : null}
    </div>
  );
}
