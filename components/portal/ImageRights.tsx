'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, ShieldCheck } from 'lucide-react';

// Images and their rights. Reference pictures in the guidelines show a direction but often aren't licensed, so they
// can't be saved, dragged or copied from the page. The approved library is the set people can use, with who owns it.

/** Pictures inside can't be right-clicked, dragged out or copied */
export function ProtectImages({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const isPic = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('img, picture, video, svg, canvas, [style*="background-image"]');
  return <div className={'pt-protect ' + className}
    onContextMenu={(e) => { if (isPic(e.target)) e.preventDefault(); }}
    onDragStart={(e) => { if (isPic(e.target)) e.preventDefault(); }}
    onCopy={(e) => { const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return; const frag = sel.getRangeAt(0).cloneContents(); if (frag.querySelector('img, video, picture')) { e.preventDefault(); e.clipboardData.setData('text/plain', sel.toString()); } }}>
    {children}
  </div>;
}

/** The note at the top of the imagery chapter: what these pictures are, and where the usable ones are */
export function ImageNotice({ client, note, owner, hasLibrary }: { client: string; note?: string; owner?: string; hasLibrary: boolean }) {
  return <aside className="pt-notice" aria-label="About the images in this chapter">
    <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
    <div>
      <p className="pt-notice-h">About these images</p>
      <p>{note || `The pictures in this chapter show the look and feel to aim for. Many are reference images ${client} doesn’t hold the rights to, so please don’t copy, download or reuse them.`}
        {hasLibrary ? <> For pictures you can use, go to the <a href="#library">approved image library</a>{owner ? <>, {owner.replace(/\.$/, '')}</> : null}.</> : null}</p>
    </div>
  </aside>;
}

/** The approved images, cycling on their own, with the package to download */
export function ImageLibrary({ images, owner, download, count }: { images: { url: string; name: string }[]; owner?: string; download?: string; count: number }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  useEffect(() => { reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; if (reduced.current) setPaused(true); }, []);
  useEffect(() => { if (paused || images.length < 2) return; const t = setInterval(() => setAt((n) => (n + 1) % images.length), 4000); return () => clearInterval(t); }, [paused, images.length]);
  if (!images.length) return null;
  const go = (d: number) => setAt((n) => (n + d + images.length) % images.length);
  return <section id="library" className="pt-lib" aria-roledescription="carousel" aria-label="Approved image library" onMouseEnter={() => setPaused(true)} onMouseLeave={() => !reduced.current && setPaused(false)}>
    <div className="pt-lib-stage">
      {images.map((im, i) => <img key={im.url} src={im.url} alt={im.name.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ')} className={i === at ? 'on' : ''} loading={Math.abs(i - at) <= 1 ? 'eager' : 'lazy'} aria-hidden={i !== at} />)}
      {images.length > 1 ? <div className="pt-lib-ctl">
        <button type="button" onClick={() => go(-1)} aria-label="Previous image"><ChevronLeft size={16} strokeWidth={2} aria-hidden /></button>
        <span aria-live="polite">{at + 1} / {images.length}</span>
        <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={14} strokeWidth={2} aria-hidden /> : <Pause size={14} strokeWidth={2} aria-hidden />}</button>
        <button type="button" onClick={() => go(1)} aria-label="Next image"><ChevronRight size={16} strokeWidth={2} aria-hidden /></button>
      </div> : null}
    </div>
    <div className="pt-lib-foot">
      <div><p className="pt-lib-h">Approved image library</p><p className="mute">{count} image{count === 1 ? '' : 's'} cleared for use{owner ? `. ${owner.replace(/\.$/, '')}.` : '.'}</p></div>
      {download ? <a className="btn solid" href={download} download>Download the library</a> : null}
    </div>
  </section>;
}
