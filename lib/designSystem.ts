import { aboutMd, lines, type BrandForm } from '@/lib/brandForm';
import type { Snapshot } from '@/lib/ai/project';
import type { ProjectFont } from '@/lib/fonts';
import { chapterText } from '@/lib/portal/guide';
import { aiRulesMd, watchoutsFrom } from '@/lib/aiRules';
import { lum } from '@/lib/portal/generated';
import { previewHtml, componentPreviews } from '@/lib/designSystemPreview';
import { SETTING_INFO, showSetting, type Profile, type SettingKey, type Source } from '@/lib/designProfileInfo';

// A design system for AI, built from the brand's guidelines: one folder that tells Claude (or any AI tool) how to
// build interfaces, documents and layouts in the brand, with the same shape as the studio's own system.
//   DESIGN.md      the brand book: voice, colour roles, type, space, shape, imagery, logo, components, rules
//   tokens.json    every token as lists (light and dark), tokens.css the same as CSS variables
//   brand.css      the components as ds- classes, built only from tokens
//   components/    a README and a live preview per component
//   preview.html   the system in use: foundations, elements, modules and whole layouts
//   assets/        logos, imagery, graphic language and licensed fonts from the kit and the Figma assets page
// What the guidelines don't say is decided here, and every such decision is written down under "Judgement calls".

export type TypeStyle = { name: string; family?: string; size?: number; lineHeight?: number; tracking?: number; weight?: number };
export type DSInput = {
  snap: Snapshot; fonts: ProjectFont[]; typeScale?: TypeStyle[];
  /** Paths inside the folder: assets/logo/…, assets/fonts/…, tokens/…, assets/imagery/…, assets/graphics/… */
  files: string[];
  aiDonts?: string[];
  /** The brand's design qualities, read from the guidelines by AI and checked by the studio */
  profile?: Profile | null;
};

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brand';
const sat = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); return Math.max(...c) - Math.min(...c); };

// ── Colour maths
const rgbOf = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** Mixes `a` into `b` by t (0 = b, 1 = a) */
export const mix = (a: string, b: string, t: number) => { const x = rgbOf(a), y = rgbOf(b); return toHex(x.map((v, i) => y[i] + (v - y[i]) * t)); };
const rel = (hex: string) => { const [r, g, b] = rgbOf(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio */
export const contrast = (a: string, b: string) => { const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const bestOn = (bg: string, options: string[]) => [...options].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
/** The quietest grey between ink and surface that still reads as text (4.5:1) */
const muteFor = (ink: string, surface: string) => { for (let t = 0.45; t <= 1; t += 0.03) { const m = mix(ink, surface, t); if (contrast(m, surface) >= 4.6) return m; } return ink; };

/** Picks working roles from the palette: background, text, accent and a quiet surface. */
export function roles(colours: { name: string; hex: string; role?: string }[]) {
  const by = (re: RegExp) => colours.find((c) => re.test(`${c.name} ${c.role || ''}`));
  const sorted = [...colours].sort((a, b) => lum(b.hex) - lum(a.hex));
  const paper = by(/background|paper|base|white|cream|light/i) || sorted[0] || { name: 'White', hex: '#FFFFFF' };
  const ink = by(/text|ink|black|dark|charcoal/i) || sorted[sorted.length - 1] || { name: 'Black', hex: '#000000' };
  const accent = by(/accent|signature|highlight/i) || [...colours].filter((c) => c !== paper && c !== ink && /primary/i.test(c.role || '')).sort((a, b) => sat(b.hex) - sat(a.hex))[0] || [...colours].filter((c) => c !== paper && c !== ink).sort((a, b) => sat(b.hex) - sat(a.hex))[0] || ink;
  let [pp, ii, aa] = [paper, ink, accent];
  // Keep it readable: when the palette can't give text and background enough contrast, fall back to white or black
  if (contrast(pp.hex, ii.hex) < 4.5) { if (lum(ii.hex) < 0.5) pp = { name: 'White', hex: '#FFFFFF' }; else ii = { name: 'Black', hex: '#000000' }; }
  if (Math.abs(lum(aa.hex) - lum(pp.hex)) < 0.08 && aa.hex.toUpperCase() !== ii.hex.toUpperCase()) aa = ii;
  const light = lum(pp.hex) > 0.5;
  const surface = sorted.find((c) => c.hex !== pp.hex && Math.abs(lum(c.hex) - lum(pp.hex)) < 0.12) || { name: light ? 'Light grey' : 'Dark grey', hex: mix(ii.hex, pp.hex, 0.05) };
  return { paper: pp, ink: ii, accent: aa, surface, onAccent: { name: 'On accent', hex: bestOn(aa.hex, [ii.hex, pp.hex, '#000000', '#FFFFFF']) } };
}

// ── The spec: everything the files are written from
type Tok = { name: string; value: string | Record<string, string>; usage: string };
type Style = { name: string; role: string; family: 'display' | 'body' | 'caption'; size: number; lineHeight: number; tracking: number; weight: number; upper?: boolean; transform?: string; usage: string; sample: string };
export type DSSpec = ReturnType<typeof buildSpec>;

export function buildSpec(input: DSInput) {
  const { snap, fonts } = input;
  const form: BrandForm = snap.form || {};
  const client = snap.client;
  const judgement: string[] = [];
  const palette = snap.colours.filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex));
  // A setting from the design profile, unless the studio switched it off
  const prof = input.profile?.settings;
  const use = <K extends SettingKey>(k: K) => (prof?.[k] && !prof[k].off ? prof[k] : undefined) as Profile['settings'][K] | undefined;
  const fromGuide = (k: SettingKey) => use(k)?.source.from === 'guidelines' || use(k)?.source.from === 'studio';
  const r = roles(palette);
  const pa = use('accent');
  if (pa) { const c = palette.find((x) => x.hex.toUpperCase() === pa.value.hex.toUpperCase()); if (c && c.hex.toUpperCase() !== r.paper.hex.toUpperCase()) { r.accent = c; r.onAccent = { name: 'On accent', hex: bestOn(c.hex, [r.ink.hex, r.paper.hex, '#000000', '#FFFFFF']) }; } }
  if (!palette.length) judgement.push('No colours in the guidelines yet, so the system runs in black and white.');

  // Themes. Light: the brand's paper and ink. Dark: ink becomes the ground (or a near-black when ink isn't dark enough).
  const L = { surface: r.paper.hex, ink: r.ink.hex };
  const darkGround = rel(r.ink.hex) < 0.05 ? r.ink.hex : '#111111';
  const D = { surface: darkGround, ink: contrast(r.paper.hex, darkGround) >= 7 ? r.paper.hex : '#FFFFFF' };
  const accent = r.accent.hex;
  const accentIsText = contrast(accent, L.surface) >= 4.5;
  const onAccent = bestOn(accent, [L.ink, L.surface, '#000000', '#FFFFFF']);
  if (contrast(onAccent, accent) < 4.5) judgement.push(`Text on the accent (${r.accent.name}) can't reach 4.5:1, so accent fills carry only large type (24px+) or icons.`);
  if (!accentIsText) judgement.push(`${r.accent.name} is too light to be text on ${r.paper.name}; it's used as a fill, and links and active states use ink.`);
  const theme = (t: { surface: string; ink: string }) => ({ surface: t.surface, ink: t.ink, mute: muteFor(t.ink, t.surface), fill: mix(t.ink, t.surface, 0.04), fill2: mix(t.ink, t.surface, 0.08), fill2h: mix(t.ink, t.surface, 0.13), line: mix(t.ink, t.surface, 0.12), lineStrong: mix(t.ink, t.surface, 0.3) });
  const lt = theme(L), dk = theme(D);
  judgement.push('Dark theme is derived: the brand ink becomes the ground, the paper becomes the text, and the accent stays as it is. Check it against the guidelines before it goes public.');
  const both = (a: string, b: string) => ({ light: a, dark: b });
  const colour: Tok[] = [
    { name: 'surface', value: both(lt.surface, dk.surface), usage: `Page background: ${r.paper.name} in light, ${darkGround === r.ink.hex ? r.ink.name : 'near-black'} in dark.` },
    { name: 'fill', value: both(lt.fill, dk.fill), usage: 'Quiet panels: cards, rows, the hover state of list items.' },
    { name: 'fill-2', value: both(lt.fill2, dk.fill2), usage: 'Default button and input ground, selected tab.' },
    { name: 'fill-2-hover', value: both(lt.fill2h, dk.fill2h), usage: 'Hover on anything on fill-2.' },
    { name: 'line', value: both(lt.line, dk.line), usage: 'Hairline dividers and card outlines. Decorative only.' },
    { name: 'line-strong', value: both(lt.lineStrong, dk.lineStrong), usage: 'Input outlines and control borders (3:1 or more on surface).' },
    { name: 'ink', value: both(lt.ink, dk.ink), usage: `All primary text and icons: ${r.ink.name} in light.` },
    { name: 'on-ink', value: both(lt.surface, dk.surface), usage: 'Text on an ink fill (primary button, inverted band).' },
    { name: 'mute', value: both(lt.mute, dk.mute), usage: 'Secondary text: meta, captions, placeholders. 4.5:1 on surface.' },
    { name: 'accent', value: accent, usage: `${r.accent.name}, the brand's lead colour. One accent moment per screen or page: a highlight button, a band, a tag.` },
    { name: 'on-accent', value: onAccent, usage: `Text and icons on accent (${contrast(onAccent, accent).toFixed(1)}:1).` },
    { name: 'link', value: both(accentIsText ? accent : lt.ink, contrast(accent, dk.surface) >= 4.5 ? accent : dk.ink), usage: accentIsText ? 'Links and active states.' : 'Links and active states (ink, underlined: the accent is too light for text).' },
    { name: 'focus', value: both(lt.ink, dk.ink), usage: 'Focus ring: 2px solid, 2px offset.' }
  ];
  const brandCols = palette.map((c) => ({ ...c, token: `brand-${kebab(c.name)}`, on: bestOn(c.hex, [L.ink, L.surface, '#000000', '#FFFFFF']) }));
  const seen = new Set(colour.map((t) => t.name));
  for (const c of brandCols) {
    if (seen.has(c.token)) continue; seen.add(c.token);
    colour.push({ name: c.token, value: c.hex.toUpperCase(), usage: `${c.name}${c.role ? ` (${c.role})` : ''}. Text on it: ${c.on === L.ink ? 'ink' : c.on === L.surface ? 'surface' : c.on} at ${contrast(c.on, c.hex).toFixed(1)}:1.` });
  }

  // Type: families from the typefaces; the scale from the Assets page's type scale when there is one
  const display = fonts.find((f) => f.role === 'display' && f.name) || fonts.find((f) => f.name);
  const body = fonts.find((f) => f.role === 'body' && f.name) || display;
  const caption = fonts.find((f) => f.role === 'caption' && f.name) || body;
  const hl = { case: use('headlineCase')?.value, weight: use('headlineWeight'), tracking: use('headlineTracking'), scale: use('displayScale')?.value, body: use('bodySize') };
  if (!display) judgement.push('No typefaces are named yet, so the system uses the system sans serif. Add them on the Typefaces tab.');
  const licensed = (f?: ProjectFont) => !!f?.files.some((x) => x.licence === 'licensed');
  if (display && !licensed(display)) judgement.push(`${display.name} isn't included as a licensed file, so the download names it and falls back to the system font until it's installed.`);
  const stack = (f: ProjectFont | undefined, role: string, mono = false) => f ? `"${f.name}", "brand-${role}", ${mono ? 'ui-monospace, Menlo, ' : ''}"Helvetica Neue", Arial, sans-serif` : '"Helvetica Neue", Arial, system-ui, sans-serif';
  const families = { display: stack(display, display?.role || 'display'), body: stack(body, body?.role || 'body'), caption: stack(caption, caption?.role || 'caption', !caption || caption === body ? false : /mono/i.test(caption.name)) };
  const sample = { display: form.name || client, headline: lines(form.line || snap.line || '')[0] || `${client}, in its own words`, title: snap.guide?.chapters[0]?.title || 'Section title', body: (form.intro || form.purpose || snap.line || `${client} body copy sits here: short paragraphs, in sentence case.`).slice(0, 160) };
  const FALLBACK: Style[] = [
    { name: 'display', role: 'display', family: 'display', size: 72, lineHeight: 1, tracking: -0.02, weight: 400, usage: 'The one hero line on a page or cover. 40px on mobile.', sample: sample.display },
    { name: 'headline', role: 'headline', family: 'display', size: 48, lineHeight: 1.05, tracking: -0.015, weight: 400, usage: 'Section headlines. 32px on mobile.', sample: sample.headline },
    { name: 'title', role: 'title', family: 'display', size: 28, lineHeight: 1.15, tracking: -0.01, weight: 400, usage: 'Card and module titles, slide titles.', sample: sample.title },
    { name: 'subtitle', role: 'subtitle', family: 'body', size: 20, lineHeight: 1.35, tracking: 0, weight: 400, usage: 'Lede paragraphs and standfirsts.', sample: sample.body.slice(0, 80) },
    { name: 'body', role: 'body', family: 'body', size: 16, lineHeight: 1.5, tracking: 0, weight: 400, usage: 'Reading text and interface copy.', sample: sample.body },
    { name: 'label', role: 'label', family: 'body', size: 14, lineHeight: 1.3, tracking: 0, weight: 500, usage: 'Buttons, tabs, form labels.', sample: 'Download the kit' },
    { name: 'caption', role: 'caption', family: 'caption', size: 12, lineHeight: 1.35, tracking: 0.04, weight: 400, upper: true, usage: 'Eyebrows, tags, meta. Never for sentences.', sample: 'Caption · meta' }
  ];
  // Without a type scale in the file, the profile sets how big display type gets, the body size and the headline habits
  const big = hl.scale === 'huge' ? [112, 64, 32] : hl.scale === 'restrained' ? [56, 36, 24] : [72, 48, 28];
  for (const f of FALLBACK) {
    if (f.role === 'display') f.size = big[0]; if (f.role === 'headline') f.size = big[1]; if (f.role === 'title') f.size = big[2];
    if (f.role === 'body' && hl.body) f.size = hl.body.value;
    if (['display', 'headline', 'title'].includes(f.role)) { if (hl.weight) f.weight = hl.weight.value; if (hl.tracking) f.tracking = f.role === 'title' ? hl.tracking.value / 2 : hl.tracking.value; }
  }
  let styles = FALLBACK;
  const ts = (input.typeScale || []).filter((s) => s.size && s.size > 0);
  if (ts.length >= 3) {
    const byFam = (fam?: string): Style['family'] => { const f = fonts.find((x) => x.name && fam && fam.toLowerCase().includes(x.name.toLowerCase().split(' ')[0])); return f?.role === 'caption' ? 'caption' : f?.role === 'body' ? 'body' : f?.role === 'display' ? 'display' : 'body'; };
    const sorted = [...ts].sort((a, b) => b.size! - a.size!);
    const bodyIdx = sorted.reduce((best, s, i) => Math.abs(s.size! - 16) < Math.abs(sorted[best].size! - 16) ? i : best, 0);
    const roleAt = (i: number) => i === sorted.length - 1 && sorted.length > 3 ? 'caption' : i === bodyIdx ? 'body' : i === 0 ? 'display' : i === 1 ? 'headline' : i < bodyIdx ? (i === 2 ? 'title' : 'subtitle') : 'label';
    styles = sorted.map((s, i) => { const role = roleAt(i); const fb = FALLBACK.find((x) => x.role === role) || FALLBACK[4]; return { name: kebab(s.name), role, family: s.family ? byFam(s.family) : fb.family, size: Math.round(s.size!), lineHeight: s.lineHeight ? Math.round(s.lineHeight) / 100 : fb.lineHeight, tracking: s.tracking ? s.tracking / 100 : 0, weight: s.weight || 400, upper: false, usage: `${s.name} from the guidelines' type scale (${role}).`, sample: (sample as Record<string, string>)[role] || fb.sample }; });
    // The components need every role; any the scale doesn't have comes from the fallback
    for (const fb of FALLBACK) if (!styles.some((s) => s.role === fb.role)) styles.push({ ...fb, name: styles.some((s) => s.name === fb.name) ? fb.name + '-ui' : fb.name, usage: fb.usage + ' (Not in the guidelines\' scale; added for the interface.)' });
    // The profile's headline habits apply to the file's scale only when the guidelines say so
    for (const x of styles) if (['display', 'headline', 'title'].includes(x.role)) { if (hl.weight && fromGuide('headlineWeight') && !ts.some((t) => t.weight)) x.weight = hl.weight.value; if (hl.tracking && fromGuide('headlineTracking') && !ts.some((t) => t.tracking)) x.tracking = hl.tracking.value; }
  } else judgement.push(`There's no type scale on the Assets page, so the system uses a ${hl.scale || 'standard'} scale (${FALLBACK.map((f) => f.size).join(' / ')})${hl.scale ? ', sized from what the guidelines show' : ''}. Add the type scale in Figma to replace it.`);
  // Headline case: upper, lower or title case on display, headline and title styles
  if (hl.case && hl.case !== 'sentence') for (const x of styles) if (['display', 'headline', 'title'].includes(x.role)) x.transform = hl.case === 'upper' ? 'uppercase' : hl.case === 'lower' ? 'lowercase' : 'capitalize';
  const roleStyle = (role: string) => styles.find((s) => s.role === role)!;

  // Space, shape, size. Spacing follows the studio's system (with two steps added for page-scale layouts).
  const dens = use('density')?.value; const k = dens === 'airy' ? 1.25 : dens === 'dense' ? 0.8 : 1;
  if (!fromGuide('density')) judgement.push(`Spacing follows the Lost Property system (2 · 6 · 10 · 14 · 20 · 28 · 40 · 48, with 64 and 96 for page sections)${k !== 1 ? `, opened up or tightened for a ${dens} feel` : ''}. The guidelines don't set a spacing scale.`);
  const spacing: Tok[] = [['space-1', '2px', 'Hairline gaps: stacked tiles, icon nudges.'], ['space-2', '6px', 'Inside a button or tag group; icon-to-label gap.'], ['space-3', '10px', 'Between form fields; small card gaps.'], ['space-4', '14px', 'Card padding (compact); gap in a form column.'], ['space-5', '20px', 'Card padding; mobile page gutter is 16px.'], ['space-6', '28px', 'Between a heading and its content.'], ['space-7', '40px', 'Between grid cards; module padding on mobile.'], ['space-8', '48px', 'Desktop page side padding.'], ['space-9', '64px', 'Module padding on desktop.'], ['space-10', '96px', 'Between page sections; hero padding.']].map(([name, value, usage], i) => ({ name, value: i >= 5 && k !== 1 ? `${Math.round(parseInt(value) * k)}px` : value, usage }));
  const roundInGuide = (snap.guide?.chapters || []).some((c) => /rounded|pill|soft corners?/i.test(chapterText(c).join(' ')));
  const squareInGuide = (snap.guide?.chapters || []).some((c) => /square corners|sharp corners|no rounded/i.test(chapterText(c).join(' ')));
  const pc = use('corners');
  const control = pc ? `${pc.value.controls}px` : squareInGuide ? '0px' : roundInGuide ? '999px' : '4px';
  if (!pc && !roundInGuide && !squareInGuide) judgement.push('Corner radius isn\'t set in the guidelines: controls and cards use a restrained 4px. Change radius-control and radius-card in tokens.json if the brand is rounder or squarer.');
  const radius: Tok[] = [{ name: 'radius-none', value: '0px', usage: 'Images, full-bleed bands, posters.' }, { name: 'radius-control', value: control, usage: 'Buttons, inputs, tabs.' }, { name: 'radius-card', value: pc ? `${pc.value.cards}px` : squareInGuide ? '0px' : '4px', usage: 'Cards, panels, thumbnails.' }, { name: 'radius-image', value: use('imagery') ? (use('imagery')!.value.corners ? (pc ? `${pc.value.cards}px` : '4px') : '0px') : squareInGuide ? '0px' : '4px', usage: 'Photography frames.' }, { name: 'radius-tag', value: pc ? `${Math.min(pc.value.cards, 2)}px` : squareInGuide ? '0px' : '2px', usage: 'Tags and small swatches.' }, { name: 'radius-pill', value: '999px', usage: 'Chips and toggles only.' }];
  const size: Tok[] = [{ name: 'control-sm', value: '32px', usage: 'Compact buttons, chips.' }, { name: 'control-md', value: '44px', usage: 'Buttons and inputs (the 44px touch target).' }, { name: 'control-lg', value: '52px', usage: 'Hero calls to action.' }, { name: 'content', value: '1200px', usage: 'Maximum content width.' }, { name: 'page-margin', value: use('grid') ? `${use('grid')!.value.marginPct}vw` : '48px', usage: 'Outer page margin on desktop (16px on mobile).' }, { name: 'gutter', value: `${use('grid')?.value.gutter ?? 20}px`, usage: 'Gap between grid columns.' }, { name: 'columns', value: String(use('grid')?.value.columns ?? 12), usage: 'Layout grid columns on desktop.' }, { name: 'measure', value: '64ch', usage: 'Maximum line length for reading text.' }, { name: 'icon', value: '20px', usage: 'Default icon size; 16px in buttons, 24px in navigation.' }];

  // Logos, imagery, graphics, voice
  const logos = input.files.filter((f) => /^assets\/logo\/.+\.(svg|png)$/i.test(f));
  const nm = (p: string) => p.split('/').pop()!.toLowerCase();
  const light = (p: string) => /white|light|reverse|negative|inverse/.test(nm(p));
  const svgFirst = (a: string, b: string) => Number(b.endsWith('.svg')) - Number(a.endsWith('.svg'));
  const kind = (p: string) => /wordmark/.test(nm(p)) && !/lockup/.test(nm(p)) ? 0 : /lockup|horizontal|primary/.test(nm(p)) ? 1 + Number(/london|north|south|stacked/.test(nm(p))) : /symbol|monogram|icon|(^|[^d])mark/.test(nm(p)) ? 3 : 2;
  const sortL = (l: string[]) => [...l].sort((a, b) => svgFirst(a, b) || kind(a) - kind(b));
  const logo = { onLight: sortL(logos.filter((p) => !light(p)))[0], onDark: sortL(logos.filter(light))[0], symbolOnLight: sortL(logos.filter((p) => !light(p) && kind(p) === 3))[0], symbolOnDark: sortL(logos.filter((p) => light(p) && kind(p) === 3))[0], all: sortL(logos) };
  if (!logos.length) judgement.push('No logo files yet: the samples set the brand name in the display face. Import the assets to add the logo.');
  const images = input.files.filter((f) => /^assets\/imagery\/.+\.(png|jpe?g|webp)$/i.test(f));
  const graphics = input.files.filter((f) => /^assets\/graphics\/.+\.(svg|png)$/i.test(f));
  if (!images.length) judgement.push('No photography in the assets yet, so image areas in the samples are colour blocks. Add images to the Images section of the Assets page.');
  const voice = { words: lines(form['voice words'] || ''), like: lines(form['sounds like'] || ''), never: lines(form['never sounds like'] || '') };
  const values = lines(form.values || '').slice(0, 6);
  const chapters = (snap.guide?.chapters || []).filter((c) => !c.hidden).map((c) => c.title);

  // Where each design setting came from, for DESIGN.md and the studio
  const provenance = prof ? (Object.keys(SETTING_INFO) as SettingKey[]).filter((k) => prof[k] && !prof[k].off).map((k) => ({ key: k, label: SETTING_INFO[k].label, value: showSetting(prof[k].value, k), source: prof[k].source as Source })) : [];
  const ground: 'light' | 'dark' = use('ground')?.value || 'light';
  const accentUse = use('accent')?.value.use || 'sparing';
  const buttons = use('buttons')?.value || 'solid';
  const imagery = use('imagery')?.value || { treatment: 'framed' as const, ratio: '4:5' as const, corners: true };
  const devices = use('devices')?.value || [], dos = use('dos')?.value || [], donts = use('donts')?.value || [];
  const rulesOn = use('rules')?.value ?? true;
  return { provenance, ground, accentUse, buttons, imagery, devices, dos, donts, rulesOn, hasProfile: !!prof, client, slug: kebab(client), line: snap.line || form.line || '', form, palette, brandCols, r, lt, dk, accent, onAccent, accentIsText, colour, families, display, body, caption, styles, roleStyle, spacing, radius, size, logo, images, graphics, voice, values, chapters, judgement, fontFiles: input.files.filter((f) => f.startsWith('assets/fonts/') && /\.(woff2?|otf|ttf)$/i.test(f)), tokensFiles: input.files.filter((f) => f.startsWith('tokens/')) };
}

// ── tokens.json (the studio system's list shape) and tokens.css
export function tokensJson(s: DSSpec) {
  return {
    name: s.client, version: 1,
    color: { themes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }], tokens: s.colour },
    type: {
      fonts: s.fontFiles.map((f) => ({ family: [s.display, s.body, s.caption].find((x) => x && f.toLowerCase().includes(kebab(x.name)))?.name || f.split('/')[2], file: f, weight: /bold|fett|700/i.test(f) ? '700' : /medium|halbfett|500/i.test(f) ? '500' : /light|buch|300/i.test(f) ? '300' : '400', style: /italic/i.test(f) ? 'italic' : 'normal' })),
      families: { display: s.families.display, body: s.families.body, caption: s.families.caption },
      groups: [{ name: 'Type scale', family: 'body', styles: s.styles.map((x) => ({ name: x.name, family: x.family, fontSize: `${x.size}px`, lineHeight: String(x.lineHeight), fontWeight: String(x.weight), letterSpacing: `${x.tracking}em`, ...(x.upper ? { textTransform: 'uppercase' } : {}), sample: x.sample, usage: x.usage })) }]
    },
    spacing: { tokens: s.spacing }, radius: { tokens: s.radius }, size: { tokens: s.size }
  };
}

export function tokensCss(s: DSSpec, fontFace = '') {
  const val = (t: Tok, th: 'light' | 'dark') => typeof t.value === 'string' ? t.value : t.value[th] || t.value.light;
  const faces = fontFace || s.fontFiles.map((f) => { const fam = tokensJson(s).type.fonts.find((x) => x.file === f)!; return `@font-face { font-family: "${fam.family}"; src: url("${f}"); font-weight: ${fam.weight}; font-style: ${fam.style}; font-display: swap; }`; }).join('\n');
  const typeVars = s.styles.map((x) => `  --type-${x.name}: ${x.weight} ${x.size}px/${x.lineHeight} var(--font-${x.family}); --tracking-${x.name}: ${x.tracking}em;`).join('\n');
  return `/* ${s.client} design system: tokens.css, generated from tokens.json by Lost Property. */
${faces}
:root, [data-theme="light"] {
${s.colour.map((t) => `  --${t.name}: ${val(t, 'light')};`).join('\n')}
}
[data-theme="dark"] {
${s.colour.filter((t) => typeof t.value !== 'string').map((t) => `  --${t.name}: ${val(t, 'dark')};`).join('\n')}
}
:root {
  --font-display: ${s.families.display};
  --font-body: ${s.families.body};
  --font-caption: ${s.families.caption};
${typeVars}
${[...s.spacing, ...s.radius, ...s.size].map((t) => `  --${t.name}: ${t.value};`).join('\n')}
}
`;
}

// ── brand.css: the components, from tokens only
export function componentsCss(s: DSSpec) {
  const st = (role: string) => { const x = s.roleStyle(role); return `font: var(--type-${x.name}); letter-spacing: var(--tracking-${x.name});${x.transform ? ` text-transform: ${x.transform};` : x.upper ? ' text-transform: uppercase;' : ''}`; };
  return `/* ${s.client} design system: brand.css. Components as ds- classes; every value comes from tokens.css. Light and dark via [data-theme]. */
.ds, .ds * { box-sizing: border-box; }
.ds { background: var(--surface); color: var(--ink); ${st('body')} -webkit-font-smoothing: antialiased; }
.ds img { max-width: 100%; display: block; }
.ds a { color: var(--link); text-underline-offset: 3px; }
.ds :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ds .mute { color: var(--mute); }

/* Type */
${s.styles.map((x) => `.ds .t-${x.name} { ${`font: var(--type-${x.name}); letter-spacing: var(--tracking-${x.name});${x.transform ? ` text-transform: ${x.transform};` : x.upper ? ' text-transform: uppercase;' : ''}`} margin: 0; }`).join('\n')}
.ds .display { ${st('display')} margin: 0; }
.ds .headline { ${st('headline')} margin: 0; }
.ds .title { ${st('title')} margin: 0; }
.ds .lede { ${st('subtitle')} margin: 0; max-width: var(--measure); }
.ds .eyebrow { ${st('caption')} margin: 0; color: var(--mute); }
.ds p { max-width: var(--measure); }
@media (max-width: 760px) { .ds .display { font-size: clamp(40px, 11vw, ${s.roleStyle('display').size}px); } .ds .headline { font-size: clamp(30px, 8vw, ${s.roleStyle('headline').size}px); } }

/* Button */
.ds-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: var(--control-md); padding: 0 var(--space-5); border: 1px solid transparent; border-radius: var(--radius-control); background: var(--fill-2); color: var(--ink); ${st('label')} text-decoration: none; cursor: pointer; white-space: nowrap; }
.ds-btn:hover { background: var(--fill-2-hover); }
.ds-btn.primary { background: var(--ink); color: var(--on-ink); }${s.buttons === 'outline' ? '\n.ds-btn.primary { background: transparent; color: var(--ink); border-color: var(--ink); }\n.ds-btn.primary:hover { background: var(--ink); color: var(--on-ink); opacity: 1; }' : s.buttons === 'underline' ? '\n.ds-btn.primary { background: transparent; color: var(--ink); padding: 0; min-height: 0; border-radius: 0; border: 0; border-bottom: 2px solid currentColor; }\n.ds-btn.primary:hover { opacity: .7; }' : ''}
.ds-btn.primary:hover { opacity: .88; }
.ds-btn.accent { background: var(--accent); color: var(--on-accent); }
.ds-btn.accent:hover { opacity: .88; }
.ds-btn.outline { background: transparent; border-color: var(--line-strong); }
.ds-btn.ghost { background: transparent; }
.ds-btn.ghost:hover { background: var(--fill); }
.ds-btn.lg { min-height: var(--control-lg); padding: 0 var(--space-6); }
.ds-btn.sm { min-height: var(--control-sm); padding: 0 var(--space-4); }
.ds-btn:disabled { opacity: .4; cursor: default; }
.ds-btn svg { width: 16px; height: 16px; }

/* Form */
.ds-field { display: flex; flex-direction: column; gap: var(--space-2); }
.ds-label { ${st('label')} color: var(--ink); }
.ds-hint { ${st('caption')} text-transform: none; letter-spacing: 0; color: var(--mute); }
.ds-input, .ds-select, .ds-textarea { width: 100%; min-height: var(--control-md); padding: 0 var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); ${st('body')} }
.ds-textarea { padding: var(--space-3) var(--space-4); min-height: 112px; resize: vertical; border-radius: ${s.radius.find((x) => x.name === 'radius-control')!.value === '999px' ? '20px' : 'var(--radius-control)'}; }
.ds-input::placeholder, .ds-textarea::placeholder { color: var(--mute); }
.ds-check { display: inline-flex; align-items: center; gap: var(--space-2); ${st('body')} }
.ds-check input { width: 18px; height: 18px; accent-color: var(--ink); margin: 0; }
.ds-chip { display: inline-flex; align-items: center; min-height: var(--control-sm); padding: 0 var(--space-4); border-radius: var(--radius-pill); background: var(--fill-2); color: var(--ink); ${st('label')} border: 0; cursor: pointer; }
.ds-chip.on, .ds-chip[aria-pressed="true"] { background: var(--ink); color: var(--on-ink); }

/* Tag */
.ds-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: var(--radius-tag); background: var(--fill-2); color: var(--ink); ${st('caption')} }
.ds-tag.accent { background: var(--accent); color: var(--on-accent); }
.ds-tag.ink { background: var(--ink); color: var(--on-ink); }
.ds-tag.line { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); }

/* Card */
.ds-card { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); border-radius: var(--radius-card); background: var(--fill); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.ds-card .media { margin: calc(var(--space-5) * -1) calc(var(--space-5) * -1) var(--space-2); aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--radius-card) var(--radius-card) 0 0; background: var(--fill-2); }
.ds-card .media img { width: 100%; height: 100%; object-fit: cover; }
.ds-card.plain { background: transparent; border: 0; padding: 0; }
.ds-card.plain .media { margin: 0 0 var(--space-2); border-radius: var(--radius-card); }
.ds-card.accent { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.ds-card.accent .mute, .ds-card.accent .eyebrow { color: currentColor; opacity: .8; }

/* Navigation */
.ds-nav { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-4) var(--page-margin); border-bottom: 1px solid var(--line); background: var(--surface); }
.ds-nav .brand { display: flex; align-items: center; color: var(--ink); text-decoration: none; ${st('title')} }
.ds-nav .brand img { height: 28px; width: auto; }
.ds-nav .links { display: flex; gap: var(--space-5); margin-left: auto; }
.ds-nav .links a { color: var(--ink); text-decoration: none; ${st('label')} }
.ds-nav .links a[aria-current] { text-decoration: underline; text-underline-offset: 6px; }
@media (max-width: 760px) { .ds-nav { padding: var(--space-4); } .ds-nav .links { display: none; } }

/* Tabs */
.ds-tabs { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--line); }
.ds-tab { padding: var(--space-3) var(--space-4); ${st('label')} color: var(--mute); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; border-top: 0; border-left: 0; border-right: 0; cursor: pointer; }
.ds-tab.on, .ds-tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--ink); }

/* Modules: hero, grid, statement, split, band, footer */
.ds-section { padding: var(--space-10) var(--page-margin); }${s.rulesOn ? '\n.ds-section + .ds-section:not(.ink):not(.accent):not(.fill) { border-top: 1px solid var(--line); }' : ''}
.ds-section.tight { padding: var(--space-9) var(--page-margin); }
.ds-section.ink { background: var(--ink); color: var(--on-ink); }
.ds-section.ink .eyebrow, .ds-section.ink .mute { color: currentColor; opacity: .72; }
.ds-section.accent { background: var(--accent); color: var(--on-accent); }
.ds-section.accent .eyebrow, .ds-section.accent .mute { color: currentColor; opacity: .8; }
.ds-section.fill { background: var(--fill); }
.ds-wrap { max-width: var(--content); margin: 0 auto; }
.ds-hero { display: grid; gap: var(--space-6); }
.ds-hero .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-3); }
.ds-hero.split { grid-template-columns: 1.1fr 1fr; align-items: end; gap: var(--space-8); }
.ds-hero .art { aspect-ratio: ${s.imagery.ratio.replace(':', ' / ')}; border-radius: var(--radius-image); overflow: hidden; }
.ds-hero .art img { width: 100%; height: 100%; object-fit: cover; }
.ds-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: max(var(--gutter), var(--space-6)); }
.ds-statement { ${st('headline')} margin: 0; max-width: 22ch; }
.ds-split { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-8); align-items: center; }
.ds-split .media { aspect-ratio: 1; border-radius: var(--radius-image); overflow: hidden; background: var(--fill-2); }
.ds-split .media img { width: 100%; height: 100%; object-fit: cover; }
.ds-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.ds-list li { display: grid; grid-template-columns: 56px 1fr; gap: var(--space-4); padding: var(--space-5) 0; border-bottom: 1px solid var(--line); }
.ds-list .n { ${st('caption')} color: var(--mute); padding-top: 4px; }
.ds-band { display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); flex-wrap: wrap; }
.ds-footer { display: grid; grid-template-columns: 2fr repeat(3, 1fr); gap: var(--space-7); padding: var(--space-9) var(--page-margin) var(--space-7); border-top: 1px solid var(--line); }
.ds-footer h4 { ${st('caption')} color: var(--mute); margin: 0 0 var(--space-3); font-weight: inherit; }
.ds-footer a { display: block; color: var(--ink); text-decoration: none; padding: 3px 0; }
.ds-footer .base { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: var(--space-4); padding-top: var(--space-5); border-top: 1px solid var(--line); color: var(--mute); ${st('caption')} text-transform: none; letter-spacing: 0; }
@media (max-width: 760px) {
  .ds-section, .ds-section.tight { padding: var(--space-7) 16px; }
  .ds-hero.split, .ds-split { grid-template-columns: 1fr; }
  .ds-grid { grid-template-columns: 1fr; gap: var(--space-5); }
  .ds-footer { grid-template-columns: 1fr 1fr; padding: var(--space-7) 16px; }
}

/* Logo: the right file for the ground */
.ds .ds-logo-dark { display: none; }
[data-theme="dark"] .ds .ds-logo-light, .ds .ds-section.ink .ds-logo-light { display: none; }
[data-theme="dark"] .ds .ds-logo-dark, .ds .ds-section.ink .ds-logo-dark { display: block; }
[data-theme="dark"] .ds .ds-section.ink .ds-logo-light { display: block; }
[data-theme="dark"] .ds .ds-section.ink .ds-logo-dark { display: none; }
`;
}

// ── Docs
const COMPONENTS: { name: string; group: string; summary: string; provide: string; variants: string[]; dont: string[] }[] = [
  { name: 'Button', group: 'Actions', summary: 'Action button: ds-btn, 44px tall, label type, radius-control.', provide: 'A <button> or <a> with class ds-btn and at most one variant, a short verb-first label in sentence case.', variants: ['default: fill-2 ground. Most actions.', 'primary: ink fill, on-ink label. The one main action in a view.', 'accent: the brand accent with on-accent label. One per screen at most.', 'outline: transparent with a line-strong border. Secondary actions on images or colour.', 'ghost: transparent until hover. Toolbars.', 'lg / sm: hero calls to action / compact rows.'], dont: ['Two primary buttons side by side.', 'Text colours other than the tokens given.', 'Shadows, gradients or all-caps labels.'] },
  { name: 'Input', group: 'Forms', summary: 'Form controls: ds-input, ds-select, ds-textarea inside a ds-field with a ds-label and optional ds-hint; ds-check and ds-chip.', provide: 'A label for every field, placeholder text only as an example, a hint for anything unusual.', variants: ['ds-input / ds-select: 44px, line-strong outline.', 'ds-textarea: 112px minimum.', 'ds-check: native checkbox in ink.', 'ds-chip: pill toggles for filters (on = ink).'], dont: ['Placeholder instead of a label.', 'Red alone for errors: say what is wrong in the hint.'] },
  { name: 'Tag', group: 'Status', summary: 'Small label: ds-tag in caption type, radius-tag.', provide: 'One or two words.', variants: ['default: fill-2.', 'accent: the brand accent, for one highlight.', 'ink: inverted, for live or new.', 'line: outlined, on images and colour.'], dont: ['Sentences in a tag.', 'More than one accent tag in a group.'] },
  { name: 'Card', group: 'Layout', summary: 'Container: ds-card on fill with a line hairline, optional .media (4:3), title, copy and a link or button.', provide: 'A title in title type, one or two lines of copy, an image from the imagery assets where it helps.', variants: ['default: fill ground, hairline.', 'plain: no ground, for editorial grids.', 'accent: accent ground with on-accent text, once per grid.'], dont: ['Shadows.', 'Cards inside cards.'] },
  { name: 'Navigation', group: 'Navigation', summary: 'Top bar: ds-nav with the logo (onLight/onDark files swap by theme), links and one action; ds-tabs for sections inside a page.', provide: 'The logo file for the ground, up to five links in sentence case, one button.', variants: ['ds-nav: page header.', 'ds-tabs: underline tabs.'], dont: ['A redrawn or recoloured logo.', 'More than one button in the bar.'] },
  { name: 'Hero', group: 'Modules', summary: 'The opening module: ds-section > ds-wrap > ds-hero, eyebrow, display line, lede and actions; .split adds a 4:5 image or accent block.', provide: 'One line in display type, a short lede, one or two actions, an image from the imagery assets.', variants: ['default: type only.', 'split: type with a 4:5 image.', 'ds-section.ink / .accent: inverted grounds.'], dont: ['More than one display line on a page.', 'Text over a busy part of a photo.'] },
  { name: 'Grid', group: 'Modules', summary: 'Feature grids: ds-grid with --cols (2, 3 or 4) of ds-card, space-7 gaps; ds-list for numbered points.', provide: 'Three to six items with a title and a line each.', variants: ['--cols: 2 · 3 · 4.', 'ds-list: numbered rows with hairlines.'], dont: ['Uneven card heights from mixed content: keep copy to the same length.'] },
  { name: 'Statement', group: 'Modules', summary: 'A single big line: ds-statement in headline type, on surface, ink or accent; ds-split pairs copy with an image.', provide: 'One sentence the brand would say, ideally its own words from the guidelines.', variants: ['on surface, ds-section.ink or ds-section.accent.', 'ds-split: copy beside a square image.'], dont: ['Quote marks around the brand\'s own statements.', 'Accent text on accent.'] },
  { name: 'Footer', group: 'Navigation', summary: 'Page footer: ds-footer with the logo and a line, three link columns, and a base row.', provide: 'The logo, the brand line, links grouped under caption headings, the legal line.', variants: ['on surface; ds-section.ink for an inverted footer.'], dont: ['Social icons drawn by hand: use the brand\'s icon set or plain text links.'] }
];

export function designMd(s: DSSpec, input: DSInput) {
  const chapters = input.snap.guide?.chapters || [];
  const t = (x: Style) => `| \`${x.name}\` | ${x.role} | ${x.family} | ${x.size}px | ${x.lineHeight} | ${x.tracking}em | ${x.weight}${x.upper ? ' · uppercase' : ''} | ${x.usage} |`;
  const v = s.voice;
  return `# ${s.client} design system

${s.line}

How everything built for ${s.client} should look and read: web pages, app screens, documents, decks, social posts and emails. Generated from the ${s.client} guidelines by Lost Property. Where this and the guidelines disagree, the guidelines win.

## Building with this system
1. Load \`tokens.css\` then \`brand.css\`. Add \`class="ds"\` to \`<body>\` and \`data-theme="light"\` (or \`"dark"\`) to \`<html>\`.
2. Use only tokens: never type a hex value, font name, size or radius. \`var(--ink)\`, \`var(--accent)\`, \`var(--space-6)\`, \`var(--radius-control)\`.
3. Start from the modules (Hero, Grid, Statement, Footer) and the components below; \`preview.html\` shows each in use, plus whole layouts.
4. Logos come from \`assets/logo/\` as supplied: ${s.logo.onLight ? `\`${s.logo.onLight.split('/').pop()}\` on light grounds` : 'none supplied yet'}${s.logo.onDark ? `, \`${s.logo.onDark.split('/').pop()}\` on dark` : ''}.
5. Check every page against "Rules for AI" at the end.

## Voice
${v.words.length ? `${s.client} sounds ${v.words.join(', ').toLowerCase()}.` : 'The guidelines don\'t list voice words yet; write plainly, in sentence case, and keep copy short.'}
${v.like.length ? `\nSounds like:\n${v.like.map((x) => `- ${x}`).join('\n')}` : ''}${v.never.length ? `\n\nNever sounds like:\n${v.never.map((x) => `- ${x}`).join('\n')}` : ''}

- Sentence case for headings, buttons and labels.
- Lead with the thing: "Book a studio", "Download the kit".
- No exclamation marks, emoji or invented figures. Use the brand's own words where the guidelines give them, and placeholders in [brackets] where they don't.

## Design qualities
${s.hasProfile ? `Read from the ${s.client} guidelines and checked by Lost Property. Build to these; they're what makes work look like ${s.client} rather than a generic template.

| Setting | Value | From |
| --- | --- | --- |
${s.provenance.map((x) => `| ${x.label} | ${x.value} | ${x.source.from === 'guidelines' ? `${x.source.chapter}: “${x.source.evidence}”` : x.source.from === 'studio' ? 'Set by Lost Property' : `Judgement: ${x.source.why}`} |`).join('\n')}
${s.devices.length ? `\nGraphic devices to use:\n${s.devices.map((d) => `- ${d}`).join('\n')}` : ''}${s.dos.length ? `\n\nDo:\n${s.dos.map((d) => `- ${d}`).join('\n')}` : ''}${s.donts.length ? `\n\nDon't:\n${s.donts.map((d) => `- ${d}`).join('\n')}` : ''}` : 'Not read from the guidelines yet; the defaults below apply.'}
- Pages start ${s.ground === 'dark' ? 'dark (`data-theme="dark"`)' : 'light'}. The accent is used ${s.accentUse === 'bold' ? 'boldly: whole bands and large fills are expected' : s.accentUse === 'moderate' ? 'regularly: a band or a block per page' : 'sparingly: one moment per screen or page'}.
- Main actions are ${s.buttons === 'outline' ? 'outlined' : s.buttons === 'underline' ? 'underlined text links' : 'solid'}; photography is ${s.imagery.treatment}, cropped ${s.imagery.ratio}${s.imagery.corners ? ' with rounded corners' : ' with square corners'}.

## Colour
Working roles (both themes in \`tokens.json\`):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
${s.colour.filter((x) => !x.name.startsWith('brand-')).map((x) => `| \`--${x.name}\` | ${typeof x.value === 'string' ? x.value : x.value.light} | ${typeof x.value === 'string' ? x.value : x.value.dark} | ${x.usage} |`).join('\n')}

The palette:

| Token | Name | HEX | Role | Text on it |
| --- | --- | --- | --- | --- |
${s.brandCols.map((c) => `| \`--${c.token}\` | ${c.name} | ${c.hex.toUpperCase()} | ${c.role || ''} | ${c.on.toUpperCase()} (${contrast(c.on, c.hex).toFixed(1)}:1) |`).join('\n') || '| | | | | |'}

- Most of a page is \`ink\` on \`surface\`; \`fill\` and \`line\` separate panels.
- \`accent\` (${s.r.accent.name}) is the brand's lead colour, used ${s.accentUse}ly, as a fill${s.accentIsText ? ' or for links' : ''}. Text on it is \`on-accent\`.
- Other palette colours are for bands, illustrations and charts, always with the text colour given above.
- Text is 4.5:1 or more against its ground in both themes; large type (24px+) and icons 3:1.

## Typography
${[s.display, s.body, s.caption].filter((f, i, a) => f && a.indexOf(f) === i).map((f) => `- **${f!.label || f!.role}**: ${f!.name} (\`--font-${f === s.display ? 'display' : f === s.caption && f !== s.body ? 'caption' : 'body'}\`)${f!.files.some((x) => x.licence === 'licensed') ? '' : '. Not included in this download: install the licensed font, or the fallback stack is used'}`).join('\n') || '- Not set yet: the system sans serif.'}

| Style | Role | Family | Size | Line height | Tracking | Weight | Use |
| --- | --- | --- | --- | --- | --- | --- | --- |
${s.styles.map(t).join('\n')}

Classes: \`.display\`, \`.headline\`, \`.title\`, \`.lede\`, \`.eyebrow\`, and \`.t-<style>\` for every style above. One display line per page.

## Space, shape and size
Spacing: ${s.spacing.map((x) => `\`${x.name}\` ${x.value}`).join(' · ')}.
- Inside components: space-2 to space-5. Between a heading and its content: space-6. Between cards: space-7. Page padding: space-8 (16px on mobile). Between sections: space-10.
Radius: ${s.radius.map((x) => `\`${x.name}\` ${x.value}`).join(' · ')}.
Sizes: ${s.size.map((x) => `\`${x.name}\` ${x.value}`).join(' · ')}.
Depth comes from colour and hairlines, never shadows or gradients unless the guidelines show them.

## Imagery and graphic language
${s.images.length ? `Photography in \`assets/imagery/\` (${s.images.length} file${s.images.length === 1 ? '' : 's'}). Use it full-bleed or in 4:5, 4:3 and 1:1 frames with \`radius-card\` or none; never filter, tint or crop out the subject.` : 'No photography supplied yet. Until it is, use colour blocks from the palette, never stock imagery.'}
${s.graphics.length ? `Graphic language in \`assets/graphics/\`: ${s.graphics.map((g) => `\`${g.split('/').pop()}\``).join(', ')}. Use as supplied, scaled, never redrawn.` : ''}

## Logo
${s.logo.all.length ? s.logo.all.filter((p) => p.endsWith('.svg') || !s.logo.all.includes(p.replace(/\.png$/, '.svg'))).map((p) => `- \`${p}\``).join('\n') : '- No logo files yet.'}
${s.form['logo light'] ? `\nOn light grounds: ${s.form['logo light']}` : ''}${s.form['logo dark'] ? `\nOn dark grounds: ${s.form['logo dark']}` : ''}
Use the file for the ground (\`.ds-logo-light\` / \`.ds-logo-dark\` swap automatically). Never redraw, recolour, stretch, outline or add effects.

## Components
${COMPONENTS.map((c) => `### ${c.name}\n${c.summary}\n\n**You provide:** ${c.provide}\n\n${c.variants.map((x) => `- ${x}`).join('\n')}\n\n**Don't:** ${c.dont.join(' ')}`).join('\n\n')}

## Layouts
\`preview.html\` builds these from the components: a landing page, a 4:5 social post set, a 16:9 title and content slide, an email header and a poster. Start new work from the nearest one.

## Judgement calls
Where the guidelines don't say, these choices were made. Change them in \`tokens.json\` if the studio decides otherwise.
${s.judgement.map((j) => `- ${j}`).join('\n')}

${aboutMd(s.form)}
## The guidelines
${chapters.map((c) => { const tx = chapterText(c).filter((x) => x.length > 2).map((x) => x.replace(/\n+/g, ' ')).join(' ').slice(0, 1800); const rules = c.rules.map((x) => `- ${x.title}: ${x.text}`).join('\n'); return `### ${c.title}\n${rules ? rules + '\n' : ''}${tx}`; }).join('\n\n')}

${aiRulesMd({ client: s.client, files: input.files, watchouts: watchoutsFrom(chapters.flatMap(chapterText)), donts: input.aiDonts, form: s.form })}
`;
}

function componentReadme(c: (typeof COMPONENTS)[number]) {
  return `# ${c.name}\n\n${c.summary}\n\n**You provide:** ${c.provide}\n\n**Variants**\n${c.variants.map((x) => `- ${x}`).join('\n')}\n\n**Don't**\n${c.dont.map((x) => `- ${x}`).join('\n')}\n\nSee \`preview.html\` in this folder.\n`;
}

/** Every file of the design system download (text files; binary assets are added by the caller from `include`) */
export function designSystemFiles(input: DSInput) {
  const s = buildSpec(input);
  const name = `${s.slug}-design-system`;
  const tcss = tokensCss(s), ccss = componentsCss(s);
  const skill = `---
name: ${name}
description: The ${s.client} design system. Use whenever building a ${s.client} web page, app screen, document, deck, social post, email or layout, to get its colours, type, spacing, components and logo exactly right.
---

# ${s.client} design system

Read \`DESIGN.md\` first; it is the brand book and the spec. Build with \`tokens.css\` and \`brand.css\`, start from the nearest layout in \`preview.html\`, and use the files in \`assets/\` as supplied.

- Use only the tokens, components and files defined. Never invent colours, fonts, sizes, effects or artwork.
- Follow "Rules for AI" in DESIGN.md exactly; it's stricter than the guidelines on purpose.
- Where copy isn't given, use the brand's own words from DESIGN.md or a placeholder in [brackets]; never write strategy, claims or figures.
- When you finish, list the tokens, components, layout and logo file you used.
`;
  const files: Record<string, string> = {
    'SKILL.md': skill,
    'DESIGN.md': designMd(s, input),
    'tokens.json': JSON.stringify(tokensJson(s), null, 2) + '\n',
    'tokens.css': tcss,
    'brand.css': ccss,
    'preview.html': previewHtml(s, { css: tcss + ccss, url: (p) => p, standalone: true })
  };
  for (const c of COMPONENTS) files[`components/${c.name}/README.md`] = componentReadme(c);
  for (const [n, html] of Object.entries(componentPreviews(s, (p) => p))) files[`components/${n}/preview.html`] = `<!doctype html><html lang="en" data-theme="${s.ground}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${n} · ${s.client}</title><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../../brand.css"><style>body{margin:0;padding:32px}</style></head><body class="ds">${html.replace(/(src|href)="assets\//g, '$1="../../assets/')}</body></html>`;
  return { folder: name, files, include: [...s.logo.all, ...s.tokensFiles, ...s.fontFiles, ...s.images, ...s.graphics], roles: s.r, spec: s };
}
