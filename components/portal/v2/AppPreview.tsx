'use client';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUp, Check, Clock, Download, Image as ImageIcon, MessageCircle, Music2, Play, Search, Sparkles, Users } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import type { AppKey } from '@/lib/portalVersion';
import type { AppPreview as Preview, Feature, Fragment } from '@/lib/portal/appPreviews';

// The coming-soon page for an app, in the manner of a product launch page: white, big type, and one row of small
// feature cards drifting past, each with a glimpse of the interface. Lost Property's palette only (black, white,
// pink and neutral greys); the client's own logo and pictures appear inside the glimpses so it feels like theirs.

type Brand = { client: string; logo: string | null; images: string[] };

export function AppPreview({ app, name, preview, client, logo, images, studioOpen, back }: {
  app: AppKey; name: string; preview: Preview; client: string; logo: string | null; colours?: unknown; images: string[]; studioOpen: string | null; back: string;
}) {
  const b: Brand = { client, logo, images };
  const rows = [preview.features];
  return <div className="apv">
    <div className="apv-glow" aria-hidden />
    <Link href={back} className="apv-back"><ArrowLeft size={14} aria-hidden />Home</Link>
    <header className="apv-head">
      <span className="apv-tag"><i />Coming soon</span>
      <span className="apv-icon"><AppIcon app={app} size={44} play /></span>
      <h1 className="apv-name">{name}</h1>
      <p className="apv-line">{preview.headline}</p>
      <p className="apv-sub">{preview.line}</p>
      {studioOpen ? <Link href={studioOpen} className="apv-open">Open {name} <span>(studio only)</span><ArrowRight size={13} aria-hidden /></Link> : null}
    </header>

    <section className="apv-tick" aria-label={`What ${name} will do`}>
      {rows.map((r, k) => <div key={k} className={'apv-row' + (k ? ' rev' : '')} style={{ ['--n' as string]: r.length } as CSSProperties}>
        <div className="apv-belt">
          {[...r, ...r].map((f, i) => <Card key={i} f={f} b={b} copy={i >= r.length} />)}
        </div>
      </div>)}
    </section>

    <footer className="apv-foot">
      <p><span className="apv-dot" aria-hidden />{name} is coming to {client}’s portal. Lost Property will let you know when it’s ready.</p>
    </footer>
  </div>;
}

function Card({ f, b, copy }: { f: Feature; b: Brand; copy: boolean }) {
  return <article className="apv-card" aria-hidden={copy || undefined}>
    <div className="apv-stage"><Frag ui={f.ui} b={b} /></div>
    <div className="apv-txt">
      {f.studio ? <span className="apv-with"><i />With Lost Property</span> : null}
      <h3>{f.title}</h3>
      <p>{f.text}</p>
    </div>
  </article>;
}

// ---------- The glimpses

const pic = (b: Brand, k: number) => (b.images.length ? b.images[k % b.images.length] : null);
const SHADES = ['#000', '#F28EE8', '#8A8A8A', '#FFFFFF'];
function Img({ b, k, className, style }: { b: Brand; k: number; className?: string; style?: CSSProperties }) {
  const u = pic(b, k);
  if (u) return <span className={'apv-img ' + (className || '')} style={{ backgroundImage: `url("${u}")`, ...style }} />;
  const c = SHADES[k % SHADES.length];
  return <span className={'apv-img apv-plain ' + (className || '')} style={{ background: c, ...style }}><Logo b={b} light={c === '#000' || c === '#8A8A8A'} /></span>;
}
function Logo({ b, light }: { b: Brand; light?: boolean }) {
  return b.logo ? <img className={'apv-logo' + (light ? ' light' : '')} src={b.logo} alt="" /> : <span className="apv-logo-t" style={{ color: light ? '#fff' : '#000' }}>{b.client}</span>;
}
const Win = ({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) => <div className={'apv-win' + (dark ? ' dark' : '') + (className ? ' ' + className : '')}>{children}</div>;
const Face = ({ t, pink }: { t: string; pink?: boolean }) => <span className={'apv-face' + (pink ? ' pink' : '')}>{t}</span>;
const LP = () => <span className="apv-lp" aria-hidden><img src="/lp-logo.svg" alt="" /></span>;

function Frag({ ui, b }: { ui: Fragment; b: Brand }) {
  switch (ui) {
    // Photographer
    case 'collection': return <Win><div className="apv-wh"><b>Summer launch</b><span className="apv-ok"><Check size={9} />Approved</span></div>
      <div className="apv-g3">{[0, 1, 2, 3, 4, 5].map((k) => <Img key={k} b={b} k={k} className="apv-sq" />)}</div></Win>;
    case 'rating': return <div className="apv-pair"><Img b={b} k={1} className="apv-tall" /><Win className="apv-score"><span className="apv-mute">Fits the brand</span><b className="apv-big">8.6</b>
      <span className="apv-meter"><i /></span>{['Natural light', 'Real moments', 'Room for the logo'].map((t, k) => <span key={t} className="apv-li">{k < 2 ? <Check size={9} /> : <i className="apv-tilde">~</i>}{t}</span>)}</Win></div>;
    case 'effects': return <div className="apv-fxwrap"><span className="apv-fx"><Img b={b} k={2} /><span className="apv-fx-on"><Img b={b} k={2} /></span><i className="apv-wipe" /></span>
      <span className="apv-pills">{['Grain', 'Duotone', 'Glow'].map((t, k) => <span key={t} className={k === 1 ? 'on' : ''}>{t}</span>)}</span></div>;
    case 'search': return <Win><span className="apv-field"><Search size={11} />warm, people, evening<i className="apv-caret" /></span><div className="apv-g3">{[3, 0, 4].map((k) => <Img key={k} b={b} k={k} className="apv-sq" />)}</div></Win>;
    case 'rights': return <div className="apv-pair"><Img b={b} k={4} className="apv-tall" /><Win className="apv-meta">{[['Photographer', 'Studio shoot'], ['Use', 'Social, web'], ['Licence ends', '12 Mar 2027']].map(([k, v]) => <span key={k} className="apv-kv"><span className="apv-mute">{k}</span><b>{v}</b></span>)}</Win></div>;
    case 'crops': case 'cutdown': case 'sizes': return <div className="apv-sizes">{[['9:16', 'r1'], ['1:1', 'r2'], ['16:9', 'r3']].map(([t, r], k) =>
      <span key={t} className={'apv-sz ' + r}>{ui === 'sizes' ? <span className="apv-design" style={{ background: SHADES[k] }}><b style={{ color: k === 0 ? '#fff' : '#000' }}>New season</b><Logo b={b} light={k === 0} /></span> : <><Img b={b} k={k + 1} /><span className="apv-corner"><Logo b={b} light /></span></>}<em>{t}</em></span>)}</div>;
    case 'picks': return <Win><div className="apv-wh"><b>This month’s picks</b><LP /></div><div className="apv-g3">{[5, 2, 0].map((k, i) => <span key={k} className="apv-pick"><Img b={b} k={k} className="apv-sq" />{i === 0 ? <i className="apv-star">★</i> : null}</span>)}</div></Win>;
    case 'retouch': return <div className="apv-pair"><Img b={b} k={3} className="apv-tall" /><Win className="apv-flow">{[['Sent', true], ['Retouching', true], ['Back to you', false]].map(([t, d], k) => <span key={String(t)} className={'apv-step' + (d ? ' done' : '') + (k === 1 ? ' now' : '')}><i />{t}</span>)}<span className="apv-by"><LP />Lost Property</span></Win></div>;
    // Director
    case 'endboard': return <div className="apv-phonewrap"><span className="apv-phone"><Img b={b} k={0} /><span className="apv-end"><Logo b={b} light /></span></span>
      <span className="apv-tl"><i /><i /><i /><i className="end">End board</i><b className="apv-play" /></span></div>;
    case 'motion': return <span className="apv-mstage"><span className="apv-mlogo"><Logo b={b} light /></span><span className="apv-pills dark">{['Reveal', 'Type', 'Transitions'].map((t, k) => <span key={t} className={k === 0 ? 'on' : ''}>{t}</span>)}</span></span>;
    case 'captions': return <span className="apv-phone wide"><Img b={b} k={2} /><span className="apv-cap"><b>Come early,</b> stay late.</span></span>;
    case 'music': return <Win>{[['Night swim', '2:41'], ['Low tide', '3:05'], ['After hours', '2:18']].map(([t, d], k) => <span key={t} className={'apv-track' + (k === 0 ? ' on' : '')}><span className="apv-pl">{k === 0 ? <span className="apv-eq"><i /><i /><i /></span> : <Play size={9} />}</span><b>{t}</b><span className="apv-mute">{d}</span><span className="apv-ok sm"><Check size={8} />Cleared</span></span>)}<span className="apv-mute apv-mi"><Music2 size={10} />Chosen for {b.client}</span></Win>;
    case 'timecode': return <div className="apv-tc"><span className="apv-frame16"><Img b={b} k={1} /><span className="apv-pin" style={{ left: '62%', top: '38%' }}>1</span></span>
      <Win className="apv-note"><span className="apv-who"><LP /><b>Motion designer</b><span className="apv-mute">0:07</span></span><span>Hold the logo two frames longer before the cut.</span></Win></div>;
    case 'storyboard': return <div className="apv-board">{[0, 1, 2, 3].map((k) => <span key={k} className="apv-fr"><Img b={b} k={k} /><em>{['Open on the door', 'Steam rises', 'Glasses meet', 'End board'][k]}</em></span>)}</div>;
    // Writer
    case 'pieces': return <div className="apv-stack">{[['Instagram caption', '136 / 2,200'], ['Email subject', '23 / 50'], ['Poster', '3 words']].map(([t, c], k) => <Win key={t} className="apv-pc"><span className="apv-wh"><b>{t}</b><span className="apv-mute">{c}</span></span><span className="apv-lines"><i style={{ width: `${90 - k * 18}%` }} /><i style={{ width: `${60 - k * 10}%` }} /></span></Win>)}</div>;
    case 'cowriter': return <Win><p className="apv-copy">We made a place for long evenings.<span className="apv-ghost"> Come early, stay late.</span></p><span className="apv-kbd"><kbd>Tab</kbd>to keep it</span>
      <span className="apv-alts">{['evenings that run on', 'the hours after dark'].map((t, k) => <span key={t} className={k === 0 ? 'on' : ''}>{t}</span>)}</span></Win>;
    case 'voicecheck': return <Win><p className="apv-copy"><mark className="g">Come early, stay late.</mark> A <mark className="p">world-class destination</mark>.</p>
      <span className="apv-nt g"><Check size={9} />Short and warm: on voice</span><span className="apv-nt p">Say something only {b.client} could say</span></Win>;
    case 'facts': return <Win><p className="apv-copy">Open from <mark className="p">8pm</mark> on Fridays.</p><span className="apv-nt p">Fact sheet says 7pm · <b>Fix</b></span><span className="apv-kv"><span className="apv-mute">Friday hours</span><b>7pm – 1am</b></span></Win>;
    case 'places': return <div className="apv-stack sm">{[['Instagram', 'Long evenings start here. Come early, stay late.'], ['Email', 'Long evenings start here'], ['Poster', 'Stay late.']].map(([t, x]) => <Win key={t} className="apv-pc"><span className="apv-mute">{t}</span><b className="apv-pl1">{x}</b></Win>)}</div>;
    case 'press': return <Win className="apv-doc"><span className="apv-mute">Press release</span><b className="apv-hl">{b.client} opens a new chapter</b><span className="apv-mute">Date TBC:</span><span className="apv-lines"><i style={{ width: '96%' }} /><i style={{ width: '88%' }} /><i style={{ width: '70%' }} /></span><span className="apv-q">“A quote in your own words.”</span></Win>;
    case 'together': return <Win><span className="apv-wh"><b>Launch copy</b><span className="apv-faces"><Face t="JW" /><Face t="AS" pink /><Face t="SC" /></span></span><span className="apv-held"><em>Alex</em><span className="apv-lines"><i style={{ width: '84%' }} /><i style={{ width: '52%' }} /></span></span><span className="apv-lines"><i style={{ width: '76%' }} /></span></Win>;
    // Designer
    case 'templates': return <div className="apv-g2">{[0, 1, 2, 3].map((k) => <span key={k} className="apv-tpl" style={{ background: SHADES[k] }}>{k % 2 ? <Img b={b} k={k} className="apv-half" /> : null}<b style={{ color: k === 0 || k === 2 ? '#fff' : '#000' }}>Headline</b><Logo b={b} light={k === 0 || k === 2} /></span>)}</div>;
    case 'onbrand': return <Win><span className="apv-pal">{SHADES.map((c) => <i key={c} style={{ background: c }} />)}</span><span className="apv-spec"><b>Aa</b><Logo b={b} /></span>{['Palette', 'Typeface', 'Logo for the background'].map((t) => <span key={t} className="apv-li"><Check size={9} />{t}</span>)}</Win>;
    case 'layout': return <div className="apv-pair"><span className="apv-tpl lay" style={{ background: '#000' }}><Img b={b} k={1} className="apv-half" /><b className="apv-grow" style={{ color: '#fff' }}>Long evenings start here</b><Logo b={b} light /></span><span className="apv-tpl lay" style={{ background: '#F28EE8' }}><Img b={b} k={1} className="apv-half sm" /><b style={{ color: '#000' }}>Stay late</b><Logo b={b} /></span></div>;
    case 'export': return <Win>{[['Story · 1080×1920', 'PNG'], ['Post · 1080×1350', 'PNG'], ['Deck · 16:9', 'PDF']].map(([t, f], k) => <span key={t} className="apv-track"><span className="apv-pl"><ImageIcon size={9} /></span><b>{t}</b><span className="apv-mute">{f}</span>{k === 0 ? <span className="apv-bar"><i /></span> : <Download size={10} />}</span>)}</Win>;
    // With Lost Property
    case 'request': return <Win dark className="apv-chat"><span className="apv-who"><LP /><b>Lost Property</b><span className="apv-mute"><Clock size={9} />Replies today</span></span>
      <span className="apv-bub me">Could the studio take on the launch piece?</span><span className="apv-bub them">Yes, send the brief and we’ll come back with a plan.</span><span className="apv-in">Write a message<ArrowUp size={10} /></span></Win>;
    case 'review': return <Win><span className="apv-wh"><b>Sent for studio review</b><span className="apv-ok pink"><Sparkles size={8} />Lost Property</span></span>
      <span className="apv-lines"><i style={{ width: '90%' }} /><i style={{ width: '64%' }} /></span><span className="apv-note2"><LP /><span>Lovely. Tighten the second line and it’s ready.</span></span></Win>;
    case 'handoff': return <Win><span className="apv-wh"><b>Handed to the studio</b></span>{[['Brief', true], ['In the studio', true], ['Back to you', false]].map(([t, d], k) => <span key={String(t)} className={'apv-step' + (d ? ' done' : '') + (k === 1 ? ' now' : '')}><i />{t}</span>)}<span className="apv-by"><LP />Due Thursday</span></Win>;
    case 'comments': return <Win><span className="apv-wh"><b>Comments</b><MessageCircle size={10} /></span>{[['JW', 'Can we try the other photo?', false], ['LP', 'Swapped, and it reads better.', true]].map(([f, t, p]) => <span key={String(t)} className="apv-cm"><Face t={String(f)} pink={!!p} /><span>{t}</span></span>)}</Win>;
    case 'approve': return <Win><span className="apv-wh"><b>Ready to sign off</b><Users size={10} /></span><span className="apv-g3">{[0, 2, 4].map((k) => <Img key={k} b={b} k={k} className="apv-sq" />)}</span><span className="apv-cta">Sign off<Check size={10} /></span></Win>;
  }
}
