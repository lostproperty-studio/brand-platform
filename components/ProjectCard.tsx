'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeleteProjectDialog } from '@/components/DeleteProject';

export type CardProject = { id: string; client: string; slug: string; status: 'draft' | 'live' | 'archived'; updated_at: string; repo_full_name: string | null; thumb: string; logo?: string; trialFonts: number };

// Dashboard card with a ⋯ menu: open, preview, archive or restore, delete.
export function ProjectCard({ p }: { p: CardProject }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [del, setDel] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', off);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', off); };
  }, [menu]);
  const archive = async () => {
    setMenu(false);
    await fetch(`/api/projects/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: p.status === 'archived' ? 'draft' : 'archived' }) });
    router.refresh();
  };
  return (
    <div className="db-card" ref={box}>
      <Link href={`/studio/projects/${p.id}`} className="db-card-link">
        <div className="db-thumb" style={{ background: p.thumb }}>{p.logo ? <img src={p.logo} alt="" style={{ maxWidth: '48%', maxHeight: '22%' }} /> : <span style={{ color: '#fff', fontSize: 18 }}>{p.client}</span>}</div>
        <div className="db-meta">
          <div><p>{p.client}</p><p className="mute">Edited {new Date(p.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{p.trialFonts ? ' · trial fonts' : ''}</p></div>
          <span className={'tag ' + p.status}>{p.status === 'live' ? 'Live' : p.status === 'draft' ? 'Draft' : 'Archived'}</span>
        </div>
      </Link>
      <button className="db-more" aria-label={`Options for ${p.client}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden><circle cx="2" cy="2" r="1.4" /><circle cx="7" cy="2" r="1.4" /><circle cx="12" cy="2" r="1.4" /></svg>
      </button>
      {menu ? <div className="menu" role="menu">
        <Link role="menuitem" href={`/studio/projects/${p.id}`}>Open</Link>
        <a role="menuitem" href={`/p/${p.slug}`}>Preview as client</a>
        <button role="menuitem" onClick={archive}>{p.status === 'archived' ? 'Restore' : 'Archive'}</button>
        <button role="menuitem" className="danger" onClick={() => { setMenu(false); setDel(true); }}>Delete…</button>
      </div> : null}
      <DeleteProjectDialog id={p.id} client={p.client} repo={p.repo_full_name} open={del} onClose={() => setDel(false)} />
    </div>
  );
}
