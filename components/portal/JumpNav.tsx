'use client';
import { useEffect, useState } from 'react';

// The bar at the top of Resources: jump to a section, and see which one you're in as you scroll.
export function JumpNav({ items }: { items: { id: string; label: string }[] }) {
  const [on, setOn] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id); }, { rootMargin: '-80px 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="rs-jump" aria-label="Sections">
      {items.map((i) => <a key={i.id} href={`#${i.id}`} className={on === i.id ? 'on' : ''} aria-current={on === i.id ? 'true' : undefined}>{i.label}</a>)}
    </nav>
  );
}
