import type { TextCase } from '@/lib/figma/blocks';

// The guide's own design system: a fixed set of text styles and a locked spacing scale, shared by every section of
// every chapter. They're generated from the guidelines (the type scale on the Assets page, what the AI read in the
// pages) and the typefaces uploaded, then tuned by the studio in the Styles window. Change one, and the whole guide
// follows, in the editor and in the client portal.

export type TypeId = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption';
/** font is a typeface role on the project ('display', 'body', 'caption'); leading is a line-height multiple; tracking in em */
export type TypeDef = { name: string; font: string; weight: number; size: number; leading: number; tracking: number; case?: TextCase };
export type SpaceRule = 'head-body' | 'intro-content' | 'part' | 'section' | 'box-gap' | 'box-pad' | 'el-gap';
export type GuideSystem = { type: Record<TypeId, TypeDef>; space: Record<SpaceRule, number>; /** Set when the studio has edited it; otherwise it follows the guidelines */ edited?: boolean };

export const TYPE_IDS: TypeId[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'];
export const TYPE_USE: Record<TypeId, string> = {
  h1: 'Chapter titles, statements, dividers', h2: 'Section headlines', h3: 'Card headlines, added headlines', h4: 'Headlines in frames',
  h5: 'Introductions and subheaders', h6: 'Labels in frames', body: 'Paragraphs', caption: 'Small labels, captions, numbers'
};

/** The spacing scale: every space in the guide is one of these. Lost Property's steps, with 0 and 128 at the ends. */
export const SPACE_STEPS: { px: number; name: string }[] = [
  { px: 0, name: 'None' }, { px: 2, name: '3XS' }, { px: 6, name: '2XS' }, { px: 10, name: 'XS' }, { px: 14, name: 'S' }, { px: 20, name: 'M' },
  { px: 28, name: 'L' }, { px: 40, name: 'XL' }, { px: 48, name: '2XL' }, { px: 64, name: '3XL' }, { px: 96, name: '4XL' }, { px: 128, name: '5XL' }
];
export const snapSpace = (px: number) => SPACE_STEPS.reduce((best, s) => (Math.abs(s.px - px) < Math.abs(best.px - px) ? s : best), SPACE_STEPS[0]).px;
export const spaceName = (px: number) => `${px}px`;
export const SPACE_RULES: { id: SpaceRule; label: string; help: string }[] = [
  { id: 'head-body', label: 'Headline to text', help: 'Between a headline and the text under it' },
  { id: 'intro-content', label: 'Text to content', help: 'Between a section’s introduction and its auto layout, grid or images' },
  { id: 'part', label: 'Between other parts', help: 'Any other two parts of a section' },
  { id: 'section', label: 'Between sections', help: 'From one section to the next' },
  { id: 'box-gap', label: 'Gap between frames', help: 'The auto layout gap: between frames, grid tiles and cards' },
  { id: 'box-pad', label: 'Frame padding', help: 'Inside frames with a stroke, fill or corner marks' },
  { id: 'el-gap', label: 'Gap inside frames', help: 'Between a label, headline and text in a frame' }
];

const FALLBACK: Record<TypeId, TypeDef> = {
  h1: { name: 'Title', font: 'display', weight: 400, size: 72, leading: 1, tracking: -0.02 },
  h2: { name: 'Header', font: 'display', weight: 400, size: 44, leading: 1.02, tracking: -0.015 },
  h3: { name: 'Subheader', font: 'display', weight: 400, size: 32, leading: 1.05, tracking: -0.01 },
  h4: { name: 'Frame headline', font: 'display', weight: 400, size: 24, leading: 1.1, tracking: -0.005 },
  h5: { name: 'Introduction', font: 'body', weight: 400, size: 19, leading: 1.4, tracking: 0 },
  h6: { name: 'Label', font: 'display', weight: 600, size: 16, leading: 1.25, tracking: 0 },
  body: { name: 'Body', font: 'body', weight: 400, size: 15, leading: 1.5, tracking: 0 },
  caption: { name: 'Caption', font: 'body', weight: 400, size: 12, leading: 1.4, tracking: 0.02 }
};
const SPACE: Record<SpaceRule, number> = { 'head-body': 20, 'intro-content': 28, part: 20, section: 64, 'box-gap': 20, 'box-pad': 28, 'el-gap': 14 };

type ScaleStyle = { name: string; family?: string; size?: number; lineHeight?: number; tracking?: number; weight?: number };
type Setting<T> = { value: T; off?: boolean } | undefined;
type ProfileLike = { settings?: { headlineCase?: Setting<TextCase>; headlineWeight?: Setting<number>; headlineTracking?: Setting<number>; displayScale?: Setting<'restrained' | 'large' | 'huge'>; bodySize?: Setting<number> } } | null | undefined;
type FontLike = { role: string; name: string };
const on = <T,>(s: Setting<T>) => (s && !s.off ? s.value : undefined);

/** The text styles and spacing from the guidelines and the typefaces: the type scale in Figma when there is one,
 *  shaped by what the AI read in the pages (headline weight, tracking, case, body size, how big display type gets). */
export function defaultSystem({ typeScale, profile, fonts }: { typeScale?: ScaleStyle[]; profile?: ProfileLike; fonts?: FontLike[] }): GuideSystem {
  const type = Object.fromEntries(TYPE_IDS.map((id) => [id, { ...FALLBACK[id] }])) as Record<TypeId, TypeDef>;
  const roleOf = (fam?: string) => { const f = (fonts || []).find((x) => x.name && fam && fam.toLowerCase().includes(x.name.toLowerCase().split(' ')[0])); return f?.role; };
  const ts = (typeScale || []).filter((s) => s.size && s.size > 0).sort((a, b) => b.size! - a.size!);
  if (ts.length >= 3) {
    // The scale's body is the size nearest 16; above it, the headlines from the top; below it, the caption
    const bi = ts.reduce((best, s, i) => (Math.abs(s.size! - 16) < Math.abs(ts[best].size! - 16) ? i : best), 0);
    const heads = ts.slice(0, bi), small = ts.slice(bi + 1);
    const put = (id: TypeId, s: ScaleStyle) => { type[id] = { name: s.name || FALLBACK[id].name, font: roleOf(s.family) || FALLBACK[id].font, weight: s.weight || FALLBACK[id].weight, size: Math.round(s.size!), leading: s.lineHeight ? Math.round(s.lineHeight) / 100 : FALLBACK[id].leading, tracking: s.tracking ? s.tracking / 100 : 0 }; };
    put('body', ts[bi]);
    if (small.length) put('caption', small[small.length - 1]);
    if (small.length > 1) put('h6', small[0]);
    // Up to five headline steps from the file; any missing step sits between its neighbours
    const hs: TypeId[] = ['h1', 'h2', 'h3', 'h4', 'h5'];
    heads.slice(0, 5).forEach((s, i) => put(hs[i], s));
    for (let i = 1; i < hs.length; i++) if (type[hs[i]].size >= type[hs[i - 1]].size) type[hs[i]] = { ...type[hs[i]], size: Math.max(type.body.size + 2, Math.round(type[hs[i - 1]].size * 0.75)) };
  } else {
    const p = profile?.settings;
    const scale = on(p?.displayScale);
    if (scale) { const k = scale === 'huge' ? 1.33 : scale === 'restrained' ? 0.78 : 1; for (const id of ['h1', 'h2', 'h3'] as TypeId[]) type[id].size = Math.round(type[id].size * k); }
    const body = on(p?.bodySize); if (body) { type.body.size = Math.round(body); type.h5.size = Math.max(type.h5.size, Math.round(body * 1.25)); }
  }
  // Headline habits from the guidelines apply to the headline styles
  const p = profile?.settings;
  const w = on(p?.headlineWeight), t = on(p?.headlineTracking), c = on(p?.headlineCase);
  for (const id of ['h1', 'h2', 'h3', 'h4'] as TypeId[]) { if (w && ts.length < 3) type[id].weight = w; if (t !== undefined && ts.length < 3) type[id].tracking = t; if (c && c !== 'sentence') type[id].case = c; }
  // Only roles with a typeface uploaded; otherwise the nearest one that has
  const roles = new Set((fonts || []).map((f) => f.role));
  if (roles.size) for (const id of TYPE_IDS) if (!roles.has(type[id].font)) type[id].font = roles.has('body') && !id.startsWith('h') ? 'body' : roles.has('display') ? 'display' : [...roles][0];
  return { type, space: { ...SPACE } };
}

/** The system to use: what the studio set, or what the guidelines give */
export function systemFor(saved: GuideSystem | undefined, from: Parameters<typeof defaultSystem>[0]): GuideSystem {
  const d = defaultSystem(from);
  if (!saved) return d;
  return { ...saved, type: { ...d.type, ...saved.type }, space: { ...d.space, ...saved.space } };
}

/** Which spacing rule sits between two parts of a section */
export function spaceRule(prev: string, cur: string, kinds: Record<string, string> = {}): SpaceRule {
  const k = (p: string) => (p === 'head' ? 'head' : p === 'body' ? 'text' : p.startsWith('x-') ? (kinds[p] === 'text' ? 'text' : 'head') : 'content');
  const a = k(prev), b = k(cur);
  if (b === 'content' && a !== 'content') return 'intro-content';
  if (a === 'head' && b === 'text') return 'head-body';
  return 'part';
}

const fam = (role: string) => `var(--font-${role}, ${role === 'display' ? 'var(--pt-display, inherit)' : role === 'body' ? 'var(--pt-body, inherit)' : 'inherit'})`;
const sizeCss = (n: number) => (n <= 18 ? `${n}px` : `clamp(${Math.max(18, Math.round(n * 0.55))}px, ${Math.round((n / 1280) * 1000) / 10}vw, ${n}px)`);
const caseCss = (c?: TextCase) => (c === 'upper' ? 'uppercase' : c === 'lower' || c === 'sentence' ? 'lowercase' : c === 'title' ? 'capitalize' : 'none');
/** Where each style applies by default. A text can be given another style in the editor (class ts-<id>). */
const WHERE: Record<TypeId, string[]> = {
  h1: ['.pt-chhead .pt-display', '.gb-h.xl', '.gb-div-h', '.gb-stmt-h', '.gb-cover .gb-h'],
  h2: ['.gb-h'], h3: ['.gc-h', '.gb-xh'], h4: ['.gi-h'],
  h5: ['.pt-chhead .pt-lede', '.gb-body.lg', '.gb-stmt-sub'], h6: ['.gi-label'],
  body: ['.gb-body', '.gi-body', '.gc-body'], caption: ['.gb-eb', '.gc-label', '.gb-cap', '.gb-div-n', '.gb-fig figcaption']
};

/** The CSS for the system, scoped to an element with class gsys (the chapter page, and the editor's page) */
export function systemCss(sys: GuideSystem): string {
  const S = '.gsys.gsys';
  const decl = (d: TypeDef) => `font-family: ${fam(d.font)}; font-weight: ${d.weight}; font-size: ${sizeCss(d.size)}; line-height: ${d.leading}; letter-spacing: ${d.tracking}em; text-transform: ${caseCss(d.case)};`;
  const vars = Object.entries(sys.space).map(([k, v]) => `--sp-${k}: ${v}px;`).join(' ');
  return [
    `.gsys { ${vars} }`,
    `${S} .pt-blocks:not(.ve-blocks) { gap: var(--sp-section); }`,
    // Paragraphs take the text's settings from the text block they're in
    `${S} :is(.gb-body, .gi-body, .gc-body, .pt-lede) p { font: inherit; letter-spacing: inherit; text-transform: inherit; }`,
    ...TYPE_IDS.map((id) => `${WHERE[id].map((w) => `${S} ${w}`).join(', ')} { ${decl(sys.type[id])} }`),
    // A sentence-case style: lowercase with the first letter up
    ...TYPE_IDS.filter((id) => sys.type[id].case === 'sentence').map((id) => `${WHERE[id].map((w) => `${S} ${w}::first-letter`).join(', ')} { text-transform: uppercase; }`),
    ...TYPE_IDS.map((id) => `${S} .ts-${id}.ts-${id} { ${decl(sys.type[id])} }`),
    // Statements locked to a shape scale their type with the slide
    `${S} .gb-stmt.gb-ratio .gb-stmt-h { font-size: clamp(28px, 8cqw, 140px); }`,
    `${S} .gb-stmt.gb-ratio .gb-stmt-sub { font-size: clamp(16px, 2.2cqw, 30px); }`
  ].join('\n');
}

/** The studio's text styles as a type scale, so the design system and the AI skills use what was set in the editor */
export function systemTypeScale(sys: GuideSystem, fonts: FontLike[]): ScaleStyle[] {
  return TYPE_IDS.map((id) => { const d = sys.type[id]; return { name: d.name, family: fonts.find((f) => f.role === d.font)?.name, size: d.size, lineHeight: Math.round(d.leading * 100), tracking: Math.round(d.tracking * 1000) / 10, weight: d.weight }; });
}
