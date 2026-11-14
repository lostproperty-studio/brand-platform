'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Film, LayoutTemplate, Loader2, Music, Palette, Pause, Play, Plus, SkipBack, Sparkles, Trash2, Type, Upload, Volume2, Wand2 } from 'lucide-react';
import { ASPECTS, TEMPLATES, TEXT_ANIMS, brandPair, clamp, missing, newCaption, newScene, sceneAt, starts, total, uid, type Aspect, type BrandKit, type Caption, type FileRow, type Placement, type Scene, type Size, type Source, type Track } from '@/lib/director/model';
import { api, secs } from './api';
import { SAVE_LABEL, useSave } from './useSave';
import { Stage } from './Stage';
import { SOURCES, sourceId } from './Planner';

const I = { size: 14, strokeWidth: 1.7, 'aria-hidden': true } as const;
type Sel = { type: 'scene'; id: string } | { type: 'caption'; id: string; sceneId: string } | { type: 'track'; id: string } | null;
type Tab = 'scenes' | 'templates' | 'text' | 'brand' | 'sound';
const TABS: { id: Tab; label: string; Icon: typeof Film }[] = [
  { id: 'scenes', label: 'Scenes', Icon: Film }, { id: 'templates', label: 'Templates', Icon: LayoutTemplate }, { id: 'text', label: 'Text', Icon: Type }, { id: 'brand', label: 'Brand', Icon: Palette }, { id: 'sound', label: 'Sound', Icon: Music }
];
const TEXT_PRESETS: { name: string; make: (k: BrandKit) => Partial<Caption> }[] = [
  { name: 'Headline', make: (k) => ({ text: 'A headline', position: 'centre', size: 'XL', anim: 'rise', font: k.fonts.find((f) => f.role === 'display')?.role || k.fonts[0]?.role || 'display' }) },
  { name: 'Lower third', make: (k) => ({ text: 'A line about this moment', position: 'lower-third', size: 'M', anim: 'fade', align: 'left', font: k.fonts.find((f) => f.role === 'body')?.role || k.fonts[0]?.role || 'body' }) },
  { name: 'Subtitle', make: (k) => ({ text: 'What’s being said', position: 'bottom', size: 'S', anim: 'none', box: brandPair(k).dark, font: k.fonts.find((f) => f.role === 'caption' || f.role === 'body')?.role || k.fonts[0]?.role || 'body' }) },
  { name: 'Kicker', make: (k) => ({ text: 'NOW OPEN', position: 'top', size: 'S', anim: 'wipe', font: k.fonts.find((f) => f.role === 'caption')?.role || k.fonts[0]?.role || 'body' }) },
  { name: 'Statement', make: () => ({ text: 'Something worth saying.', position: 'centre', size: 'L', anim: 'type', align: 'left' }) }
];
const SFX = ['Soft whoosh', 'Water drop', 'Deep low hit', 'Gentle chime', 'Paper rustle', 'Glass clink', 'Room tone, quiet hum', 'Camera shutter'];
const SIZES: Size[] = ['S', 'M', 'L', 'XL'];
const PLACES: Placement[] = ['top-left', 'top', 'top-right', 'centre', 'bottom-left', 'bottom', 'bottom-right'];

// The editor: the stage in the middle at the canvas proportions, the brand's kit on the left, the timeline below
// and the selected scene, caption or sound on the right. Saves as you go.
export function Editor({ slug, kit, file, setFile, onBack, canGenerate }: { slug: string; kit: BrandKit; file: FileRow; setFile: (fn: (f: FileRow) => FileRow) => void; onBack: () => void; canGenerate: boolean }) {
  const A = api(slug);
  const { state, now } = useSave(slug, file);
  const d = file.data;
  const T = total(d);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>(d.scenes[0] ? { type: 'scene', id: d.scenes[0].id } : null);
  const [tab, setTab] = useState<Tab>('scenes');
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<{ type: 'scene' | 'track'; id: string } | null>(null);

  // Editing helpers, always against the latest file (generations can finish minutes later)
  const edit = (fn: (doc: FileRow['data']) => FileRow['data']) => setFile((f) => ({ ...f, data: fn(f.data) }));
  const setScene = (id: string, patch: Partial<Scene>) => edit((x) => ({ ...x, scenes: x.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const setCaption = (sceneId: string, id: string, patch: Partial<Caption>) => edit((x) => ({ ...x, scenes: x.scenes.map((s) => (s.id === sceneId ? { ...s, captions: s.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : s)) }));
  const setTrack = (id: string, patch: Partial<Track>) => edit((x) => ({ ...x, audio: x.audio.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  // Playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (n: number) => { const dt = (n - last) / 1000; last = n; setT((x) => { const y = x + dt; if (y >= T) { setPlaying(false); return T; } return y; }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, T]);
  useEffect(() => { const k = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement).tagName; if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); setPlaying((p) => { if (!p && t >= T - 0.01) setT(0); return !p; }); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [t, T]);

  const st = starts(d);
  const cur = sceneAt(d, t);
  const selScene = sel?.type === 'scene' ? d.scenes.find((s) => s.id === sel.id) : sel?.type === 'caption' ? d.scenes.find((s) => s.id === sel.sceneId) : cur?.scene;
  const selCaption = sel?.type === 'caption' ? selScene?.captions.find((c) => c.id === sel.id) : undefined;
  const selTrack = sel?.type === 'track' ? d.audio.find((a) => a.id === sel.id) : undefined;
  const jumpTo = (sceneId: string) => { const i = d.scenes.findIndex((s) => s.id === sceneId); if (i >= 0) setT(st[i] + 0.01); };
  const pick = (s: Sel) => { setSel(s); if (s?.type === 'scene') jumpTo(s.id); };

  // Making media
  const generate = async (s: Scene) => {
    if (s.source.kind !== 'generate' || !s.source.prompt.trim()) return;
    setBusy((b) => ({ ...b, [s.id]: s.source.kind === 'generate' && s.source.model === 'video' ? 'Making the video (a minute or two)…' : 'Making the image…' })); setErr('');
    try { const { media } = await A.generate({ prompt: s.source.prompt, kind: s.source.model, aspect: d.aspect, seconds: s.duration }); setScene(s.id, { media }); }
    catch (e) { setErr(`${s.title}: ${(e as Error).message}`); }
    setBusy((b) => { const n = { ...b }; delete n[s.id]; return n; });
  };
  const generateAll = async () => {
    const todo = missing(d).filter((s) => s.source.kind === 'generate' && s.source.prompt.trim());
    for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(generate));
  };
  const makeSound = async (a: Track) => {
    if (!a.prompt?.trim()) return;
    setBusy((b) => ({ ...b, [a.id]: a.kind === 'music' ? 'Composing the track…' : 'Making the sound…' })); setErr('');
    try { const { media } = await A.generate({ prompt: a.prompt, kind: 'audio', sound: a.kind, seconds: a.kind === 'music' ? Math.max(6, Math.ceil(T)) : 2 }); setTrack(a.id, { media }); }
    catch (e) { setErr(`${a.name}: ${(e as Error).message}`); }
    setBusy((b) => { const n = { ...b }; delete n[a.id]; return n; });
  };
  const askUpload = (target: { type: 'scene' | 'track'; id: string }, accept: string) => { uploadFor.current = target; if (fileIn.current) { fileIn.current.accept = accept; fileIn.current.click(); } };
  const onFile = async (f?: File | null, target = uploadFor.current) => {
    if (!f || !target) return;
    setBusy((b) => ({ ...b, [target.id]: `Uploading ${f.name}…` })); setErr('');
    try {
      const media = await A.upload(f);
      if (target.type === 'scene') setScene(target.id, { media, fit: 'cover' }); else setTrack(target.id, { media, name: f.name.replace(/\.[a-z0-9]+$/i, '') });
    } catch (e) { setErr((e as Error).message); }
    setBusy((b) => { const n = { ...b }; delete n[target.id]; return n; });
  };

  // Scenes
  const insertScene = (s: Scene) => { const i = selScene ? d.scenes.findIndex((x) => x.id === selScene.id) + 1 : d.scenes.length; edit((x) => ({ ...x, scenes: [...x.scenes.slice(0, i), s, ...x.scenes.slice(i)] })); setSel({ type: 'scene', id: s.id }); setTimeout(() => setT((st[i - 1] ?? 0) + (d.scenes[i - 1]?.duration ?? 0) + 0.01), 0); };
  const move = (id: string, by: number) => edit((x) => { const i = x.scenes.findIndex((s) => s.id === id), j = i + by; if (j < 0 || j >= x.scenes.length) return x; const sc = [...x.scenes]; [sc[i], sc[j]] = [sc[j], sc[i]]; return { ...x, scenes: sc }; });
  const removeScene = (id: string) => { edit((x) => ({ ...x, scenes: x.scenes.filter((s) => s.id !== id) })); setSel(null); };
  const addCaption = (over: Partial<Caption>) => { const s = selScene || cur?.scene; if (!s) return; const local = cur?.scene.id === s.id ? cur.local : 0; const c = newCaption(kit, { start: clamp(Math.round(local * 10) / 10, 0, s.duration - 0.5), end: s.duration - 0.1, ...over }); setScene(s.id, { captions: [...s.captions, c] }); setSel({ type: 'caption', id: c.id, sceneId: s.id }); };
  const addTrack = (kind: Track['kind'], prompt: string, name: string) => { const a: Track = { id: uid(), kind, name, prompt, at: kind === 'sfx' ? Math.round(t * 10) / 10 : 0, volume: kind === 'music' ? 0.8 : 1 }; edit((x) => ({ ...x, audio: [...x.audio, a] })); setSel({ type: 'track', id: a.id }); };

  const needGen = missing(d).filter((s) => s.source.kind === 'generate').length;
  const needUp = missing(d).filter((s) => s.source.kind === 'upload').length;
  const anyBusy = Object.keys(busy).length > 0;

  return <div className="dr-ed" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; const s = selScene || cur?.scene; if (f && s) onFile(f, f.type.startsWith('audio') && selTrack ? { type: 'track', id: selTrack.id } : { type: 'scene', id: s.id }); }}>
    <input ref={fileIn} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    <header className="dr-bar">
      <button className="btn ic" onClick={async () => { await now(); onBack(); }}><ArrowLeft {...I} />Videos</button>
      <input className="dr-title-in" value={file.title} onChange={(e) => setFile((f) => ({ ...f, title: e.target.value }))} aria-label="Title" />
      <span className="mute dr-save">{SAVE_LABEL[state]}</span>
      <span className="dr-bar-gap" />
      <div className="dr-aspect-sw" role="group" aria-label="Canvas">{ASPECTS.map((a) => <button key={a.id} className={d.aspect === a.id ? 'on' : ''} onClick={() => setFile((f) => ({ ...f, aspect: a.id as Aspect, data: { ...f.data, aspect: a.id as Aspect } }))} title={`${a.label}: ${a.use}`}>{a.id}</button>)}</div>
      {needGen && canGenerate ? <button className="btn" onClick={generateAll} disabled={anyBusy}><Wand2 {...I} />Generate {needGen} scene{needGen === 1 ? '' : 's'}</button> : null}
      <button className="btn solid" disabled title="Export to MP4 is coming next"><Download {...I} />Export</button>
    </header>
    {needUp ? <p className="dr-hint"><Upload {...I} />{needUp} scene{needUp === 1 ? ' needs' : 's need'} your footage. Select {needUp === 1 ? 'it' : 'one'} and upload, or drop a file onto the stage.</p> : null}
    {err ? <p className="cd-err dr-err" role="alert">{err} <button className="dr-link" onClick={() => setErr('')}>Dismiss</button></p> : null}

    <div className="dr-ed-main">
      <aside className="dr-left">
        <nav className="dr-tabs">{TABS.map((x) => <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)} title={x.label}><x.Icon size={16} strokeWidth={1.6} aria-hidden /><span>{x.label}</span></button>)}</nav>
        <div className="dr-left-body">
          {tab === 'scenes' ? <>
            <ol className="dr-scenes">{d.scenes.map((s, i) => <li key={s.id} className={'dr-sc' + (selScene?.id === s.id ? ' on' : '')} onClick={() => pick({ type: 'scene', id: s.id })}>
              <span className="dr-sc-thumb" style={{ background: s.background }}>{s.media?.url ? (s.media.kind === 'video' ? <video src={s.media.url + '#t=0.3'} muted preload="metadata" /> : <img src={s.media.url} alt="" />) : null}{busy[s.id] ? <Loader2 size={14} className="spin" aria-hidden /> : null}</span>
              <span className="dr-sc-t"><strong>{String(i + 1).padStart(2, '0')} {s.title}</strong><span className="mute">{secs(s.duration)} · {s.media ? (s.media.kind === 'video' ? 'Video' : 'Still') : s.source.kind === 'card' ? 'Card' : s.source.kind === 'upload' ? 'Needs footage' : 'To generate'}</span></span>
              <span className="dr-sc-act"><button onClick={(e) => { e.stopPropagation(); move(s.id, -1); }} aria-label="Move up"><ArrowUp size={12} aria-hidden /></button><button onClick={(e) => { e.stopPropagation(); move(s.id, 1); }} aria-label="Move down"><ArrowDown size={12} aria-hidden /></button></span>
            </li>)}</ol>
            <button className="btn dr-wide" onClick={() => insertScene(newScene(kit))}><Plus {...I} />Add scene</button>
          </> : null}
          {tab === 'templates' ? <div className="dr-tpls">{TEMPLATES.map((x) => { const s = x.make(kit); return <button key={x.id} className="dr-tpl" onClick={() => insertScene(x.make(kit))}>
            <span className="dr-tpl-frame" style={{ background: s.background }}>{s.captions[0] ? <span style={{ color: s.captions[0].colour, fontFamily: `var(--font-${s.captions[0].font}, var(--pt-display))` }}>{s.captions[0].text}</span> : s.logo && kit.logos[0] ? <img src={(kit.logos.find((l) => l.light) || kit.logos[0]).url} alt="" /> : <Film size={18} strokeWidth={1.3} aria-hidden />}</span>
            <span><strong>{x.name}</strong><span className="mute">{x.about}</span></span>
          </button>; })}</div> : null}
          {tab === 'text' ? <div className="dr-tpls">{TEXT_PRESETS.map((x) => { const c = { ...newCaption(kit), ...x.make(kit) }; return <button key={x.name} className="dr-tpl" onClick={() => addCaption(x.make(kit))}>
            <span className="dr-tpl-frame" style={{ background: brandPair(kit).dark }}><span style={{ color: c.colour, background: c.box || undefined, fontFamily: `var(--font-${c.font}, var(--pt-display))`, fontSize: c.size === 'XL' ? 18 : c.size === 'L' ? 15 : 12 }}>{c.text}</span></span>
            <span><strong>{x.name}</strong><span className="mute">{TEXT_ANIMS.find((a) => a.id === c.anim)?.label}, {c.position.replace('-', ' ')}</span></span>
          </button>; })}<p className="mute dr-small">Adds to the current scene at the playhead.</p></div> : null}
          {tab === 'brand' ? <div className="dr-brand">
            <p className="dr-kicker">Colours</p>
            <div className="dr-swatches">{kit.colours.map((c) => <button key={c.hex + c.name} className="dr-sw" style={{ background: c.hex }} title={`${c.name} ${c.hex} · apply to ${selCaption ? 'the caption' : 'the scene'}`} onClick={() => { if (selCaption && sel?.type === 'caption') setCaption(sel.sceneId, selCaption.id, { colour: c.hex }); else if (selScene) setScene(selScene.id, { background: c.hex }); }} />)}</div>
            <p className="mute dr-small">Click to colour the selected {selCaption ? 'caption' : 'scene'}.</p>
            <p className="dr-kicker">Type</p>
            {kit.fonts.length ? kit.fonts.map((f) => <button key={f.role} className="dr-font" style={{ fontFamily: `var(--font-${f.role})` }} onClick={() => { if (selCaption && sel?.type === 'caption') setCaption(sel.sceneId, selCaption.id, { font: f.role }); else addCaption({ font: f.role }); }}>{f.name}<span className="mute">{f.label}</span></button>) : <p className="mute dr-small">No brand fonts uploaded yet.</p>}
            <p className="dr-kicker">Logos</p>
            <div className="dr-logos">{kit.logos.map((l) => <button key={l.url} className={'dr-logo-b' + (l.light ? ' dark' : '')} title={l.name} onClick={() => selScene && setScene(selScene.id, { logo: { placement: selScene.logo?.placement || 'bottom', size: selScene.logo?.size || 'M', tone: l.light ? 'light' : 'dark' } })}><img src={l.url} alt={l.name} /></button>)}</div>
            {!kit.logos.length ? <p className="mute dr-small">No logos in the kit yet.</p> : <p className="mute dr-small">Click to place on the selected scene.</p>}
          </div> : null}
          {tab === 'sound' ? <div className="dr-sound">
            <p className="dr-kicker">Music</p>
            {d.audio.filter((a) => a.kind === 'music').map((a) => <TrackRow key={a.id} a={a} on={sel?.type === 'track' && sel.id === a.id} busy={busy[a.id]} onPick={() => setSel({ type: 'track', id: a.id })} />)}
            {!d.audio.some((a) => a.kind === 'music') ? <button className="btn dr-wide" onClick={() => addTrack('music', `Instrumental music for ${kit.client}: calm, modern, builds gently`, 'Bespoke track')}><Plus {...I} />Add a music track</button> : null}
            <p className="dr-kicker">Sound effects</p>
            {d.audio.filter((a) => a.kind === 'sfx').map((a) => <TrackRow key={a.id} a={a} on={sel?.type === 'track' && sel.id === a.id} busy={busy[a.id]} onPick={() => { setSel({ type: 'track', id: a.id }); setT(a.at); }} />)}
            <div className="dr-sfx">{SFX.map((x) => <button key={x} className="dr-chip" onClick={() => addTrack('sfx', x, x)}><Plus size={11} aria-hidden />{x}</button>)}</div>
            <p className="mute dr-small">Effects land at the playhead. Generate them with Krea, or upload your own.</p>
          </div> : null}
        </div>
      </aside>

      <section className="dr-centre">
        <div className="dr-stage-wrap"><Stage doc={d} kit={kit} t={t} playing={playing} selected={sel?.type === 'caption' ? sel.id : null} onPick={(x) => setSel(x.type === 'caption' ? { type: 'caption', id: x.id, sceneId: x.sceneId } : { type: 'scene', id: x.id })} /></div>
        <div className="dr-transport">
          <button className="dr-round" onClick={() => { setT(0); }} aria-label="Back to start"><SkipBack {...I} /></button>
          <button className="dr-round big" onClick={() => setPlaying((p) => { if (!p && t >= T - 0.01) setT(0); return !p; })} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button>
          <span className="dr-time">{secs(t)} / {secs(T)}</span>
        </div>
        <AudioLayer tracks={d.audio} t={t} playing={playing} />
      </section>

      <aside className="dr-right">
        {selCaption && sel?.type === 'caption' ? <CaptionPanel c={selCaption} scene={selScene!} kit={kit} set={(p) => setCaption(sel.sceneId, selCaption.id, p)} remove={() => { setScene(sel.sceneId, { captions: selScene!.captions.filter((c) => c.id !== selCaption.id) }); setSel({ type: 'scene', id: sel.sceneId }); }} />
          : selTrack ? <TrackPanel a={selTrack} busy={busy[selTrack.id]} canGenerate={canGenerate} set={(p) => setTrack(selTrack.id, p)} make={() => makeSound(selTrack)} upload={() => askUpload({ type: 'track', id: selTrack.id }, 'audio/*')} remove={() => { edit((x) => ({ ...x, audio: x.audio.filter((a) => a.id !== selTrack.id) })); setSel(null); }} total={T} />
          : selScene ? <ScenePanel s={selScene} kit={kit} busy={busy[selScene.id]} canGenerate={canGenerate} set={(p) => setScene(selScene.id, p)} generate={() => generate(selScene)} upload={() => askUpload({ type: 'scene', id: selScene.id }, 'video/*,image/*')}
            pickCaption={(id) => setSel({ type: 'caption', id, sceneId: selScene.id })} addCaption={() => addCaption({})}
            duplicate={() => insertScene({ ...selScene, id: uid(), captions: selScene.captions.map((c) => ({ ...c, id: uid() })) })} remove={() => removeScene(selScene.id)} />
          : <p className="mute dr-pad">Select a scene, caption or sound to edit it.</p>}
      </aside>
    </div>

    <Timeline doc={d} t={t} setT={(x) => { setPlaying(false); setT(x); }} sel={sel} pick={(s) => setSel(s)} resize={(id, dur) => setScene(id, { duration: dur })} busy={busy} />
  </div>;
}

function TrackRow({ a, on, busy, onPick }: { a: Track; on: boolean; busy?: string; onPick: () => void }) {
  return <button className={'dr-track' + (on ? ' on' : '')} onClick={onPick}>
    {a.kind === 'music' ? <Music {...I} /> : <Volume2 {...I} />}
    <span><strong>{a.name}</strong><span className="mute">{busy || (a.media ? (a.kind === 'sfx' ? `at ${secs(a.at)}` : 'Ready') : 'Not made yet')}</span></span>
    {busy ? <Loader2 size={13} className="spin" aria-hidden /> : null}
  </button>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="dr-row"><span className="dr-row-l">{label}</span><div className="dr-row-c">{children}</div></div>; }
function Chips<T extends string>({ value, options, onPick }: { value: T; options: { id: T; label: React.ReactNode; title?: string }[]; onPick: (v: T) => void }) {
  return <div className="dr-chips tight">{options.map((o) => <button key={o.id} className={'dr-chip' + (value === o.id ? ' on' : '')} onClick={() => onPick(o.id)} title={o.title}>{o.label}</button>)}</div>;
}
function Swatches({ kit, value, onPick, none }: { kit: BrandKit; value: string | null; onPick: (hex: string | null) => void; none?: boolean }) {
  return <div className="dr-swatches small">{none ? <button className={'dr-sw none' + (!value ? ' on' : '')} onClick={() => onPick(null)} title="None" /> : null}{kit.colours.map((c) => <button key={c.hex + c.name} className={'dr-sw' + (value?.toLowerCase() === c.hex.toLowerCase() ? ' on' : '')} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} onClick={() => onPick(c.hex)} />)}</div>;
}

function ScenePanel({ s, kit, busy, canGenerate, set, generate, upload, pickCaption, addCaption, duplicate, remove }: { s: Scene; kit: BrandKit; busy?: string; canGenerate: boolean; set: (p: Partial<Scene>) => void; generate: () => void; upload: () => void; pickCaption: (id: string) => void; addCaption: () => void; duplicate: () => void; remove: () => void }) {
  return <div className="dr-panel">
    <input className="dr-panel-t" value={s.title} onChange={(e) => set({ title: e.target.value })} aria-label="Scene title" />
    <Row label="Length"><input type="range" min={0.5} max={12} step={0.1} value={s.duration} onChange={(e) => set({ duration: Number(e.target.value) })} /><span className="dr-num">{secs(s.duration)}</span></Row>
    <p className="dr-kicker">Picture</p>
    <div className="dr-chips tight">{SOURCES.map((x) => <button key={x.id} className={'dr-chip' + (sourceId(s.source) === x.id ? ' on' : '')} onClick={() => set({ source: x.make(s) })}><x.Icon size={12} aria-hidden />{x.label}</button>)}</div>
    {s.note ? <p className="mute dr-small">{s.note}</p> : null}
    {s.source.kind === 'generate' ? <>
      <textarea className="dr-ta" rows={5} value={s.source.prompt} onChange={(e) => set({ source: { ...s.source, prompt: e.target.value } as Source })} placeholder="Describe the shot: subject, setting, movement, framing, light" />
      <button className="btn solid dr-wide" onClick={generate} disabled={!!busy || !canGenerate || !s.source.prompt.trim()} title={canGenerate ? '' : 'Generating needs a connected Krea account'}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Sparkles {...I} />}{busy || (s.media ? 'Generate again' : `Generate ${s.source.model}`)}</button>
      <button className="btn dr-wide" onClick={upload} disabled={!!busy}><Upload {...I} />Or upload instead</button>
    </> : null}
    {s.source.kind === 'upload' ? <>
      <p className="dr-ask">{s.source.ask || 'Upload footage or a still for this scene.'}</p>
      <button className="btn solid dr-wide" onClick={upload} disabled={!!busy}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Upload {...I} />}{busy || (s.media ? 'Replace footage' : 'Upload footage')}</button>
      <p className="mute dr-small">Video (MP4, MOV) or a still. You can also drop a file onto the stage.</p>
    </> : null}
    {s.media ? <>
      <Row label="Fit"><Chips value={s.fit} options={[{ id: 'cover', label: 'Fill' }, { id: 'contain', label: 'Fit' }]} onPick={(v) => set({ fit: v })} /></Row>
      {s.media.kind === 'image' ? <Row label="Motion"><Chips value={s.motion} options={[{ id: 'none', label: 'Still' }, { id: 'push', label: 'Push in' }, { id: 'pull', label: 'Pull out' }, { id: 'pan', label: 'Pan' }]} onPick={(v) => set({ motion: v })} /></Row> : null}
    </> : null}
    <Row label={s.source.kind === 'card' ? 'Colour' : 'Ground'}><Swatches kit={kit} value={s.background} onPick={(h) => h && set({ background: h })} /></Row>
    <p className="dr-kicker">Logo</p>
    {s.logo ? <>
      <Row label="Place"><div className="dr-places">{PLACES.map((p) => <button key={p} className={s.logo!.placement === p ? 'on' : ''} onClick={() => set({ logo: { ...s.logo!, placement: p } })} aria-label={p} title={p} />)}</div></Row>
      <Row label="Size"><Chips value={s.logo.size} options={SIZES.map((x) => ({ id: x, label: x }))} onPick={(v) => set({ logo: { ...s.logo!, size: v } })} /></Row>
      <Row label="Version"><Chips value={s.logo.tone} options={[{ id: 'dark', label: 'For light grounds' }, { id: 'light', label: 'For dark grounds' }]} onPick={(v) => set({ logo: { ...s.logo!, tone: v } })} /></Row>
      <button className="btn" onClick={() => set({ logo: null })}>Remove logo</button>
    </> : <button className="btn dr-wide" onClick={() => set({ logo: { placement: 'bottom', size: 'M', tone: 'light' } })} disabled={!kit.logos.length}><Plus {...I} />Add the logo</button>}
    <p className="dr-kicker">Captions</p>
    {s.captions.map((c) => <button key={c.id} className="dr-capitem" onClick={() => pickCaption(c.id)}><Type {...I} /><span>{c.text}</span><span className="mute">{secs(c.start)}–{secs(c.end)}</span></button>)}
    <button className="btn dr-wide" onClick={addCaption}><Plus {...I} />Add a caption</button>
    <div className="dr-panel-foot"><button className="btn" onClick={duplicate}><Copy {...I} />Duplicate</button><button className="btn" onClick={remove}><Trash2 {...I} />Delete scene</button></div>
  </div>;
}

function CaptionPanel({ c, scene, kit, set, remove }: { c: Caption; scene: Scene; kit: BrandKit; set: (p: Partial<Caption>) => void; remove: () => void }) {
  return <div className="dr-panel">
    <p className="dr-kicker">Caption · {scene.title}</p>
    <textarea className="dr-ta" rows={3} value={c.text} onChange={(e) => set({ text: e.target.value })} autoFocus />
    <Row label="In"><input type="range" min={0} max={scene.duration} step={0.1} value={c.start} onChange={(e) => set({ start: Math.min(Number(e.target.value), c.end - 0.2) })} /><span className="dr-num">{secs(c.start)}</span></Row>
    <Row label="Out"><input type="range" min={0} max={scene.duration} step={0.1} value={c.end} onChange={(e) => set({ end: Math.max(Number(e.target.value), c.start + 0.2) })} /><span className="dr-num">{secs(c.end)}</span></Row>
    <p className="dr-kicker">Layout</p>
    <Row label="Position"><Chips value={c.position} options={[{ id: 'top', label: 'Top' }, { id: 'centre', label: 'Centre' }, { id: 'lower-third', label: 'Lower third' }, { id: 'bottom', label: 'Bottom' }]} onPick={(v) => set({ position: v })} /></Row>
    <Row label="Align"><Chips value={c.align} options={[{ id: 'left', label: <AlignLeft size={13} aria-hidden />, title: 'Left' }, { id: 'centre', label: <AlignCenter size={13} aria-hidden />, title: 'Centre' }, { id: 'right', label: <AlignRight size={13} aria-hidden />, title: 'Right' }]} onPick={(v) => set({ align: v })} /></Row>
    <Row label="Size"><Chips value={c.size} options={SIZES.map((x) => ({ id: x, label: x }))} onPick={(v) => set({ size: v })} /></Row>
    <p className="dr-kicker">Style</p>
    <Row label="Font"><select className="dr-sel" value={c.font} onChange={(e) => set({ font: e.target.value })}>{(kit.fonts.length ? kit.fonts : [{ role: c.font, label: c.font, name: c.font }]).map((f) => <option key={f.role} value={f.role}>{f.name} ({f.label})</option>)}</select></Row>
    <Row label="Colour"><Swatches kit={kit} value={c.colour} onPick={(h) => h && set({ colour: h })} /></Row>
    <Row label="Box"><Swatches kit={kit} value={c.box} onPick={(h) => set({ box: h })} none /></Row>
    <p className="dr-kicker">Animation</p>
    <Chips value={c.anim} options={TEXT_ANIMS.map((a) => ({ id: a.id, label: a.label }))} onPick={(v) => set({ anim: v })} />
    <div className="dr-panel-foot"><button className="btn" onClick={remove}><Trash2 {...I} />Delete caption</button></div>
  </div>;
}

function TrackPanel({ a, busy, canGenerate, set, make, upload, remove, total: T }: { a: Track; busy?: string; canGenerate: boolean; set: (p: Partial<Track>) => void; make: () => void; upload: () => void; remove: () => void; total: number }) {
  return <div className="dr-panel">
    <p className="dr-kicker">{a.kind === 'music' ? 'Music' : 'Sound effect'}</p>
    <input className="dr-panel-t" value={a.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
    <textarea className="dr-ta" rows={4} value={a.prompt || ''} onChange={(e) => set({ prompt: e.target.value })} placeholder={a.kind === 'music' ? 'Genre, tempo, instruments, mood, how it builds' : 'The sound, e.g. a soft whoosh'} />
    <button className="btn solid dr-wide" onClick={make} disabled={!!busy || !canGenerate || !a.prompt?.trim()}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Sparkles {...I} />}{busy || (a.media ? 'Make again with Krea' : a.kind === 'music' ? 'Compose with Krea' : 'Make with Krea')}</button>
    <button className="btn dr-wide" onClick={upload} disabled={!!busy}><Upload {...I} />Upload your own</button>
    {a.media?.url ? <audio controls src={a.media.url} className="dr-audio-prev" /> : null}
    <Row label="Volume"><input type="range" min={0} max={1} step={0.05} value={a.volume} onChange={(e) => set({ volume: Number(e.target.value) })} /><span className="dr-num">{Math.round(a.volume * 100)}%</span></Row>
    {a.kind === 'sfx' ? <Row label="At"><input type="range" min={0} max={Math.max(0.1, T)} step={0.1} value={a.at} onChange={(e) => set({ at: Number(e.target.value) })} /><span className="dr-num">{secs(a.at)}</span></Row> : null}
    <div className="dr-panel-foot"><button className="btn" onClick={remove}><Trash2 {...I} />Remove</button></div>
  </div>;
}

/** Plays the music from the playhead and fires each sound effect as the playhead passes it */
function AudioLayer({ tracks, t, playing }: { tracks: Track[]; t: number; playing: boolean }) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  const last = useRef(t);
  useEffect(() => {
    for (const a of tracks) {
      const el = refs.current[a.id]; if (!el || !a.media?.url) continue;
      el.volume = clamp(a.volume, 0, 1);
      if (a.kind === 'music') {
        if (playing) { if (Math.abs(el.currentTime - t) > 0.3) el.currentTime = t; if (el.paused) el.play().catch(() => {}); } else if (!el.paused) el.pause();
      } else if (playing && last.current <= a.at && t > a.at && t - a.at < 0.5) { el.currentTime = 0; el.play().catch(() => {}); }
      else if (!playing && !el.paused) el.pause();
    }
    last.current = t;
  }, [t, playing, tracks]);
  return <>{tracks.filter((a) => a.media?.url).map((a) => <audio key={a.id} ref={(el) => { refs.current[a.id] = el; }} src={a.media!.url} preload="auto" />)}</>;
}

function Timeline({ doc, t, setT, sel, pick, resize, busy }: { doc: FileRow['data']; t: number; setT: (t: number) => void; sel: Sel; pick: (s: Sel) => void; resize: (id: string, dur: number) => void; busy: Record<string, string> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth - 24)); ro.observe(el); return () => ro.disconnect(); }, []);
  const T = total(doc);
  const span = Math.max(T + 2, 10);
  const pps = w / span;
  const st = starts(doc);
  const ticks = useMemo(() => { const step = span > 60 ? 10 : span > 20 ? 5 : 1; return Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step); }, [span]);
  const scrub = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const go = (x: number) => setT(clamp((x - r.left) / pps, 0, T));
    go(e.clientX);
    const mv = (ev: PointerEvent) => go(ev.clientX); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  const drag = (e: React.PointerEvent, s: Scene) => {
    e.stopPropagation(); const x0 = e.clientX, d0 = s.duration;
    const mv = (ev: PointerEvent) => resize(s.id, Math.round(clamp(d0 + (ev.clientX - x0) / pps, 0.5, 30) * 10) / 10);
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  return <div className="dr-tl" ref={wrap}>
    <div className="dr-tl-in" style={{ width: w }}>
      <div className="dr-ruler" onPointerDown={scrub}>{ticks.map((x) => <span key={x} style={{ left: x * pps }}>{x}s</span>)}</div>
      <div className="dr-lane">
        <span className="dr-lane-l"><Film size={12} aria-hidden /></span>
        {doc.scenes.map((s, i) => <div key={s.id} className={'dr-clip' + ((sel?.type === 'scene' && sel.id === s.id) || (sel?.type === 'caption' && sel.sceneId === s.id) ? ' on' : '') + (s.media || s.source.kind === 'card' ? '' : ' need')} style={{ left: st[i] * pps, width: Math.max(8, s.duration * pps - 2), background: s.background }} onClick={() => { pick({ type: 'scene', id: s.id }); setT(st[i] + 0.01); }}>
          {s.media?.url && s.media.kind === 'image' ? <img src={s.media.url} alt="" /> : null}
          {s.media?.url && s.media.kind === 'video' ? <video src={s.media.url + '#t=0.3'} muted preload="metadata" /> : null}
          <span className="dr-clip-t">{busy[s.id] ? <Loader2 size={10} className="spin" aria-hidden /> : null}{s.title}</span>
          <span className="dr-clip-h" onPointerDown={(e) => drag(e, s)} title="Drag to change length" />
        </div>)}
      </div>
      <div className="dr-lane thin">
        <span className="dr-lane-l"><Type size={12} aria-hidden /></span>
        {doc.scenes.flatMap((s, i) => s.captions.map((c) => <div key={c.id} className={'dr-capbar' + (sel?.type === 'caption' && sel.id === c.id ? ' on' : '')} style={{ left: (st[i] + c.start) * pps, width: Math.max(6, (c.end - c.start) * pps) }} onClick={() => { pick({ type: 'caption', id: c.id, sceneId: s.id }); setT(st[i] + c.start + 0.05); }}>{c.text}</div>))}
      </div>
      <div className="dr-lane thin">
        <span className="dr-lane-l"><Music size={12} aria-hidden /></span>
        {doc.audio.map((a) => a.kind === 'music'
          ? <div key={a.id} className={'dr-audbar' + (sel?.type === 'track' && sel.id === a.id ? ' on' : '') + (a.media ? '' : ' need')} style={{ left: 0, width: Math.max(20, T * pps) }} onClick={() => pick({ type: 'track', id: a.id })}>{busy[a.id] ? 'Composing…' : a.name}</div>
          : <div key={a.id} className={'dr-sfx-dot' + (sel?.type === 'track' && sel.id === a.id ? ' on' : '') + (a.media ? '' : ' need')} style={{ left: a.at * pps }} title={a.name} onClick={() => pick({ type: 'track', id: a.id })} />)}
      </div>
      <div className="dr-playhead" style={{ left: t * pps }} />
    </div>
  </div>;
}
