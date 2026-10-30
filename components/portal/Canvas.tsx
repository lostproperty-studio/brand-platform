'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Tpl = { id: string; label: string; path: string };
type FontFile = { role: string; name: string; weight: number; style: string; format: string; url: string };
type Slot = { name: string; kind: 'text' | 'image'; value: string; long: boolean };
const CSS_FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };

// Resolves a path written in a template (e.g. ../../tokens/x.css) against the template's own location.
function resolve(from: string, rel: string) {
  if (/^(https?:|data:|blob:|#)/.test(rel)) return rel;
  const parts = from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}

export function Canvas({ slug, toolId, templates, resources, images, fontFiles, aiConnected, canConnect }: { slug: string; toolId: string; templates: Tpl[]; resources: Record<string, string>; images: { path: string; url: string }[]; fontFiles: FontFile[]; aiConnected: boolean; canConnect: boolean }) {
  const [tplId, setTplId] = useState(templates[0].id);
  const [base, setBase] = useState<{ html: string; w: number; h: number } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [prompt, setPrompt] = useState('');
  const [aiMsg, setAiMsg] = useState('');
  const [busy, setBusy] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const tpl = templates.find((t) => t.id === tplId)!;
  // Each person's saved layouts
  type Saved = { id: string; title: string; data: { template?: string; slots?: Record<string, string> }; updated_at: string };
  const [saved, setSaved] = useState<Saved[]>([]);
  const restoringRef = useRef<Record<string, string> | null>(null);
  const setRestoring = (r: Record<string, string>) => { restoringRef.current = r; };
  const loadSaved = useCallback(async () => { const r = await fetch(`/api/p/${slug}/creations?tool=${toolId}`); if (r.ok) setSaved((await r.json()).creations); }, [slug, toolId]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  async function saveLayout() {
    const title = window.prompt('Name this layout', slots.find((s) => s.name === 'headline')?.value.slice(0, 40) || tpl.label); if (!title) return;
    const keep = Object.fromEntries(slots.filter((s) => !s.value.startsWith('data:')).map((s) => [s.name, s.value]));
    const r = await fetch(`/api/p/${slug}/creations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId, title, data: { template: tplId, slots: keep } }) });
    if (r.ok) { loadSaved(); setAiMsg('Saved to your layouts.' + (slots.some((s) => s.value.startsWith('data:')) ? ' Uploaded images aren’t saved; add them again when you reopen it.' : '')); }
  }
  function openSaved(c: Saved) { const r = c.data.slots || {}; if (c.data.template && c.data.template !== tplId && templates.some((t) => t.id === c.data.template)) { setRestoring(r); setTplId(c.data.template); } else setSlots((l) => l.map((s) => (r[s.name] !== undefined ? { ...s, value: r[s.name] } : s))); }

  // Brand fonts as @font-face rules inside the template, so the layout renders (and exports) in the real typefaces
  const fontCss = useMemo(() => fontFiles.map((f) => `@font-face { font-family: "brand-${f.role}"; src: url("${f.url}") format("${CSS_FORMAT[f.format]}"); font-weight: ${f.weight}; font-style: ${f.style}; }`).join('\n')
    + `\n:root { ${[...new Set(fontFiles.map((f) => f.role))].map((r) => `--font-${r}: "brand-${r}", ${JSON.stringify(fontFiles.find((f) => f.role === r)!.name)}, sans-serif;`).join(' ')} }`, [fontFiles]);

  // Load the template, point its file references at the kit, and read its slots
  useEffect(() => {
    let off = false;
    (async () => {
      setBase(null); setAiMsg('');
      const src = await (await fetch(resources[tpl.path])).text();
      const doc = new DOMParser().parseFromString(src, 'text/html');
      const logos = Object.keys(resources).filter((p) => /^assets\/logo\/.+\.svg$/.test(p));
      doc.querySelectorAll('[src],[href]').forEach((el) => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const rel = el.getAttribute(attr)!;
        const path = resolve(tpl.path, rel);
        let url = resources[path];
        if (!url && /^assets\/logo\//.test(path) && logos.length) url = resources[logos.find((l) => /dark|black|primary/i.test(l)) || logos[0]];
        if (url) el.setAttribute(attr, url); else if (el.getAttribute('data-slot') === 'image') el.setAttribute(attr, '');
      });
      const style = doc.createElement('style'); style.textContent = fontCss; doc.head.appendChild(style);
      const c = doc.querySelector('.canvas') as HTMLElement | null;
      const m = src.match(/(\d{3,4})\s*×\s*(\d{3,4})px/);
      const w = m ? Number(m[1]) : 1080, h = m ? Number(m[2]) : 1350;
      const found: Slot[] = [...doc.querySelectorAll('[data-slot]')].map((el) => ({ name: el.getAttribute('data-slot')!, kind: el.tagName === 'IMG' ? 'image' : 'text', value: el.tagName === 'IMG' ? '' : (el.textContent || '').trim(), long: el.tagName === 'P' }));
      if (off) return;
      const r = restoringRef.current; restoringRef.current = null;
      setSlots((prev) => found.map((s) => (r && r[s.name] !== undefined ? { ...s, value: r[s.name] } : prev.find((p) => p.name === s.name && p.value) || s)));
      setBase({ html: '<!doctype html>' + doc.documentElement.outerHTML, w: c ? w : 1080, h: c ? h : 1350 });
    })().catch(() => setAiMsg('This template couldn’t be loaded.'));
    return () => { off = true; };
  }, [tpl.path, resources, fontCss]);

  // Push slot values into the rendered template
  const paint = useCallback(() => {
    const d = frame.current?.contentDocument; if (!d) return;
    for (const s of slots) d.querySelectorAll(`[data-slot="${s.name}"]`).forEach((el) => {
      if (s.kind === 'image') { (el as HTMLImageElement).src = s.value || ''; (el as HTMLElement).style.visibility = s.value ? 'visible' : 'hidden'; }
      else el.textContent = s.value;
    });
  }, [slots]);
  useEffect(() => { paint(); }, [paint]);

  useEffect(() => {
    if (!box.current || !base) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(e.contentRect.width / base.w, 640 / base.h, 1)));
    ro.observe(box.current); return () => ro.disconnect();
  }, [base]);

  const set = (name: string, value: string) => setSlots((l) => l.map((s) => (s.name === name ? { ...s, value } : s)));
  const upload = (name: string, file?: File) => { if (!file) return; const r = new FileReader(); r.onload = () => set(name, String(r.result)); r.readAsDataURL(file); };

  async function askClaude() {
    if (!prompt.trim()) return;
    setBusy('Claude is writing…'); setAiMsg('');
    const r = await fetch(`/api/p/${slug}/canvas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, current: Object.fromEntries(slots.filter((s) => s.kind === 'text').map((s) => [s.name, s.value])), templates: templates.map((t) => t.id) }) });
    setBusy('');
    if (r.status === 402) { setAiMsg('AI isn’t connected for this portal yet.'); return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { setAiMsg(j.error || 'That didn’t work. Try again.'); return; }
    if (j.template && templates.some((t) => t.id === j.template) && j.template !== tplId) setTplId(j.template);
    setSlots((l) => l.map((s) => (s.kind === 'text' && typeof j[s.name] === 'string' ? { ...s, value: j[s.name] } : s)));
    setAiMsg([j.note, j.image_hint ? `Image: ${j.image_hint}` : ''].filter(Boolean).join(' '));
  }

  async function download() {
    const d = frame.current?.contentDocument; const node = d?.querySelector('.canvas') as HTMLElement | null;
    if (!node || !base) return;
    setBusy('Preparing the PNG…');
    try {
      const { toPng } = await import('html-to-image');
      // Embed the fonts as data so the export uses the brand typefaces
      const embedded = await Promise.all(fontFiles.map(async (f) => { const b = await (await fetch(f.url)).blob(); const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); }); return `@font-face { font-family: "brand-${f.role}"; src: url("${data}") format("${CSS_FORMAT[f.format]}"); font-weight: ${f.weight}; font-style: ${f.style}; }`; }));
      const url = await toPng(node, { width: base.w, height: base.h, pixelRatio: 1, cacheBust: true, fontEmbedCSS: embedded.join('\n') });
      const a = document.createElement('a'); a.href = url; a.download = `${slug}-${tplId}.png`; a.click();
    } catch { setAiMsg('The download failed. Try again, or use a screenshot for now.'); }
    setBusy('');
  }

  return (
    <div className="cv">
      <div className="cv-stage" ref={box}>
        <div className="row" role="group" aria-label="Format">{templates.map((t) => <button key={t.id} className={'btn' + (t.id === tplId ? ' solid' : '')} onClick={() => setTplId(t.id)}>{t.label}</button>)}</div>
        <div className="cv-art" style={base ? { width: base.w * scale, height: base.h * scale } : { height: 400 }}>
          {base ? <iframe ref={frame} title={`${tpl.label} preview`} srcDoc={base.html} onLoad={paint} style={{ width: base.w, height: base.h, transform: `scale(${scale})` }} /> : <p className="mute" style={{ padding: 20 }}>Loading…</p>}
        </div>
        {base ? <p className="mute">{tpl.label} · {base.w} × {base.h}px</p> : null}
      </div>
      <div className="cv-panel">
        {slots.map((s) => <div key={s.name} className="cv-f">
          <label className="mute" htmlFor={`s-${s.name}`}>{s.name[0].toUpperCase() + s.name.slice(1)}</label>
          {s.kind === 'text' ? (s.long || s.value.length > 60 ? <textarea id={`s-${s.name}`} className="ta" value={s.value} onChange={(e) => set(s.name, e.target.value)} /> : <input id={`s-${s.name}`} className="in" value={s.value} onChange={(e) => set(s.name, e.target.value)} />)
            : <div className="row">
              <label className="btn"><input id={`s-${s.name}`} type="file" accept="image/*" hidden onChange={(e) => upload(s.name, e.target.files?.[0])} />Upload image</label>
              {images.slice(0, 8).map((im) => <button key={im.path} className="cv-thumb" onClick={() => set(s.name, im.url)} aria-label={`Use ${im.path.split('/').pop()}`}><img src={im.url} alt="" /></button>)}
              {s.value ? <button className="btn" onClick={() => set(s.name, '')}>Remove</button> : null}
            </div>}
        </div>)}
        <div className="cv-ai">
          <label className="mute" htmlFor="cv-p">Ask Claude to write it</label>
          <textarea id="cv-p" className="ta" placeholder="e.g. Announce our open studio day on 14 November, friendly but short" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!aiConnected} />
          {aiConnected ? <button className="btn solid" disabled={!!busy || !prompt.trim()} onClick={askClaude}>Write it</button>
            : <p className="mute" style={{ margin: 0 }}>AI isn’t connected yet. {canConnect ? <Link href={`/p/${slug}/settings`}>Connect your Anthropic account</Link> : 'Ask your admin to connect it in Settings.'} You can still fill the layout by hand.</p>}
        </div>
        {aiMsg ? <p className="cv-note" role="status">{aiMsg}</p> : null}
        <div className="row"><button className="btn pink" disabled={!base || !!busy} onClick={download}>Download PNG</button><button className="btn" disabled={!base} onClick={saveLayout}>Save</button><span className="mute">{busy}</span></div>
        {saved.length ? <div className="cv-f"><label className="mute">My saved layouts</label>{saved.map((c) => <div key={c.id} className="dock-h"><button onClick={() => openSaved(c)}><span>{c.title}</span><span className="mute">{new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></button><button className="fm-x" aria-label={`Delete ${c.title}`} onClick={async () => { await fetch(`/api/p/${slug}/creations/${c.id}`, { method: 'DELETE' }); loadSaved(); }}>×</button></div>)}</div> : null}
      </div>
    </div>
  );
}
