'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Download, FileCode2, Film, Layers, Loader2, Package, Pause, Play, Repeat, RotateCcw, Send, Sparkles, Undo2, Upload, Wand2, X } from 'lucide-react';
import { buildTimeline, CONTROLS, describe, easeName, presetFor, typeFor, type BrandMotion, type Control, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { drawFrame, encodeMp4, encodeWebm, toLottie, toSVG, type Artwork } from '@/lib/motion/render';
import { TypeStage } from '@/components/motion/TypeStage';
import { artworkOf } from '@/components/motion/LogoMotion';
import { download, I, Import, kebab, lum, Mini, post, Settings, Submit, type Direction, type Msg, type MotionFont, type MotionLogo, type Patch } from '@/components/motion/MotionStudio';

// The studio's Motion tab as a maker: everything on one canvas. Pick a logo or typeface on the left, describe the
// motion in the prompt bar (Claude refines what's on the stage, or offers three new directions), tune it by hand on
// the right, then Export: add it to the client's Motion logos package, download a draft, or publish it as the
// brand's motion (which also writes the guidelines chapter, tokens and AI rules). Changes save as a draft.
type Sel = { kind: 'logo'; path: string } | { kind: 'type'; role: string };
const ALL: Control[] = CONTROLS.map((c) => c.id);

export function MotionMaker({ projectId, client, logos, fonts, colours, motion: initial, live: live0, canSubmit }: { projectId: string; client: string; logos: MotionLogo[]; fonts: MotionFont[]; colours: { name: string; hex: string }[]; motion: BrandMotion; live: { version: number; submittedAt?: string; submittedBy?: string } | null; canSubmit: boolean }) {
  const [m, setM] = useState<BrandMotion>(() => initial.assets ? initial : { ...initial, assets: { logos: logos.map((l) => l.path), fonts: fonts.map((f) => f.role) } });
  const [live, setLive] = useState(live0);
  const [status, setStatus] = useState('');
  const [undo, setUndo] = useState<BrandMotion[]>([]);
  const [importing, setImporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState('');
  const pair = useMemo(() => { const c = colours.filter((x) => /^#[0-9a-f]{6}/i.test(x.hex)).sort((a, b) => lum(a.hex) - lum(b.hex)); return { dark: c[0]?.hex || '#111111', light: c[c.length - 1]?.hex || '#ffffff' }; }, [colours]);

  // Every change is saved as a draft, a moment after it's made
  const savedJson = useRef(JSON.stringify(initial));
  const saveNow = useCallback(async (x: BrandMotion) => {
    const json = JSON.stringify(x); if (json === savedJson.current) return x;
    setStatus('Saving…');
    try {
      const j = await post(`/api/projects/${projectId}/motion`, { logo: x.logo, type: x.type, perLogo: x.perLogo || {}, typeBy: x.typeBy || {}, assets: x.assets, brief: x.brief, note: x.note, controls: x.controls, source: x.source, builtAt: x.builtAt }, 'PUT');
      savedJson.current = json; setStatus('Draft saved'); return j.motion as BrandMotion;
    } catch (e) { setStatus((e as Error).message); return x; }
  }, [projectId]);
  useEffect(() => { if (JSON.stringify(m) === savedJson.current) return; const t = setTimeout(() => saveNow(m), 1200); return () => clearTimeout(t); }, [m, saveNow]);
  const edit = (fn: (x: BrandMotion) => BrandMotion) => { setUndo((u) => [m, ...u].slice(0, 40)); setM(fn); };
  const isLive = !!live && m.submittedAt === live.submittedAt && savedJson.current === JSON.stringify(m);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 6000); return () => clearTimeout(t); }, [toast]);

  // The stage
  const [sel, setSel] = useState<Sel>(logos[0] ? { kind: 'logo', path: logos[0].path } : { kind: 'type', role: fonts[0]?.role || 'display' });
  const [own, setOwn] = useState(false);
  const [art, setArt] = useState<Artwork | null>(null);
  const [artErr, setArtErr] = useState('');
  const [bg, setBg] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [sample, setSample] = useState(`Welcome to ${client}`);
  const logo = sel.kind === 'logo' ? logos.find((l) => l.path === sel.path) : undefined;
  const font = sel.kind === 'type' ? fonts.find((f) => f.role === sel.role) : undefined;
  const key = sel.kind === 'logo' ? sel.path : sel.role;
  const ownMap = sel.kind === 'logo' ? m.perLogo : m.typeBy;
  const hasOwn = !!(ownMap?.[key] && Object.keys(ownMap[key]).length);
  useEffect(() => { setOwn(hasOwn); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const P: MotionPreset | TypePreset = sel.kind === 'type' ? typeFor(m, sel.role) : presetFor(m, logo?.path);
  const setP = (x: Patch) => edit((cur) => {
    if (sel.kind === 'type') return own && fonts.length > 1 ? { ...cur, typeBy: { ...cur.typeBy, [sel.role]: { ...(cur.typeBy?.[sel.role] || {}), ...x } as Partial<TypePreset> } } : { ...cur, type: { ...cur.type, ...x } as TypePreset };
    if (own && logo) return { ...cur, perLogo: { ...cur.perLogo, [logo.path]: { ...(cur.perLogo?.[logo.path] || {}), ...x } as Partial<MotionPreset> } };
    return { ...cur, logo: { ...cur.logo, ...x } as MotionPreset };
  });
  useEffect(() => {
    if (!logo) { setArt(null); return; }
    let on = true; setArt(null); setArtErr('');
    artworkOf(logo.url).then((a) => { if (on) { setArt(a); setBg(a.tone === 'dark' ? pair.light : pair.dark); } }).catch((e) => on && setArtErr(e.message));
    return () => { on = false; };
  }, [logo?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel.kind === 'type' && bg === null) setBg(pair.dark); }, [sel.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const tl = useMemo(() => (sel.kind === 'logo' && art ? buildTimeline(P, art.rects, art.w, art.h) : null), [art, P, sel.kind]);
  const T = tl?.T ?? P.length * 1000;
  const last = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => { const dt = last.current ? now - last.current : 0; last.current = now; if (playing) setT((x) => { const n = x + dt; return n > T ? (loop ? n % T : (setPlaying(false), T)) : n; }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => { cancelAnimationFrame(raf); last.current = 0; };
  }, [playing, loop, T]);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c || !art || !tl) return;
    const r = c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * d), H = Math.round(r.height * d);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    drawFrame(c.getContext('2d')!, W, H, art, P, tl, t, bg);
  }, [art, tl, t, bg, P]);
  const replay = () => { setT(0); setPlaying(true); };

  // The prompt bar: refine what's on the stage, or ask for three new directions
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'refine' | 'new'>(m.source ? 'refine' : 'new');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const subject = sel.kind === 'type' ? `${font?.name || 'Type'}: “${sample}”` : `${logo?.name || ''}${own ? ' (its own settings)' : ' (the brand’s logo motion)'}`;
  const generate = async (text: string, how = mode) => {
    if (!text.trim() || busy) return;
    setBusy(true); setPrompt('');
    setMsgs((x) => [...x, { role: 'user', text }]);
    try {
      if (how === 'new') {
        const parts = await Promise.all(logos.slice(0, 12).map(async (l) => ({ name: l.name, parts: (await artworkOf(l.url).catch(() => null))?.rects.length || 1 })));
        const j = await post(`/api/projects/${projectId}/motion/directions`, { brief: text, logos: parts, fonts: fonts.map((f) => ({ role: f.role, name: f.name })), previous: shown });
        setDirs(j.directions); setShown((s) => [...s, ...j.directions.map((d: Direction) => `${d.name}: ${d.about}`)].slice(-9));
        setMsgs((x) => [...x, { role: 'assistant', text: `Three directions below. Pick one to put it on the stage, then refine it.` }]);
        edit((x) => ({ ...x, brief: text }));
      } else {
        const j = await post(`/api/projects/${projectId}/motion/ai`, { target: sel.kind === 'type' ? 'type' : 'logo', preset: P, subject: `${subject}${m.brief ? `. The brief: ${m.brief.slice(0, 120)}` : ''}`.slice(0, 200), parts: tl?.parts.length || 1, history: msgs.slice(-10), message: text });
        setP(j.preset); replay(); setMsgs((x) => [...x, { role: 'assistant', text: j.reply }]);
        if (!m.source) edit((x) => ({ ...x, source: { kind: 'claude', name: 'Made in the maker', at: new Date().toISOString() } }));
      }
    } catch (e) { setMsgs((x) => [...x, { role: 'assistant', text: (e as Error).message }]); }
    setBusy(false);
  };
  const pickDir = (d: Direction) => {
    edit((x) => ({ ...x, logo: d.logo, type: d.type, perLogo: {}, typeBy: {}, controls: d.controls, note: `${d.name}: ${d.about}`, source: { kind: 'claude', name: d.name, at: new Date().toISOString() } }));
    setDirs([]); setMode('refine'); replay();
    setMsgs((x) => [...x, { role: 'assistant', text: `${d.name} is on the stage. Say what to change, or tune it on the right.` }]);
  };
  const ideas = mode === 'new' ? ['Confident and architectural, like doors sliding open', 'Quiet and warm, things settle into place', 'The mark draws itself, by hand', 'Sharp and fast, editorial']
    : sel.kind === 'logo' ? ['Slower and calmer', 'Draw it on, then fill', 'Come into focus, gently', 'Snappier'] : ['Word by word, gentle', 'Letters, quick and crisp', 'Lines rising up'];
  const lastReply = [...msgs].reverse().find((x) => x.role === 'assistant');

  // Export: into the client's Motion logos package (shows in Resources), or a draft to download
  const [menu, setMenu] = useState(false);
  const [exp, setExp] = useState<{ p: number; note: string } | null>(null);
  const toPackage = async (list: MotionLogo[]) => {
    setMenu(false); if (!list.length) return;
    const steps = list.length * 4 + 1; let n = 0; const tick = (note: string, sub = 0) => setExp({ p: Math.min(0.99, (n + sub) / steps), note });
    try {
      tick('Saving the draft'); const saved = await saveNow(m); n++;
      const pk = async (body: object) => post(`/api/projects/${projectId}/packages`, body);
      const toPkg = async (name: string, blob: Blob) => {
        const s = await pk({ action: 'sign', pkg: 'motion', name });
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', blob, name);
        const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } }); if (!up.ok) throw new Error(`Couldn’t upload ${name}.`);
        await pk({ action: 'add', pkg: 'motion', name, path: s.path, bytes: blob.size, type: blob.type });
      };
      for (const l of list) {
        const a = await artworkOf(l.url); const LP = presetFor(saved, l.path); const base = kebab(l.name); const on = a.tone === 'dark' ? pair.light : pair.dark;
        tick(`${l.name}: video`); await toPkg(`${base}.mp4`, await encodeMp4(a, LP, { W: 1920, H: 1080, fps: 30, bg: on, onProgress: (p) => tick(`${l.name}: video`, p) })); n++;
        tick(`${l.name}: transparent video`); await toPkg(`${base}-transparent.webm`, await encodeWebm(a, LP, { W: 1920, H: 1080, fps: 30, bg: null, onProgress: (p) => tick(`${l.name}: transparent video`, p) })); n++;
        tick(`${l.name}: Lottie`); await toPkg(`${base}.json`, new Blob([JSON.stringify(toLottie(a, LP, { frame: 'logo', bg: null, title: `${client} ${l.name}` }))], { type: 'application/json' })); n++;
        tick(`${l.name}: SVG`); await toPkg(`${base}.svg`, new Blob([toSVG(a, LP, { frame: 'logo', bg: null, loop: true, title: `${client} ${l.name}` })], { type: 'image/svg+xml' })); n++;
      }
      setExp(null); setToast(`${list.length === 1 ? list[0].name : `${list.length} logos`} added to Motion logos in ${client}’s Resources: MP4, transparent video, Lottie and SVG.`);
    } catch (e) { setExp(null); setToast((e as Error).message); }
  };
  const draft = async (kind: 'mp4' | 'lottie' | 'page') => {
    setMenu(false); setExp({ p: 0.3, note: kind === 'page' ? 'Building the review page' : 'Rendering' });
    try {
      if (kind === 'page') {
        const items = await Promise.all(logos.map(async (l) => { const a = await artworkOf(l.url); const on = a.tone === 'dark' ? pair.light : pair.dark; return `<figure style="background:${on}"><div>${toSVG(a, presetFor(m, l.path), { frame: 'logo', bg: null, loop: true, title: l.name })}</div><figcaption>${l.name}</figcaption></figure>`; }));
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${client} motion, for review</title><style>body{margin:0;padding:48px;font:14px/1.5 system-ui,sans-serif;background:#f4f3ef;color:#111}h1{font-size:28px;margin:0 0 6px}p{max-width:720px;color:#555}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;margin-top:32px}figure{margin:0;border-radius:10px;aspect-ratio:16/9;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative}figure div{width:62%}figure svg{width:100%;height:auto;display:block}figcaption{position:absolute;left:12px;bottom:8px;font-size:11px;color:#888;text-transform:capitalize}</style></head><body><h1>${client} motion</h1><p>${(m.brief || '').replace(/</g, '&lt;')}</p><p><strong>Logos:</strong> ${describe(m.logo)}<br><strong>Type:</strong> ${describe(m.type)}<br><strong>Ease:</strong> ${easeName(m.logo.ease)}, cubic-bezier(${m.logo.ease.join(', ')})</p><p>Draft for review, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Lost Property Studio.</p><main>${items.join('')}</main></body></html>`;
        download(`${kebab(client)}-motion-review.html`, new Blob([html], { type: 'text/html' }));
      } else if (logo && art) {
        const LP = presetFor(m, logo.path);
        if (kind === 'mp4') download(`${kebab(logo.name)}-draft.mp4`, await encodeMp4(art, LP, { W: 1920, H: 1080, fps: 30, bg: bg || (art.tone === 'dark' ? pair.light : pair.dark), onProgress: (p) => setExp({ p, note: 'Rendering' }) }));
        else download(`${kebab(logo.name)}-draft.json`, new Blob([JSON.stringify(toLottie(art, LP, { frame: 'logo', bg: null, title: logo.name }))], { type: 'application/json' }));
      }
    } catch (e) { setToast((e as Error).message); }
    setExp(null);
  };
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [menu]);

  return <div className="mk">
    <header className="mk-top">
      <strong>Motion</strong><span className="mute">/</span><span className="mk-crumb">{sel.kind === 'type' ? font?.name || 'Type' : logo?.name || 'Motion'}</span>
      <span className={'mo-pill' + (isLive ? ' live' : '')}>{live ? (isLive ? `Live · version ${live.version}` : `Draft · version ${live.version} is live`) : 'Draft'}</span>
      {status ? <span className="mute mo-status" role="status">{status}</span> : null}
      <span className="mo-sp" />
      <button className="btn mo-ic" onClick={() => { setM(undo[0]); setUndo((u) => u.slice(1)); }} disabled={!undo.length} aria-label="Undo" title="Undo"><Undo2 {...I} /></button>
      <button className="btn" onClick={() => setImporting(true)}><Upload {...I} />Import</button>
      <span className="mk-exp">
        <button className="btn solid" onClick={() => setMenu(!menu)} aria-expanded={menu} disabled={!!exp}>{exp ? <Loader2 size={14} className="spin" aria-hidden /> : <Package {...I} />}Export<ChevronDown size={13} aria-hidden /></button>
        {menu ? <div className="mk-menu" role="menu" onMouseLeave={() => setMenu(false)}>
          <p className="mk-mh">Add to {client}’s Motion logos</p>
          <button role="menuitem" onClick={() => logo && toPackage([logo])} disabled={!logo}><Package {...I} /><span><b>{logo ? logo.name : 'This logo'}</b><span className="mute">{logo ? 'MP4, transparent video, Lottie and SVG, in Resources' : 'Pick a logo on the left'}</span></span></button>
          <button role="menuitem" onClick={() => toPackage(logos)} disabled={!logos.length}><Layers {...I} /><span><b>Every logo</b><span className="mute">{logos.length} logo{logos.length === 1 ? '' : 's'}, each in its own motion</span></span></button>
          <p className="mk-mh">Download a draft</p>
          <button role="menuitem" onClick={() => draft('mp4')} disabled={!logo || !art}><Film {...I} /><span><b>MP4</b><span className="mute">This logo, on the stage colour</span></span></button>
          <button role="menuitem" onClick={() => draft('lottie')} disabled={!logo || !art}><Download {...I} /><span><b>Lottie</b><span className="mute">This logo</span></span></button>
          <button role="menuitem" onClick={() => draft('page')} disabled={!logos.length}><FileCode2 {...I} /><span><b>Review page</b><span className="mute">Every logo moving, to share</span></span></button>
          <p className="mk-mh">Make it the brand’s motion</p>
          <button role="menuitem" onClick={() => { setMenu(false); setPublishing(true); }}><Send {...I} /><span><b>{live ? `Publish version ${live.version + 1}` : 'Publish'}</b><span className="mute">Package, guidelines chapter, design tokens and AI{canSubmit ? '' : ' · leads only'}</span></span></button>
        </div> : null}
      </span>
    </header>
    {exp ? <div className="mk-prog"><i style={{ width: `${Math.round(exp.p * 100)}%` }} /></div> : null}

    <div className="mk-body">
      <aside className="mk-side" aria-label="What moves">
        <p className="mo-h">Logos</p>
        {!logos.length ? <p className="mute mo-none">No SVG logos yet. Add them in Resources → Logos.</p> : null}
        {logos.map((l) => <button key={l.path} className={'mo-it' + (sel.kind === 'logo' && sel.path === l.path ? ' on' : '')} onClick={() => setSel({ kind: 'logo', path: l.path })}>
          <span className="mo-th"><img src={l.url} alt="" /></span><span className="mo-it-t">{l.name}</span>{m.perLogo?.[l.path] && Object.keys(m.perLogo[l.path]).length ? <span className="mo-dot" title="Has its own changes" /> : null}</button>)}
        <p className="mo-h">Type</p>
        {!fonts.length ? <p className="mute mo-none">No typefaces yet.</p> : null}
        {fonts.map((f) => <button key={f.role} className={'mo-it' + (sel.kind === 'type' && sel.role === f.role ? ' on' : '')} onClick={() => setSel({ kind: 'type', role: f.role })}><span className="mo-th mo-th-t" style={{ fontFamily: f.css }}>Aa</span><span className="mo-it-t">{f.name}<span className="mute"> · {f.label}</span></span>{m.typeBy?.[f.role] && Object.keys(m.typeBy[f.role]).length ? <span className="mo-dot" title="Has its own changes" /> : null}</button>)}
      </aside>

      <section className="mk-main">
        <div className={'mk-stage' + (bg ? '' : ' clear')} style={{ background: bg || undefined }}>
          {sel.kind === 'logo' ? (artErr ? <p className="mo-err">{artErr}</p> : <canvas ref={cv} />) : <div className="mo-type"><TypeStage text={sample} P={P as TypePreset} t={t} font={font?.css} colour={bg && lum(bg) < 0.5 ? pair.light : pair.dark} size={56} /></div>}
          {busy ? <span className="mk-busy"><Loader2 size={13} className="spin" aria-hidden />{mode === 'new' ? 'Finding directions' : 'Changing the motion'}</span> : null}
        </div>
        <div className="mo-transport">
          <button className="btn solid mo-ic" onClick={() => { if (!playing && t >= T) setT(0); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause {...I} /> : <Play {...I} />}</button>
          <button className="btn mo-ic" onClick={replay} aria-label="From the start"><RotateCcw {...I} /></button>
          <input type="range" min={0} max={1000} value={Math.round(t / T * 1000)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000 * T); }} aria-label="Scrub" />
          <span className="mute mo-time">{(t / 1000).toFixed(2)} / {(T / 1000).toFixed(2)} s</span>
          <button className={'btn mo-ic' + (loop ? ' on' : '')} aria-pressed={loop} onClick={() => setLoop(!loop)} aria-label="Loop"><Repeat {...I} /></button>
          <span className="mo-sw" role="group" aria-label="Background">
            <button className={'mo-swb none' + (bg === null ? ' on' : '')} onClick={() => setBg(null)} title="Transparent" aria-label="Transparent" />
            {[...new Set([pair.light, pair.dark, ...colours.map((c) => c.hex)])].slice(0, 7).map((h) => <button key={h} className={'mo-swb' + (bg === h ? ' on' : '')} style={{ background: h }} onClick={() => setBg(h)} title={colours.find((c) => c.hex === h)?.name || h} aria-label={colours.find((c) => c.hex === h)?.name || h} />)}
          </span>
        </div>
        {sel.kind === 'type' ? <label className="mo-sample"><span className="mute">Sample</span><input value={sample} onChange={(e) => setSample(e.target.value)} /></label> : null}

        {dirs.length ? <div className="mk-dirs">{dirs.map((d, i) => <button key={d.name + i} className="mk-dir" onClick={() => pickDir(d)}>
          <Mini logo={logos[0]} font={logos[0] ? undefined : fonts[0]} P={d.logo} T={d.type} pair={pair} label={`Welcome to ${client}`} />
          <strong>{d.name}</strong><span className="mute">{d.about}</span></button>)}
          <button className="mo-x mk-dirs-x" onClick={() => setDirs([])} aria-label="Close directions"><X size={13} aria-hidden /></button></div> : null}

        <form className="mk-prompt" onSubmit={(e) => { e.preventDefault(); generate(prompt); }}>
          {lastReply && !busy ? <p className="mk-reply"><Sparkles size={12} aria-hidden />{lastReply.text}</p> : null}
          <div className="mk-in">
            <Wand2 {...I} />
            <textarea rows={1} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy}
              placeholder={mode === 'new' ? `Describe how ${client} should move, and Claude will make three directions` : `Say what to change on ${sel.kind === 'type' ? 'this typeface' : own ? 'this logo' : 'every logo'}, e.g. “the build feels rushed”`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(prompt); } }} />
            <button className="btn solid mo-ic" disabled={busy || !prompt.trim()} aria-label="Generate">{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <ArrowUp {...I} />}</button>
          </div>
          <div className="mk-pb">
            <div className="mo-seg" role="radiogroup" aria-label="Prompt makes">
              <button type="button" role="radio" aria-checked={mode === 'refine'} onClick={() => setMode('refine')}>Refine this</button>
              <button type="button" role="radio" aria-checked={mode === 'new'} onClick={() => setMode('new')}>New directions</button>
            </div>
            {!prompt ? <div className="mo-chips">{ideas.map((x) => <button type="button" key={x} className="mo-chip" onClick={() => generate(x)} disabled={busy}>{x}</button>)}</div> : null}
          </div>
        </form>

        {tl ? <div className="mo-lanes">
          {tl.parts.map((p, i) => <div key={i} className="mo-lane"><span className="mute">Part {i + 1}</span><div><i style={{ left: `${p.spans.in[0] / T * 100}%`, width: `${(p.spans.in[1] - p.spans.in[0]) / T * 100}%` }} />{p.spans.out ? <i className="out" style={{ left: `${p.spans.out[0] / T * 100}%`, width: `${(p.spans.out[1] - p.spans.out[0]) / T * 100}%` }} /> : null}<b style={{ left: `${t / T * 100}%` }} /></div></div>)}
          <p className="mute mo-fit">{describe(P)}</p>
        </div> : <p className="mute mo-fit">{describe(P)}</p>}
      </section>

      <aside className="mk-panel" aria-label="Settings">
        {(sel.kind === 'logo' || fonts.length > 1) ? <div className="mo-sec"><div className="mo-seg" role="radiogroup" aria-label="Changes apply to">
          <button role="radio" aria-checked={!own} onClick={() => setOwn(false)}>{sel.kind === 'logo' ? 'All logos' : 'All type'}</button>
          <button role="radio" aria-checked={own} onClick={() => setOwn(true)}>{sel.kind === 'logo' ? 'Just this logo' : 'Just this typeface'}</button>
        </div>{own && hasOwn ? <button className="mo-link" onClick={() => edit((x) => sel.kind === 'logo' ? { ...x, perLogo: Object.fromEntries(Object.entries(x.perLogo || {}).filter(([k]) => k !== key)) } : { ...x, typeBy: Object.fromEntries(Object.entries(x.typeBy || {}).filter(([k]) => k !== key)) })}>Go back to the brand’s</button> : null}</div> : null}
        <Settings P={P} type={sel.kind === 'type'} set={(x) => { setP(x); }} controls={ALL} />
      </aside>
    </div>

    {toast ? <div className="mk-toast" role="status"><Check size={14} aria-hidden /><span>{toast}</span><button className="mo-x" onClick={() => setToast('')} aria-label="Close"><X size={12} aria-hidden /></button></div> : null}

    {publishing ? <div className="mo-modal" role="dialog" aria-modal="true" aria-label="Publish motion" onClick={(e) => { if (e.target === e.currentTarget) setPublishing(false); }}>
      <div className="mo-modal-b mk-pub"><Submit projectId={projectId} client={client} m={m} saveNow={saveNow} logos={logos} fonts={fonts} pair={pair} live={live} canSubmit={canSubmit} onBack={() => setPublishing(false)}
        setM={(x) => { savedJson.current = JSON.stringify(x); setM(x); setLive({ version: x.version || 1, submittedAt: x.submittedAt, submittedBy: x.submittedBy }); }} /></div>
    </div> : null}
    {importing ? <Import projectId={projectId} logos={logos} fonts={fonts} onClose={() => setImporting(false)}
      onDone={(r, approved) => {
        edit((x) => ({ ...x, logo: r.logo, type: r.type, perLogo: {}, typeBy: {}, controls: r.controls, note: r.summary, source: { kind: r.kind, name: r.name, at: new Date().toISOString() } }));
        setMsgs((x) => [...x, { role: 'assistant', text: `Imported from ${r.name}. ${r.summary}${r.unsure ? ` Not sure about: ${r.unsure}` : ''}` }]);
        setImporting(false); setMode('refine'); replay(); if (approved) setPublishing(true);
      }} /> : null}
  </div>;
}
