import type { Block, BlockItem, BlockMedia, BlockSwatch, ItemEl, SectionText } from '@/lib/figma/blocks';
import { Swatch } from '@/components/portal/Swatch';
import { textProps } from '@/lib/textStyle';
import { fillMedia, type FrameLook } from '@/lib/figma/blocks';
import { spaceRule } from '@/lib/guideSystem';
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
  /** Select an element in a frame (a nested frame), and whether it's selected */
  selectEl?: (item: number, key: string) => void; isSel?: (key: string) => boolean;
  /** Drag a side handle of a frame inside a frame to size it */
  sizeEl?: (item: number, elId: string, side: 'n' | 's' | 'e' | 'w', e: React.PointerEvent) => void;
  /** Elements added freely inside a box */
  itemElText?: (i: number, e: ItemEl, el: El) => React.ReactNode;
  itemElImage?: (i: number, e: ItemEl, img: React.ReactNode) => React.ReactNode;
  /** A handle to move one of the section's parts (headline, text, images, boxes) */
  partGrip?: (part: string) => React.ReactNode;
  /** Text placed freely in the section */
  extraText?: (x: SectionText, el: El) => React.ReactNode;
  /** The space before a part, to select and adjust */
  gap?: (part: string, value: number | undefined, rule?: import('@/lib/guideSystem').SpaceRule) => React.ReactNode;
  /** A handle to pick an element up and move it */
  grip?: (i: number, elId: string) => React.ReactNode;
};

function Paras({ text, className, style }: { text?: string; className?: string; style?: React.CSSProperties }) {
  if (!text) return null;
  // Every line is its own paragraph, with paragraph spacing between: text typed, pasted and imported from Figma all
  // separate paragraphs differently, and they should all look the same
  return <div className={className} style={style}>{text.split(/\n+/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

/** Black or white, whichever reads on a colour */
const inkOn = (hex: string) => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); if (Number.isNaN(n)) return '#ffffff'; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#111111' : '#ffffff'; };

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
  // A brand colour for filled boxes, with text that reads on it
  const boxVars = b.boxBg && /^#[0-9A-F]{6}$/i.test(b.boxBg) ? { ['--box-bg' as string]: b.boxBg, ['--box-ink' as string]: lum(b.boxBg) > 0.6 ? '#000' : '#fff' } as React.CSSProperties : undefined;
  const tone = [b.headSize ? `hs-${b.headSize}` : '', b.bodySize ? `bs-${b.bodySize}` : '', b.bodyCols && b.bodyCols > 1 ? `bc-${b.bodyCols}` : '', b.align === 'center' ? 'al-c' : ''].filter(Boolean).join(' ');

    // A box with its own list of elements, in the order they were placed
  const CLS: Record<ItemEl['kind'], string> = { label: 'gi-label', heading: 'gi-h', text: 'gi-body', image: 'gi-media', spacer: '', frame: 'gi-frame', icon: 'gi-icon', button: 'gi-btn' };
  const CARD_CLS: Record<ItemEl['kind'], string> = { label: 'gc-label', heading: 'gc-h', text: 'gc-body', image: 'gc-cardimg', spacer: '', frame: 'gi-frame', icon: 'gi-icon', button: 'gi-btn' };
  const elsOf = (i: number, it: BlockItem, card = false) => { const els = (it.els || []).filter((e) => edit || !e.hidden); const push = els.findIndex((e) => e.kind === 'heading' || e.kind === 'text'); const pushOk = push > 0 && els.slice(0, push).every((e) => e.kind === 'label' || e.kind === 'image') && !els.some((e) => e.kind === 'spacer'); return els.map((e, k) => {
    const cls = (k === push && pushOk ? 'gi-push ' : '') + 'gi-el';
    if (e.kind === 'spacer') return <div key={e.id} data-el={e.id} data-spacer="" className={'gi-el gi-spacer' + (edit ? ' ed-spacer' : '')} style={{ height: e.size ?? 32 }}>{edit?.grip ? edit.grip(i, e.id) : null}{edit ? <span>Spacer · {e.size ?? 32}px</span> : null}</div>;
    if (e.kind === 'icon') { const key = `${it.id}.${e.id}`; const sz = e.size ?? 32; return <div key={e.id} data-el={e.id} className={cls + ' gi-icon-el'}>{edit?.grip ? edit.grip(i, e.id) : null}<span className={'gi-icon' + (edit?.isSel?.(key) ? ' on' : '')} style={{ width: sz, height: sz, color: e.colour }} role="img" aria-label={e.icon?.name || 'Icon'} onMouseDown={edit?.selectEl ? (ev) => { ev.stopPropagation(); edit.selectEl!(i, key); } : undefined} dangerouslySetInnerHTML={{ __html: e.icon?.svg || '' }} /></div>; }
    if (e.kind === 'frame' || (e.kind === 'image' && e.look)) { const key = `${it.id}.${e.id}`; return <div key={e.id} data-el={e.id} className={cls + ' gi-frame-el' + (e.look?.sh === 'fill' && !(e.look.ratio && e.look.ratio !== 'auto') ? ' grow' : ' locked') + (e.look?.swPct ? ' pct' : e.look?.sw === 'hug' || typeof e.look?.sw === 'number' ? ' hug' : '')}>{edit?.grip ? edit.grip(i, e.id) : null}<Frame look={e.look} media={e.kind === 'image' ? e.media : undefined} urls={urls} on={edit?.isSel?.(key)} onPick={edit?.selectEl ? () => edit.selectEl!(i, key) : undefined} empty={!!edit} onSize={edit?.sizeEl ? (side, ev) => edit.sizeEl!(i, e.id, side, ev) : undefined} /></div>; }
    if (e.kind === 'button') {
      // A button: a filled one in the chosen colour (the text picks black or white to read on it), or a text link
      const key = `${it.id}.${e.id}`; const v = e.variant || 'primary'; const bg = e.colour || '#111111';
      const style = v === 'primary' ? { background: bg, color: inkOn(bg) } : e.colour ? { color: e.colour } : undefined;
      const cls2 = `gi-btn ${v}`;
      if (edit?.itemElText) return <div key={e.id} data-el={e.id} className={cls + ' gi-btn-el'}>{edit.grip ? edit.grip(i, e.id) : null}<span className={cls2 + (edit.isSel?.(key) ? ' on' : '')} style={style}>{edit.itemElText(i, e, { tag: 'p', className: 'gi-btn-t', placeholder: 'Button', multiline: false, key })}{v === 'link' ? <span className="gi-btn-arrow" aria-hidden>{e.newTab ? '↗' : '→'}</span> : null}</span></div>;
      if (!e.text) return null;
      const label = <>{e.text}{v === 'link' ? <span className="gi-btn-arrow" aria-hidden>{e.newTab ? ' ↗' : ' →'}</span> : null}</>;
      return <div key={e.id} data-el={e.id} className={cls + ' gi-btn-el'}>{e.href ? <a className={cls2} style={style} href={e.href} {...(e.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}{e.newTab ? <span className="sr">(opens in a new tab)</span> : null}</a> : <span className={cls2} style={style}>{label}</span>}</div>;
    }
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
    const kinds = Object.fromEntries((b.extras || []).map((x) => ['x-' + x.id, x.kind]));
      const scaled = b.kind === 'statement' && !!b.ratio; // a statement locked to a shape scales its own spacing
      return nodes.map(([p, n], k) => {
        const g = k > 0 ? b.gapBefore?.[p] : undefined;
        // The space before a part follows the guide's spacing rules, unless this section sets its own
        const rule = k > 0 ? spaceRule(nodes[k - 1][0], p, kinds) : undefined;
        const mt = g !== undefined ? `calc(${g}px - var(--part-gap, 20px))` : rule && !scaled ? `calc(var(--sp-${rule}, var(--part-gap, 20px)) - var(--part-gap, 20px))` : undefined;
        return <div key={p} data-part={p} data-rule={rule} className={'gb-part gb-part-' + (p.startsWith('x-') ? 'x' : p)} style={mt ? { marginTop: mt } : undefined}>{k > 0 && edit?.gap ? edit.gap(p, g, scaled ? undefined : rule) : null}{edit?.partGrip ? edit.partGrip(p) : null}{n}</div>;
      });
  };
  // How content sits inside each box: the box's own setting, else the section's
  const alignCls = (it: BlockItem) => { const a = it.align || b.boxAlign; return a && (a.x || a.y) ? ` ga ga-x-${a.x || 'start'} ga-y-${a.y || 'start'}` : ''; };
  /** A frame's sizing in an auto layout: fill the space, hug its content, or a fixed size */
  const sizeOf = (it: BlockItem): React.CSSProperties => {
    if (b.kind !== 'columns') return {};
    const sw = it.look?.sw, sh = it.look?.ratio && it.look.ratio !== 'auto' ? undefined : it.look?.sh, col = b.flow?.dir === 'col';
    return { ...(col ? (sw === 'hug' ? { width: 'fit-content', alignSelf: 'flex-start' } : typeof sw === 'number' ? { width: sw, maxWidth: '100%', alignSelf: 'flex-start' } : {})
      : (sw === 'hug' ? { flex: '0 0 auto', width: 'auto' } : typeof sw === 'number' ? { flex: `0 0 ${sw}px`, maxWidth: '100%' } : {})),
      ...(sh === 'hug' ? { alignSelf: 'flex-start' } : typeof sh === 'number' ? (it.look?.clip ? { height: sh, alignSelf: 'flex-start' } : { minHeight: sh, height: 'auto', alignSelf: 'flex-start', aspectRatio: 'auto' }) : sh === 'fill' && !col ? { alignSelf: 'stretch' } : {}) };
  };
  const gapVar = (it: BlockItem): React.CSSProperties => { const g = it.gap ?? b.boxGap; return { ...(g !== undefined ? { ['--egap' as string]: `${g}px` } : {}), ...(it.pad !== undefined ? { padding: it.pad } : {}), ...lookVars(it.look), ...(it.look?.ratio && it.look.ratio !== 'auto' && b.kind !== 'grid' ? { aspectRatio: it.look.ratio.replace(':', ' / '), ...(b.kind === 'columns' ? { alignSelf: 'flex-start', height: 'auto' } : {}) } : {}) }; };
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

  // A picture whose image was taken out stays in the editor as an empty frame, ready for a new one; clients never see it
  const media = (b.media || []).map((m, i) => ({ m, i })).filter(({ m }) => urls[m.path] || (edit && !m.path));
  const img = (m: BlockMedia, i: number | 'backdrop', el: React.ReactNode) => (edit ? edit.image(i, m, el) : el);
  const mediaEl = media.length || (edit && ['split', 'media', 'image'].includes(b.kind)) ? <div className="gb-media" style={{ ['--cols' as string]: String(Math.max(1, Math.min(b.kind === 'split' || b.kind === 'image' ? 1 : b.cols || Math.min(media.length, 3), media.length || 1))) }}>
    {media.map(({ m, i }) => <figure key={m.path || 'empty-' + i} className={'gb-fig ' + m.kind}>{img(m, i, (() => { const l = m.look || {}; if (!m.path) return <div className="fr fixed gb-fimg fr-empty" style={{ aspectRatio: (l.ratio && l.ratio !== 'auto' ? l.ratio : `${m.w}:${m.h}`).replace(':', ' / ') }}><span className="fr-ph">Drop an image here, or choose Replace</span></div>; return <div className="fr fixed gb-fimg" style={{ aspectRatio: (l.ratio || `${m.w}:${m.h}`).replace(':', ' / '), ...lookVars(l) }}><FrameMedia look={{ ...l, fill: { type: m.video ? 'video' : 'image', media: m }, fit: l.fit || (m.kind === 'graphic' ? 'fit' : 'fill') }} media={m} urls={urls} /></div>; })())}{edit ? edit.caption(i, m.caption) : m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>)}
    {edit && (b.kind === 'media' || !media.length) ? edit.addImage() : null}
  </div> : null;
  const backEl = back && b.backdrop ? img(b.backdrop, 'backdrop', <img className="gb-back" src={back} alt="" loading="lazy" decoding="async" />) : null;

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
    <section className={'gb gb-stmt' + (bg || back ? ' pad' : '') + (back ? ' has-back' : '') + (darkBack ? ' on-dark' : '') + ((bg || back || b.full) && !b.ratio ? ' gb-slice' + (bg || back ? '' : ' nofill') : b.full ? ' gb-bleed' : '') + (b.ratio ? ' gb-ratio' : '') + ' ' + tone} style={{ ...(bg || back ? style : ink ? { color: ink } : {}), ...(b.ratio ? { aspectRatio: b.ratio.replace(':', ' / ') } : {}) }}>
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
    // Hidden frames stay in the editor (faded) but aren't shown to the client
    const items = edit ? b.items || [] : (b.items || []).filter((x) => !x.hidden);
    const f = b.flow || {};
    const cols = Math.max(1, Math.min(6, b.cols || items.length || 2)), gcols = b.gridCols || 6;
    // Columns run one way: side by side, or stacked as rows. Older sections that wrapped more boxes than columns keep wrapping.
    const flowCls = f.dir === 'col' ? 'col' : f.dir === 'row' || f.wrap === false || items.length <= cols ? 'row' : 'wrap';
    const itxt = (i: number, f: 'label' | 'heading' | 'body', v: string | undefined, el0: El) => { const key = `${items[i].id}.${f}`; const tp = st(key); const el = { ...el0, style: tp.style, className: tp.className ? `${el0.className} ${tp.className}` : el0.className, key }; return edit?.itemText ? edit.itemText(i, f, v, el) : !v ? null : el.multiline ? <Paras text={v} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{v}</p>; };
    return (
      <section className={'gb gb-items ' + tone} style={boxVars}>
        {parts(['head', 'body', 'items', 'media'], { head: edit || b.heading || b.eyebrow ? head : null, body: edit || b.body ? body('gb-body gb-intro') : null, media: media.length ? mediaEl : null, items: <>
        <div className={'gb-' + b.kind + ' bx-' + (b.box || 'none') + (b.kind === 'columns' ? ` fl-${flowCls} fw-${f.width || 'equal'} fh-${f.height || 'fill'} ia-${f.align || 'start'}` : '')} style={{ ...(b.kind === 'columns' ? { ['--cols' as string]: String(cols), ['--gap' as string]: b.gapX !== undefined ? `${b.gapX}px` : f.gap ? GAP_COL[f.gap] : `var(--sp-box-gap, ${GAP_COL.m})` } : { ['--gcols' as string]: String(gcols), ['--row' as string]: ROW_H[b.rowH || 'm'], ['--gap' as string]: b.gapX !== undefined ? `${b.gapX}px` : b.gap ? GAP_GRID[b.gap] : `var(--sp-box-gap, ${GAP_GRID.m})` }), ...(b.gapY !== undefined ? { ['--rgap' as string]: `${b.gapY}px` } : {}), ...(b.pad !== undefined ? { ['--pad' as string]: `${b.pad}px` } : {}) }}>
          {items.map((it, i) => {
            const m = it.media && urls[it.media.path] ? it.media : undefined;
            const pic = m ? <img src={urls[m.path]} alt="" loading="lazy" /> : null;
            const onlyImage = !!m && !it.label && !it.heading && !it.body && !it.els && !edit;
            return (
              <div key={it.id} data-item={edit ? i : undefined} className={'gi' + (onlyImage ? ' gi-img' : '') + (m ? ' has-img' : '') + (it.box && it.box !== (b.box || 'none') ? ' ibx-' + it.box : '') + alignCls(it)} style={{ ...(b.kind === 'grid' ? { gridColumn: `span ${Math.min(gcols, it.w || 2)}`, gridRow: `span ${it.h || 2}` } : { ['--w' as string]: String(Math.min(cols, it.w || 1)) }), ...gapVar(it), ...sizeOf(it) }}>
                {edit?.itemBar ? edit.itemBar(i, it) : null}
                {fillMedia(it.look) ? <FrameMedia look={it.look} urls={urls} className="gi-bg" /> : null}
                {(b.kind === 'columns' || b.kind === 'grid') && edit?.insertItem ? <>{edit.insertItem(i, 'before')}{i === items.length - 1 ? edit.insertItem(i + 1, 'after') : null}</> : null}
                {it.els ? elsOf(i, it) : <>
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
    // Hidden frames stay in the editor (faded) but aren't shown to the client
    const items = edit ? b.items || [] : (b.items || []).filter((x) => !x.hidden);
    const itxt = (i: number, f: ItemField, v: string | undefined, el0: El) => { const key = `${items[i].id}.${f}`; const tp = st(key); const el = { ...el0, style: tp.style, className: tp.className ? `${el0.className} ${tp.className}` : el0.className, key }; return edit?.itemText ? edit.itemText(i, f, v, el) : !v ? null : el.multiline ? <Paras text={v} className={el.className} style={el.style} /> : <p className={el.className} style={el.style}>{v}</p>; };
    const images = b.variant === 'images';
    const addCard = !images && edit?.addItem ? edit.addItem() : null; const sel0 = !!addCard;
    const slides = images
      ? [...media.map(({ m, i }) => <figure key={m.path} className="gc-fig">{img(m, i, <img src={urls[m.path]} alt={m.caption || ''} loading="lazy" />)}{edit ? edit.caption(i, m.caption) : m.caption ? <figcaption>{m.caption}</figcaption> : null}</figure>), ...(edit ? [edit.addImage()] : [])]
      : [...items.map((it, i) => {
          const m = it.media && urls[it.media.path] ? it.media : undefined;
          return <div key={it.id} data-item={edit ? i : undefined} className={'gc-card bx-' + (it.box || b.box || 'fill') + alignCls(it)} style={{ ...(b.pad !== undefined ? { padding: b.pad } : {}), ...gapVar(it) }}>
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
      <section className={'gb gb-items ' + tone} style={boxVars}>
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
    <section className={'gb gb-split' + (b.side === 'left' ? ' left' : '') + ` ta-${b.textAlign || 'center'}` + (b.sticky ? ' sticky' : '') + ' ' + tone}>
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

/** A frame's fill colour, stroke and corner radius as CSS */
export function lookVars(l?: FrameLook): React.CSSProperties {
  if (!l) return {};
  const rgba = (hex: string, a?: number) => { if (a === undefined || a >= 100 || !/^#[0-9a-f]{6}$/i.test(hex)) return hex; const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a / 100})`; };
  const st = l.stroke && l.stroke.width ? l.stroke : undefined, sc = st ? rgba(st.colour, l.strokeAlpha) : '';
  const pos = l.strokePos || 'inside';
  return {
    ...(l.fill?.type === 'colour' ? { background: rgba(l.fill.colour, l.fillAlpha), color: lum(l.fill.colour) < 0.5 && (l.fillAlpha ?? 100) > 40 ? '#fff' : undefined } : {}),
    ...(l.fill?.type === 'gradient' ? { background: `linear-gradient(${l.fill.angle}deg, ${l.fill.stops.map((x) => `${rgba(x.colour, l.fillAlpha)} ${x.pos}%`).join(', ')})` } : {}),
    ...(l.radius ? { borderRadius: l.radius } : {}),
    ...(st && pos === 'inside' ? { ['--fr-sw' as string]: `${st.width}px`, ['--fr-sc' as string]: sc } : {}),
    ...(st && pos !== 'inside' ? { outline: `${st.width}px solid ${sc}`, outlineOffset: pos === 'center' ? -st.width / 2 : 0 } : {}),
    ...(l.opacity !== undefined && l.opacity < 100 ? { opacity: l.opacity / 100 } : {}),
    ...(l.padX !== undefined || l.padY !== undefined ? { padding: `${l.padY ?? l.pad ?? 0}px ${l.padX ?? l.pad ?? 0}px` } : {}),
    ...(l.clip === true ? { overflow: 'hidden' } : l.clip === false ? { overflow: 'visible' } : {}),
    ...(l.flow === 'row' || l.flow === 'wrap' ? { flexDirection: 'row', flexWrap: l.flow === 'wrap' ? 'wrap' : 'nowrap', alignItems: 'flex-start' } : {}),
    ...(fillMedia(l) ? { isolation: 'isolate' } : {})
  };
}

/** An image or video filling a frame: fill (cover), fit (contain) or crop (zoomed, from a focal point) */
export function FrameMedia({ look, media: m0, urls, className = 'fr-m' }: { look?: FrameLook; media?: BlockMedia; urls: Record<string, string>; className?: string }) {
  const m = fillMedia(look) || m0;
  const src = m ? urls[m.path] : undefined;
  if (!m || !src) return null;
  const fit = look?.fit || 'fill', x = look?.x ?? 50, y = look?.y ?? 50;
  // Figma's image adjustments, as CSS filters
  const a = look?.adjust || {};
  const filter = [a.exposure ? `brightness(${1 + a.exposure / 200})` : '', a.highlights ? `brightness(${1 + a.highlights / 500})` : '', a.contrast || a.shadows ? `contrast(${1 + (a.contrast || 0) / 100 - (a.shadows || 0) / 400})` : '', a.saturation ? `saturate(${1 + a.saturation / 100})` : '', a.temperature && a.temperature > 0 ? `sepia(${a.temperature / 250})` : '', a.temperature && a.temperature < 0 ? `hue-rotate(${a.temperature / 8}deg) saturate(${1 + a.temperature / 400})` : '', a.tint ? `hue-rotate(${a.tint / 4}deg)` : ''].filter(Boolean).join(' ');
  const style: React.CSSProperties = { ...(filter ? { filter } : {}), objectFit: fit === 'fit' ? 'contain' : 'cover', objectPosition: `${x}% ${y}%`, ...(fit === 'crop' && (look?.zoom || 1) > 1 ? { transform: `scale(${look!.zoom})`, transformOrigin: `${x}% ${y}%` } : {}) };
  return m.video || (look?.fill && look.fill.type === 'video')
    ? <video className={className} src={src} style={style} autoPlay muted loop playsInline aria-hidden />
    : <img className={className} src={src} alt={m.caption || ''} loading="lazy" style={style} />;
}

/** A frame inside a frame: filled with a colour, an image or a video, with its own stroke, radius, padding and shape */
function Frame({ look, media, urls, on, onPick, empty, onSize }: { look?: FrameLook; media?: BlockMedia; urls: Record<string, string>; on?: boolean; onPick?: () => void; empty?: boolean; onSize?: (side: 'n' | 's' | 'e' | 'w', e: React.PointerEvent) => void }) {
  const m = fillMedia(look) || media;
  // Locked proportions win: the frame keeps its shape at every width, whatever its height setting says
  const ratio = look?.ratio && look.ratio !== 'auto' ? look.ratio.replace(':', ' / ') : undefined;
  const sw = look?.sw, sh = ratio ? undefined : look?.sh;
  const fixed = !!ratio || sh === 'fill' || typeof sh === 'number';
  const style: React.CSSProperties = { ...lookVars(look), ...(ratio ? { aspectRatio: ratio } : {}), ...(look?.pad && look.padX === undefined && look.padY === undefined ? { padding: look.pad } : {}),
    ...(look?.swPct ? { width: `${look.swPct}%`, maxWidth: '100%' } : typeof sw === 'number' ? { width: sw, maxWidth: '100%' } : sw === 'hug' ? { width: 'fit-content', maxWidth: '100%' } : {}), ...(typeof sh === 'number' ? { height: sh } : sh === 'fill' ? { flex: '1 1 auto', minHeight: 80 } : {}) };
  const has = !!look?.fill || !!m;
  return <div className={'fr' + (fixed ? ' fixed' : '') + (on ? ' on' : '') + (!has && empty ? ' fr-empty' : '')} style={style} onMouseDown={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
    <div className="fr-in">{m ? <FrameMedia look={look} media={media} urls={urls} /> : !has && empty ? <span className="fr-ph">Frame · choose a fill</span> : null}</div>
    {on && onSize ? (['n', 's', 'e', 'w'] as const).map((sd) => <span key={sd} className={'ve-fh ve-fh-' + sd} onPointerDown={(ev) => { ev.stopPropagation(); onSize(sd, ev); }} aria-hidden />) : null}
  </div>;
}
