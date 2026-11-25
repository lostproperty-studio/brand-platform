'use client';
import { useMemo, useState } from 'react';
import { buildTimeline, presetFor, typeFor, type BrandMotion, type MotionPreset } from '@/lib/motion/model';
import { placement, type Artwork } from '@/lib/motion/render';
import type { BrandKit, Endboard as EB, Size } from '@/lib/director/model';
import { LogoMotion, fitLength } from '@/components/motion/LogoMotion';
import { TypeStage } from '@/components/motion/TypeStage';

const TEXT: Record<Size, number> = { S: 0.032, M: 0.045, L: 0.065, XL: 0.09 };
const ICON: Record<Size, number> = { S: 0.05, M: 0.07, L: 0.1, XL: 0.14 };

// A logo endboard: the logo builds in the brand's motion at the size chosen, then any lines of text or icons follow
// in the brand's type motion, above or below it or at the top or bottom of the frame. local is seconds into the scene.
export function Endboard({ eb, kit, motion, local, duration, w, h, ink }: { eb: EB; kit: BrandKit; motion: BrandMotion; local: number; duration: number; w: number; h: number; ink: string }) {
  const logo = kit.logos.find((l) => l.name === eb.logo) || kit.logos[0];
  const [art, setArt] = useState<Artwork | null>(null);
  const base = useMemo(() => presetFor(motion, logo?.key), [motion, logo?.key]);
  const k = base.length / base.refLength;
  const P = useMemo(() => fitLength<MotionPreset>({ ...base, scale: eb.scale, delay: (eb.delay * 1000) / k, out: eb.out ? (base.out === 'none' ? 'mirror' : base.out) : 'none' }, duration), [base, eb.scale, eb.delay, eb.out, duration, k]);
  // When the logo has finished building, the rest follows
  const built = useMemo(() => (art ? Math.max(...buildTimeline(P, art.rects, art.w, art.h).parts.map((p) => p.spans.in[1])) / 1000 : eb.delay + 0.8), [art, P, eb.delay]);
  const logoH = art ? art.h * placement(art, w, h, eb.scale).s : h * 0.15;
  const from = Math.min(built - 0.15, duration - 0.3);
  const role = kit.fonts.find((f) => f.role === 'display')?.role;
  const T0 = useMemo(() => typeFor(motion, role), [motion, role]);
  const TP = useMemo(() => fitLength({ ...T0, out: P.out === 'none' ? 'none' as const : T0.out === 'none' ? 'mirror' as const : T0.out }, Math.max(0.4, duration - from)), [T0, P.out, duration, from]);
  const slots = { above: eb.items.filter((i) => i.at === 'above'), below: eb.items.filter((i) => i.at === 'below'), top: eb.items.filter((i) => i.at === 'top'), bottom: eb.items.filter((i) => i.at === 'bottom') };
  const base_ = Math.min(w, h);
  const item = (i: EB['items'][number]) => {
    if (i.kind === 'icon') {
      const ic = kit.icons?.find((x) => x.name === i.icon);
      const o = Math.max(0, Math.min(1, (local - from) / 0.4)) * (P.out === 'none' ? 1 : Math.max(0, Math.min(1, (duration - local) / 0.4)));
      return ic ? <img key={i.id} src={ic.url} alt="" style={{ height: base_ * ICON[i.size], opacity: o, filter: ink === '#ffffff' ? 'invert(1)' : undefined }} /> : null;
    }
    return <div key={i.id} style={{ display: 'flex', justifyContent: 'center' }}><TypeStage text={i.text || ' '} P={TP} t={(local - from) * 1000} font={`var(--font-${i.font || kit.fonts.find((f) => f.role === 'display')?.role || 'display'}, var(--pt-display))`} colour={ink} size={base_ * TEXT[i.size]} align="centre" /></div>;
  };
  const col: React.CSSProperties = { position: 'absolute', left: '6%', right: '6%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: base_ * 0.02 };
  return <>
    {logo ? <LogoMotion url={logo.url} P={P} t={local * 1000} onSize={setArt} /> : null}
    {slots.above.length ? <div style={{ ...col, bottom: `calc(50% + ${logoH / 2 + base_ * 0.035}px)` }}>{slots.above.map(item)}</div> : null}
    {slots.below.length ? <div style={{ ...col, top: `calc(50% + ${logoH / 2 + base_ * 0.035}px)` }}>{slots.below.map(item)}</div> : null}
    {slots.top.length ? <div style={{ ...col, top: '7%' }}>{slots.top.map(item)}</div> : null}
    {slots.bottom.length ? <div style={{ ...col, bottom: '7%' }}>{slots.bottom.map(item)}</div> : null}
  </>;
}
