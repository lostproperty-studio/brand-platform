'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, partAt, type Rect, type TypePreset } from '@/lib/motion/model';

// Type in the brand's motion: the text split into lines, words or letters, each revealed by the type behaviour, at
// time t (ms). Used by the Motion tab's preview and by Director's captions, so they move the same way.
export function TypeStage({ text, P, t, font, colour, size, align = 'left', lineHeight = 1.05 }: { text: string; P: TypePreset; t: number; font?: string; colour: string; size: number; align?: 'left' | 'centre' | 'right'; lineHeight?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ rects: Rect[]; of: number[]; boxes: Rect[]; w: number; h: number } | null>(null);
  // Units: letters, or words (spaces kept so the text wraps as it would)
  const units = useMemo(() => P.split === 'letters' ? [...text] : text.split(/(\s+)/).filter((x) => x.length), [text, P.split]);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => {
      const o = el.getBoundingClientRect();
      const spans = [...el.querySelectorAll<HTMLSpanElement>('[data-u]')];
      const boxes = spans.map((s) => { const r = s.getBoundingClientRect(); return [r.left - o.left, r.top - o.top, r.width, r.height] as Rect; });
      // Parts: each unit, or each line (units sharing a top), or the whole thing
      let of: number[]; let rects: Rect[];
      if (P.split === 'lines') {
        const tops: number[] = [];
        of = boxes.map((b, k) => { if (!/\S/.test(spans[k].textContent || '')) return -1; let i = tops.findIndex((y) => Math.abs(y - b[1]) < b[3] * 0.5); if (i < 0) { tops.push(b[1]); i = tops.length - 1; } return i; });
        rects = tops.map((_, i) => { const bs = boxes.filter((_, k) => of[k] === i); const x1 = Math.min(...bs.map((b) => b[0])), y1 = Math.min(...bs.map((b) => b[1])), x2 = Math.max(...bs.map((b) => b[0] + b[2])), y2 = Math.max(...bs.map((b) => b[1] + b[3])); return [x1, y1, x2 - x1, y2 - y1] as Rect; });
      } else { let n = 0; of = spans.map((s) => (/\S/.test(s.textContent || '') ? n++ : -1)); rects = boxes.filter((_, i) => of[i] >= 0); }
      setGeo({ rects, of, boxes, w: o.width, h: o.height });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [units, P.split, size, font]);
  const tl = useMemo(() => (geo ? buildTimeline({ ...P, split: P.split === 'whole' ? 'whole' : 'words' } as TypePreset, geo.rects, geo.w, geo.h) : null), [geo, P]);
  // Each part's place in the timeline, by its box (the timeline sorts parts into the preset's order)
  const rankOf = useMemo(() => { if (!tl || !geo) return [] as number[]; return geo.rects.map((r) => tl.parts.findIndex((p) => p.r === r)); }, [tl, geo]);
  const whole = P.split === 'whole';
  return <div ref={box} style={{ position: 'relative', fontFamily: font, fontSize: size, lineHeight, color: colour, textAlign: align === 'centre' ? 'center' : align, whiteSpace: 'pre-wrap', transform: tl ? `translate(${tl.driftX.at(t)}px, ${tl.driftY.at(t)}px)` : undefined }}>
    {units.map((u, i) => {
      let style: React.CSSProperties = { display: 'inline-block', whiteSpace: 'pre' };
      if (tl && geo && /\S/.test(u)) {
        const part = whole ? tl.parts[0] : geo.of[i] >= 0 ? tl.parts[rankOf[geo.of[i]]] : undefined;
        if (part) {
          const f = partAt(P, part, t); const b = geo.boxes[i];
          // The part's visible box, cut to this unit's own box
          const l = Math.max(0, f.clip[0] - b[0]), tp = Math.max(0, f.clip[1] - b[1]), r = Math.max(0, b[0] + b[2] - (f.clip[0] + f.clip[2])), bt = Math.max(0, b[1] + b[3] - (f.clip[1] + f.clip[3]));
          style = { ...style, clipPath: P.build === 'wipe' ? `inset(${tp}px ${r}px ${bt}px ${l}px)` : undefined, opacity: f.opacity, transform: f.dx || f.dy || f.scale !== 1 ? `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})` : undefined };
        }
      }
      return <span key={i} data-u style={style}>{u}</span>;
    })}
  </div>;
}
