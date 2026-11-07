import type { Block, BlockItem, BlockMedia, BlockSwatch, ItemEl, SectionText } from '@/lib/figma/blocks';
import { Swatch } from '@/components/portal/Swatch';
import { textProps } from '@/lib/textStyle';
import { Carousel } from '@/components/portal/Carousel';

// Renders one guideline section as responsive web content. Used by the client portal, and by the studio's visual
// editor, which passes `edit` so the same layout becomes editable in place.
// Guidance stands free on the page; only covers, statements and content (images, visuals, items the brand
// presents in containers) are held in a panel or box. Pages are never shown as pictures of the slide.

const lum = (hex?: string) => { if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return 1; const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const textOn = (hex: string) => (lum(hex) > 0.6 ? '#000' : '#fff');
const GAP_COL = { s: '10px', m: '20px', l: '40px' }, GAP_GRID = { s: '6px', m: '12px', l: '24px' }, ROW_H = { s: '44px', m: '64px', l: '96px' };
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };

export type TextField = 'eyebrow' | 'heading' | 'body';
export type ItemField = 'label' | 'heading' | 'body';
type El = { tag: 'p' | 'span' | 'h2' | 'h3' | 'div'; className: string; placeholder: string; multiline?: boolean; style?: React.CSSProperties; key?: string };
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
  /** A small + in the gap before item i (or after the last), to add a box there */
  insertItem?: (at: number, edge: 'before' | 'after') => React.ReactNode;
  /** Elements added freely inside a box */
  itemElText?: (i: number, e: ItemEl, el: El) => React.ReactNode;
  itemElImage?: (i: number, e: ItemEl, img: React.ReactNode) => React.ReactNode;
  /** A handle to move one of the section's parts (headline, text, images, boxes) */
  partGrip?: (part: string) => React.ReactNode;
  /** Text placed freely in the section */
  extraText?: (x: SectionText, el: El) => React.ReactNode;
  /** The space before a part, to select and adjust */
  gap?: (part: string, value: number | undefined) => React.ReactNode;
  /** A handle to pick an element up and move it */
  grip?: (i: number, elId: string) => React.ReactNode;
};

function Paras({ text, className, style }: { text?: string; className?: string; style?: React.CSSProperties }) {
  if (!text) return null;
  return <div className={className} style={style}>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.split('\n').map((l, j, a) => <span key={j}>{l}{j < a.length - 1 ? <br /> : null}</span>)}</p>)}</div>;
}

export function GuideBlock({ b, urls, headingLevel = 2, number, anchor, chapter, edit }: { b: Block; urls: Record<string, string>; headingLevel?: 2 | 3; number?: string; anchor?: string; chapter?: string; edit?: EditKit }) {
  if ((b.hidden || b.draft) && !edit) return null;
  const H = (headingLevel === 2 ? 'h2' : 'h3') as 'h2';
  // Panels only for covers and statements
  const panel = b.kind === 'cover' || b.kind === 'statement';
  const back = (b.kind === 'cover' || b.kind === 'statement') && b.backdrop ? urls[b.backdrop.path] : undefined;
  const bg = panel && b.bg && /^#[0-9A-F]{6}$/i.test(b.bg) ? b.bg : undefined;
  const darkBack = !!back && (!b.ink || lum(b.ink) > 0.6);
  const ink = panel ? (b.ink && (!bg || Math.abs(lum(b.ink) - lum(bg)) > 0.3 || back) ? b.ink : bg ? textOn(bg) : undefined) : (b.ink && lum(b.ink) < 0.5 ? b.ink : undefined);
  const style = { ...(bg && !back ? { background: bg } : {}), ...(ink ? { color: ink } : {}) } as React.CSSProperties;
  const tone = [b.headSize ? `hs-${b.headSize}` : '', b.bodySize ? `bs-${b.bodySize}` : '', b.bodyCols && b.bodyCols > 1 ? `bc-${b.bodyCols}` : '', b.align === 'center' ? 'al-c' : ''].filter(Boolean).join(' ');

    // A box with its own list of elements, in the order they were placed
  const CLS: Record<ItemEl['kind'], string> = { label: 'gi-label', heading: 'gi-h', text: 'gi-body', image: 'gi-media', spacer: '' };
  const CARD_CLS: Record<ItemEl['kind'], string> = { label: 'gc-label', heading: 'gc-h', text: 'gc-body', image: 'gc-cardimg', spacer: '' };
  const elsOf = (i: number, it: BlockItem, card = false) => { const els = it.els || []; const push = els.findIndex((e) => e.kind === 'heading' || e.kind === 'text'); const pushOk = push > 0 && els.slice(0, push).every((e) => e.kind === 'label' || e.kind === 'image') && !els.some((e) => e.kind === 'spacer'); return els.map((e, k) => {
    const cls = (k === push && pushOk ? 'gi-push ' : '') + 'gi-el';
    if (e.kind === 'spacer') return <div key={e.id} data-el={e.id} data-spacer="" className={'gi-el gi-spacer' + (edit ? ' ed-spacer' : '')} style={{ height: e.size ?? 32 }}>{edit?.grip ? edit.grip(i, e.id) : null}{edit ? <span>Spacer · {e.size ?? 32}px</span> : null}</div>;
    if (e.kind === 'image') { const mm = e.media && urls[e.media.path] ? e.media : undefined; const img = mm ? <img src={urls[mm.path]} alt="" loading="lazy" /> : null; return <div key={e.id} data-el={e.id} className={cls + ' gi-media'}>{edit?.grip ? edit.grip(i, e.id) : null}{edit?.itemElImage ? edit.itemElImage(i, e, img) : img}</div>; }
    const key = `${it.id}.${e.id}`; const tp = st(key); const el: El = { tag: e.kind === 'text' ? 'div' : 'p', className: (card ? CARD_CLS[e.kind] : CLS[e.kind]) + (tp.className ? ' ' + tp.className : ''), placeholder: e.kind === 'label' ? 'Label' : e.kind === 'heading' ? 'Headline' : 'Text', multiline: e.kind === 'text', style: tp.style, key };
    return <div key={e.id} data-el={e.id} className={cls}>{edit?.grip ? edit.grip(i, e.id) : null}{edit?.itemElText ? edit.itemElText(i, e, el) : !e.text ? null : el.multiline ? <Paras text={e.text} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{e.text}</p>}</div>;
  }); };
  // The section's parts in the order set in the editor (or the layout's own order), each movable
  // Text placed freely in the section joins its parts; the space before each part can be set
  const XCLS: Record<SectionText['kind'], [El['tag'], string, string]> = { label: ['p', 'gb-eb', 'Label'], heading: ['p', 'gb-h gb-xh', 'Headline'], text: ['div', 'gb-body', 'Write something…'] };
  const extraEl = (x: SectionText) => { const [tag, cls, ph] = XCLS[x.kind]; const tp = st(`x-${x.id}`); const el: El = { tag, className: cls + (tp.className ? ' ' + tp.className : ''), placeholder: ph, multiline: x.kind === 'text', style: tp.style, key: `x-${x.id}` }; return edit?.extraText ? edit.extraText(x, el) : !x.text ? null : el.multiline ? <Paras text={x.text} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{x.text}</p>; };
  const parts = (def: string[], map: Record<string, React.ReactNode>) => {
    const xs = (b.extras || []).map((x) => 'x-' + x.id);
    const all = [...def, ...xs];
    const saved = (b.order || []).filter((p) => all.includes(p));
    const nodes = [...saved, ...all.filter((p) => !saved.includes(p))].map((p) => [p, p.startsWith('x-') ? extraEl(b.extras!.find((x) => 'x-' + x.id === p)!) : map[p]] as const).filter(([, n]) => n);
    return nodes.map(([p, n], k) => { const g = k > 0 ? b.gapBefore?.[p] : undefined; return <div key={p} data-part={p} className={'gb-part gb-part-' + (p.startsWith('x-') ? 'x' : p)} style={g !== undefined ? { marginTop: `calc(${g}px - var(--part-gap, 20px))` } : undefined}>{k > 0 && edit?.gap ? edit.gap(p, g) : null}{edit?.partGrip ? edit.partGrip(p) : null}{n}</div>; });
  };
  // How content sits inside each box: the box's own setting, else the section's
  const alignCls = (it: BlockItem) => { const a = it.align || b.boxAlign; return a && (a.x || a.y) ? ` ga ga-x-${a.x || 'start'} ga-y-${a.y || 'start'}` : ''; };
  const gapVar = (it: BlockItem): React.CSSProperties => { const g = it.gap ?? b.boxGap; return g !== undefined ? { ['--egap' as string]: `${g}px` } : {}; };
  // Per-text styling from the editor: size, weight, colour
  const st = (key: string) => textProps(b.styles?.[key]);
  const txt = (field: TextField, value: string | undefined, tag: El['tag'], className0: string, placeholder: string, multiline = false) => {
    const { style, className: tc } = st(field); const className = tc ? `${className0} ${tc}` : className0;
    return edit ? edit.text(field, value, { tag, className, placeholder, multiline, style, key: field }) : !value ? null : multiline ? <Paras text={value} className={className} style={style} /> : tag === 'p' ? <p className={className} style={style}>{value}</p> : tag === 'span' ? <span className={className} style={style}>{value}</span> : <H className={className} style={style}>{value}</H>;
  };
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
  // A statement: a large headline and a line under it, on the page, a colour or an image; it can run edge to edge
  // in a locked shape, like a slide
  if (b.kind === 'statement') return (
    <section className={'gb gb-stmt' + (bg || back ? ' pad' : '') + (back ? ' has-back' : '') + (darkBack ? ' on-dark' : '') + (b.full ? ' gb-bleed' : '') + (b.ratio ? ' gb-ratio' : '') + ' ' + tone} style={{ ...(bg || back ? style : ink ? { color: ink } : {}), ...(b.ratio ? { aspectRatio: b.ratio.replace(':', ' / ') } : {}) }}>
      {backEl}
      <div className="gb-in">{parts(['head', 'body'], { head: <>{eyebrow()}{txt('heading', b.heading, 'p', 'gb-stmt-h', 'A statement')}</>, body: edit || b.body ? body('gb-body gb-stmt-sub') : null })}</div>
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
    const f = b.flow || {};
    const cols = Math.max(1, Math.min(6, b.cols || items.length || 2)), gcols = b.gridCols || 6;
    // Columns run one way: side by side, or stacked as rows. Older sections that wrapped more boxes than columns keep wrapping.
    const flowCls = f.dir === 'col' ? 'col' : f.dir === 'row' || f.wrap === false || items.length <= cols ? 'row' : 'wrap';
    const itxt = (i: number, f: 'label' | 'heading' | 'body', v: string | undefined, el0: El) => { const key = `${items[i].id}.${f}`; const tp = st(key); const el = { ...el0, style: tp.style, className: tp.className ? `${el0.className} ${tp.className}` : el0.className, key }; return edit?.itemText ? edit.itemText(i, f, v, el) : !v ? null : el.multiline ? <Paras text={v} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{v}</p>; };
    return (
      <section className={'gb gb-items ' + tone}>
        {parts(['head', 'body', 'items', 'media'], { head: edit || b.heading || b.eyebrow ? head : null, body: edit || b.body ? body('gb-body gb-intro') : null, media: media.length ? mediaEl : null, items: <>
        <div className={'gb-' + b.kind + ' bx-' + (b.box || 'none') + (b.kind === 'columns' ? ` fl-${flowCls} fw-${f.width || 'equal'} fh-${f.height || 'fill'} ia-${f.align || 'start'}` : '')} style={{ ...(b.kind === 'columns' ? { ['--cols' as string]: String(cols), ['--gap' as string]: b.gapX !== undefined ? `${b.gapX}px` : GAP_COL[f.gap || 'm'] } : { ['--gcols' as string]: String(gcols), ['--row' as string]: ROW_H[b.rowH || 'm'], ['--gap' as string]: b.gapX !== undefined ? `${b.gapX}px` : GAP_GRID[b.gap || 'm'] }), ...(b.gapY !== undefined ? { ['--rgap' as string]: `${b.gapY}px` } : {}), ...(b.pad !== undefined ? { ['--pad' as string]: `${b.pad}px` } : {}) }}>
          {items.map((it, i) => {
            const m = it.media && urls[it.media.path] ? it.media : undefined;
            const pic = m ? <img src={urls[m.path]} alt="" loading="lazy" /> : null;
            const onlyImage = !!m && !it.label && !it.heading && !it.body && !it.els && !edit;
            return (
              <div key={it.id} data-item={edit ? i : undefined} className={'gi' + (onlyImage ? ' gi-img' : '') + (m ? ' has-img' : '') + alignCls(it)} style={{ ...(b.kind === 'grid' ? { gridColumn: `span ${Math.min(gcols, it.w || 2)}`, gridRow: `span ${it.h || 2}` } : { ['--w' as string]: String(Math.min(cols, it.w || 1)) }), ...gapVar(it) }}>
                {edit?.itemBar ? edit.itemBar(i, it) : null}
                {b.kind === 'columns' && edit?.insertItem ? <>{edit.insertItem(i, 'before')}{i === items.length - 1 ? edit.insertItem(i + 1, 'after') : null}</> : null}
                {it.els ? elsOf(i, it, true) : <>
                {m ? <div className="gi-media" data-el="media">{edit?.grip ? edit.grip(i, 'media') : null}{edit?.itemImage ? edit.itemImage(i, m, pic) : pic}</div> : null}
                {onlyImage ? null : <div className="gi-txt">
                  {it.label ? <div data-el="label">{edit?.grip ? edit.grip(i, 'label') : null}{itxt(i, 'label', it.label, { tag: 'p', className: 'gi-label', placeholder: 'Label' })}</div> : null}
                  <div className="gi-main">
                    {it.heading ? <div data-el="heading">{edit?.grip ? edit.grip(i, 'heading') : null}{itxt(i, 'heading', it.heading, { tag: 'p', className: 'gi-h', placeholder: 'Headline (optional)' })}</div> : null}
                    {it.body ? <div data-el="body">{edit?.grip ? edit.grip(i, 'body') : null}{itxt(i, 'body', it.body, { tag: 'div', className: 'gi-body', placeholder: 'Text', multiline: true })}</div> : null}
                  </div>
                </div>}</>}
              </div>
            );
          })}
          {edit?.addItem && (b.kind !== 'columns' || !items.length) ? edit.addItem() : null}
        </div></> })}
      </section>
    );
  }
  if (b.kind === 'carousel') {
    const items = b.items || [];
    const itxt = (i: number, f: ItemField, v: string | undefined, el0: El) => { const key = `${items[i].id}.${f}`; const tp = st(key); const el = { ...el0, style: tp.style, className: tp.className ? `${el0.className} ${tp.className}` : el0.className, key }; return edit?.itemText ? edit.itemText(i, f, v, el) : !v ? null : el.multiline ? <Paras text={v} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{v}</p>; };
    const images = b.variant === 'images';
    const addCard = !images && edit?.addItem ? edit.addItem() : null; const sel0 = !!addCard;
    const slides = images
      ? [...media.map(({ m, i }) => <figure key={m.path} className="gc-fig">{img(m, i, <img src={urls[m.path]} alt={m.caption || ''} loading="lazy" />)}{edit ? edit.caption(i, m.caption) : m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>), ...(edit ? [edit.addImage()] : [])]
      : [...items.map((it, i) => {
          const m = it.media && urls[it.media.path] ? it.media : undefined;
          return <div key={it.id} data-item={edit ? i : undefined} className={'gc-card bx-' + (b.box || 'fill') + alignCls(it)} style={{ ...(b.pad !== undefined ? { padding: b.pad } : {}), ...gapVar(it) }}>
            {edit?.itemBar ? edit.itemBar(i, it) : null}
            {it.els ? elsOf(i, it, true) : <>
            {it.label ? <div data-el="label" className="gc-el">{edit?.grip ? edit.grip(i, 'label') : null}{itxt(i, 'label', it.label, { tag: 'p', className: 'gc-label', placeholder: 'Label' })}</div> : null}
            {it.heading ? <div data-el="heading" className="gc-el gc-push">{edit?.grip ? edit.grip(i, 'heading') : null}{itxt(i, 'heading', it.heading, { tag: 'p', className: 'gc-h', placeholder: 'A headline' })}</div> : null}
            {it.body ? <div data-el="body" className="gc-el">{edit?.grip ? edit.grip(i, 'body') : null}{itxt(i, 'body', it.body, { tag: 'div', className: 'gc-body', placeholder: 'Text', multiline: true })}</div> : null}
            {m ? <div className="gc-cardimg" data-el="media">{edit?.grip ? edit.grip(i, 'media') : null}{edit?.itemImage ? edit.itemImage(i, m, <img src={urls[m.path]} alt="" loading="lazy" />) : <img src={urls[m.path]} alt="" loading="lazy" />}</div> : null}
            </>}
          </div>;
        }), ...(addCard ? [addCard] : [])];
    return (
      <section className={'gb gb-items ' + tone}>
        {parts(['head', 'body', 'items'], { head: edit || b.heading || b.eyebrow ? head : null, body: edit || b.body ? body('gb-body gb-intro') : null, items: <Carousel slides={slides} variant={images ? 'images' : 'cards'} label={b.heading || (images ? 'Images' : 'Cards')} editing={!!edit} extra={edit ? (images ? 1 : edit.addItem && sel0 ? 1 : 0) : 0} /> })}
      </section>
    );
  }
  if (b.kind === 'spacer') return <div className={'gb-spacer' + (edit ? ' ed-spacer' : '')} style={{ height: b.size ?? 64 }} aria-hidden={!edit}>{edit ? <span>Spacer · {b.size ?? 64}px</span> : null}</div>;
  if (b.kind === 'image') return (
    <section className={'gb gb-full ' + tone}>
      {parts(['head', 'media', 'body'], { head: edit || b.heading ? head : null, media: mediaEl, body: edit || b.body ? body() : null })}
    </section>
  );
  if (b.kind === 'split') return (
    <section className={'gb gb-split' + (b.side === 'left' ? ' left' : '') + ' ' + tone}>
      <div className="gb-txt">{parts(['head', 'body'], { head, body: body() })}</div>
      {mediaEl}
    </section>
  );
  const longBody = (b.body || '').length > 280 && !media.length && !b.bodyCols;
  return (
    <section className={'gb' + (longBody ? ' gb-two' : '') + ' ' + tone}>
      {parts(['head', 'body', 'media'], { head, body: body(), media: b.kind === 'media' ? mediaEl : media.length ? mediaEl : null })}
    </section>
  );
}
