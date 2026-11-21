'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import type { AppKey } from '@/lib/portalVersion';
import type { AppPreview as Preview, Fragment } from '@/lib/portal/appPreviews';

// The coming-soon page for an app: its name and promise, then a carousel of what it will do. Each feature shows a
// small piece of the interface, drawn with this brand's own logo, colours and pictures so it feels like theirs.

type Brand = { client: string; logo: string | null; colours: { name: string; hex: string }[]; images: string[] };

export function AppPreview({ app, name, preview, client, logo, colours, images, studioOpen, back }: {
  app: AppKey; name: string; preview: Preview; client: string; logo: string | null; colours: { name: string; hex: string }[]; images: string[]; studioOpen: string | null; back: string;
}) {
  const b: Brand = { client, logo, colours: colours.length ? colours : [{ name: 'Black', hex: '#111111' }, { name: 'Stone', hex: '#d8d2c8' }, { name: 'White', hex: '#ffffff' }], images };
  const n = preview.features.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((k: number) => setI(((k % n) + n) % n), [n]);
  // Moves on by itself every few seconds, unless you're looking closely or have asked for less motion
  useEffect(() => {
    if (paused || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const t = setTimeout(() => go(i + 1), 6500); return () => clearTimeout(t);
  }, [i, paused, go]);
  const track = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const f = preview.features[i];

  return <div className="apv" onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}>
    <Link href={back} className="apv-back"><ArrowLeft size={14} aria-hidden />Home</Link>
    <header className="apv-head">
      <span className="apv-icon"><AppIcon app={app} size={56} play /></span>
      <span className="apv-tag"><Sparkles size={12} aria-hidden />Coming soon</span>
      <h1 className="apv-name">{name}</h1>
      <p className="apv-line">{preview.headline}</p>
      <p className="mute apv-teaser">{preview.teaser}, for {client}.</p>
      {studioOpen ? <Link href={studioOpen} className="btn apv-open">Open {name} (studio only)<ArrowRight size={13} aria-hidden /></Link> : null}
    </header>

    <section className="apv-car" aria-roledescription="carousel" aria-label={`What ${name} will do`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current === null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 40) go(i + (d < 0 ? 1 : -1)); touch.current = null; }}>
      <div className="apv-track" ref={track} style={{ transform: `translateX(-${i * 100}%)` }}>
        {preview.features.map((x, k) => <article key={x.title} className="apv-card" aria-roledescription="slide" aria-label={`${k + 1} of ${n}: ${x.title}`} aria-hidden={k !== i}>
          <div className="apv-copy">
            <span className="apv-n">{String(k + 1).padStart(2, '0')}</span>
            <h2>{x.title}</h2>
            <p>{x.text}</p>
          </div>
          <div className="apv-stage" aria-hidden><Frag ui={x.ui} b={b} live={k === i} /></div>
        </article>)}
      </div>
      <div className="apv-ctl">
        <button type="button" className="apv-arrow" onClick={() => go(i - 1)} aria-label="Previous feature"><ChevronLeft size={18} aria-hidden /></button>
        <div className="apv-dots" role="tablist" aria-label="Features">{preview.features.map((x, k) => <button key={x.title} type="button" role="tab" aria-selected={k === i} aria-label={x.title} className={'apv-dot' + (k === i ? ' on' : '')} onClick={() => go(k)}>{k === i && !paused ? <i key={i} /> : null}</button>)}</div>
        <button type="button" className="apv-arrow" onClick={() => go(i + 1)} aria-label="Next feature"><ChevronRight size={18} aria-hidden /></button>
      </div>
      <p className="sr" aria-live="polite">{f.title}</p>
    </section>
  </div>;
}

// ---------- The glimpses of the interface

const pic = (b: Brand, k: number) => b.images.length ? b.images[k % b.images.length] : null;
const col = (b: Brand, k: number) => b.colours[k % b.colours.length].hex;
function Img({ b, k, className }: { b: Brand; k: number; className?: string }) {
  const u = pic(b, k);
  return u ? <span className={'apv-img ' + (className || '')} style={{ backgroundImage: `url("${u}")` }} /> : <span className={'apv-img ' + (className || '')} style={{ background: `linear-gradient(135deg, ${col(b, k)}, ${col(b, k + 1)})` }} />;
}
function Logo({ b, light }: { b: Brand; light?: boolean }) {
  return b.logo ? <img className={'apv-logo' + (light ? ' light' : '')} src={b.logo} alt="" /> : <span className="apv-logo-t">{b.client}</span>;
}

function Frag({ ui, b, live }: { ui: Fragment; b: Brand; live: boolean }) {
  const cls = 'apv-ui apv-' + ui + (live ? ' live' : '');
  switch (ui) {
    case 'collection': return <div className={cls}>
      <div className="apv-win-h"><b>Summer launch</b><span className="apv-pill ok"><Check size={11} aria-hidden />Approved</span><span className="mute">24 images</span></div>
      <div className="apv-grid6">{[0, 1, 2, 3, 4, 5].map((k) => <span key={k} className="apv-cell" style={{ animationDelay: `${k * 80}ms` }}><Img b={b} k={k} /><span className="apv-tick"><Check size={10} aria-hidden /></span></span>)}</div>
    </div>;
    case 'rating': return <div className={cls}>
      <Img b={b} k={1} className="apv-big" />
      <div className="apv-score"><p className="mute">Fits the brand</p><p className="apv-num">8.6<span>/10</span></p><span className="apv-bar"><i style={{ width: '86%' }} /></span>
        <ul>{[['Natural light', true], ['Real moments, not posed', true], ['Warm, earthy palette', true], ['Room for the logo', false]].map(([t, ok]) => <li key={String(t)} className={ok ? 'ok' : 'so'}>{ok ? <Check size={11} aria-hidden /> : <span>~</span>}{t}</li>)}</ul>
      </div>
    </div>;
    case 'effects': return <div className={cls}>
      <div className="apv-split"><Img b={b} k={2} /><span className="apv-fx" style={{ ['--a' as string]: col(b, 0), ['--b' as string]: col(b, 2) }}><Img b={b} k={2} /></span><i className="apv-handle" /></div>
      <div className="apv-chips">{['Grain', 'Duotone', 'Glow', 'Halftone'].map((t, k) => <span key={t} className={'apv-chip' + (k === 1 ? ' on' : '')}>{t}</span>)}<span className="mute apv-by">by Lost Property</span></div>
    </div>;
    case 'endboard': return <div className={cls}>
      <div className="apv-phone"><Img b={b} k={0} className="apv-clip" /><span className="apv-end" style={{ background: col(b, 0) }}><Logo b={b} light /></span></div>
      <div className="apv-tl"><span className="apv-seg" /><span className="apv-seg" /><span className="apv-seg" /><span className="apv-seg end" style={{ background: col(b, 0) }}>End board</span><i className="apv-head-line" /></div>
    </div>;
    case 'cutdown': case 'sizes': {
      const words = ui === 'sizes';
      return <div className={cls}>{[['9:16', 'apv-r916'], ['1:1', 'apv-r11'], ['16:9', 'apv-r169']].map(([t, r], k) => <figure key={t} className={'apv-size ' + r} style={{ animationDelay: `${k * 140}ms` }}>
        <span className="apv-frame">{words ? <span className="apv-design" style={{ background: col(b, k) }}><b>New season</b><Logo b={b} light={k !== 2} /></span> : <><Img b={b} k={k + 3} /><span className="apv-corner"><Logo b={b} light /></span></>}</span>
        <figcaption>{t}</figcaption></figure>)}</div>;
    }
    case 'motion': return <div className={cls}>
      <div className="apv-mstage" style={{ background: col(b, 0) }}><span className="apv-mlogo"><Logo b={b} light /></span></div>
      <div className="apv-chips">{['Logo reveal', 'Type in motion', 'Transitions', 'End boards'].map((t, k) => <span key={t} className={'apv-chip' + (k === 0 ? ' on' : '')}>{t}</span>)}</div>
    </div>;
    case 'pieces': return <div className={cls}>{[['Instagram caption', 'A first line that does the work, then the rest…', '136 / 2,200'], ['Email subject', 'Something worth opening', '23 / 50'], ['Poster headline', 'Say it big', '3 words'], ['Press release', 'Date TBC: …', 'Full draft']].map(([t, x, c], k) =>
      <div key={t} className="apv-piece" style={{ animationDelay: `${k * 110}ms` }}><span className="apv-piece-h"><b>{t}</b><span className="mute">{c}</span></span><span className="apv-piece-x">{x}</span></div>)}</div>;
    case 'cowriter': return <div className={cls}>
      <p className="apv-txt">We made a place for long evenings and slow conversations.<span className="apv-ghost"> Come early, stay late, and leave the phone at the door.</span></p>
      <span className="apv-tab"><kbd>Tab</kbd> to keep it</span>
      <div className="apv-alts"><p className="mute">Other ways to say “long evenings”</p>{['evenings that run on', 'the hours after dark', 'nights with no hurry'].map((t) => <span key={t} className="apv-alt">{t}</span>)}</div>
    </div>;
    case 'voicecheck': return <div className={cls}>
      <p className="apv-txt"><mark className="ok">Come early, stay late.</mark> We’re a <mark className="fix">world-class destination</mark> for people who love good drinks.</p>
      <div className="apv-notes"><p className="ok"><Check size={11} aria-hidden />Short and warm: right on the voice</p><p className="fix">Swap “world-class destination” for something only {b.client} could say</p></div>
    </div>;
    case 'templates': return <div className={cls}><div className="apv-grid4">{[0, 1, 2, 3].map((k) => <span key={k} className={'apv-tpl t' + k} style={{ background: k % 2 ? '#fff' : col(b, k), animationDelay: `${k * 100}ms` }}>
      {k === 1 || k === 3 ? <Img b={b} k={k} /> : null}<b style={{ color: k % 2 ? '#111' : undefined }}>Headline</b><Logo b={b} light={k % 2 === 0} /></span>)}</div></div>;
    case 'onbrand': return <div className={cls}>
      <div className="apv-pal">{b.colours.slice(0, 5).map((c) => <span key={c.hex} style={{ background: c.hex }} title={c.name} />)}</div>
      <div className="apv-spec"><span className="apv-aa">Aa</span><Logo b={b} /></div>
      <ul className="apv-checks">{['Colours from the palette', 'Type from the guidelines', 'The right logo for the background'].map((t) => <li key={t}><Check size={11} aria-hidden />{t}</li>)}</ul>
    </div>;
  }
}
