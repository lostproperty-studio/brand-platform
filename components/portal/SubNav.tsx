'use client';
import { useEffect, useState } from 'react';

// The chapter's subsections (Wordmark, Symbol, How to use…) as a slim bar that stays at the top while you scroll,
// showing where you are. Keeps the sidebar to chapters only.
export function SubNav({ items }: { items: { id: string; title: string }[] }) {
  const [on, setOn] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setOn(visible.target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((e) => io.observe(e)); return () => io.disconnect();
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav className="sn" aria-label="In this chapter">
      {items.map((i, k) => <a key={i.id} href={`#${i.id}`} className={'sn-it' + (on === i.id ? ' on' : '')} aria-current={on === i.id ? 'location' : undefined}><span className="pt-n">{String(k + 1).padStart(2, '0')}</span>{i.title}</a>)}
    </nav>
  );
}
