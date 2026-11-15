'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pause, Play, Repeat, RotateCcw, Send, Sparkles, Undo2 } from 'lucide-react';
import { buildTimeline, bezier, describe, easeName, EASES, presetFor, type BrandMotion, type Ease, type MotionPreset, type TypePreset } from '@/lib/motion/model';
import { drawFrame, encodeMp4, encodeWebm, loadArtwork, toLottie, toSVG, type Artwork } from '@/lib/motion/render';
import { TypeStage } from '@/components/motion/TypeStage';

// The studio's Motion tab: set how a client's logos and type move. Pick a logo or Type on the left, watch it on the
// stage, and change the behaviour on the right, by hand or by telling Claude how it should feel. The logo behaviour is
// the brand's default; any logo can have its own changes. Saved behaviours drive the motion logo package (built
// here) and Director.

export type MotionLogo = { path: string; name: string; url: string };
type Sel = { kind: 'logo'; path: string } | { kind: 'type' };
type Msg = { role: 'user' | 'assistant'; text: string };
/** A change to any preset, logo or type */
type Patch = Partial<Omit<MotionPreset, 'split'>> & { split?: MotionPreset['split'] | TypePreset['split'] };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const kebab = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lum = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };

export function MotionStudio({ projectId, client, logos, colours, motion: initial, typeFont }: { projectId: string; client: string; logos: MotionLogo[]; colours: { name: string; hex: string }[]; motion: BrandMotion; typeFont: string }) {
  const [m, setM] = useState<BrandMotion>(initial);
  const [saved, setSaved] = useState<BrandMotion>(initial);
  const [sel, setSel] = useState<Sel>(logos[0] ? { kind: 'logo', path: logos[0].path } : { kind: 'type' });
  const [own, setOwn] = useState(false);
  const [art, setArt] = useState<Artwork | null>(null);
  const [artErr, setArtErr] = useState('');
  const [bg, setBg] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [sample, setSample] = useState(`Welcome to ${client}`);
  const [status, setStatus] = useState('');
  const [build, setBuild] = useState<{ p: number; note: string } | null>(null);
  const [undo, setUndo] = useState<BrandMotion[]>([]);
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const pair = useMemo(() => { const c = colours.filter((x) => /^#[0-9a-f]{6}/i.test(x.hex)).sort((a, b) => lum(a.hex) - lum(b.hex)); return { dark: c[0]?.hex || '#111111', light: c[c.length - 1]?.hex || '#ffffff' }; }, [colours]);
  const logo = sel.kind === 'logo' ? logos.find((l) => l.path === sel.path) : undefined;
  // The behaviour being looked at, and what a change applies to: the brand's logos, this logo, or type
  const hasOwn = !!(logo && m.perLogo?.[logo.path] && Object.keys(m.perLogo[logo.path]).length);
  useEffect(() => { setOwn(hasOwn); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const P: MotionPreset | TypePreset = sel.kind === 'type' ? m.type : presetFor(m, logo?.path);
  const setP = (x: Patch) => {
    setUndo((u) => [m, ...u].slice(0, 30));
    setM((cur) => {
      if (sel.kind === 'type') return { ...cur, type: { ...cur.type, ...x } as TypePreset };
      if (own && logo) return { ...cur, perLogo: { ...cur.perLogo, [logo.path]: { ...(cur.perLogo?.[logo.path] || {}), ...x } as Partial<MotionPreset> } };
      return { ...cur, logo: { ...cur.logo, ...x } as MotionPreset };
    });
  };

  // Load the logo being looked at
  useEffect(() => {
    if (!logo) { setArt(null); return; }
    let live = true; setArt(null); setArtErr('');
    fetch(logo.url).then((r) => r.text()).then(loadArtwork).then((a) => { if (live) { setArt(a); setBg(a.tone === 'dark' ? pair.light : pair.dark); } }).catch((e) => live && setArtErr(e.message));
    return () => { live = false; };
  }, [logo?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const tl = useMemo(() => (sel.kind === 'logo' && art ? buildTimeline(P, art.rects, art.w, art.h) : null), [art, P, sel.kind]);
  const T = tl?.T ?? P.length * 1000;

  // The clock
  const last = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => { const dt = last.current ? now - last.current : 0; last.current = now; if (playing) setT((x) => { const n = x + dt; return n > T ? (loop ? n % T : (setPlaying(false), T)) : n; }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => { cancelAnimationFrame(raf); last.current = 0; };
  }, [playing, loop, T]);

  // Draw the logo
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c || !art || !tl) return;
    const r = c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * d), H = Math.round(r.height * d);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    drawFrame(c.getContext('2d')!, W, H, art, P, tl, t, bg);
  }, [art, tl, t, bg, P]);

  const save = async () => {
    setStatus('Saving…');
    const r = await fetch(`/api/projects/${projectId}/motion`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: m.logo, type: m.type, perLogo: m.perLogo || {}, note: m.note, builtAt: m.builtAt }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setStatus(j.error || 'Didn’t save. Try again.'); return; }
    setM(j.motion); setSaved(j.motion); setStatus('Saved. Director and the next package build use it.');
  };

  // Build the motion package: each logo as MP4 on a brand colour, transparent WebM, Lottie and animated SVG
  const buildPackage = async () => {
    if (dirty) await save();
    const call = async (body: object) => { const r = await fetch(`/api/projects/${projectId}/packages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Upload failed'); return j; };
    const upload = async (name: string, blob: Blob) => { const s = await call({ action: 'sign', pkg: 'motion', name }); const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', blob, name); const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } }); if (!up.ok) throw new Error(`Couldn’t upload ${name}.`); await call({ action: 'add', pkg: 'motion', name, path: s.path, bytes: blob.size, type: blob.type }); };
    const steps = logos.length * 4; let done = 0; const tick = (note: string) => setBuild({ p: done / steps, note });
    try {
      for (const l of logos) {
        const a = await loadArtwork(await (await fetch(l.url)).text());
        const LP = presetFor(m, l.path); const base = kebab(l.name); const on = a.tone === 'dark' ? pair.light : pair.dark;
        tick(`${l.name}: video`); await upload(`${base}.mp4`, await encodeMp4(a, LP, { W: 1920, H: 1080, fps: 30, bg: on, onProgress: (p) => setBuild({ p: (done + p) / steps, note: `${l.name}: video` }) })); done++;
        tick(`${l.name}: transparent video`); await upload(`${base}-transparent.webm`, await encodeWebm(a, LP, { W: 1920, H: 1080, fps: 30, bg: null, onProgress: (p) => setBuild({ p: (done + p) / steps, note: `${l.name}: transparent video` }) })); done++;
        tick(`${l.name}: Lottie`); await upload(`${base}.json`, new Blob([JSON.stringify(toLottie(a, LP, { frame: 'logo', bg: null, title: `${client} ${l.name}` }))], { type: 'application/json' })); done++;
        tick(`${l.name}: SVG`); await upload(`${base}.svg`, new Blob([toSVG(a, LP, { frame: 'logo', bg: null, loop: true, title: `${client} ${l.name}` })], { type: 'image/svg+xml' })); done++;
      }
      const readme = `${client} motion logos\n\nEach logo, animated in the ${client} motion (${describe(m.logo)})\n\n- .mp4: 1920 × 1080 video on a brand colour, for presentations, screens and social.\n- -transparent.webm: the same with a transparent background, to lay over footage (Chrome, Premiere, After Effects, DaVinci Resolve).\n- .json: Lottie, for apps and websites (lottie-web, LottieFiles, Rive import).\n- .svg: animated SVG that loops, for websites. Open it in a browser to see it move.\n\nMade by Lost Property Studio.`;
      await upload('README.txt', new Blob([readme], { type: 'text/plain' }));
      const builtAt = new Date().toISOString();
      setM((x) => ({ ...x, builtAt })); setSaved((x) => ({ ...x, builtAt }));
      await fetch(`/api/projects/${projectId}/motion`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: m.logo, type: m.type, perLogo: m.perLogo || {}, note: m.note, builtAt }) });
      setBuild({ p: 1, note: `Built ${logos.length} logo${logos.length === 1 ? '' : 's'} into Motion logos, in Resources.` });
    } catch (e) { setBuild({ p: done / steps, note: (e as Error).message }); }
  };

  return <div className="mo">
    <aside className="mo-side" aria-label="What moves">
      <p className="mo-h">Logos</p>
      {!logos.length ? <p className="mute mo-none">No SVG logos yet. Add them in Resources → Logos, or build the kit.</p> : null}
      {logos.map((l) => <button key={l.path} className={'mo-it' + (sel.kind === 'logo' && sel.path === l.path ? ' on' : '')} onClick={() => setSel({ kind: 'logo', path: l.path })}>
        <span className="mo-th"><img src={l.url} alt="" /></span><span className="mo-it-t">{l.name}</span>{m.perLogo?.[l.path] && Object.keys(m.perLogo[l.path]).length ? <span className="mo-dot" title="Has its own changes" /> : null}</button>)}
      <p className="mo-h">Type</p>
      <button className={'mo-it' + (sel.kind === 'type' ? ' on' : '')} onClick={() => setSel({ kind: 'type' })}><span className="mo-th mo-th-t" style={{ fontFamily: typeFont }}>Aa</span><span className="mo-it-t">Headlines and captions</span></button>
    </aside>

    <section className="mo-main">
      <header className="mo-top">
        <div><h2>{sel.kind === 'type' ? 'Type' : logo?.name || 'Motion'}</h2><p className="mute">{describe(P)}</p></div>
        <span className="mo-sp" />
        {undo.length ? <button className="btn" onClick={() => { setM(undo[0]); setUndo((u) => u.slice(1)); }}><Undo2 {...I} />Undo</button> : null}
        <button className="btn solid" onClick={save} disabled={!dirty}>{dirty ? 'Save' : 'Saved'}</button>
      </header>
      {status ? <p className="mute mo-status" role="status">{status}</p> : null}

      <div className={'mo-stage' + (bg ? '' : ' clear')} style={{ background: bg || undefined }}>
        {sel.kind === 'logo' ? (artErr ? <p className="mo-err">{artErr}</p> : <canvas ref={cv} />) : <div className="mo-type"><TypeStage text={sample} P={m.type} t={t} font={typeFont} colour={bg && lum(bg) < 0.5 ? pair.light : pair.dark} size={56} /></div>}
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
        <div><strong>Motion logos package</strong><p className="mute">Every logo above, in its saved motion: MP4 on a brand colour, transparent WebM, Lottie and animated SVG. It appears in the client’s Resources once built.{m.builtAt ? ` Last built ${new Date(m.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</p></div>
        <button className="btn solid" onClick={buildPackage} disabled={!logos.length || (!!build && build.p < 1 && !build.note.includes('’t'))}>{build && build.p < 1 ? <Loader2 size={14} className="spin" aria-hidden /> : null}{m.builtAt ? 'Rebuild package' : 'Build package'}</button>
        {build ? <div className="mo-prog"><i style={{ width: `${Math.round(build.p * 100)}%` }} /><span className="mute">{build.note}</span></div> : null}
      </section>
    </section>

    <aside className="mo-panel" aria-label="Settings">
      {sel.kind === 'logo' ? <div className="mo-sec"><div className="mo-seg" role="radiogroup" aria-label="Changes apply to">
        <button role="radio" aria-checked={!own} onClick={() => setOwn(false)}>All logos</button>
        <button role="radio" aria-checked={own} onClick={() => setOwn(true)}>Just this logo</button>
      </div>{own && hasOwn ? <button className="mo-link" onClick={() => { const { [logo!.path]: _, ...rest } = m.perLogo || {}; setUndo((u) => [m, ...u]); setM({ ...m, perLogo: rest }); }}>Go back to the brand’s</button> : null}</div> : null}
      <Settings P={P} type={sel.kind === 'type'} set={setP} />
      <Claude projectId={projectId} target={sel.kind === 'type' ? 'type' : 'logo'} P={P} subject={sel.kind === 'type' ? `Type: “${sample}”` : `${logo?.name || ''}${own ? ' (its own settings)' : ' (the brand’s logo motion)'}`} parts={tl?.parts.length || 1} apply={(next) => { setP(next); setT(0); setPlaying(true); }} />
    </aside>
  </div>;
}

function Chips<T extends string>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return <div className="mo-opt"><span className="mute">{label}</span><div className="mo-chips">{options.map(([v, l]) => <button key={v} className={'mo-chip' + (value === v ? ' on' : '')} aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}</div></div>;
}
function Slide({ label, value, min, max, step, unit, set }: { label: string; value: number; min: number; max: number; step: number; unit: string; set: (v: number) => void }) {
  return <label className="mo-slide"><span className="mute">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /><span className="mo-num">{value}{unit}</span></label>;
}

function Settings({ P, type, set }: { P: MotionPreset | TypePreset; type: boolean; set: (x: Patch) => void }) {
  const e = P.ease;
  const f = useMemo(() => bezier(...e), [e]);
  const d = useMemo(() => Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${i * 2.5} ${100 - f(i / 40) * 100}`).join(''), [f]);
  return <>
    <div className="mo-sec"><p className="mo-sh">Build</p>
      <Chips label="In" value={P.build} options={[['wipe', 'Wipe'], ['fade', 'Fade'], ['rise', 'Rise'], ['scale', 'Scale'], ['none', 'Cut']]} set={(v) => set({ build: v })} />
      {P.build === 'wipe' || P.build === 'rise' ? <Chips label="From" value={P.from} options={[['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']]} set={(v) => set({ from: v })} /> : null}
      {type ? <Chips label="Split" value={(P as TypePreset).split} options={[['whole', 'Whole'], ['lines', 'Lines'], ['words', 'Words'], ['letters', 'Letters']]} set={(v) => set({ split: v } )} />
        : <Chips label="Split" value={(P as MotionPreset).split} options={[['parts', 'Part by part'], ['whole', 'As one']]} set={(v) => set({ split: v } )} />}
      <Chips label="Order" value={P.order} options={[['left', 'From left'], ['right', 'From right'], ['top', 'From top'], ['centre', 'From centre']]} set={(v) => set({ order: v })} />
      <Chips label="Out" value={P.out} options={[['mirror', 'Reverse'], ['fade', 'Fade'], ['none', 'Stay']]} set={(v) => set({ out: v })} />
    </div>
    <div className="mo-sec"><p className="mo-sh">Timing</p>
      <Slide label="Length" value={P.length} min={0.6} max={8} step={0.1} unit=" s" set={(v) => set({ length: v })} />
      <Slide label="Each part" value={Math.round(P.wipe * P.length / P.refLength)} min={40} max={3000} step={10} unit=" ms" set={(v) => set({ wipe: Math.round(v * P.refLength / P.length) })} />
      <Slide label="Between" value={Math.round(P.stagger * P.length / P.refLength)} min={0} max={1000} step={10} unit=" ms" set={(v) => set({ stagger: Math.round(v * P.refLength / P.length) })} />
      <Slide label="Delay" value={Math.round(P.delay * P.length / P.refLength)} min={0} max={2000} step={10} unit=" ms" set={(v) => set({ delay: Math.round(v * P.refLength / P.length) })} />
    </div>
    <div className="mo-sec"><p className="mo-sh">Drift</p>
      <Slide label="Distance" value={P.drift} min={0} max={40} step={1} unit="%" set={(v) => set({ drift: v })} />
      {P.drift ? <Chips label="Towards" value={P.driftTo} options={[['right', 'Right'], ['left', 'Left'], ['top', 'Up'], ['bottom', 'Down']]} set={(v) => set({ driftTo: v })} /> : null}
      {!type ? <Slide label="Size" value={(P as MotionPreset).scale} min={8} max={100} step={4} unit="%" set={(v) => set({ scale: v } )} /> : null}
    </div>
    <div className="mo-sec"><p className="mo-sh">Ease <span className="mute">{easeName(e)}</span></p>
      <div className="mo-ease"><svg viewBox="-6 -6 112 112" aria-hidden><path className="g" d="M0 0V100H100" /><line className="a" x1="0" y1="100" x2={e[0] * 100} y2={100 - e[1] * 100} /><line className="a" x1="100" y1="0" x2={e[2] * 100} y2={100 - e[3] * 100} /><path className="c" d={d} /></svg>
        <div className="mo-chips">{EASES.map((x) => <button key={x.id} className={'mo-chip' + (easeName(e) === x.label ? ' on' : '')} onClick={() => set({ ease: x.ease })}>{x.label}</button>)}</div></div>
      <label className="mo-bez"><span className="mute">cubic-bezier</span><input key={e.join(',')} defaultValue={e.join(', ')} onBlur={(ev) => { const v = ev.target.value.split(/[\s,]+/).map(Number).filter((n) => isFinite(n)); if (v.length === 4) set({ ease: v as Ease }); }} /></label>
    </div>
  </>;
}

// Claude, as a motion partner: say how it should feel, and it changes the settings
function Claude({ projectId, target, P, subject, parts, apply }: { projectId: string; target: 'logo' | 'type'; P: MotionPreset | TypePreset; subject: string; parts: number; apply: (p: Patch) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);
  const send = useCallback(async (message: string) => {
    if (!message.trim() || busy) return;
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: 'user', text: message }]); setText(''); setBusy(true);
    const r = await fetch(`/api/projects/${projectId}/motion/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, preset: P, subject, parts, history, message }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setMsgs((m) => [...m, { role: 'assistant', text: j.error || 'That didn’t work. Try again.' }]); return; }
    apply(j.preset); setMsgs((m) => [...m, { role: 'assistant', text: j.reply }]);
  }, [busy, msgs, projectId, target, P, subject, parts, apply]);
  const ideas = target === 'logo' ? ['Slower and calmer', 'More drift, softer ease', 'Snappier, less drift', 'Build from the centre out'] : ['Word by word, gentle', 'Letters, quick and crisp', 'Lines rising up'];
  return <div className="mo-sec mo-claude"><p className="mo-sh"><Sparkles size={13} aria-hidden /> Ask Claude</p>
    <div className="mo-msgs">{!msgs.length ? <p className="mute">Say how it should feel and Claude will change the settings. Undo takes any change back.</p> : null}
      {msgs.map((x, i) => <p key={i} className={'mo-msg ' + x.role}>{x.text}</p>)}{busy ? <p className="mo-msg assistant mute"><Loader2 size={12} className="spin" aria-hidden /> Working on it</p> : null}<div ref={end} /></div>
    {!msgs.length ? <div className="mo-chips">{ideas.map((x) => <button key={x} className="mo-chip" onClick={() => send(x)}>{x}</button>)}</div> : null}
    <form className="mo-ask" onSubmit={(e) => { e.preventDefault(); send(text); }}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. the wipe feels rushed" disabled={busy} /><button className="btn solid mo-ic" disabled={busy || !text.trim()} aria-label="Send"><Send size={13} aria-hidden /></button></form>
  </div>;
}
