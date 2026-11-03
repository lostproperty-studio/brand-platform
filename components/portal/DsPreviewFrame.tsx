'use client';
import { useEffect, useRef, useState } from 'react';

// The design system preview, embedded: grows to the page's height so it reads as part of the portal page.
export function DsPreviewFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(900);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const f = ref.current; if (!f) return;
    const fit = () => { try { const d = f.contentDocument; if (d?.body) setH(Math.max(600, d.documentElement.scrollHeight)); } catch { /* cross-origin: keep the default */ } };
    f.addEventListener('load', fit);
    const t = setInterval(fit, 1200);
    return () => { f.removeEventListener('load', fit); clearInterval(t); };
  }, []);
  function flip(next: 'light' | 'dark') { setTheme(next); try { ref.current!.contentDocument!.documentElement.dataset.theme = next; } catch { /* ignore */ } }
  return <section className="ds-pv" aria-label="Preview">
    <div className="ds-pv-bar"><p className="mute">Preview · built only from the design system</p><div className="ds-pv-seg" role="radiogroup" aria-label="Theme">{(['light', 'dark'] as const).map((t) => <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => flip(t)}>{t === 'light' ? 'Light' : 'Dark'}</button>)}</div></div>
    <iframe ref={ref} src={src} title={title} style={{ height: h }} loading="lazy" />
  </section>;
}
