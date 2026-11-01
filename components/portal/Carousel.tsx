'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// A row of slides you click through: big cards of text (strategy, principles) or images (the brand in action).
// The next slide peeks in from the right; arrows, the keyboard, a swipe or a scroll all move it on.
export function Carousel({ slides, label, variant, editing, extra = 0 }: { slides: React.ReactNode[]; label: string; variant: 'cards' | 'images'; editing?: boolean; /** Trailing slides that aren't content (the editor's add button) */ extra?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const n = slides.length;
  const go = useCallback((i: number) => {
    const el = track.current; if (!el) return;
    const k = Math.max(0, Math.min(n - 1, i));
    const slide = el.children[k] as HTMLElement | undefined;
    if (slide) el.scrollTo({ left: slide.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft, behavior: 'smooth' });
    setAt(k);
  }, [n]);
  // Follow manual scrolling and swiping
  useEffect(() => {
    const el = track.current; if (!el) return;
    const onScroll = () => { const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth || 1; setAt(Math.round(el.scrollLeft / (w + 16))); };
    el.addEventListener('scroll', onScroll, { passive: true }); return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className={'gc gc-' + variant} role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="gc-track" ref={track} tabIndex={editing ? -1 : 0}
        onKeyDown={(e) => { if (editing && (e.target as HTMLElement).isContentEditable) return; if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); } }}>
        {slides.map((s, i) => <div key={i} className="gc-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}>{s}</div>)}
      </div>
      {n > 1 ? <div className="gc-ctl">
        <span className="gc-count" aria-live="polite">{Math.min(at, n - extra - 1) + 1} / {n - extra}</span>
        <button type="button" className="gc-btn" onClick={() => go(at - 1)} disabled={at <= 0} aria-label="Previous"><ChevronLeft size={18} strokeWidth={1.75} aria-hidden /></button>
        <button type="button" className="gc-btn" onClick={() => go(at + 1)} disabled={at >= n - 1} aria-label="Next"><ChevronRight size={18} strokeWidth={1.75} aria-hidden /></button>
      </div> : null}
    </div>
  );
}
