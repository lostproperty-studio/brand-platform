'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, FileCode2, Film, Loader2, Pause, Play, Repeat, RotateCcw, Send, Sparkles, Undo2, Upload, X } from 'lucide-react';
import { buildTimeline, bezier, channels, CONTROLS, DEFAULT_CONTROLS, describe, easeName, EASES, presetFor, typeFor, type BrandMotion, type Control, type Ease, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { drawFrame, encodeMp4, encodeWebm, toLottie, toSVG, type Artwork } from '@/lib/motion/render';
import { TypeStage } from '@/components/motion/TypeStage';
import { LogoMotion, artworkOf } from '@/components/motion/LogoMotion';

// The studio's Motion tab, as a workflow:
//   1 Choose    which logos and typefaces get behaviours
//   2 Describe  say how it should feel; Claude offers three directions, moving on the chosen assets, and asks which
//               qualities to play with
//   3 Explore   tune it by hand or with Claude, with only the chosen qualities as controls; export examples to review
//   4 Submit    a project lead approves it: the motion package goes to Resources, a Motion chapter is drafted in the
//               guidelines, and the design system and AI pick up the eases and timings
// Or Import motion built off the platform: an HTML motion kit, or a video to match. Everything before Submit is a
// draft only the studio sees.

export type MotionLogo = { path: string; name: string; url: string };
export type MotionFont = { role: string; label: string; name: string; css: string };
type Step = 'choose' | 'describe' | 'explore' | 'submit';
type Sel = { kind: 'logo'; path: string } | { kind: 'type'; role: string };
export type Msg = { role: 'user' | 'assistant'; text: string };
export type Patch = Partial<Omit<MotionPreset, 'split'>> & { split?: MotionPreset['split'] | TypePreset['split'] };
export type Direction = { name: string; about: string; logo: MotionPreset; type: TypePreset; controls: Control[] };
export const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
export const kebab = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const lum = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const STEPS: { id: Step; label: string }[] = [{ id: 'choose', label: 'Choose' }, { id: 'describe', label: 'Describe' }, { id: 'explore', label: 'Explore' }, { id: 'submit', label: 'Submit' }];
export const download = (name: string, blob: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
export const post = async (url: string, body: object, method = 'POST') => { const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null); if (!r) throw new Error('You seem to be offline. Try again.'); const txt = await r.text(); let j: Record<string, any> = {}; try { j = JSON.parse(txt); } catch { /* a plain message */ } if (!r.ok) throw new Error(j.error || txt.slice(0, 200) || 'That didn’t work. Try again.'); return j; }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A clock that loops a length (ms) */
export function useLoop(T: number, on = true) {
  const [t, setT] = useState(0);
  useEffect(() => { if (!on) return; let raf = 0; const t0 = performance.now(); const tick = (n: number) => { setT((n - t0) % (T + 700)); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [T, on]);
  return Math.min(t, T);
}

export function MotionStudio({ projectId, client, logos, fonts, colours, motion: initial, live: live0, canSubmit }: { projectId: string; client: string; logos: MotionLogo[]; fonts: MotionFont[]; colours: { name: string; hex: string }[]; motion: BrandMotion; live: { version: number; submittedAt?: string; submittedBy?: string } | null; canSubmit: boolean }) {
  const [m, setM] = useState<BrandMotion>(initial);
  const [live, setLive] = useState(live0);
  const [step, setStep] = useState<Step>(!initial.assets ? 'choose' : !initial.source ? 'describe' : 'explore');
  const [status, setStatus] = useState('');
  const [undo, setUndo] = useState<BrandMotion[]>([]);
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<{ title: string; text: string } | null>(null);
  const pair = useMemo(() => { const c = colours.filter((x) => /^#[0-9a-f]{6}/i.test(x.hex)).sort((a, b) => lum(a.hex) - lum(b.hex)); return { dark: c[0]?.hex || '#111111', light: c[c.length - 1]?.hex || '#ffffff' }; }, [colours]);
  const chosenLogos = useMemo(() => logos.filter((l) => m.assets?.logos.includes(l.path)), [logos, m.assets]);
  const chosenFonts = useMemo(() => fonts.filter((f) => m.assets?.fonts.includes(f.role)), [fonts, m.assets]);
  const changed = JSON.stringify(m) !== JSON.stringify(initial);

  // Every change is saved as a draft, a moment after it's made
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedJson = useRef(JSON.stringify(initial));
  const saveNow = useCallback(async (x: BrandMotion) => {
    const json = JSON.stringify(x); if (json === savedJson.current) return x;
    setStatus('Saving…');
    try {
      const j = await post(`/api/projects/${projectId}/motion`, { logo: x.logo, type: x.type, perLogo: x.perLogo || {}, typeBy: x.typeBy || {}, assets: x.assets, brief: x.brief, note: x.note, controls: x.controls, source: x.source, builtAt: x.builtAt }, 'PUT');
      savedJson.current = json; setStatus('Draft saved'); return j.motion as BrandMotion;
    } catch (e) { setStatus((e as Error).message); return x; }
  }, [projectId]);
  useEffect(() => { if (!changed) return; if (saving.current) clearTimeout(saving.current); saving.current = setTimeout(() => saveNow(m), 1200); return () => { if (saving.current) clearTimeout(saving.current); }; }, [m]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (fn: (x: BrandMotion) => BrandMotion) => { setUndo((u) => [m, ...u].slice(0, 40)); setM(fn); };

  const done = (s: Step) => s === 'choose' ? !!m.assets : s === 'describe' ? !!m.source : s === 'explore' ? !!m.source : !!live && m.version === live.version && m.submittedAt === live.submittedAt;
  const isLive = !!live && m.submittedAt === live.submittedAt && savedJson.current === JSON.stringify(m);

  return <div className="mo-flow">
    <header className="mo-flow-top">
      <ol className="mo-steps" aria-label="Steps">{STEPS.map((s, i) => <li key={s.id}><button className={step === s.id ? 'on' : done(s.id) ? 'done' : ''} onClick={() => setStep(s.id)} disabled={s.id !== 'choose' && !m.assets}>
        <span className="mo-step-n">{done(s.id) && step !== s.id ? <Check size={11} aria-hidden /> : i + 1}</span>{s.label}</button></li>)}</ol>
      <span className="mo-sp" />
      <span className={'mo-pill' + (isLive ? ' live' : '')}>{live ? (isLive ? `Live · version ${live.version}` : `Draft · version ${live.version} is live`) : 'Draft · nothing submitted yet'}</span>
      {status ? <span className="mute mo-status" role="status">{status}</span> : null}
      {undo.length && step === 'explore' ? <button className="btn" onClick={() => { setM(undo[0]); setUndo((u) => u.slice(1)); }}><Undo2 {...I} />Undo</button> : null}
      <button className="btn" onClick={() => setImporting(true)}><Upload {...I} />Import</button>
    </header>

    {step === 'choose' ? <Choose logos={logos} fonts={fonts} m={m} pair={pair} onNext={(assets) => { edit((x) => ({ ...x, assets })); setStep(m.source ? 'explore' : 'describe'); }} /> : null}
    {step === 'describe' ? <Describe projectId={projectId} client={client} m={m} logos={chosenLogos} fonts={chosenFonts} pair={pair}
      onPick={(d, controls, brief) => { edit((x) => ({ ...x, logo: d.logo, type: d.type, perLogo: {}, typeBy: {}, controls, brief, note: `${d.name}: ${d.about}`, source: { kind: 'claude', name: d.name, at: new Date().toISOString() } })); setBanner(null); setStep('explore'); }}
      onImport={() => setImporting(true)} /> : null}
    {step === 'explore' ? <Explore projectId={projectId} client={client} m={m} edit={edit} logos={chosenLogos} fonts={chosenFonts} colours={colours} pair={pair} banner={banner} closeBanner={() => setBanner(null)} onNext={() => setStep('submit')} /> : null}
    {step === 'submit' ? <Submit projectId={projectId} client={client} m={m} setM={(x) => { savedJson.current = JSON.stringify(x); setM(x); setLive({ version: x.version || 1, submittedAt: x.submittedAt, submittedBy: x.submittedBy }); }} saveNow={saveNow} logos={chosenLogos} fonts={chosenFonts} pair={pair} live={live} canSubmit={canSubmit} onBack={() => setStep('explore')} /> : null}

    {importing ? <Import projectId={projectId} logos={chosenLogos.length ? chosenLogos : logos} fonts={chosenFonts.length ? chosenFonts : fonts} onClose={() => setImporting(false)}
      onDone={(r, approved) => {
        edit((x) => ({ ...x, logo: r.logo, type: r.type, perLogo: {}, typeBy: {}, controls: r.controls.length ? r.controls : DEFAULT_CONTROLS, note: r.summary, source: { kind: r.kind, name: r.name, at: new Date().toISOString() },
          assets: x.assets || { logos: logos.map((l) => l.path), fonts: fonts.map((f) => f.role) } }));
        setBanner({ title: `Imported from ${r.name}`, text: r.summary + (r.unsure ? ` Not sure about: ${r.unsure}` : '') });
        setImporting(false); setStep(approved ? 'submit' : 'explore');
      }} /> : null}
  </div>;
}

// ---------- 1 Choose

function Choose({ logos, fonts, m, pair, onNext }: { logos: MotionLogo[]; fonts: MotionFont[]; m: BrandMotion; pair: { dark: string; light: string }; onNext: (a: { logos: string[]; fonts: string[] }) => void }) {
  const [L, setL] = useState<string[]>(m.assets?.logos ?? logos.map((l) => l.path));
  const [F, setF] = useState<string[]>(m.assets?.fonts ?? fonts.slice(0, 1).map((f) => f.role));
  const flip = (list: string[], set: (x: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return <section className="mo-pane">
    <div className="mo-pane-h"><h2>What should move?</h2><p className="mute">Choose the logos and typefaces to give behaviours to. You can change this later.</p></div>
    <div className="mo-group-h"><strong>Logos</strong><span className="mute">{L.length} of {logos.length}</span><button className="mo-link" onClick={() => setL(L.length === logos.length ? [] : logos.map((l) => l.path))}>{L.length === logos.length ? 'Select none' : 'Select all'}</button></div>
    {!logos.length ? <p className="mute">No SVG logos yet. They arrive from the Figma import, or add them in Resources → Logos.</p> : null}
    <div className="mo-pick">{logos.map((l) => { const on = L.includes(l.path); return <button key={l.path} className={'mo-pickc' + (on ? ' on' : '')} aria-pressed={on} onClick={() => flip(L, setL, l.path)}>
      <span className="mo-pickf" style={{ background: /white|light|reverse|negative|inverse/i.test(l.path) ? pair.dark : pair.light }}><img src={l.url} alt="" /></span>
      <span className="mo-pickn"><span className="mo-tick">{on ? <Check size={11} aria-hidden /> : null}</span>{l.name}</span></button>; })}</div>
    <div className="mo-group-h"><strong>Typefaces</strong><span className="mute">{F.length} of {fonts.length}</span></div>
    {!fonts.length ? <p className="mute">No typefaces on the project yet. Add them in the Typefaces tab.</p> : null}
    <div className="mo-pick fonts">{fonts.map((f) => { const on = F.includes(f.role); return <button key={f.role} className={'mo-pickc' + (on ? ' on' : '')} aria-pressed={on} onClick={() => flip(F, setF, f.role)}>
      <span className="mo-pickf type" style={{ fontFamily: f.css }}>Aa Bb</span>
      <span className="mo-pickn"><span className="mo-tick">{on ? <Check size={11} aria-hidden /> : null}</span>{f.name}<span className="mute"> · {f.label}</span></span></button>; })}</div>
    <div className="mo-pane-foot"><button className="btn solid" disabled={!L.length && !F.length} onClick={() => onNext({ logos: L, fonts: F })}>Continue<ArrowRight {...I} /></button></div>
  </section>;
}

// ---------- 2 Describe

/** A small stage with a logo or a line of type moving in a preset, on a loop */
export function Mini({ logo, font, P, T, pair, label }: { logo?: MotionLogo; font?: MotionFont; P: MotionPreset; T: TypePreset; pair: { dark: string; light: string }; label?: string }) {
  const t = useLoop(Math.max(P.length, T.length) * 1000);
  const dark = logo ? /white|light|reverse|negative|inverse/i.test(logo.path) : true;
  return <span className="mo-mini" style={{ background: dark ? pair.dark : pair.light }}>
    {logo ? <LogoMotion url={logo.url} P={{ ...P, scale: 62 }} t={t} /> : null}
    {font ? <span className="mo-mini-t"><TypeStage text={label || 'Arrives like this'} P={T} t={t} font={font.css} colour={dark ? pair.light : pair.dark} size={17} align="centre" /></span> : null}
  </span>;
}

function Describe({ projectId, client, m, logos, fonts, pair, onPick, onImport }: { projectId: string; client: string; m: BrandMotion; logos: MotionLogo[]; fonts: MotionFont[]; pair: { dark: string; light: string }; onPick: (d: Direction, controls: Control[], brief: string) => void; onImport: () => void }) {
  const [brief, setBrief] = useState(m.brief || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [question, setQuestion] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const [controls, setControls] = useState<Control[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const ask = async () => {
    setBusy(true); setErr('');
    try {
      const parts = await Promise.all(logos.slice(0, 12).map(async (l) => ({ name: l.name, parts: (await artworkOf(l.url).catch(() => null))?.rects.length || 1 })));
      const j = await post(`/api/projects/${projectId}/motion/directions`, { brief, logos: parts, fonts: fonts.map((f) => ({ role: f.role, name: f.name })), previous: shown });
      setDirs(j.directions); setQuestion(j.question); setPick(null); setShown((s) => [...s, ...j.directions.map((d: Direction) => `${d.name}: ${d.about}`)].slice(-9));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const choose = (i: number) => { setPick(i); setControls(dirs[i].controls.length ? dirs[i].controls : DEFAULT_CONTROLS); };
  const ideas = ['Confident and architectural, like doors sliding open', 'Quiet and warm, things settle into place', 'Hand-drawn, the mark sketches itself', 'Sharp and fast, editorial'];
  const sample = logos[0], font = fonts[0];
  return <section className="mo-pane">
    <div className="mo-pane-h"><h2>How should {client} move?</h2><p className="mute">Describe the feel in your own words. Claude will set out three directions on {logos.length ? `the ${logos.length} logo${logos.length === 1 ? '' : 's'}` : 'the type'} you chose.</p></div>
    <div className="mo-brief">
      <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Calm, assured, a little cinematic. The tiles should feel like they’re being laid one by one." onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && brief.trim()) ask(); }} />
      <div className="mo-brief-b">
        {!brief ? <div className="mo-chips">{ideas.map((x) => <button key={x} className="mo-chip" onClick={() => setBrief(x)}>{x}</button>)}</div> : <span />}
        <button className="btn solid" onClick={ask} disabled={busy || brief.trim().length < 2}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Sparkles {...I} />}{dirs.length ? 'Three more' : 'Suggest directions'}</button>
      </div>
      {err ? <p className="mo-err" role="alert">{err}</p> : null}
    </div>
    {dirs.length ? <>
      <div className="mo-dirs">{dirs.map((d, i) => <button key={d.name + i} className={'mo-dir' + (pick === i ? ' on' : '')} onClick={() => choose(i)} aria-pressed={pick === i}>
        <Mini logo={sample} font={sample ? undefined : font} P={d.logo} T={d.type} pair={pair} />
        {sample && font ? <Mini font={font} P={d.logo} T={d.type} pair={pair} label={`Welcome to ${client}`} /> : null}
        <strong>{d.name}</strong><span className="mute">{d.about}</span><span className="mo-dir-d mute">{describe(d.logo)}</span>
      </button>)}</div>
      {pick !== null ? <div className="mo-q">
        <p><Sparkles size={13} aria-hidden /> {question}</p>
        <div className="mo-chips">{CONTROLS.map((c) => { const on = controls.includes(c.id); return <button key={c.id} className={'mo-chip' + (on ? ' on' : '')} aria-pressed={on} title={c.about} onClick={() => setControls(on ? controls.filter((x) => x !== c.id) : [...controls, c.id])}>{c.label}</button>; })}</div>
        <div className="mo-pane-foot"><button className="btn solid" onClick={() => onPick(dirs[pick], controls, brief)}>Explore {dirs[pick].name}<ArrowRight {...I} /></button></div>
      </div> : <p className="mute mo-hint">Pick the closest, then choose what to play with.</p>}
    </> : <p className="mute mo-hint">Already approved this off the platform? <button className="mo-link" onClick={onImport}>Import a motion kit or a video</button>.</p>}
  </section>;
}

// ---------- 3 Explore

function Explore({ projectId, client, m, edit, logos, fonts, colours, pair, banner, closeBanner, onNext }: { projectId: string; client: string; m: BrandMotion; edit: (fn: (x: BrandMotion) => BrandMotion) => void; logos: MotionLogo[]; fonts: MotionFont[]; colours: { name: string; hex: string }[]; pair: { dark: string; light: string }; banner: { title: string; text: string } | null; closeBanner: () => void; onNext: () => void }) {
  const [sel, setSel] = useState<Sel>(logos[0] ? { kind: 'logo', path: logos[0].path } : { kind: 'type', role: fonts[0]?.role || 'display' });
  const [own, setOwn] = useState(false);
  const [art, setArt] = useState<Artwork | null>(null);
  const [artErr, setArtErr] = useState('');
  const [bg, setBg] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [sample, setSample] = useState(`Welcome to ${client}`);
  const [busy, setBusy] = useState('');
  const logo = sel.kind === 'logo' ? logos.find((l) => l.path === sel.path) : undefined;
  const font = sel.kind === 'type' ? fonts.find((f) => f.role === sel.role) : undefined;
  const key = sel.kind === 'logo' ? sel.path : sel.role;
  const ownMap = sel.kind === 'logo' ? m.perLogo : m.typeBy;
  const hasOwn = !!(ownMap?.[key] && Object.keys(ownMap[key]).length);
  useEffect(() => { setOwn(hasOwn); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const P: MotionPreset | TypePreset = sel.kind === 'type' ? typeFor(m, sel.role) : presetFor(m, logo?.path);
  const controls = m.controls?.length ? m.controls : DEFAULT_CONTROLS;
  const setP = (x: Patch) => edit((cur) => {
    if (sel.kind === 'type') return own && fonts.length > 1 ? { ...cur, typeBy: { ...cur.typeBy, [sel.role]: { ...(cur.typeBy?.[sel.role] || {}), ...x } as Partial<TypePreset> } } : { ...cur, type: { ...cur.type, ...x } as TypePreset };
    if (own && logo) return { ...cur, perLogo: { ...cur.perLogo, [logo.path]: { ...(cur.perLogo?.[logo.path] || {}), ...x } as Partial<MotionPreset> } };
    return { ...cur, logo: { ...cur.logo, ...x } as MotionPreset };
  });

  useEffect(() => {
    if (!logo) { setArt(null); return; }
    let live = true; setArt(null); setArtErr('');
    artworkOf(logo.url).then((a) => { if (live) { setArt(a); setBg(a.tone === 'dark' ? pair.light : pair.dark); } }).catch((e) => live && setArtErr(e.message));
    return () => { live = false; };
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

  // Examples to review: this logo as a video or Lottie, or a page of every logo moving
  const example = async (kind: 'mp4' | 'lottie' | 'page') => {
    setBusy(kind);
    try {
      if (kind === 'page') {
        const items = await Promise.all(logos.map(async (l) => { const a = await artworkOf(l.url); const on = a.tone === 'dark' ? pair.light : pair.dark; return `<figure style="background:${on}"><div>${toSVG(a, presetFor(m, l.path), { frame: 'logo', bg: null, loop: true, title: l.name })}</div><figcaption>${l.name}</figcaption></figure>`; }));
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${client} motion, for review</title><style>body{margin:0;padding:48px;font:14px/1.5 system-ui,sans-serif;background:#f4f3ef;color:#111}h1{font-size:28px;margin:0 0 6px}p{max-width:720px;color:#555}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;margin-top:32px}figure{margin:0;border-radius:10px;aspect-ratio:16/9;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative}figure div{width:62%}figure svg{width:100%;height:auto;display:block}figcaption{position:absolute;left:12px;bottom:8px;font-size:11px;color:#888;text-transform:capitalize}</style></head><body><h1>${client} motion</h1><p>${(m.brief || '').replace(/</g, '&lt;')}</p><p><strong>Logos:</strong> ${describe(m.logo)}<br><strong>Type:</strong> ${describe(m.type)}<br><strong>Ease:</strong> ${easeName(m.logo.ease)}, cubic-bezier(${m.logo.ease.join(', ')})</p><p>Draft for review, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Lost Property Studio.</p><main>${items.join('')}</main></body></html>`;
        download(`${kebab(client)}-motion-review.html`, new Blob([html], { type: 'text/html' }));
      } else if (logo && art) {
        const LP = presetFor(m, logo.path);
        if (kind === 'mp4') download(`${kebab(logo.name)}-draft.mp4`, await encodeMp4(art, LP, { W: 1920, H: 1080, fps: 30, bg: bg || (art.tone === 'dark' ? pair.light : pair.dark) }));
        else download(`${kebab(logo.name)}-draft.json`, new Blob([JSON.stringify(toLottie(art, LP, { frame: 'logo', bg: null, title: logo.name }))], { type: 'application/json' }));
      }
    } catch (e) { alert((e as Error).message); }
    setBusy('');
  };

  return <div className="mo">
    <aside className="mo-side" aria-label="What moves">
      <p className="mo-h">Logos</p>
      {!logos.length ? <p className="mute mo-none">None chosen.</p> : null}
      {logos.map((l) => <button key={l.path} className={'mo-it' + (sel.kind === 'logo' && sel.path === l.path ? ' on' : '')} onClick={() => setSel({ kind: 'logo', path: l.path })}>
        <span className="mo-th"><img src={l.url} alt="" /></span><span className="mo-it-t">{l.name}</span>{m.perLogo?.[l.path] && Object.keys(m.perLogo[l.path]).length ? <span className="mo-dot" title="Has its own changes" /> : null}</button>)}
      <p className="mo-h">Type</p>
      {!fonts.length ? <p className="mute mo-none">None chosen.</p> : null}
      {fonts.map((f) => <button key={f.role} className={'mo-it' + (sel.kind === 'type' && sel.role === f.role ? ' on' : '')} onClick={() => setSel({ kind: 'type', role: f.role })}><span className="mo-th mo-th-t" style={{ fontFamily: f.css }}>Aa</span><span className="mo-it-t">{f.name}<span className="mute"> · {f.label}</span></span>{m.typeBy?.[f.role] && Object.keys(m.typeBy[f.role]).length ? <span className="mo-dot" title="Has its own changes" /> : null}</button>)}
    </aside>

    <section className="mo-main">
      {banner ? <div className="mo-banner"><FileCode2 {...I} /><div><strong>{banner.title}</strong><p>{banner.text}</p></div><button className="mo-x" onClick={closeBanner} aria-label="Close"><X size={13} aria-hidden /></button></div> : null}
      <header className="mo-top">
        <div><h2>{sel.kind === 'type' ? font?.name || 'Type' : logo?.name || 'Motion'}</h2><p className="mute">{describe(P)}</p></div>
      </header>
      <div className={'mo-stage' + (bg ? '' : ' clear')} style={{ background: bg || undefined }}>
        {sel.kind === 'logo' ? (artErr ? <p className="mo-err">{artErr}</p> : <canvas ref={cv} />) : <div className="mo-type"><TypeStage text={sample} P={P as TypePreset} t={t} font={font?.css} colour={bg && lum(bg) < 0.5 ? pair.light : pair.dark} size={56} /></div>}
      </div>
      <div className="mo-transport">
        <button className="btn solid mo-ic" onClick={() => { if (!playing && t >= T) setT(0); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause {...I} /> : <Play {...I} />}</button>
        <button className="btn mo-ic" onClick={() => { setT(0); setPlaying(true); }} aria-label="From the start"><RotateCcw {...I} /></button>
        <input type="range" min={0} max={1000} value={Math.round(t / T * 1000)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000 * T); }} aria-label="Scrub" />
        <span className="mute mo-time">{(t / 1000).toFixed(2)} / {(T / 1000).toFixed(2)} s</span>
        <button className={'btn mo-ic' + (loop ? ' on' : '')} aria-pressed={loop} onClick={() => setLoop(!loop)} aria-label="Loop"><Repeat {...I} /></button>
        <span className="mo-sw" role="group" aria-label="Background">
          <button className={'mo-swb none' + (bg === null ? ' on' : '')} onClick={() => setBg(null)} title="Transparent" aria-label="Transparent" />
          {[...new Set([pair.light, pair.dark, ...colours.map((c) => c.hex)])].slice(0, 7).map((h) => <button key={h} className={'mo-swb' + (bg === h ? ' on' : '')} style={{ background: h }} onClick={() => setBg(h)} title={colours.find((c) => c.hex === h)?.name || h} aria-label={colours.find((c) => c.hex === h)?.name || h} />)}
        </span>
      </div>
      {sel.kind === 'type' ? <label className="mo-sample"><span className="mute">Sample</span><input value={sample} onChange={(e) => setSample(e.target.value)} /></label> : null}
      {tl ? <div className="mo-lanes">
        {tl.parts.map((p, i) => <div key={i} className="mo-lane"><span className="mute">Part {i + 1}</span><div><i style={{ left: `${p.spans.in[0] / T * 100}%`, width: `${(p.spans.in[1] - p.spans.in[0]) / T * 100}%` }} />{p.spans.out ? <i className="out" style={{ left: `${p.spans.out[0] / T * 100}%`, width: `${(p.spans.out[1] - p.spans.out[0]) / T * 100}%` }} /> : null}<b style={{ left: `${t / T * 100}%` }} /></div></div>)}
        <p className="mute mo-fit">{tl.parts.length} part{tl.parts.length === 1 ? '' : 's'} · each builds in {Math.round(tl.wipe)} ms, {Math.round(tl.stagger)} ms apart · holds for {(tl.hold / 1000).toFixed(2)} s</p>
      </div> : null}
      <section className="mo-pkg">
        <div><strong>Examples to review</strong><p className="mute">Drafts to share with the team or the client before submitting. Nothing goes to the client’s portal.</p></div>
        <div className="mo-ex">
          <button className="btn" onClick={() => example('mp4')} disabled={!!busy || sel.kind !== 'logo' || !art}>{busy === 'mp4' ? <Loader2 size={14} className="spin" aria-hidden /> : <Film {...I} />}This logo, MP4</button>
          <button className="btn" onClick={() => example('lottie')} disabled={!!busy || sel.kind !== 'logo' || !art}>{busy === 'lottie' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download {...I} />}Lottie</button>
          <button className="btn" onClick={() => example('page')} disabled={!!busy || !logos.length}>{busy === 'page' ? <Loader2 size={14} className="spin" aria-hidden /> : <FileCode2 {...I} />}Review page, every logo</button>
        </div>
      </section>
      <div className="mo-pane-foot"><button className="btn solid" onClick={onNext}>Ready to submit<ArrowRight {...I} /></button></div>
    </section>

    <aside className="mo-panel" aria-label="Settings">
      {(sel.kind === 'logo' || fonts.length > 1) ? <div className="mo-sec"><div className="mo-seg" role="radiogroup" aria-label="Changes apply to">
        <button role="radio" aria-checked={!own} onClick={() => setOwn(false)}>{sel.kind === 'logo' ? 'All logos' : 'All type'}</button>
        <button role="radio" aria-checked={own} onClick={() => setOwn(true)}>{sel.kind === 'logo' ? 'Just this logo' : 'Just this typeface'}</button>
      </div>{own && hasOwn ? <button className="mo-link" onClick={() => edit((x) => sel.kind === 'logo' ? { ...x, perLogo: Object.fromEntries(Object.entries(x.perLogo || {}).filter(([k]) => k !== key)) } : { ...x, typeBy: Object.fromEntries(Object.entries(x.typeBy || {}).filter(([k]) => k !== key)) })}>Go back to the brand’s</button> : null}</div> : null}
      <div className="mo-sec"><p className="mo-sh">Playing with</p>
        <div className="mo-chips">{CONTROLS.filter((c) => sel.kind === 'logo' || (c.id !== 'line' && c.id !== 'size')).map((c) => { const on = controls.includes(c.id); return <button key={c.id} className={'mo-chip' + (on ? ' on' : '')} aria-pressed={on} title={c.about} onClick={() => edit((x) => ({ ...x, controls: on ? controls.filter((y) => y !== c.id) : [...controls, c.id] }))}>{c.label}</button>; })}</div></div>
      <Settings P={P} type={sel.kind === 'type'} set={setP} controls={controls} />
      <Claude projectId={projectId} target={sel.kind === 'type' ? 'type' : 'logo'} P={P} subject={sel.kind === 'type' ? `${font?.name || 'Type'}: “${sample}”` : `${logo?.name || ''}${own ? ' (its own settings)' : ' (the brand’s logo motion)'}`} parts={tl?.parts.length || 1} brief={m.brief} apply={(next) => { setP(next); setT(0); setPlaying(true); }} />
    </aside>
  </div>;
}

function Chips<T extends string>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return <div className="mo-opt"><span className="mute">{label}</span><div className="mo-chips">{options.map(([v, l]) => <button key={v} className={'mo-chip' + (value === v ? ' on' : '')} aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}</div></div>;
}
function Slide({ label, value, min, max, step, unit, set }: { label: string; value: number; min: number; max: number; step: number; unit: string; set: (v: number) => void }) {
  return <label className="mo-slide"><span className="mute">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /><span className="mo-num">{value}{unit}</span></label>;
}

/** The settings, showing only the qualities being played with */
export function Settings({ P, type, set, controls }: { P: MotionPreset | TypePreset; type: boolean; set: (x: Patch) => void; controls: Control[] }) {
  const e = P.ease;
  const f = useMemo(() => bezier(...e), [e]);
  const d = useMemo(() => Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${i * 2.5} ${100 - f(i / 40) * 100}`).join(''), [f]);
  const C = channels(P);
  const has = (c: Control) => controls.includes(c);
  const ms = (v: number) => Math.round(v * P.length / P.refLength), back = (v: number) => Math.round(v * P.refLength / P.length);
  const sides: [MotionPreset['from'], string][] = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']];
  return <>
    {has('reveal') || has('order') || has('exit') ? <div className="mo-sec"><p className="mo-sh">Build</p>
      {has('reveal') ? <Chips label="Reveal" value={P.build} options={[['wipe', 'Wipe'], ...(type ? [] : [['draw', 'Drawn on']] as [MotionPreset['build'], string][]), ['fade', 'Fade'], ['rise', 'Rise'], ['scale', 'Scale'], ['blur', 'Focus'], ['none', 'Cut']]} set={(v) => set({ build: v })} /> : null}
      {has('reveal') && (P.build === 'wipe' || P.build === 'rise') ? <Chips label="From" value={P.from} options={sides} set={(v) => set({ from: v })} /> : null}
      {has('order') ? <>{type ? <Chips label="Split" value={(P as TypePreset).split} options={[['whole', 'Whole'], ['lines', 'Lines'], ['words', 'Words'], ['letters', 'Letters']]} set={(v) => set({ split: v })} />
        : <Chips label="Split" value={(P as MotionPreset).split} options={[['parts', 'Part by part'], ['whole', 'As one']]} set={(v) => set({ split: v })} />}
        <Chips label="Order" value={P.order} options={[['left', 'From left'], ['right', 'From right'], ['top', 'From top'], ['centre', 'From centre']]} set={(v) => set({ order: v })} /></> : null}
      {has('exit') ? <Chips label="Out" value={P.out} options={[['mirror', 'Reverse'], ['fade', 'Fade'], ['none', 'Stay']]} set={(v) => set({ out: v })} /> : null}
      {has('line') && P.build === 'draw' && !type ? <Slide label="Line" value={C.line} min={0.1} max={6} step={0.1} unit="%" set={(v) => set({ line: v })} /> : null}
    </div> : null}
    {has('opacity') || has('scale') || has('blur') || has('movement') ? <div className="mo-sec"><p className="mo-sh">Arrives</p>
      {has('opacity') ? <Slide label="Opacity from" value={Math.round(C.opacityFrom * 100)} min={0} max={100} step={5} unit="%" set={(v) => set({ opacityFrom: v / 100 })} /> : null}
      {has('scale') ? <Slide label="Scale from" value={Math.round(C.scaleFrom * 100)} min={20} max={160} step={2} unit="%" set={(v) => set({ scaleFrom: v / 100 })} /> : null}
      {has('blur') ? <Slide label="Blur from" value={C.blur} min={0} max={20} step={0.5} unit="" set={(v) => set({ blurFrom: v })} /> : null}
      {has('movement') ? <><Slide label="Travel" value={C.offset} min={0} max={200} step={5} unit="%" set={(v) => set({ offset: v })} />{C.offset ? <Chips label="From" value={P.from} options={sides} set={(v) => set({ from: v })} /> : null}</> : null}
    </div> : null}
    {has('speed') || has('timing') ? <div className="mo-sec"><p className="mo-sh">Timing</p>
      {has('speed') ? <Slide label="Length" value={P.length} min={0.6} max={8} step={0.1} unit=" s" set={(v) => set({ length: v })} /> : null}
      {has('timing') ? <>
        <Slide label="Each part" value={ms(P.wipe)} min={40} max={3000} step={10} unit=" ms" set={(v) => set({ wipe: back(v) })} />
        <Slide label="Between" value={ms(P.stagger)} min={0} max={1000} step={10} unit=" ms" set={(v) => set({ stagger: back(v) })} />
        <Slide label="Delay" value={ms(P.delay)} min={0} max={2000} step={10} unit=" ms" set={(v) => set({ delay: back(v) })} /></> : null}
    </div> : null}
    {has('drift') || (has('size') && !type) ? <div className="mo-sec"><p className="mo-sh">{has('drift') ? 'Drift' : 'Frame'}</p>
      {has('drift') ? <><Slide label="Distance" value={P.drift} min={0} max={40} step={1} unit="%" set={(v) => set({ drift: v })} />
        {P.drift ? <Chips label="Towards" value={P.driftTo} options={[['right', 'Right'], ['left', 'Left'], ['top', 'Up'], ['bottom', 'Down']]} set={(v) => set({ driftTo: v })} /> : null}</> : null}
      {has('size') && !type ? <Slide label="Size" value={(P as MotionPreset).scale} min={8} max={100} step={4} unit="%" set={(v) => set({ scale: v })} /> : null}
    </div> : null}
    {has('easing') ? <div className="mo-sec"><p className="mo-sh">Ease <span className="mute">{easeName(e)}</span></p>
      <div className="mo-ease"><svg viewBox="-6 -6 112 112" aria-hidden><path className="g" d="M0 0V100H100" /><line className="a" x1="0" y1="100" x2={e[0] * 100} y2={100 - e[1] * 100} /><line className="a" x1="100" y1="0" x2={e[2] * 100} y2={100 - e[3] * 100} /><path className="c" d={d} /></svg>
        <div className="mo-chips">{EASES.map((x) => <button key={x.id} className={'mo-chip' + (easeName(e) === x.label ? ' on' : '')} onClick={() => set({ ease: x.ease })}>{x.label}</button>)}</div></div>
      <label className="mo-bez"><span className="mute">cubic-bezier</span><input key={e.join(',')} defaultValue={e.join(', ')} onBlur={(ev) => { const v = ev.target.value.split(/[\s,]+/).map(Number).filter((n) => isFinite(n)); if (v.length === 4) set({ ease: v as Ease }); }} /></label>
    </div> : null}
  </>;
}

// Claude, as a motion partner: say how it should feel, and it changes the settings
function Claude({ projectId, target, P, subject, parts, brief, apply }: { projectId: string; target: 'logo' | 'type'; P: MotionPreset | TypePreset; subject: string; parts: number; brief?: string; apply: (p: Patch) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);
  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: 'user', text: message }]); setText(''); setBusy(true);
    try {
      const j = await post(`/api/projects/${projectId}/motion/ai`, { target, preset: P, subject: `${subject}${brief ? `. The brief: ${brief.slice(0, 120)}` : ''}`.slice(0, 200), parts, history, message });
      apply(j.preset); setMsgs((m) => [...m, { role: 'assistant', text: j.reply }]);
    } catch (e) { setMsgs((m) => [...m, { role: 'assistant', text: (e as Error).message }]); }
    setBusy(false);
  };
  const ideas = target === 'logo' ? ['Slower and calmer', 'Draw it on, then fill', 'Come into focus, gently', 'Snappier'] : ['Word by word, gentle', 'Letters, quick and crisp', 'Lines rising up'];
  return <div className="mo-sec mo-claude"><p className="mo-sh"><Sparkles size={13} aria-hidden /> Ask Claude</p>
    <div className="mo-msgs">{!msgs.length ? <p className="mute">Say how it should feel and Claude will change the settings. Undo takes any change back.</p> : null}
      {msgs.map((x, i) => <p key={i} className={'mo-msg ' + x.role}>{x.text}</p>)}{busy ? <p className="mo-msg assistant mute"><Loader2 size={12} className="spin" aria-hidden /> Working on it</p> : null}<div ref={end} /></div>
    {!msgs.length ? <div className="mo-chips">{ideas.map((x) => <button key={x} className="mo-chip" onClick={() => send(x)}>{x}</button>)}</div> : null}
    <form className="mo-ask" onSubmit={(e) => { e.preventDefault(); send(text); }}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. the build feels rushed" disabled={busy} /><button className="btn solid mo-ic" disabled={busy || !text.trim()} aria-label="Send"><Send size={13} aria-hidden /></button></form>
  </div>;
}

// ---------- 4 Submit

export function Submit({ projectId, client, m, setM, saveNow, logos, fonts, pair, live, canSubmit, onBack }: { projectId: string; client: string; m: BrandMotion; setM: (x: BrandMotion) => void; saveNow: (x: BrandMotion) => Promise<BrandMotion>; logos: MotionLogo[]; fonts: MotionFont[]; pair: { dark: string; light: string }; live: { version: number } | null; canSubmit: boolean; onBack: () => void }) {
  const [prog, setProg] = useState<{ p: number; note: string; error?: boolean } | null>(null);
  const [result, setResult] = useState<{ version: number; chapter: boolean } | null>(null);
  const running = !!prog && prog.p < 1 && !prog.error;
  const go = async () => {
    const steps = logos.length * 4 + Math.min(3, logos.length) + 2; let n = 0;
    const tick = (note: string, sub = 0) => setProg({ p: Math.min(0.99, (n + sub) / steps), note });
    try {
      tick('Saving the draft'); const saved = await saveNow(m); n++;
      const pk = async (body: object) => post(`/api/projects/${projectId}/packages`, body);
      const put = async (signedUrl: string, name: string, blob: Blob) => { const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', blob, name); const up = await fetch(signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } }); if (!up.ok) throw new Error(`Couldn’t upload ${name}.`); };
      const toPkg = async (name: string, blob: Blob) => { const s = await pk({ action: 'sign', pkg: 'motion', name }); await put(s.signedUrl, name, blob); await pk({ action: 'add', pkg: 'motion', name, path: s.path, bytes: blob.size, type: blob.type }); };
      // The motion package, for Resources
      for (const l of logos) {
        const a = await artworkOf(l.url); const LP = presetFor(saved, l.path); const base = kebab(l.name); const on = a.tone === 'dark' ? pair.light : pair.dark;
        tick(`${l.name}: video`); await toPkg(`${base}.mp4`, await encodeMp4(a, LP, { W: 1920, H: 1080, fps: 30, bg: on, onProgress: (p) => tick(`${l.name}: video`, p) })); n++;
        tick(`${l.name}: transparent video`); await toPkg(`${base}-transparent.webm`, await encodeWebm(a, LP, { W: 1920, H: 1080, fps: 30, bg: null, onProgress: (p) => tick(`${l.name}: transparent video`, p) })); n++;
        tick(`${l.name}: Lottie`); await toPkg(`${base}.json`, new Blob([JSON.stringify(toLottie(a, LP, { frame: 'logo', bg: null, title: `${client} ${l.name}` }))], { type: 'application/json' })); n++;
        tick(`${l.name}: SVG`); await toPkg(`${base}.svg`, new Blob([toSVG(a, LP, { frame: 'logo', bg: null, loop: true, title: `${client} ${l.name}` })], { type: 'image/svg+xml' })); n++;
      }
      if (logos.length) await toPkg('README.txt', new Blob([`${client} motion logos\n\nEach logo, animated in the ${client} motion: ${describe(saved.logo)}\nEase: ${easeName(saved.logo.ease)}, cubic-bezier(${saved.logo.ease.join(', ')}).\n\n- .mp4: 1920 × 1080 video on a brand colour, for presentations, screens and social.\n- -transparent.webm: the same with a transparent background, to lay over footage (Chrome, Premiere, After Effects, DaVinci Resolve).\n- .json: Lottie, for apps and websites (lottie-web, LottieFiles).\n- .svg: animated SVG that loops, for websites. Open it in a browser to see it move.\n\nMade by Lost Property Studio.`], { type: 'text/plain' }));
      // Examples for the guidelines' Motion chapter
      const media: { path: string; w: number; h: number; caption: string }[] = [];
      for (const l of logos.slice(0, 3)) {
        tick(`Guidelines example: ${l.name}`);
        const a = await artworkOf(l.url); const blob = await encodeMp4(a, presetFor(saved, l.path), { W: 1280, H: 720, fps: 30, bg: a.tone === 'dark' ? pair.light : pair.dark });
        const s = await post(`/api/projects/${projectId}/motion/submit`, { action: 'sign', name: `${kebab(l.name)}-v${(live?.version || 0) + 1}.mp4` }); await put(s.signedUrl, 'example.mp4', blob);
        media.push({ path: s.path, w: 1280, h: 720, caption: l.name }); n++;
      }
      tick('Writing the guidelines, design system and AI rules');
      const j = await post(`/api/projects/${projectId}/motion/submit`, { action: 'submit', media, fonts: fonts.map((f) => ({ role: f.role, name: f.name })) });
      setM({ ...j.motion, builtAt: new Date().toISOString() });
      setProg({ p: 1, note: 'Done' }); setResult({ version: j.motion.version, chapter: j.chapter });
    } catch (e) { setProg((p) => ({ p: p?.p || 0, note: (e as Error).message, error: true })); }
  };
  const L = m.logo, T = m.type;
  return <section className="mo-pane">
    <div className="mo-pane-h"><h2>Submit {client}’s motion</h2><p className="mute">{live ? `Version ${live.version} is live. Submitting makes this version ${live.version + 1}.` : 'Nothing has been submitted yet. Until you do, clients see no motion.'}</p></div>
    <div className="mo-sum">
      <div className="mo-sum-v">{logos.slice(0, 4).map((l) => <Mini key={l.path} logo={l} P={presetFor(m, l.path)} T={T} pair={pair} />)}{!logos.length && fonts[0] ? <Mini font={fonts[0]} P={L} T={T} pair={pair} label={`Welcome to ${client}`} /> : null}</div>
      <dl>
        {m.brief ? <><dt>Brief</dt><dd>{m.brief}</dd></> : null}
        <dt>Logos</dt><dd>{describe(L)}{Object.keys(m.perLogo || {}).length ? ` ${Object.keys(m.perLogo!).length} logo${Object.keys(m.perLogo!).length === 1 ? ' has' : 's have'} its own changes.` : ''}</dd>
        <dt>Type</dt><dd>{describe(T)}</dd>
        <dt>Ease</dt><dd>{easeName(L.ease)} · <code>cubic-bezier({L.ease.join(', ')})</code></dd>
        <dt>What moves</dt><dd>{logos.length} logo{logos.length === 1 ? '' : 's'}{fonts.length ? `, ${fonts.map((f) => f.name).join(', ')}` : ''}</dd>
        {m.source ? <><dt>From</dt><dd>{m.source.kind === 'claude' ? `Explored with Claude (${m.source.name})` : m.source.kind === 'kit' ? `Imported motion kit, ${m.source.name}` : m.source.kind === 'video' ? `Matched to a video, ${m.source.name}` : 'Set by hand'}</dd></> : null}
      </dl>
    </div>
    <div className="mo-will"><strong>Submitting will</strong><ul>
      <li>Build the <b>Motion logos</b> package in Resources: each logo as MP4, transparent video, Lottie and animated SVG.</li>
      <li>Draft a <b>Motion</b> chapter in the guidelines, with example videos, the easing curves and timings. It stays hidden until the studio accepts it in Guidelines.</li>
      <li>Add the eases and durations to the client’s <b>design system</b> (tokens.json, tokens.css, DESIGN.md).</li>
      <li>Teach the client’s <b>AI</b> (Ask, Claude skills) how the brand moves.</li>
      <li>Let <b>Director</b> use the motion logos, the logo endboard and brand type motion.</li>
    </ul></div>
    {result ? <div className="mo-done" role="status"><Check size={16} aria-hidden /><div><strong>Version {result.version} submitted.</strong><p>{result.chapter ? <>The Motion chapter is drafted. <a href="?tab=guidelines">Check it in Guidelines</a> and accept it to show clients.</> : 'There are no guidelines on this project yet, so no Motion chapter was written.'} The package is in Resources.</p></div></div> : null}
    {prog && !result ? <div className="mo-prog"><i style={{ width: `${Math.round(prog.p * 100)}%` }} /><span className={prog.error ? 'mo-err' : 'mute'}>{prog.note}</span></div> : null}
    <div className="mo-pane-foot">
      <button className="btn" onClick={onBack} disabled={running}><ArrowLeft {...I} />Back</button>
      <span className="mo-sp" />
      {!canSubmit ? <span className="mute">Only the project’s leads can submit.</span> : null}
      <button className="btn solid" onClick={go} disabled={!canSubmit || running || !!result || (!logos.length && !fonts.length)}>{running ? <Loader2 size={14} className="spin" aria-hidden /> : <Send {...I} />}{result ? 'Submitted' : live ? `Submit version ${live.version + 1}` : 'Submit motion'}</button>
    </div>
  </section>;
}

// ---------- Import

export type Imported = { logo: MotionPreset; type: TypePreset; controls: Control[]; summary: string; unsure: string; kind: 'kit' | 'video'; name: string };
/** Frames from a video, evenly through its first 10 seconds, as small JPEGs */
async function videoFrames(file: File, n = 14) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('That video couldn’t be read here. Try an MP4.')); });
  const dur = Math.min(v.duration || 0, 10); if (!dur) throw new Error('That video has no length.');
  const w = 640, h = Math.round(w * (v.videoHeight / v.videoWidth || 9 / 16));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  const frames: { t: number; data: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (dur * i) / (n - 1) * 0.999;
    await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = t; });
    x.drawImage(v, 0, 0, w, h); frames.push({ t, data: c.toDataURL('image/jpeg', 0.72) });
  }
  URL.revokeObjectURL(v.src);
  return { frames, duration: v.duration };
}

export function Import({ projectId, logos, fonts, onClose, onDone }: { projectId: string; logos: MotionLogo[]; fonts: MotionFont[]; onClose: () => void; onDone: (r: Imported, approved: boolean) => void }) {
  const [kind, setKind] = useState<'kit' | 'video'>('kit');
  const [file, setFile] = useState<File | null>(null);
  const [approved, setApproved] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    if (!file) return; setErr('');
    try {
      const parts = await Promise.all(logos.slice(0, 12).map(async (l) => ({ name: l.name, parts: (await artworkOf(l.url).catch(() => null))?.rects.length || 1 })));
      const base = { kind, name: file.name, logos: parts, fonts: fonts.map((f) => ({ role: f.role, name: f.name })) };
      let body: object;
      if (kind === 'kit') { setBusy('Reading the kit'); body = { ...base, text: await file.text() }; }
      else { setBusy('Taking frames from the video'); const v = await videoFrames(file); body = { ...base, frames: v.frames, duration: v.duration }; }
      setBusy(kind === 'kit' ? 'Claude is reading the timings and eases' : 'Claude is watching the frames');
      const j = await post(`/api/projects/${projectId}/motion/import`, body);
      onDone({ ...(j as Omit<Imported, 'kind' | 'name'>), kind, name: file.name }, approved);
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  return <div className="mo-modal" role="dialog" aria-modal="true" aria-label="Import motion" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="mo-modal-b">
      <header><h3>Import motion</h3><button className="mo-x" onClick={onClose} disabled={!!busy} aria-label="Close"><X size={14} aria-hidden /></button></header>
      <p className="mute">For motion made off the platform. Claude reads it and turns it into settings here, so it can be built into files, guidelines and tools.</p>
      <div className="mo-imp">
        <button className={'mo-impc' + (kind === 'kit' ? ' on' : '')} onClick={() => { setKind('kit'); setFile(null); }}><FileCode2 size={18} strokeWidth={1.5} aria-hidden /><strong>HTML motion kit</strong><span className="mute">A kit like the Tileyard Wipes file. Its exact timings and eases are used.</span></button>
        <button className={'mo-impc' + (kind === 'video' ? ' on' : '')} onClick={() => { setKind('video'); setFile(null); }}><Film size={18} strokeWidth={1.5} aria-hidden /><strong>A video to match</strong><span className="mute">An MP4 or MOV of the logo moving. Claude watches it and sets something close.</span></button>
      </div>
      <label className="mo-file"><input type="file" accept={kind === 'kit' ? '.html,.htm,text/html' : 'video/*'} onChange={(e) => setFile(e.target.files?.[0] || null)} /><Upload {...I} /><span>{file ? file.name : kind === 'kit' ? 'Choose an HTML file' : 'Choose a video'}</span></label>
      <div className="mo-seg" role="radiogroup" aria-label="Use it as">
        <button role="radio" aria-checked={approved} onClick={() => setApproved(true)}>Already approved: publish it</button>
        <button role="radio" aria-checked={!approved} onClick={() => setApproved(false)}>A starting point: explore it</button>
      </div>
      {err ? <p className="mo-err" role="alert">{err}</p> : null}
      <footer><button className="btn" onClick={onClose} disabled={!!busy}>Cancel</button><button className="btn solid" onClick={go} disabled={!file || !!busy}>{busy ? <><Loader2 size={14} className="spin" aria-hidden />{busy}</> : <>Import</>}</button></footer>
    </div>
  </div>;
}
