'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Sparkles } from 'lucide-react';
import { ASPECTS, LOGO_SCALE, SIZE_SCALE, captionFrame, fxAt, motionParams, motionTransform, sceneAt, type BrandKit, type Caption, type Doc, type Scene } from '@/lib/director/model';
import { EffectView } from '@/components/effects/Effects';
import type { EffectLayer } from '@/lib/effects/model';
import { presetFor, typeFor } from '@/lib/motion/model';
import { LogoMotion, fitLength } from '@/components/motion/LogoMotion';
import { TypeStage } from '@/components/motion/TypeStage';
import { Endboard } from '@/components/motion/Endboard';

const PLACE: Record<string, React.CSSProperties> = {
  'top-left': { top: '6%', left: '6%' }, top: { top: '6%', left: '50%', transform: 'translateX(-50%)' }, 'top-right': { top: '6%', right: '6%' },
  centre: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'bottom-left': { bottom: '6%', left: '6%' }, bottom: { bottom: '6%', left: '50%', transform: 'translateX(-50%)' }, 'bottom-right': { bottom: '6%', right: '6%' }
};
const CAP_POS: Record<Caption['position'], React.CSSProperties> = {
  top: { top: '8%' }, centre: { top: '50%', transform: 'translateY(-50%)' }, bottom: { bottom: '8%' }, 'lower-third': { bottom: '22%' }
};

// The frame at time t: the scene's picture (or a placeholder saying what's needed), its logo and captions, drawn at
// the canvas proportions. Sizes scale with the frame, so it looks the same small or full screen.
export function Stage({ doc, kit, t, playing, selected, onPick }: { doc: Doc; kit: BrandKit; t: number; playing: boolean; selected?: string | null; onPick?: (sel: { type: 'scene' | 'caption'; id: string; sceneId: string }) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 640 });
  const a = ASPECTS.find((x) => x.id === doc.aspect) || ASPECTS[0];
  useEffect(() => {
    const el = box.current?.parentElement; if (!el) return;
    const fit = () => { const W = el.clientWidth - 32, H = el.clientHeight - 32; const s = Math.min(W / a.w, H / a.h); setSize({ w: Math.max(80, Math.floor(a.w * s)), h: Math.max(80, Math.floor(a.h * s)) }); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [a.w, a.h]);
  const at = sceneAt(doc, t);
  const base = Math.min(size.w, size.h);
  return <div ref={box} className="dr-stage" style={{ width: size.w, height: size.h }}>
    {at ? <SceneFrame scene={at.scene} local={at.local} t={t} fx={fxAt(doc, t)} kit={kit} base={base} w={size.w} h={size.h} playing={playing} selected={selected} onPick={onPick} /> : <div className="dr-stage-empty">Add a scene to begin</div>}
  </div>;
}

function SceneFrame({ scene: s, local, t, fx, kit, base, w, h, playing, selected, onPick }: { scene: Scene; local: number; t: number; fx: EffectLayer[]; kit: BrandKit; base: number; w: number; h: number; playing: boolean; selected?: string | null; onPick?: (sel: { type: 'scene' | 'caption'; id: string; sceneId: string }) => void }) {
  const p = s.duration ? local / s.duration : 0;
  const logo = s.logo ? (kit.logos.find((l) => (s.logo!.tone === 'light' ? l.light : !l.light)) || kit.logos[0]) : null;
  const frame = useRef<HTMLDivElement>(null);
  return <div ref={frame} className="dr-frame" style={{ background: s.background }} onClick={() => onPick?.({ type: 'scene', id: s.id, sceneId: s.id })}>
    {s.media?.url ? (s.media.kind === 'video'
      ? <SyncedVideo key={s.media.path} src={s.media.url} time={local} playing={playing} fit={s.fit} />
      : <img className="dr-media" src={s.media.url} alt="" crossOrigin="anonymous" style={{ objectFit: s.fit, transform: motionTransform(s.motion, p) }} />)
      : s.source.kind !== 'card' ? <div className="dr-need">
        {s.source.kind === 'upload' ? <Camera size={base * 0.07} strokeWidth={1.3} aria-hidden /> : <Sparkles size={base * 0.07} strokeWidth={1.3} aria-hidden />}
        <strong style={{ fontSize: base * 0.04 }}>{s.source.kind === 'upload' ? 'Your footage' : s.source.model === 'image' ? 'Image to generate' : 'Video to generate'}</strong>
        <span style={{ fontSize: base * 0.03 }}>{s.source.kind === 'upload' ? s.source.ask : s.source.prompt || s.note}</span>
      </div> : null}
    {fx.length ? <FxFrame frame={frame} scene={s} p={p} t={t} layers={fx} live={playing} /> : null}
    {s.endboard && kit.motion ? <Endboard eb={s.endboard} kit={kit} motion={kit.motion} local={local} duration={s.duration} w={w} h={h} ink={lum(s.background) < 0.5 ? '#ffffff' : '#000000'} /> : null}
    {logo && s.logo && !s.endboard ? (kit.motion && /\.svg$/i.test(logo.url.split('?')[0])
      // Portal v2: the logo builds in on the brand's motion, and stays
      ? <LogoMotion url={logo.url} P={fitLength({ ...presetFor(kit.motion, logo.key), out: 'none' as const }, s.duration)} t={local * 1000} place={(art, W, H) => logoPlace(art, W, H, s.logo!.placement, LOGO_SCALE[s.logo!.size] * (s.logo!.placement === 'centre' ? 1.4 : 1))} />
      : <img className="dr-logo" src={logo.url} alt="" style={{ ...PLACE[s.logo.placement], width: base * LOGO_SCALE[s.logo.size] * (s.logo.placement === 'centre' ? 1.4 : 1) }} />) : null}
    {s.captions.map((c) => {
      const f = captionFrame(c, local); if (!f.visible) return null;
      const text = f.chars !== undefined ? c.text.slice(0, f.chars) : c.text;
      return <div key={c.id} className={'dr-cap' + (selected === c.id ? ' sel' : '')} style={{ ...CAP_POS[c.position], textAlign: c.align === 'centre' ? 'center' : c.align, justifyContent: c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center' }}
        onClick={(e) => { e.stopPropagation(); onPick?.({ type: 'caption', id: c.id, sceneId: s.id }); }}>
        {c.anim === 'brand' && kit.motion ? <TypeStage text={c.text} P={fitLength(typeFor(kit.motion, c.font), Math.max(0.3, c.end - c.start))} t={(local - c.start) * 1000} font={`var(--font-${c.font}, var(--pt-display))`} colour={c.colour} size={base * SIZE_SCALE[c.size]} align={c.align} />
        : <span style={{ ...f.style, fontFamily: `var(--font-${c.font}, var(--pt-display))`, fontSize: base * SIZE_SCALE[c.size], color: c.colour, background: c.box || undefined, padding: c.box ? '0.15em 0.4em' : undefined, lineHeight: 1.08, display: 'inline-block', maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
          {text}{f.chars !== undefined && f.chars < c.text.length ? <span className="dr-caret">|</span> : null}
        </span>}
      </div>;
    })}
  </div>;
}

/** A muted video kept in step with the playhead */
function SyncedVideo({ src, time, playing, fit }: { src: string; time: number; playing: boolean; fit: 'cover' | 'contain' }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = v.current; if (!el) return;
    const want = el.duration ? time % el.duration : time;
    if (!playing || Math.abs(el.currentTime - want) > 0.35) { try { el.currentTime = want; } catch { /* not loaded yet */ } }
    if (playing && el.paused) el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
  }, [time, playing]);
  return <video ref={v} className="dr-media" src={src} crossOrigin="anonymous" muted playsInline preload="auto" loop style={{ objectFit: fit }} />;
}

const lum = (hex: string) => { const n = parseInt((hex || '#000').replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
/** Where a placed logo sits, in canvas pixels: its width a share of the frame's shorter side, 6% in from the edges */
function logoPlace(art: { w: number; h: number }, W: number, H: number, at: string, share: number) {
  const s = (Math.min(W, H) * share) / art.w; const lw = art.w * s, lh = art.h * s;
  const mx = W * 0.06, my = H * 0.06;
  const ox = at.endsWith('left') ? mx : at.endsWith('right') ? W - mx - lw : (W - lw) / 2;
  const oy = at.startsWith('top') ? my : at.startsWith('bottom') ? H - my - lh : (H - lh) / 2;
  return { s, ox, oy };
}

/** Effect layers over the picture: the scene's ground and its footage or still (with its fit and camera move) drawn
 *  into a canvas, then through the layers. Logos and captions stay on top, untouched. */
function FxFrame({ frame, scene: s, p, t, layers, live }: { frame: React.RefObject<HTMLDivElement | null>; scene: Scene; p: number; t: number; layers: EffectLayer[]; live: boolean }) {
  const comp = useRef<HTMLCanvasElement | null>(null);
  const source = () => {
    const f = frame.current; if (!f) return null;
    const d = Math.min(2, devicePixelRatio || 1); const W = Math.max(2, Math.round(f.clientWidth * d)), H = Math.max(2, Math.round(f.clientHeight * d));
    const c = comp.current || (comp.current = document.createElement('canvas')); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d')!; x.fillStyle = s.background || '#000'; x.fillRect(0, 0, W, H);
    const m = f.querySelector<HTMLVideoElement | HTMLImageElement>('video.dr-media, img.dr-media');
    const mw = m ? ('videoWidth' in m ? m.videoWidth : m.naturalWidth) : 0, mh = m ? ('videoHeight' in m ? m.videoHeight : m.naturalHeight) : 0;
    if (m && mw && mh) {
      const k = s.fit === 'contain' ? Math.min(W / mw, H / mh) : Math.max(W / mw, H / mh);
      const mp = m instanceof HTMLImageElement ? motionParams(s.motion, p) : { scale: 1, tx: 0 };
      const dw = mw * k * mp.scale, dh = mh * k * mp.scale;
      try { x.drawImage(m, (W - dw) / 2 + mp.tx * W, (H - dh) / 2, dw, dh); } catch { /* not ready */ }
    }
    return c;
  };
  return <div className="dr-fx" aria-hidden><EffectView source={source} layers={layers} time={t} live={live || layers.some((l) => l.effects.some((e) => e.on && e.kind === 'noise' && Number(e.params.speed) > 0))} /></div>;
}
