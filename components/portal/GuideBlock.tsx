import type { Block } from '@/lib/figma/blocks';

// Renders one guideline block as responsive web content. Used by the client portal and the studio preview.
// `urls` maps stored image paths to signed URLs.

const lum = (hex?: string) => { if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return 1; const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const textOn = (hex: string) => (lum(hex) > 0.6 ? '#000' : '#fff');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };

function Paras({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return <div className={className}>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.split('\n').map((l, j, a) => <span key={j}>{l}{j < a.length - 1 ? <br /> : null}</span>)}</p>)}</div>;
}

export function GuideBlock({ b, urls, headingLevel = 2 }: { b: Block; urls: Record<string, string>; headingLevel?: 2 | 3 }) {
  if (b.hidden) return null;
  const H = (headingLevel === 2 ? 'h2' : 'h3') as 'h2';
  const back = b.backdrop && urls[b.backdrop.path];
  // Text colour: what Figma used, unless it would vanish on the background
  const bg = b.bg && /^#[0-9A-F]{6}$/i.test(b.bg) ? b.bg : undefined;
  const darkBack = !!back && (!b.ink || lum(b.ink) > 0.6);
  const ink = b.ink && (!bg || Math.abs(lum(b.ink) - lum(bg)) > 0.3 || back) ? b.ink : bg ? textOn(bg) : undefined;
  const style = { ...(bg && !back ? { background: bg } : {}), ...(ink ? { color: ink } : {}), ...(bg && bg.toUpperCase() !== '#FFFFFF' && !back ? {} : {}) } as React.CSSProperties;
  const padded = !!(bg && bg.toUpperCase() !== '#FFFFFF') || !!back;

  if (b.showOriginal && b.original && urls[b.original]) {
    return <figure className="gb gb-orig"><img src={urls[b.original]} alt={[b.heading, b.body].filter(Boolean).join(' — ').slice(0, 300)} loading="lazy" /></figure>;
  }
  const head = (b.eyebrow || b.heading) ? <div className="gb-head">{b.eyebrow ? <p className="gb-eb">{b.eyebrow}</p> : null}{b.heading ? <H className={'gb-h' + (b.kind === 'cover' ? ' xl' : '')}>{b.heading}</H> : null}</div> : null;
  const media = (b.media || []).filter((m) => urls[m.path]);
  const mediaEl = media.length ? <div className="gb-media" style={{ ['--cols' as string]: String(Math.min(b.kind === 'split' ? 1 : b.cols || Math.min(media.length, 3), media.length)) }}>
    {media.map((m) => <figure key={m.path} className={'gb-fig ' + m.kind}><img src={urls[m.path]} alt={m.caption || ''} loading="lazy" style={{ aspectRatio: `${m.w} / ${m.h}` }} />{m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>)}
  </div> : null;

  if (b.kind === 'cover') return (
    <section className={'gb gb-cover' + (back ? ' has-back' : '') + (darkBack ? ' on-dark' : '')} style={style}>
      {back ? <img className="gb-back" src={back} alt="" /> : null}
      <div className="gb-in">{head}<Paras text={b.body} className="gb-body lg" /></div>
      {mediaEl && !back ? mediaEl : null}
    </section>
  );
  if (b.kind === 'swatches') return (
    <section className={'gb' + (padded ? ' pad' : '')} style={style}>
      {head}<Paras text={b.body} className="gb-body" />
      <div className="gb-sw">{(b.swatches || []).map((s) => <div key={s.hex + s.name} className="gb-swc" style={{ background: s.hex, color: textOn(s.hex) }}><span className="gb-swn">{s.name}</span><span>{s.hex}<br /><span style={{ opacity: .75 }}>{s.note || rgb(s.hex)}</span></span></div>)}</div>
      {mediaEl}
    </section>
  );
  if (b.kind === 'split') return (
    <section className={'gb gb-split' + (b.side === 'left' ? ' left' : '') + (padded ? ' pad' : '')} style={style}>
      <div className="gb-txt">{head}<Paras text={b.body} className="gb-body" /></div>
      {mediaEl}
    </section>
  );
  // text and media
  const longBody = (b.body || '').length > 280 && !media.length;
  return (
    <section className={'gb' + (longBody ? ' gb-two' : '') + (padded ? ' pad' : '') + (back ? ' has-back on-dark' : '')} style={style}>
      {back ? <img className="gb-back" src={back} alt="" /> : null}
      <div className="gb-in">{head}<Paras text={b.body} className="gb-body" /></div>
      {mediaEl}
    </section>
  );
}
