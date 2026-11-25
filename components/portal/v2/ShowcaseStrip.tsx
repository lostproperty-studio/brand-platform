'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ShowcaseMedia } from '@/components/portal/ShowcaseFrame';
import type { ShowcaseFrame } from '@/lib/showcase';

// Portal v2 home: the showcase as a level row you scroll sideways. Full-width showcase rows show as 3:2, half
// rows as 3:4, all at the same height, so a mix sits on one line.
export function ShowcaseStrip({ items, urls, href, title }: { items: { f: ShowcaseFrame; wide: boolean }[]; urls: Record<string, string>; href: string; title: string }) {
  const row = useRef<HTMLDivElement>(null);
  const go = (d: number) => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.8, behavior: 'smooth' });
  return <section className="h2-sc" aria-labelledby="h2-sc">
    <div className="h2-row"><h2 id="h2-sc" className="pt-h2">{title}</h2><span className="h2-sc-nav"><Link href={href} className="mute">View all</Link><button type="button" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={16} aria-hidden /></button><button type="button" onClick={() => go(1)} aria-label="Next"><ChevronRight size={16} aria-hidden /></button></span></div>
    <div className="h2-sc-row" ref={row}>
      {items.map((x, i) => <Link key={i} href={href} className={'h2-sc-it' + (x.wide ? ' wide' : '')} style={x.f.bg ? { background: x.f.bg } : undefined}><ShowcaseMedia f={x.f} url={x.f.path ? urls[x.f.path] : undefined} /></Link>)}
    </div>
  </section>;
}
