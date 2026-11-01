import type { Block, BlockItem, BlockMedia, BlockSwatch } from '@/lib/figma/blocks';
import { Swatch } from '@/components/portal/Swatch';

// Renders one guideline section as responsive web content. Used by the client portal, and by the studio's visual
// editor, which passes `edit` so the same layout becomes editable in place.
// Guidance stands free on the page; only covers, statements and content (images, visuals, items the brand
// presents in containers) are held in a panel or box. Pages are never shown as pictures of the slide.

const lum = (hex?: string) => { if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return 1; const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const textOn = (hex: string) => (lum(hex) > 0.6 ? '#000' : '#fff');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };

export type TextField = 'eyebrow' | 'heading' | 'body';
export type ItemField = 'label' | 'heading' | 'body';
type El = { tag: 'p' | 'span' | 'h2' | 'h3' | 'div'; className: string; placeholder: string; multiline?: boolean };
export type EditKit = {
  text: (field: TextField, value: string | undefined, el: El) => React.ReactNode;
  image: (target: number | 'backdrop', m: BlockMedia, img: React.ReactNode) => React.ReactNode;
  caption: (i: number, value: string | undefined) => React.ReactNode;
  swatch: (i: number, s: BlockSwatch) => React.ReactNode;
  addSwatch: () => React.ReactNode;
  addImage: () => React.ReactNode;
  itemText?: (i: number, field: ItemField, value: string | undefined, el: El) => React.ReactNode;
  itemImage?: (i: number, m: BlockMedia | undefined, img: React.ReactNode) => React.ReactNode;
  itemBar?: (i: number, it: BlockItem) => React.ReactNode;
  addItem?: () => React.ReactNode;
};

function Paras({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return <div className={className}>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.split('\n').map((l, j, a) => <span key={j}>{l}{j < a.length - 1 ? <br /> : null}</span>)}</p>)}</div>;
}

export function GuideBlock({ b, urls, headingLevel = 2, number, anchor, chapter, edit }: { b: Block; urls: Record<string, string>; headingLevel?: 2 | 3; number?: string; anchor?: string; chapter?: string; edit?: EditKit }) {
  if ((b.hidden || b.draft) && !edit) return null;
  const H = (headingLevel === 2 ? 'h2' : 'h3') as 'h2';
  // Panels only for covers and statements
  const panel = b.kind === 'cover' || b.kind === 'statement';
  const back = panel && b.backdrop ? urls[b.backdrop.path] : undefined;
  const bg = panel && b.bg && /^#[0-9A-F]{6}$/i.test(b.bg) ? b.bg : undefined;
  const darkBack = !!back && (!b.ink || lum(b.ink) > 0.6);
  const ink = panel ? (b.ink && (!bg || Math.abs(lum(b.ink) - lum(bg)) > 0.3 || back) ? b.ink : bg ? textOn(bg) : undefined) : (b.ink && lum(b.ink) < 0.5 ? b.ink : undefined);
  const style = { ...(bg && !back ? { background: bg } : {}), ...(ink ? { color: ink } : {}) } as React.CSSProperties;
  const tone = [b.headSize ? `hs-${b.headSize}` : '', b.bodySize ? `bs-${b.bodySize}` : '', b.bodyCols && b.bodyCols > 1 ? `bc-${b.bodyCols}` : '', b.align === 'center' ? 'al-c' : ''].filter(Boolean).join(' ');

  const txt = (field: TextField, value: string | undefined, tag: El['tag'], className: string, placeholder: string, multiline = false) =>
    edit ? edit.text(field, value, { tag, className, placeholder, multiline }) : !value ? null : multiline ? <Paras text={value} className={className} /> : tag === 'p' ? <p className={className}>{value}</p> : tag === 'span' ? <span className={className}>{value}</span> : <H className={className}>{value}</H>;
  const eyebrow = (cls = 'gb-eb', tag: 'p' | 'span' = 'p') => txt('eyebrow', b.eyebrow, tag, cls, 'Small label');
  const heading = (cls: string) => txt('heading', b.heading, H, cls, 'Headline');
  const body = (cls = 'gb-body') => txt('body', b.body, 'div', cls, 'Write something…', true);
  const head = edit || b.eyebrow || b.heading ? <div className="gb-head">{eyebrow()}{heading('gb-h' + (b.kind === 'cover' ? ' xl' : ''))}</div> : null;

  const media = (b.media || []).map((m, i) => ({ m, i })).filter(({ m }) => urls[m.path]);
  const img = (m: BlockMedia, i: number | 'backdrop', el: React.ReactNode) => (edit ? edit.image(i, m, el) : el);
  const mediaEl = media.length || (edit && ['split', 'media', 'image'].includes(b.kind)) ? <div className="gb-media" style={{ ['--cols' as string]: String(Math.max(1, Math.min(b.kind === 'split' || b.kind === 'image' ? 1 : b.cols || Math.min(media.length, 3), media.length || 1))) }}>
    {media.map(({ m, i }) => <figure key={m.path} className={'gb-fig ' + m.kind}>{img(m, i, <img src={urls[m.path]} alt={m.caption || ''} loading="lazy" style={{ aspectRatio: `${m.w} / ${m.h}` }} />)}{edit ? edit.caption(i, m.caption) : m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>)}
    {edit && (b.kind === 'media' || !media.length) ? edit.addImage() : null}
  </div> : null;
  const backEl = back && b.backdrop ? img(b.backdrop, 'backdrop', <img className="gb-back" src={back} alt="" />) : null;

  if (b.kind === 'cover') return (
    <section className={'gb gb-cover pad' + (back ? ' has-back' : '') + (darkBack ? ' on-dark' : '') + ' ' + tone} style={style}>
      {backEl}
      <div className="gb-in">{head}{body('gb-body lg')}</div>
    </section>
  );
  // A subsection starts with its headline, and nothing else
  if (b.kind === 'divider') return (
    <section id={anchor} className={'gb gb-div ' + tone}>
      <p className="gb-div-n">{[number, chapter].filter(Boolean).join(' · ')}</p>
      {heading('gb-div-h')}
    </section>
  );
  if (b.kind === 'statement') return (
    <section className={'gb gb-stmt' + (bg || back ? ' pad' : '') + (back ? ' has-back on-dark' : '') + ' ' + tone} style={style}>
      {backEl}
      <div className="gb-in">{eyebrow()}{txt('heading', b.heading, 'p', 'gb-stmt-h', 'A statement')}{body()}</div>
    </section>
  );
  if (b.kind === 'swatches') return (
    <section className={'gb ' + tone}>
      {head}{body()}
      <div className="gb-sw">{(b.swatches || []).map((s, i) => (edit ? edit.swatch(i, s) : <Swatch key={s.hex + s.name} name={s.name} hex={s.hex} note={s.note || rgb(s.hex)} ink={textOn(s.hex)} />))}{edit ? edit.addSwatch() : null}</div>
      {media.length ? mediaEl : null}
    </section>
  );
  if (b.kind === 'columns' || b.kind === 'grid') {
    const items = b.items || [];
    const itxt = (i: number, f: 'label' | 'heading' | 'body', v: string | undefined, el: El) => (edit?.itemText ? edit.itemText(i, f, v, el) : !v ? null : el.multiline ? <Paras text={v} className={el.className} /> : <p className={el.className}>{v}</p>);
    return (
      <section className={'gb gb-items ' + tone}>
        {edit || b.heading || b.eyebrow ? head : null}
        {edit || b.body ? body('gb-body gb-intro') : null}
        <div className={'gb-' + b.kind + ' bx-' + (b.box || 'none')} style={b.kind === 'columns' ? { ['--cols' as string]: String(Math.max(2, Math.min(4, b.cols || items.length || 2))) } : undefined}>
          {items.map((it, i) => {
            const m = it.media && urls[it.media.path] ? it.media : undefined;
            const pic = m ? <img src={urls[m.path]} alt="" loading="lazy" /> : null;
            const onlyImage = !!m && !it.label && !it.heading && !it.body && !edit;
            return (
              <div key={it.id} className={'gi' + (onlyImage ? ' gi-img' : '') + (m ? ' has-img' : '')} style={b.kind === "grid" ? { gridColumn: `span ${it.w || 2}`, gridRow: `span ${it.h || 2}` } : undefined}>
                {edit?.itemBar ? edit.itemBar(i, it) : null}
                {m ? <div className="gi-media">{edit?.itemImage ? edit.itemImage(i, m, pic) : pic}</div> : null}
                {onlyImage ? null : <div className="gi-txt">
                  {itxt(i, 'label', it.label, { tag: 'p', className: 'gi-label', placeholder: 'Label' })}
                  <div className="gi-main">
                    {itxt(i, 'heading', it.heading, { tag: 'p', className: 'gi-h', placeholder: 'Headline (optional)' })}
                    {itxt(i, 'body', it.body, { tag: 'div', className: 'gi-body', placeholder: 'Text', multiline: true })}
                  </div>
                </div>}
              </div>
            );
          })}
          {edit?.addItem ? edit.addItem() : null}
        </div>
        {media.length ? mediaEl : null}
      </section>
    );
  }
  if (b.kind === 'image') return (
    <section className={'gb gb-full ' + tone}>
      {edit || b.heading ? head : null}
      {mediaEl}
      {edit || b.body ? body() : null}
    </section>
  );
  if (b.kind === 'split') return (
    <section className={'gb gb-split' + (b.side === 'left' ? ' left' : '') + ' ' + tone}>
      <div className="gb-txt">{head}{body()}</div>
      {mediaEl}
    </section>
  );
  const longBody = (b.body || '').length > 280 && !media.length && !b.bodyCols;
  return (
    <section className={'gb' + (longBody ? ' gb-two' : '') + ' ' + tone}>
      <div className="gb-in">{head}{body()}</div>
      {b.kind === 'media' ? mediaEl : media.length ? mediaEl : null}
    </section>
  );
}
