'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Sparkles } from 'lucide-react';
import { ASPECTS, LOGO_SCALE, SIZE_SCALE, captionFrame, motionTransform, sceneAt, type BrandKit, type Caption, type Doc, type Scene } from '@/lib/director/model';

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
    {at ? <SceneFrame scene={at.scene} local={at.local} kit={kit} base={base} playing={playing} selected={selected} onPick={onPick} /> : <div className="dr-stage-empty">Add a scene to begin</div>}
  </div>;
}

function SceneFrame({ scene: s, local, kit, base, playing, selected, onPick }: { scene: Scene; local: number; kit: BrandKit; base: number; playing: boolean; selected?: string | null; onPick?: (sel: { type: 'scene' | 'caption'; id: string; sceneId: string }) => void }) {
  const p = s.duration ? local / s.duration : 0;
  const logo = s.logo ? (kit.logos.find((l) => (s.logo!.tone === 'light' ? l.light : !l.light)) || kit.logos[0]) : null;
  return <div className="dr-frame" style={{ background: s.background }} onClick={() => onPick?.({ type: 'scene', id: s.id, sceneId: s.id })}>
    {s.media?.url ? (s.media.kind === 'video'
      ? <SyncedVideo key={s.media.path} src={s.media.url} time={local} playing={playing} fit={s.fit} />
      : <img className="dr-media" src={s.media.url} alt="" style={{ objectFit: s.fit, transform: motionTransform(s.motion, p) }} />)
      : s.source.kind !== 'card' ? <div className="dr-need">
        {s.source.kind === 'upload' ? <Camera size={base * 0.07} strokeWidth={1.3} aria-hidden /> : <Sparkles size={base * 0.07} strokeWidth={1.3} aria-hidden />}
        <strong style={{ fontSize: base * 0.04 }}>{s.source.kind === 'upload' ? 'Your footage' : s.source.model === 'image' ? 'Image to generate' : 'Video to generate'}</strong>
        <span style={{ fontSize: base * 0.03 }}>{s.source.kind === 'upload' ? s.source.ask : s.source.prompt || s.note}</span>
      </div> : null}
    {logo && s.logo ? <img className="dr-logo" src={logo.url} alt="" style={{ ...PLACE[s.logo.placement], width: base * LOGO_SCALE[s.logo.size] * (s.logo.placement === 'centre' ? 1.4 : 1) }} /> : null}
    {s.captions.map((c) => {
      const f = captionFrame(c, local); if (!f.visible) return null;
      const text = f.chars !== undefined ? c.text.slice(0, f.chars) : c.text;
      return <div key={c.id} className={'dr-cap' + (selected === c.id ? ' sel' : '')} style={{ ...CAP_POS[c.position], textAlign: c.align === 'centre' ? 'center' : c.align, justifyContent: c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center' }}
        onClick={(e) => { e.stopPropagation(); onPick?.({ type: 'caption', id: c.id, sceneId: s.id }); }}>
        <span style={{ ...f.style, fontFamily: `var(--font-${c.font}, var(--pt-display))`, fontSize: base * SIZE_SCALE[c.size], color: c.colour, background: c.box || undefined, padding: c.box ? '0.15em 0.4em' : undefined, lineHeight: 1.08, display: 'inline-block', maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
          {text}{f.chars !== undefined && f.chars < c.text.length ? <span className="dr-caret">|</span> : null}
        </span>
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
  return <video ref={v} className="dr-media" src={src} muted playsInline preload="auto" loop style={{ objectFit: fit }} />;
}
