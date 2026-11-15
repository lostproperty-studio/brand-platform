'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, type MotionPreset } from '@/lib/motion/model';
import { drawFrame, loadArtwork, type Artwork } from '@/lib/motion/render';

// A logo moving in the brand's motion, drawn on a canvas that fills its parent. Logos are read once per page.
const cache = new Map<string, Promise<Artwork>>();
export function useArtwork(url?: string) {
  const [art, setArt] = useState<Artwork | null>(null);
  useEffect(() => {
    if (!url || !/\.svg$/i.test(url.split('?')[0])) { setArt(null); return; }
    let live = true;
    if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.text()).then(loadArtwork));
    cache.get(url)!.then((a) => { if (live) setArt(a); }).catch(() => { cache.delete(url); if (live) setArt(null); });
    return () => { live = false; };
  }, [url]);
  return art;
}

/** Keeps the brand's speed whatever the length: the timings stay as the studio set them, and the hold takes up the rest */
export const fitLength = <T extends { length: number; refLength: number }>(P: T, seconds: number): T => ({ ...P, length: seconds, refLength: seconds / (P.length / P.refLength) });

export type Place = (art: Artwork, W: number, H: number) => { s: number; ox: number; oy: number };

export function LogoMotion({ url, P, t, place, onSize }: { url: string; P: MotionPreset; t: number; place?: Place; onSize?: (a: Artwork) => void }) {
  const art = useArtwork(url);
  const cv = useRef<HTMLCanvasElement>(null);
  const tl = useMemo(() => (art ? buildTimeline(P, art.rects, art.w, art.h) : null), [art, P]);
  useEffect(() => { if (art) onSize?.(art); }, [art]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = cv.current; if (!c || !art || !tl) return;
    const r = c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d')!;
    drawFrame(ctx, W, H, art, P, tl, t, null, place ? place(art, W, H) : undefined);
  });
  return <canvas ref={cv} className="mo-layer" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
