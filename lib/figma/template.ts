import { answer, FORM_KEYS, type BrandForm, type FormKey } from '@/lib/brandForm';
import { figma } from '@/lib/figma/scan';
import type { Block, BlockItem, BlockKind, BlockMedia, BoxStyle, FNode } from '@/lib/figma/blocks';

// Reads a Figma file made from the Lost Property guidelines template (Cover · Read me · Assets · Guidelines ·
// Components). Nothing is guessed: everything is found by its layer name, as the template's Read me lists them.
// Layers named "note", and sections or page-level layers whose names start with "_", are instructions and ignored.

type N = FNode & { fills?: { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number }; imageRef?: string }[]; style?: FNode['style'] & { lineHeightPx?: number; letterSpacing?: number; lineHeightPercentFontSize?: number } };
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
const hasImage = (n: N) => (n.fills || []).some((f) => f.type === 'IMAGE' && f.visible !== false);
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
const PLACEHOLDER = new Set(['brand name', 'one line about the brand.', 'colour name', 'family name', 'where it’s used', 'chapter title']);
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
  chapters: { title: string; number?: string; intro?: string; thumbNode?: string; frames: N[] }[];
  showcase: { layout: 'full' | 'half'; frames: { nodeId: string; caption?: string }[] }[];
  imageNodes: string[];
  /** Size of every node that gets exported, for image proportions */
  sizes: Record<string, { w: number; h: number }>;
};

const PKG: [RegExp, string][] = [[/^logos?$/i, 'logos'], [/^avatars?$/i, 'avatars'], [/^icons?$/i, 'icons'], [/^images?$/i, 'images'], [/^graphic\s*language$/i, 'graphics']];

export async function readTemplate(fileKey: string, pages: TemplatePages): Promise<TemplateRead> {
  const [assetsPage, guidePage] = await Promise.all([pageTree(fileKey, pages.assets), pageTree(fileKey, pages.guidelines)]);
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

  // Assets: one frame per file inside each package section; the artwork layer is what's exported
  const assets: TemplateAsset[] = [];
  for (const sec of top(assetsPage).filter((c) => c.type === 'SECTION')) {
    const nm = sec.name.trim();
    const custom = nm.match(/^custom\s*\/\s*(.+)$/i);
    const pkg = custom ? 'custom-' + slug(custom[1]).slice(0, 12) : PKG.find(([re]) => re.test(nm))?.[1];
    if (!pkg) continue;
    for (const f of (sec.children || []).filter((c) => visible(c) && c.type === 'FRAME' && !c.name.startsWith('_')).sort(byPos)) {
      const art = find(f, 'artwork'); if (!art) continue;
      const real = (art.children || []).filter((c) => visible(c) && !isNote(c));
      if (!real.length && !hasImage(art)) continue; // still the placeholder
      assets.push({ pkg, title: custom ? custom[1].trim() : undefined, name: f.name.trim(), nodeId: art.id, format: pkg === 'images' || hasImage(art) || real.some((c) => hasImage(c)) ? 'png' : 'svg', ground: solid(f) || undefined });
    }
  }

  // Chapters, in reading order, each matched to its section on the Guidelines page by title
  const cards = findAll(guidePage, (x) => x.name.trim().toLowerCase() === 'chapter' && (x.type === 'INSTANCE' || x.type === 'FRAME' || x.type === 'COMPONENT')).sort(byPos);
  const sections = top(guidePage).filter((c) => c.type === 'SECTION');
  const norm = (s: string) => slug(s.replace(/^\d+\s*/, ''));
  const chapters: TemplateRead['chapters'] = cards.map((c) => {
    const title = named(c, 'title') || 'Chapter';
    const sec = sections.find((s) => norm(s.name) === norm(title));
    const thumb = find(c, 'thumbnail');
    return { title, number: named(c, 'number'), intro: filled(named(c, 'intro')), thumbNode: thumb && hasImage(thumb) ? thumb.id : undefined, frames: sec ? (sec.children || []).filter((f) => visible(f) && f.type === 'FRAME' && !f.name.startsWith('_') && !isNote(f)).sort(byPos) : [] };
  });

  // Showcase: the section named showcase; full frames and pairs (left, right) with an image fill
  const showSec = sections.find((s) => s.name.trim().toLowerCase() === 'showcase');
  const showcase: TemplateRead['showcase'] = [];
  for (const f of (showSec?.children || []).filter((c) => visible(c) && !c.name.startsWith('_') && !isNote(c)).sort(byPos)) {
    const n = f.name.trim().toLowerCase();
    if (n === 'full' && hasImage(f)) showcase.push({ layout: 'full', frames: [{ nodeId: f.id }] });
    if (n === 'pair') { const l = find(f, 'left'), r = find(f, 'right'); const fr = [l, r].filter((x): x is N => !!x && hasImage(x)).map((x) => ({ nodeId: x.id })); if (fr.length) showcase.push({ layout: 'half', frames: fr }); }
  }

  // Pictures inside guideline frames that need exporting
  const imageNodes = chapters.flatMap((c) => c.frames.flatMap((f) => findAll(f, (x) => x.name.trim().toLowerCase() === 'image' && hasImage(x)).map((x) => x.id)));
  const want = new Set([...imageNodes, ...chapters.map((c) => c.thumbNode).filter(Boolean) as string[], ...showcase.flatMap((r) => r.frames.map((f) => f.nodeId)), ...assets.map((a) => a.nodeId)]);
  const sizes: TemplateRead['sizes'] = {};
  for (const p of [assetsPage, guidePage]) walk(p, (x) => { if (want.has(x.id)) { const bb = box(x); sizes[x.id] = { w: Math.round(bb.width), h: Math.round(bb.height) }; } });
  return { brand, form, colours, fonts, styles, assets, chapters, showcase, imageNodes, sizes };
}

// ── Guideline frames to blocks, by layout name
const LAYOUT: [RegExp, BlockKind][] = [[/^carousel/, 'carousel'], [/^headline/, 'divider'], [/^text\s*\+\s*image/, 'split'], [/^text/, 'text'], [/^columns?/, 'columns'], [/^grid/, 'grid'], [/^statement/, 'statement'], [/^images/, 'media'], [/^image/, 'image']];

export function frameToTemplateBlock(f: N, media: (nodeId: string) => BlockMedia | undefined): Block | null {
  const [layoutName, style] = f.name.toLowerCase().split('·').map((s) => s.trim());
  const kind = LAYOUT.find(([re]) => re.test(layoutName))?.[1];
  if (!kind) return null;
  const boxStyle: BoxStyle = /corners?/.test(style || '') ? 'corners' : /outline/.test(style || '') ? 'outline' : /fill/.test(style || '') ? 'fill' : 'none';
  const pics = (root: N, stop: boolean) => findAll(root, (x) => x.name.trim().toLowerCase() === 'image' && hasImage(x), stop).sort(byPos);
  const caption = (img: N) => { const parent = findAll(f, (x) => (x.children || []).some((c) => c.id === img.id))[0] || f; return text(find(parent, 'caption')); };
  const toMedia = (img: N) => { const m = media(img.id); return m ? { ...m, caption: caption(img) || m.caption } : undefined; };
  const b: Block = { id: f.id, source: f.id, kind, eyebrow: named(f, 'label', true), heading: named(f, 'headline', true), body: named(f, 'body', true), media: [] };
  if (kind === 'divider') return { id: f.id, source: f.id, kind, heading: b.heading || b.eyebrow };
  if (kind === 'statement') { const bg = solid(f); return { ...b, bg: bg && bg !== '#FFFFFF' ? bg : undefined }; }
  if (kind === 'carousel') {
    const items = findAll(f, (x) => x.name.trim().toLowerCase() === 'item', true).sort(byPos);
    const imgs = /images?/.test(style || '') || !items.length;
    if (imgs) { const ms = pics(f, true).map(toMedia).filter(Boolean) as BlockMedia[]; return ms.length ? { ...b, variant: 'images', media: ms } : null; }
    const cards: BlockItem[] = items.map((it) => { const pic = pics(it, false)[0]; return { id: it.id, label: named(it, 'label'), heading: named(it, 'headline'), body: named(it, 'body'), media: pic ? toMedia(pic) : undefined }; }).filter((i) => i.label || i.heading || i.body || i.media);
    return cards.length ? { ...b, variant: 'cards', items: cards, box: /corners?|outline|none/.test(style || '') ? boxStyle : 'fill' } : null;
  }
  if (kind === 'columns' || kind === 'grid') {
    const items = findAll(f, (x) => x.name.trim().toLowerCase() === 'item', true).sort(byPos);
    const all = items.reduce((u, it) => { const bb = box(it); return { x: Math.min(u.x, bb.x), r: Math.max(u.r, bb.x + bb.width) }; }, { x: Infinity, r: -Infinity });
    const unit = (box(f).width || 1440) / 16;
    const out: BlockItem[] = items.map((it) => {
      const pic = pics(it, false)[0]; const bb = box(it);
      return { id: it.id, label: named(it, 'label'), heading: named(it, 'headline'), body: named(it, 'body'), media: pic ? toMedia(pic) : undefined,
        ...(kind === 'grid' ? { w: Math.max(1, Math.min(6, Math.round((bb.width / Math.max(1, all.r - all.x)) * 6))), h: Math.max(1, Math.min(8, Math.round(bb.height / unit))) } : {}) };
    }).filter((i) => i.label || i.heading || i.body || i.media);
    const n = layoutName.match(/(\d)/)?.[1];
    return { ...b, items: out, box: boxStyle, cols: kind === 'columns' ? Math.max(2, Math.min(4, Number(n) || out.length || 3)) : undefined };
  }
  const ms = pics(f, true).map(toMedia).filter(Boolean) as BlockMedia[];
  if ((kind === 'image' || kind === 'media' || kind === 'split') && !ms.length && !b.heading && !b.body) return null;
  return { ...b, media: ms, side: kind === 'split' ? (() => { const img = pics(f, true)[0]; const t = find(f, 'headline', true) || find(f, 'body', true); return img && t && box(img).x < box(t).x ? 'left' : 'right'; })() : undefined, cols: kind === 'media' ? Math.min(4, Math.max(1, ms.length)) : undefined, kind: kind === 'split' && !ms.length ? 'text' : kind === 'image' && ms.length > 1 ? 'media' : kind };
}
