'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ShowcaseRow } from '@/lib/showcase';
import { ShowcaseMedia } from '@/components/portal/ShowcaseFrame';

// The home page hero: a 3:2 frame that steps through the showcase at a slow pace, with a hard cut between slides
// (no fade). A full-width 3:2 slide fills it; a pair of 3:4 frames splits it down the middle.
export function HeroReel({ rows, urls, href, label }: { rows: ShowcaseRow[]; urls: Record<string, string>; href: string; label: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (rows.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % rows.length), 6000);
    return () => clearInterval(t);
  }, [rows.length, paused]);
  const r = rows[i];
  return (
    <section className="hr" aria-label={label} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className={'hr-slide ' + r.layout} key={r.id}>
        {r.frames.map((f, k) => <div key={k} className="hr-frame" style={f.bg ? { background: f.bg } : undefined}><ShowcaseMedia f={f} url={f.path ? urls[f.path] : undefined} /></div>)}
      </div>
      <Link className="hr-cta" href={href}>View the showcase <span aria-hidden>→</span></Link>
      {rows.length > 1 ? <div className="hr-dots" aria-hidden>{rows.map((x, k) => <i key={x.id} className={k === i ? 'on' : ''} />)}</div> : null}
    </section>
  );
}
