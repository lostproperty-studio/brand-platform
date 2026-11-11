import { answer, FORM_KEYS, type BrandForm, type FormKey } from '@/lib/brandForm';
import { figma } from '@/lib/figma/scan';
import type { Block, BlockItem, BlockKind, BlockMedia, BoxAlign, BoxStyle, FNode, FrameLook, ItemEl } from '@/lib/figma/blocks';
import { SPACE_STEPS } from '@/lib/guideSystem';

// Reads a Figma file made from the Lost Property guidelines template (Cover · Read me · Assets · Guidelines ·
// Components). Nothing is guessed: everything is found by its layer name, as the template's Read me lists them.
// Layers named "note", and sections or page-level layers whose names start with "_", are instructions and ignored.

type N = FNode & { layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'; primaryAxisAlignItems?: string; counterAxisAlignItems?: string; layoutSizingVertical?: string; itemSpacing?: number; paddingLeft?: number; paddingRight?: number; paddingTop?: number; paddingBottom?: number; cornerRadius?: number; fills?: { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number }; imageRef?: string }[]; style?: FNode['style'] & { lineHeightPx?: number; letterSpacing?: number; lineHeightPercentFontSize?: number } };
export type TemplatePages = { assets: string; guidelines: string };

/** The template's page ids, or null when the file isn't made from the template. */
export async function templatePages(fileKey: string): Promise<(TemplatePages & { file: string }) | null> {
  const meta = await figma<{ name: string; document: N }>(`/files/${fileKey}?depth=1`);
  const pages = meta.document.children || [];
  const find = (re: RegExp) => pages.find((p) => re.test(p.name.trim()))?.id;
  const assets = find(/^assets$/i), guidelines = find(/^guidelines$/i);
  return assets && guidelines && find(/^read\s*me$/i) ? { assets, guidelines, file: meta.name } : null;
}

async function pageTree(fileKey: string, pageId: string): Promise<N> {
  try {
    const r = await figma<{ nodes: Record<string, { document: N }> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(pageId)}`, 2);
    return r.nodes[pageId].document;
  } catch {
    const shallow = await figma<{ nodes: Record<string, { document: N }> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(pageId)}&depth=1`);
    const doc = shallow.nodes[pageId].document;
    const ids = (doc.children || []).map((n) => n.id); const kids: N[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      const part = await figma<{ nodes: Record<string, { document: N } | null> }>(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids.slice(i, i + 4).join(','))}`);
      for (const id of ids.slice(i, i + 4)) if (part.nodes[id]) kids.push(part.nodes[id]!.document);
    }
    return { ...doc, children: kids };
  }
}

// ── Helpers
const visible = (n: N) => n.visible !== false;
const isNote = (n: N) => n.name.trim().toLowerCase() === 'note';
const hexOf = (c: { r: number; g: number; b: number }) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const solid = (n: N) => { const f = (n.fills || []).find((x) => x.type === 'SOLID' && x.visible !== false && x.color); return f ? hexOf(f.color!) : null; };
/** A photo or video fill (a video comes through as its first frame) */
const hasImage = (n: N) => (n.fills || []).some((f) => (f.type === 'IMAGE' || f.type === 'VIDEO') && f.visible !== false);
const DRAWN = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'REGULAR_POLYGON', 'INSTANCE']);
const solidFill = (n: N) => (n.fills || []).some((f) => f.type !== 'IMAGE' && f.type !== 'VIDEO' && f.visible !== false && (f.opacity ?? 1) > 0);
/** Something to see: a photo, drawn artwork, a filled shape, or a frame or group holding any of these. Notes don't count. */
function hasVisual(n: N): boolean {
  if (!visible(n) || isNote(n) || n.type === 'TEXT') return false;
  if (hasImage(n) || DRAWN.has(n.type) || (n.type === 'RECTANGLE' && solidFill(n))) return true;
  if ((n.type === 'FRAME' || n.type === 'COMPONENT') && solidFill(n) && !(n.children || []).length) return true;
  return (n.children || []).some(hasVisual);
}
/** A picture slot: a layer named "image" with a photo fill, or with artwork inside it (a logo, a group, a placed photo).
 *  A slot that only wraps another slot (with its caption) gives way to the inner one; an empty template slot is skipped. */
const isImageName = (x: N) => x.name.trim().toLowerCase() === 'image';
/** Words set as artwork (a type specimen, a headline lockup): any text in a picture slot, except a template prompt */
const PROMPT = /^(image|photo|picture|artwork|graphic|placeholder|(drop|place|add|insert|replace)\b.*)$/i;
function hasWords(n: N): boolean {
  if (!visible(n) || isNote(n)) return false;
  if (n.type === 'TEXT') { const t = (n.characters || '').trim(); return !!t && !PROMPT.test(t); }
  return (n.children || []).some(hasWords);
}
/** Artwork in a slot: drawn shapes, photos, or type */
const holdsArt = (x: N) => hasImage(x) || (x.children || []).some((c) => hasVisual(c) || hasWords(c));
function isPicSlot(x: N): boolean {
  if (!isImageName(x) || !visible(x)) return false;
  const inner: N[] = []; const look = (n: N) => { for (const c of n.children || []) { if (isImageName(c)) inner.push(c); else look(c); } }; look(x);
  if (inner.some(holdsArt)) return false;
  return holdsArt(x);
}
/** A photo anywhere inside: such a slot is exported as a picture; artwork without photos goes out as SVG, crisp at any size */
const hasPhoto = (n: N): boolean => visible(n) && (hasImage(n) || (n.children || []).some(hasPhoto));
const box = (n: N) => n.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
const byPos = (a: N, b: N) => box(a).y - box(b).y || box(a).x - box(b).x;
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Every descendant, skipping notes; `stop` keeps a search from going inside nested items. */
function walk(n: N, fn: (x: N) => void, stop?: (x: N) => boolean) { for (const c of n.children || []) { if (!visible(c) || isNote(c)) continue; fn(c); if (!stop || !stop(c)) walk(c, fn, stop); } }
function find(n: N, name: string, stopAtItems = false) { let out: N | undefined; walk(n, (x) => { if (!out && x.name.trim().toLowerCase() === name) out = x; }, stopAtItems ? (x) => x.name.trim().toLowerCase() === 'item' : undefined); return out; }
function findAll(n: N, pred: (x: N) => boolean, stopAtItems = false) { const out: N[] = []; walk(n, (x) => { if (pred(x)) out.push(x); }, stopAtItems ? (x) => x.name.trim().toLowerCase() === 'item' : undefined); return out; }
const LS = new RegExp(String.fromCharCode(8232), 'g');
const text = (n?: N) => (n && n.type === 'TEXT' ? (n.characters || '').replace(LS, '\n').trim() : '') || undefined;
const named = (n: N, name: string, stopAtItems = false) => text(find(n, name, stopAtItems));

// Template placeholder text: left as is, it means "not filled in"
const PLACEHOLDER = new Set(['brand name', 'one line about the brand.', 'colour name', 'family name', 'where it’s used', 'chapter title', 'title']);
const filled = (s?: string) => (s && !PLACEHOLDER.has(s.toLowerCase()) && !/^a short welcome for the portal’s home page/i.test(s) ? s : undefined);

// ── What a template file holds
export type TemplateAsset = { pkg: string; title?: string; name: string; nodeId: string; format: 'svg' | 'png'; ground?: string };
export type TemplateRead = {
  brand: { name?: string; line?: string; intro?: string };
  /** The brand form at the top of Assets: rows named "field / key", each with an answer */
  form: BrandForm;
  colours: { name: string; hex: string; role: string }[];
  fonts: { role: string; family: string; use?: string }[];
  styles: { name: string; family?: string; size?: number; lineHeight?: number; tracking?: number; weight?: number }[];
  assets: TemplateAsset[];
  /** Things on the Assets page that weren't taken as assets, and why */
  assetSkips: { pkg: string; name: string; reason: string }[];
  chapters: { title: string; number?: string; intro?: string; thumbNode?: string; frames: N[] }[];
  showcase: { layout: 'full' | 'half'; frames: { nodeId: string; caption?: string }[] }[];
  imageNodes: string[];
  /** Picture slots holding only drawn artwork and type: exported as SVG */
  vectorNodes: string[];
  /** Size of every node that gets exported, for image proportions */
  sizes: Record<string, { w: number; h: number }>;
};

const PKG: [RegExp, string][] = [[/^(logo|wordmark|lockup)/i, 'logos'], [/^(social\s*)?avatar/i, 'avatars'], [/^icon/i, 'icons'], [/^(image|photo)/i, 'images'], [/^(graphic|pattern|shape)/i, 'graphics']];

export async function readTemplate(fileKey: string, pages: TemplatePages): Promise<TemplateRead> {
  // Either page can be left out ('') to read only the assets or only the guidelines
  const empty: N = { id: '', name: '', type: 'CANVAS', children: [] } as unknown as N;
  const [assetsPage, guidePage] = await Promise.all([pages.assets ? pageTree(fileKey, pages.assets) : empty, pages.guidelines ? pageTree(fileKey, pages.guidelines) : empty]);
  const top = (p: N) => (p.children || []).filter((c) => visible(c) && !c.name.trim().startsWith('_') && !isNote(c));

  // Brand
  const brandF = find(assetsPage, 'brand');
  const form: BrandForm = {};
  const formF = find(assetsPage, 'form');
  if (formF) for (const row of findAll(formF, (x) => /^field\s*\/\s*/i.test(x.name.trim()))) {
    const key = row.name.trim().replace(/^field\s*\/\s*/i, '').toLowerCase() as FormKey;
    const v = answer(named(row, 'answer'));
    if (FORM_KEYS.includes(key) && v) form[key] = v;
  }
  // Older files hold the basics in a frame named brand
  const brand = brandF ? { name: filled(named(brandF, 'name')), line: filled(named(brandF, 'line')), intro: filled(named(brandF, 'intro')) } : {};
  brand.name = form.name || brand.name; brand.line = form.line || brand.line; brand.intro = form.intro || brand.intro;

  // Colour: primary, secondary, tertiary sections of swatches; the value is the chip's fill
  const colours: TemplateRead['colours'] = [];
  for (const role of ['primary', 'secondary', 'tertiary']) {
    const sec = top(assetsPage).find((c) => c.name.trim().toLowerCase() === role); if (!sec) continue;
    for (const sw of findAll(sec, (x) => x.name.trim().toLowerCase() === 'swatch').sort(byPos)) {
      const chip = find(sw, 'chip'); const hex = chip ? solid(chip) : null; const name = filled(named(sw, 'name'));
      if (!hex || (!name && hex === '#D9D9D9')) continue;
      const use = filled(named(sw, 'use'));
      colours.push({ name: name || hex, hex, role: [role[0].toUpperCase() + role.slice(1), use].filter(Boolean).join(' · ') });
    }
  }

  // Typography: roles from the typeface frames, the scale from each style's specimen
  const fonts: TemplateRead['fonts'] = [];
  for (const tf of findAll(assetsPage, (x) => x.name.trim().toLowerCase() === 'typeface')) {
    const role = (named(tf, 'role') || '').toLowerCase(); const spec = find(tf, 'specimen');
    const family = filled(named(tf, 'family')) || (spec?.style?.fontFamily && spec.style.fontFamily !== 'KMR Waldenburg' ? spec.style.fontFamily : undefined);
    if (role && family) fonts.push({ role: /display|head/.test(role) ? 'display' : /caption|label/.test(role) ? 'caption' : 'body', family, use: filled(named(tf, 'use')) });
  }
  const styles: TemplateRead['styles'] = findAll(assetsPage, (x) => x.name.trim().toLowerCase() === 'style').map((s) => {
    const sp = find(s, 'specimen'); const st = sp?.style || {};
    return { name: named(s, 'style name') || 'Style', family: st.fontFamily, size: st.fontSize, weight: st.fontWeight, lineHeight: st.lineHeightPercentFontSize ? Math.round(st.lineHeightPercentFontSize) : st.lineHeightPx && st.fontSize ? Math.round((st.lineHeightPx / st.fontSize) * 100) : undefined, tracking: st.letterSpacing && st.fontSize ? Math.round((st.letterSpacing / st.fontSize) * 1000) / 10 : undefined };
  });

  // Assets. Each package section (Logos, Avatars, Icons, Images, Graphic language, custom / …) holds slots: the
  // template's frames ("wordmark / black"). Inside each slot is the artwork, either the template's "artwork" layer
  // or a layer named as the file should be ("Tileyard_Wordmark_Dark"). The artwork layer is what's exported, so the
  // slot's background never comes with it, and its name is the file name; a generic name ("Group 1") falls back to
  // the slot's name. A slot with an image fill and nothing inside (photography) is exported whole. Sections inside a
  // package section are followed, their name leading the file name.
  const assets: TemplateAsset[] = [];
  const assetSkips: TemplateRead['assetSkips'] = [];
  const ITEM = new Set(['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP']);
  const SHAPE = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'REGULAR_POLYGON', 'TEXT']);
  const hidden = (c: N) => !visible(c) || c.name.trim().startsWith('_') || isNote(c);
  const kidsOf = (n: N) => (n.children || []).filter((c) => !hidden(c) && (c.type !== 'TEXT' || !!c.characters?.trim()));
  // Real artwork: an image, a shape, filled text, or a frame/group holding any of those (the template's notes don't count)
  const hasArt = (n: N): boolean => hasImage(n) || (SHAPE.has(n.type) && (n.type !== 'TEXT' || !!n.characters?.trim())) || kidsOf(n).some((c) => hasArt(c) || (ITEM.has(c.type) && !!solid(c)));
  const GENERIC = /^(artwork|group|frame|vector|rectangle|ellipse|image|union|subtract|intersect|exclude|component|instance|layer|shape|path|logo|mask)(\s*\d+)?$/i;
  const usedNames = new Set<string>();
  for (const sec of top(assetsPage).filter((c) => c.type === 'SECTION')) {
    const nm = sec.name.trim();
    const custom = nm.match(/^custom\s*\/\s*(.+)$/i);
    const pkg = custom ? 'custom-' + slug(custom[1]).slice(0, 12) : PKG.find(([re]) => re.test(nm))?.[1];
    if (!pkg) continue;
    const take = (node: N, slotName: string) => {
      const own = node.name.trim();
      const base = !GENERIC.test(own) && own !== slotName ? own : slotName;
      let name = base, i = 2; while (usedNames.has(pkg + '/' + slug(name))) name = `${base} ${i++}`;
      if (name !== base) assetSkips.push({ pkg, name: base, reason: `two assets share this name; the second is saved as “${name}”` });
      if (base === slotName && GENERIC.test(own) && node.id !== '') assetSkips.push({ pkg, name, reason: `the artwork layer has no name of its own (“${own}”), so the file is named after its slot` });
      usedNames.add(pkg + '/' + slug(name));
      const kids = kidsOf(node);
      assets.push({ pkg, title: custom ? custom[1].trim() : undefined, name, nodeId: node.id, format: pkg === 'images' || hasImage(node) || kids.some((c) => hasImage(c)) || findAll(node, (x) => hasImage(x)).length ? 'png' : 'svg', ground: undefined });
    };
    const visit = (parent: N, prefix: string[]) => {
      for (const f of (parent.children || []).filter((c) => !hidden(c)).sort(byPos)) {
        if (f.type === 'TEXT') continue;
        if (f.type === 'SECTION') { visit(f, [...prefix, f.name.trim()]); continue; }
        if (!ITEM.has(f.type) && !SHAPE.has(f.type)) continue;
        const slotName = [...prefix, f.name.trim()].join(' / ');
        const kids = kidsOf(f);
        const artworkLayer = kids.find((c) => c.name.trim().toLowerCase() === 'artwork');
        // The artwork: the "artwork" layer, else the slot's one layer, else (several layers, or none) the slot itself
        const art = artworkLayer || (kids.length === 1 && (ITEM.has(kids[0].type) || SHAPE.has(kids[0].type)) ? kids[0] : undefined);
        if (art) {
          if (!hasArt(art) && !solid(art)) { assetSkips.push({ pkg, name: slotName, reason: art === artworkLayer ? 'the artwork layer is still the placeholder' : 'the layer inside is empty' }); continue; }
          take(art, slotName); continue;
        }
        if (!kids.length) { if (hasImage(f)) take(f, slotName); else assetSkips.push({ pkg, name: slotName, reason: 'empty slot' }); continue; }
        // Several layers loose in the slot: export the slot as one file (its background included)
        if (!hasArt(f)) { assetSkips.push({ pkg, name: slotName, reason: 'nothing to export' }); continue; }
        assetSkips.push({ pkg, name: slotName, reason: 'several layers sit loose in the slot, so the whole slot was exported, background included; group them into one named layer to export just the artwork' });
        take(f, slotName);
      }
    };
    visit(sec, []);
  }

  // Chapters, in reading order, each matched to its section on the Guidelines page by title
  const cards = findAll(guidePage, (x) => x.name.trim().toLowerCase() === 'chapter' && (x.type === 'INSTANCE' || x.type === 'FRAME' || x.type === 'COMPONENT')).sort(byPos);
  const sections = top(guidePage).filter((c) => c.type === 'SECTION');
  const norm = (s: string) => slug(s.replace(/^\d+\s*/, ''));
  const framesOf = (sec?: N) => (sec ? (sec.children || []).filter((f) => visible(f) && f.type === 'FRAME' && !f.name.startsWith('_') && !isNote(f)).sort(byPos) : []);
  const chapters: TemplateRead['chapters'] = cards.map((c) => {
    const title = filled(named(c, 'title')) || 'Chapter';
    const sec = sections.find((s) => norm(s.name) === norm(title));
    const thumb = find(c, 'thumbnail');
    return { title, number: named(c, 'number'), intro: filled(named(c, 'intro')), thumbNode: thumb && hasImage(thumb) ? thumb.id : undefined, frames: framesOf(sec) };
  }).filter((c) => c.title !== 'Chapter' || c.frames.length);
  // Chapter sections without a card are chapters too, in their place left to right (the layout library and the showcase aren't)
  for (const sec of [...sections].sort((a, b) => box(a).x - box(b).x)) {
    if (/^showcase$/i.test(sec.name.trim()) || chapters.some((c) => norm(c.title) === norm(sec.name))) continue;
    const frames = framesOf(sec); if (!frames.length) continue;
    chapters.push({ title: sec.name.trim().replace(/^\d+\s*/, ''), number: sec.name.trim().match(/^(\d+)/)?.[1], frames });
  }

  // Showcase: the section named showcase; full frames and pairs (left, right) with an image fill
  const showSec = sections.find((s) => s.name.trim().toLowerCase() === 'showcase');
  const showcase: TemplateRead['showcase'] = [];
  for (const f of (showSec?.children || []).filter((c) => visible(c) && !c.name.startsWith('_') && !isNote(c)).sort(byPos)) {
    const n = f.name.trim().toLowerCase();
    if (n === 'full' && hasImage(f)) showcase.push({ layout: 'full', frames: [{ nodeId: f.id }] });
    if (n === 'pair') { const l = find(f, 'left'), r = find(f, 'right'); const fr = [l, r].filter((x): x is N => !!x && hasImage(x)).map((x) => ({ nodeId: x.id })); if (fr.length) showcase.push({ layout: 'half', frames: fr }); }
  }

  // Pictures inside guideline frames that need exporting
  const slotNodes = chapters.flatMap((c) => c.frames.flatMap((f) => [...findAll(f, isPicSlot), ...findAll(f, (x) => x.name.trim().toLowerCase() === 'item' && hasImage(x))]));
  const imageNodes = slotNodes.map((x) => x.id);
  const vectorNodes = slotNodes.filter((x) => !hasPhoto(x)).map((x) => x.id);
  const want = new Set([...imageNodes, ...chapters.map((c) => c.thumbNode).filter(Boolean) as string[], ...showcase.flatMap((r) => r.frames.map((f) => f.nodeId)), ...assets.map((a) => a.nodeId)]);
  const sizes: TemplateRead['sizes'] = {};
  for (const p of [assetsPage, guidePage]) walk(p, (x) => { if (want.has(x.id)) { const bb = box(x); sizes[x.id] = { w: Math.round(bb.width), h: Math.round(bb.height) }; } });
  return { brand, form, colours, fonts, styles, assets, assetSkips, chapters, showcase, imageNodes, vectorNodes, sizes };
}

// ── A card as it's set up in Figma: its fill, stroke, corners, padding, spacing and alignment, and its contents in
// order as frames and text. Artwork keeps its size relative to the card. Spacing snaps to the guide's spacing scale.
// Guideline frames are drawn at about 1440 wide; the platform's sections are narrower, so spacing scales down with them.
const SCALE = 0.75;
const snap = (px: number) => SPACE_STEPS.reduce((b, s) => (Math.abs(s.px - px * SCALE) < Math.abs(b - px * SCALE) ? s.px : b), SPACE_STEPS[0].px);
const ALIGN: Record<string, 'start' | 'center' | 'end' | 'between'> = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'between' };
function cardLayout(it: N, media: (img: N) => BlockMedia | undefined): Pick<BlockItem, 'els' | 'look' | 'align' | 'gap'> | null {
  const ib = box(it);
  if (!ib.width || !ib.height) return null;
  const parts: { n: N; kind: ItemEl['kind'] }[] = [];
  const TEXTS: Record<string, ItemEl['kind']> = { label: 'label', headline: 'heading', body: 'text', caption: 'text' };
  walk(it, (x) => {
    const name = x.name.trim().toLowerCase();
    if (isPicSlot(x)) parts.push({ n: x, kind: 'frame' });
    else if (x.type === 'TEXT' && TEXTS[name] && text(x)) parts.push({ n: x, kind: TEXTS[name] });
  }, (x) => isPicSlot(x) || x.name.trim().toLowerCase() === 'item');
  if (!parts.length) return null;
  parts.sort((a, b) => byPos(a.n, b.n));
  // Padding: the card's auto layout padding, or how far in its contents start
  const auto = it.layoutMode === 'VERTICAL' || it.layoutMode === 'HORIZONTAL';
  const bbs = parts.map((p) => box(p.n));
  // Without auto layout, the inset on the left is taken for both sides (small artwork leaves a big gap on the right)
  const padL = auto ? it.paddingLeft ?? 0 : Math.max(0, Math.min(...bbs.map((b) => b.x - ib.x)));
  const padR = auto ? it.paddingRight ?? 0 : padL;
  const padT = auto ? it.paddingTop ?? 0 : Math.max(0, Math.min(...bbs.map((b) => b.y - ib.y)));
  const padB = auto ? it.paddingBottom ?? 0 : Math.max(0, Math.min(...bbs.map((b) => ib.y + ib.height - (b.y + b.height))));
  const inner = Math.max(1, ib.width - padL - padR);
  // Space between: auto layout spacing, or the usual gap between its contents
  const gaps = bbs.slice(1).map((b, i) => b.y - (bbs[i].y + bbs[i].height)).filter((g) => g >= 0).sort((a, b) => a - b);
  const small = gaps.filter((g) => g < ib.height * 0.2);
  const usual = auto ? it.itemSpacing ?? 0 : small.length ? small[Math.floor((small.length - 1) / 2)] : 12;
  // Alignment: from auto layout, or contents pinned top and bottom with a big gap between them
  let y: BoxAlign['y'] = auto && it.layoutMode === 'VERTICAL' ? ALIGN[it.primaryAxisAlignItems || 'MIN'] : undefined;
  let x: BoxAlign['x'] = auto && it.layoutMode === 'VERTICAL' ? (ALIGN[it.counterAxisAlignItems || 'MIN'] as BoxAlign['x']) : undefined;
  // Something pinned to the bottom, well away from what's above it: spread top to bottom
  const spread = !auto && gaps.length > 0 && Math.max(...gaps) > ib.height * 0.2 && padB <= padT * 1.5 + 4;
  if (spread) y = 'between';
  if (!auto && bbs.every((b) => Math.abs(b.x + b.width / 2 - (ib.x + ib.width / 2)) < 4) && bbs.some((b) => b.width < inner - 8)) x = 'center';
  const els: ItemEl[] = [];
  for (const p of parts) {
    if (p.kind === 'frame') {
      const m = media(p.n); if (!m) continue;
      const bb = box(p.n);
      const full = bb.width >= inner - 4;
      els.push({ id: 'f' + p.n.id.replace(/[^0-9a-z]/gi, ''), kind: 'frame', look: { fill: { type: 'image', media: m }, fit: 'fit', ratio: `${Math.round(bb.width)}:${Math.round(bb.height)}`, ...(full ? {} : { swPct: Math.round((bb.width / inner) * 1000) / 10 }) } });
    } else els.push({ id: 't' + p.n.id.replace(/[^0-9a-z]/gi, ''), kind: p.kind, text: text(p.n) });
  }
  if (!els.length) return null;
  const fill = solid(it);
  const st = (it.strokes || []).find((s) => s.visible !== false && s.color);
  const look: FrameLook = {
    ...(fill && fill !== '#FFFFFF' ? { fill: { type: 'colour', colour: fill } } : {}),
    ...(st && (it.strokeWeight ?? 1) > 0 ? { stroke: { colour: hexOf(st.color!), width: Math.max(1, Math.round(it.strokeWeight ?? 1)) } } : {}),
    ...(it.cornerRadius ? { radius: Math.round(it.cornerRadius * SCALE) } : {}),
    padX: snap((padL + padR) / 2), padY: snap(auto ? (padT + padB) / 2 : Math.min(padT, padB)),
    // A card with a set shape in Figma keeps it; a card that hugs its content doesn't
    ...(!auto || it.layoutSizingVertical === 'FIXED' ? { ratio: `${Math.round(ib.width)}:${Math.round(ib.height)}` } : {})
  };
  return { els, look, gap: snap(usual), align: x || y ? { x, y } : undefined };
}

// ── Guideline frames to blocks, by layout name
const LAYOUT: [RegExp, BlockKind][] = [[/^carousel/, 'carousel'], [/^headline/, 'divider'], [/^text\s*\+\s*image/, 'split'], [/^text/, 'text'], [/^columns?/, 'columns'], [/^grid/, 'grid'], [/^statement/, 'statement'], [/^images/, 'media'], [/^image/, 'image']];

export function frameToTemplateBlock(f: N, media: (nodeId: string) => BlockMedia | undefined): Block | null {
  const [layoutName, style] = f.name.toLowerCase().split('·').map((s) => s.trim());
  const kind = LAYOUT.find(([re]) => re.test(layoutName))?.[1];
  if (!kind) return null;
  const boxStyle: BoxStyle = /corners?/.test(style || '') ? 'corners' : /outline/.test(style || '') ? 'outline' : /fill/.test(style || '') ? 'fill' : 'none';
  const pics = (root: N, stop: boolean) => findAll(root, isPicSlot, stop).sort(byPos);
  // A card or box whose own fill is the photo is its own picture
  const picOf = (it: N) => pics(it, false)[0] || (hasImage(it) ? it : undefined);
  const caption = (img: N) => { const parent = findAll(f, (x) => (x.children || []).some((c) => c.id === img.id))[0] || f; return text(find(parent, 'caption')); };
  const toMedia = (img: N) => { const m = media(img.id); return m ? { ...m, caption: caption(img) || m.caption } : undefined; };
  // Each card as a frame: a card whose own fill is the photo becomes a frame filled with it; otherwise its contents,
  // pictures included, become frames and text laid out as in Figma. The plain fields stay as a fallback.
  const asFrames = (it: N, pic: N | undefined): Partial<BlockItem> => {
    if (pic && pic.id === it.id) { const m = toMedia(it); const bb = box(it); return m ? { media: undefined, els: [], look: { fill: { type: 'image', media: m }, fit: 'fill', ratio: `${Math.round(bb.width)}:${Math.round(bb.height)}` } } : {}; }
    const l = cardLayout(it, toMedia);
    return l ? { ...l, media: undefined } : {};
  };
  const b: Block = { id: f.id, source: f.id, kind, eyebrow: named(f, 'label', true), heading: named(f, 'headline', true), body: named(f, 'body', true), media: [] };
  if (kind === 'divider') return { id: f.id, source: f.id, kind, heading: b.heading || b.eyebrow };
  if (kind === 'statement') { const bg = solid(f); return { ...b, bg: bg && bg !== '#FFFFFF' ? bg : undefined }; }
  if (kind === 'carousel') {
    const items = findAll(f, (x) => x.name.trim().toLowerCase() === 'item', true).sort(byPos);
    const imgs = /images?/.test(style || '') || !items.length;
    if (imgs) { const ms = pics(f, true).map(toMedia).filter(Boolean) as BlockMedia[]; return ms.length ? { ...b, variant: 'images', media: ms } : null; }
    const cards: BlockItem[] = items.map((it) => { const pic = picOf(it); return { id: it.id, label: named(it, 'label'), heading: named(it, 'headline'), body: named(it, 'body'), media: pic ? toMedia(pic) : undefined, ...asFrames(it, pic) }; }).filter((i) => i.label || i.heading || i.body || i.media || i.els?.length);
    return cards.length ? { ...b, variant: 'cards', items: cards, box: /corners?|outline|none/.test(style || '') ? boxStyle : 'fill' } : null;
  }
  if (kind === 'columns' || kind === 'grid') {
    const items = findAll(f, (x) => x.name.trim().toLowerCase() === 'item', true).sort(byPos);
    const all = items.reduce((u, it) => { const bb = box(it); return { x: Math.min(u.x, bb.x), r: Math.max(u.r, bb.x + bb.width) }; }, { x: Infinity, r: -Infinity });
    const unit = (box(f).width || 1440) / 16;
    const out: BlockItem[] = items.map((it) => {
      const pic = picOf(it); const bb = box(it);
      return { id: it.id, label: named(it, 'label'), heading: named(it, 'headline'), body: named(it, 'body'), media: pic ? toMedia(pic) : undefined, ...asFrames(it, pic),
        ...(kind === 'grid' ? { w: Math.max(1, Math.min(6, Math.round((bb.width / Math.max(1, all.r - all.x)) * 6))), h: Math.max(1, Math.min(8, Math.round(bb.height / unit))) } : {}) };
    }).filter((i) => i.label || i.heading || i.body || i.media || i.els?.length);
    const n = layoutName.match(/(\d)/)?.[1];
    return { ...b, items: out, box: boxStyle, cols: kind === 'columns' ? Math.max(2, Math.min(4, Number(n) || out.length || 3)) : undefined };
  }
  const ms = pics(f, true).map(toMedia).filter(Boolean) as BlockMedia[];
  if ((kind === 'image' || kind === 'media' || kind === 'split') && !ms.length && !b.heading && !b.body) return null;
  return { ...b, media: ms, side: kind === 'split' ? (() => { const img = pics(f, true)[0]; const t = find(f, 'headline', true) || find(f, 'body', true); return img && t && box(img).x < box(t).x ? 'left' : 'right'; })() : undefined, cols: kind === 'media' ? Math.min(4, Math.max(1, ms.length)) : undefined, kind: kind === 'split' && !ms.length ? 'text' : kind === 'image' && ms.length > 1 ? 'media' : kind };
}
