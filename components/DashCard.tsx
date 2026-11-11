'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from 'lucide-react';

// A card on a studio dashboard: a title, a short summary of where things are, and the full detail one click away
// in a panel that slides in from the right, so the page never shows everything at once.
export function DashCard({ title, icon, children, sheet, action = 'Open', sheetTitle, wide, tone }: {
  title: string; icon?: React.ReactNode; children?: React.ReactNode; sheet?: React.ReactNode; action?: string; sheetTitle?: string; wide?: boolean; tone?: 'warn' | 'good';
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, [open]);
  return <section className={'dc' + (wide ? ' wide' : '') + (tone ? ' ' + tone : '')}>
    <header className="dc-h">{icon ? <span className="dc-ic">{icon}</span> : null}<h2>{title}</h2>
      {sheet ? <button type="button" className="dc-open" onClick={() => setOpen(true)}>{action}<ArrowRight size={14} strokeWidth={1.75} aria-hidden /></button> : null}</header>
    <div className="dc-b">{children}</div>
    {open && sheet ? createPortal(<div className="sh-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="sh" role="dialog" aria-modal="true" aria-label={sheetTitle || title}>
        <header className="sh-h"><h2>{sheetTitle || title}</h2><button type="button" className="sh-x" onClick={() => setOpen(false)} aria-label="Close"><X size={18} strokeWidth={1.75} aria-hidden /></button></header>
        <div className="sh-b">{sheet}</div>
      </aside>
    </div>, document.body) : null}
  </section>;
}
