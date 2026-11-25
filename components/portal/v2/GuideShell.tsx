'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Portal v2: the sidebar is an icon rail, so the guidelines get their own list of chapters beside the page.
export function GuideShell({ slug, chapters, children }: { slug: string; chapters: { id: string; title: string }[]; children: React.ReactNode }) {
  const path = usePathname();
  const base = `/p/${slug}/guidelines`;
  if (!path.startsWith(base) || !chapters.length) return <>{children}</>;
  return <div className="pt-gwrap">
    <nav className="pt-chap" aria-label="Chapters">
      <Link href={base} className="pt-chap-h">Guidelines</Link>
      {chapters.map((c, k) => { const h = `${base}/${c.id.replace(/[:;]/g, '-')}`; const on = path === h; return <Link key={c.id} href={h} className={'pt-chap-it' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}><span className="pt-n">{String(k + 1).padStart(2, '0')}</span>{c.title}</Link>; })}
    </nav>
    <div className="pt-gmain">{children}</div>
  </div>;
}
