import type { Block, BlockMedia, BlockSwatch } from '@/lib/figma/blocks';
import { Swatch } from '@/components/portal/Swatch';

// Renders one guideline block as responsive web content. Used by the client portal, and by the studio's visual
// editor, which passes `edit` so the same layout becomes editable in place (text, images, swatches).
// `urls` maps stored image paths to signed URLs.

const lum = (hex?: string) => { if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return 1; const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const textOn = (hex: string) => (lum(hex) > 0.6 ? '#000' : '#fff');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };

export type TextField = 'eyebrow' | 'heading' | 'body';
export type EditKit = {
  text: (field: TextField, value: string | undefined, el: { tag: 'p' | 'span' | 'h2' | 'h3' | 'div'; className: string; placeholder: string; multiline?: boolean }) => React.ReactNode;
  image: (target: number | 'backdrop', m: BlockMedia, img: React.ReactNode) => React.ReactNode;
  caption: (i: number, value: string | undefined) => React.ReactNode;
  swatch: (i: number, s: BlockSwatch) => React.ReactNode;
  addSwatch: () => React.ReactNode;
  addImage: () => React.ReactNode;
};

function Paras({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return <div className={className}>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.split('\n').map((l, j, a) => <span key={j}>{l}{j < a.length - 1 ? <br /> : null}</span>)}</p>)}</div>;
}

export function GuideBlock({ b, urls, headingLevel = 2, number, anchor, chapter, edit }: { b: Block; urls: Record<string, string>; headingLevel?: 2 | 3; number?: string; anchor?: string; chapter?: string; edit?: EditKit }) {
  if (b.hidden && !edit) return null;
  const H = (headingLevel === 2 ? 'h2' : 'h3') as 'h2';
  const back = b.backdrop && urls[b.backdrop.path];
  const bg = b.bg && /^#[0-9A-F]{6}$/i.test(b.bg) ? b.bg : undefined;
  const darkBack = !!back && (!b.ink || lum(b.ink) > 0.6);
  const ink = b.ink && (!bg || Math.abs(lum(b.ink) - lum(bg)) > 0.3 || back) ? b.ink : bg ? textOn(bg) : undefined;
  const style = { ...(bg && !back ? { background: bg } : {}), ...(ink ? { color: ink } : {}) } as React.CSSProperties;
  const padded = !!(bg && bg.toUpperCase() !== '#FFFFFF') || !!back;
  // Studio text style choices
  const tone = [b.headSize ? `hs-${b.headSize}` : '', b.bodySize ? `bs-${b.bodySize}` : '', b.bodyCols && b.bodyCols > 1 ? `bc-${b.bodyCols}` : '', b.align === 'center' ? 'al-c' : ''].filter(Boolean).join(' ');

  if (b.showOriginal && b.original && urls[b.original]) {
    return <figure className="gb gb-orig"><img src={urls[b.original]} alt={[b.heading, b.body].filter(Boolean).join(' — ').slice(0, 300)} loading="lazy" /></figure>;
  }

  // Text: plain for the client, editable in place for the studio
  const txt = (field: TextField, value: string | undefined, tag: 'p' | 'span' | 'h2' | 'h3' | 'div', className: string, placeholder: string, multiline = false) =>
    edit ? edit.text(field, value, { tag, className, placeholder, multiline }) : !value ? null : multiline ? <Paras text={value} className={className} /> : tag === 'p' ? <p className={className}>{value}</p> : tag === 'span' ? <span className={className}>{value}</span> : <H className={className}>{value}</H>;
  const eyebrow = (cls = 'gb-eb', tag: 'p' | 'span' = 'p') => txt('eyebrow', b.eyebrow, tag, cls, 'Small label');
  const heading = (cls: string) => txt('heading', b.heading, H, cls, 'Headline');
  const body = (cls = 'gb-body') => txt('body', b.body, 'div', cls, 'Write something…', true);
  const head = edit || b.eyebrow || b.heading ? <div className="gb-head">{eyebrow()}{heading('gb-h' + (b.kind === 'cover' ? ' xl' : ''))}</div> : null;

  const media = (b.media || []).map((m, i) => ({ m, i })).filter(({ m }) => urls[m.path]);
  const img = (m: BlockMedia, i: number | 'backdrop', el: React.ReactNode) => (edit ? edit.image(i, m, el) : el);
  const mediaEl = media.length || (edit && b.kind !== 'text' && b.kind !== 'swatches') ? <div className="gb-media" style={{ ['--cols' as string]: String(Math.max(1, Math.min(b.kind === 'split' ? 1 : b.cols || Math.min(media.length, 3), media.length || 1))) }}>
    {media.map(({ m, i }) => <figure key={m.path} className={'gb-fig ' + m.kind}>{img(m, i, <img src={urls[m.path]} alt={m.caption || ''} loading="lazy" style={{ aspectRatio: `${m.w} / ${m.h}` }} />)}{edit ? edit.caption(i, m.caption) : m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>)}
    {edit && (b.kind === 'media' || !media.length) ? edit.addImage() : null}
  </div> : null;
  const backEl = back && b.backdrop ? img(b.backdrop, 'backdrop', <img className="gb-back" src={back} alt="" />) : null;

  if (b.kind === 'cover') return (
    <section className={'gb gb-cover' + (back ? ' has-back' : '') + (darkBack ? ' on-dark' : '') + ' ' + tone} style={style}>
      {backEl}
      <div className="gb-in">{head}{body('gb-body lg')}</div>
      {mediaEl && !back ? mediaEl : null}
    </section>
  );
  if (b.kind === 'divider') return (
    <section id={anchor} className={'gb gb-div' + (back ? ' has-back on-dark' : '') + ' ' + tone} style={bg && bg.toUpperCase() !== '#FFFFFF' && !back ? style : ink && !bg ? { color: ink } : undefined}>
      {backEl}
      <div className="gb-div-txt gb-in">
        <p className="gb-div-n">{[number, edit ? null : b.eyebrow || chapter].filter(Boolean).join(' · ')}{edit ? <>{number ? ' · ' : ''}{eyebrow('gb-div-eb', 'span')}</> : null}</p>
        {heading('gb-div-h')}
        {body('gb-body lg')}
      </div>
      {media.length ? <div className={'gb-div-art' + (bg && bg.toUpperCase() !== '#FFFFFF' ? '' : ' plain')}>{media.slice(0, 2).map(({ m, i }) => <span key={m.path} className="gb-div-img">{img(m, i, <img src={urls[m.path]} alt={m.caption || b.heading || ''} />)}</span>)}</div> : edit ? <div className="gb-div-art plain">{edit.addImage()}</div> : null}
    </section>
  );
  if (b.kind === 'swatches') return (
    <section className={'gb' + (padded ? ' pad' : '') + ' ' + tone} style={style}>
      {head}{body()}
      <div className="gb-sw">{(b.swatches || []).map((s, i) => (edit ? edit.swatch(i, s) : <Swatch key={s.hex + s.name} name={s.name} hex={s.hex} note={s.note || rgb(s.hex)} ink={textOn(s.hex)} />))}{edit ? edit.addSwatch() : null}</div>
      {media.length ? mediaEl : null}
    </section>
  );
  if (b.kind === 'split') return (
    <section className={'gb gb-split' + (b.side === 'left' ? ' left' : '') + (padded ? ' pad' : '') + ' ' + tone} style={style}>
      <div className="gb-txt">{head}{body()}</div>
      {mediaEl}
    </section>
  );
  const longBody = (b.body || '').length > 280 && !media.length && !b.bodyCols;
  return (
    <section className={'gb' + (longBody ? ' gb-two' : '') + (padded ? ' pad' : '') + (back ? ' has-back on-dark' : '') + ' ' + tone} style={style}>
      {backEl}
      <div className="gb-in">{head}{body()}</div>
      {b.kind === 'media' ? mediaEl : media.length ? mediaEl : null}
    </section>
  );
}
