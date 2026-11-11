'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { BookOpen, GalleryHorizontalEnd, LayoutDashboard, ListChecks, Package, Type, MessageSquareQuote, Users, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { overview: LayoutDashboard, review: ListChecks, guidelines: BookOpen, showcase: GalleryHorizontalEnd, typefaces: Type, voice: MessageSquareQuote, resources: Package, client: Users };

// The project's sections. They switch like tabs: one is selected, the arrow keys (and Home/End) move between them,
// and the page keeps its place in the header while the content below changes.
export function ProjectTabs({ id, tabs, current }: { id: string; tabs: readonly (readonly [string, string])[]; current: string }) {
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const go = (i: number) => { const n = (i + tabs.length) % tabs.length; refs.current[n]?.focus(); router.push(`/studio/projects/${id}?tab=${tabs[n][0]}`, { scroll: false }); };
  const at = tabs.findIndex(([k]) => k === current);
  return (
    <div className="pj-tabs" role="tablist" aria-label="Project sections" onKeyDown={(e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
    }}>
      {tabs.map(([k, l], i) => { const Ic = ICONS[k]; const on = k === current; return (
        <Link key={k} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={on} aria-controls="pj-panel" tabIndex={on ? 0 : -1} scroll={false}
          className={'pj-tab' + (on ? ' on' : '')} href={`/studio/projects/${id}?tab=${k}`}>
          {Ic ? <Ic size={16} strokeWidth={1.75} aria-hidden /> : null}{l}
        </Link>); })}
    </div>
  );
}
