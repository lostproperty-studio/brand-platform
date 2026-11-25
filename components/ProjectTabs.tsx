'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { BookOpen, FileText, GalleryHorizontalEnd, LayoutDashboard, ListChecks, Package, Settings, Spline, Type, MessageSquareQuote, Users, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { overview: LayoutDashboard, review: ListChecks, guidelines: BookOpen, showcase: GalleryHorizontalEnd, typefaces: Type, voice: MessageSquareQuote, resources: Package, motion: Spline, pdf: FileText, client: Users, settings: Settings };

type Tab = readonly [string, string];

// The project's sections, in groups down the left (Overview; the editing tools; Client and Settings). On a phone
// they're one strip along the top. They switch like tabs: one is selected, the arrow keys (and Home/End) move
// between them, and the page keeps its place while the content changes.
export function ProjectTabs({ id, groups, current, desk = [] }: { id: string; groups: readonly (readonly Tab[])[]; current: string; desk?: string[] }) {
  const router = useRouter();
  const tabs = groups.flat();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  // The tab you pick is selected straight away and the panel fades while it loads, so switching never feels stuck
  const [pending, start] = useTransition();
  const [want, setWant] = useState(current);
  useEffect(() => { setWant(current); }, [current]);
  useEffect(() => { document.getElementById('pj-panel')?.classList.toggle('pj-loading', pending); }, [pending]);
  // Every tab is fetched ahead, so it's ready when you click
  useEffect(() => { const t = setTimeout(() => tabs.forEach(([k]) => { if (k !== current) router.prefetch(`/studio/projects/${id}?tab=${k}`); }), 600); return () => clearTimeout(t); }, [id, current, tabs, router]);
  const open = (k: string) => { setWant(k); start(() => router.push(`/studio/projects/${id}?tab=${k}`, { scroll: false })); };
  const go = (i: number) => { const n = (i + tabs.length) % tabs.length; refs.current[n]?.focus(); open(tabs[n][0]); };
  const at = tabs.findIndex(([k]) => k === want);
  let i = -1;
  return (
    <div className="pj-tabs" role="tablist" aria-orientation="vertical" aria-label="Project sections" onKeyDown={(e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
    }}>
      {groups.map((g, gi) => [gi ? <span key={`sep${gi}`} className="pj-sep" role="presentation" /> : null, ...g.map(([k, l]) => {
        i++; const n = i; const Ic = ICONS[k]; const on = k === want;
        return <Link key={k} ref={(el) => { refs.current[n] = el; }} role="tab" aria-selected={on} aria-controls="pj-panel" tabIndex={on ? 0 : -1} scroll={false}
          title={l} className={'pj-tab' + (on ? ' on' : '') + (desk.includes(k) ? ' desk' : '')} href={`/studio/projects/${id}?tab=${k}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (k !== want) open(k); }}>
          {Ic ? <Ic size={16} strokeWidth={1.75} aria-hidden /> : null}<span className="pj-tab-l">{l}</span>
        </Link>;
      })])}
    </div>
  );
}
