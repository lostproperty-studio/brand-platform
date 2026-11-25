import type { Snapshot } from '@/lib/ai/project';
import { itemEls, type Block } from '@/lib/figma/blocks';

// What the published guidelines haven't written yet: the default text the guide editor puts in a new section, frame
// or card (and the studio's Figma template's own placeholders), left as it was. The connector never passes these off
// as rules, and the studio sees them listed per chapter.

const norm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.…:]+$/, '').trim();

/** Text the editor and the studio template insert as stand-ins (components/GuideEditor.tsx, components/SectionLayouts.tsx, lib/figma/template.ts) */
const DEFAULTS = new Set([
  // Section layouts and the editor's new sections, frames and cards
  'section headline', 'a short introduction to this section', 'a headline', 'a headline for this card', 'a sentence or two to go with it',
  'a sentence or two about this point', 'a large statement', 'a line to go under it', "a statement in the brand's voice", 'new section',
  'new subsection', 'write something', 'headline', 'label', 'text',
  // The studio's Figma template
  'brand name', 'one line about the brand', 'colour name', 'family name', "where it's used", 'chapter title', 'title'
].map(norm));

/** True when the text is a stand-in, not something the studio wrote: editor defaults, lorem ipsum, [bracketed] prompts, TBC. */
export function isPlaceholder(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = norm(text);
  if (!t) return false;
  return DEFAULTS.has(t) || /lorem ipsum|dolor sit amet/.test(t) || /^\[[^\]]*\]$/.test(t) || /^(tbc|tbd|tk|xxx+|todo|to come|coming soon|placeholder)$/.test(t);
}

const short = (t: string) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
const real = (t?: string) => (t && !isPlaceholder(t) ? t : undefined);

/** Where a section sits, by its headline when it has a real one */
export const sectionName = (b: Block, i: number) => (real(b.heading) ? `“${short(b.heading!)}”` : `Section ${i + 1}`);

/** The unfinished points in one section: each placeholder, and image sections with no image */
export function blockGaps(b: Block, i: number): string[] {
  const where = sectionName(b, i);
  const out: string[] = [];
  const flag = (field: string, t?: string) => { if (isPlaceholder(t)) out.push(`${where}, ${field}: still says “${short(t!)}”`); };
  flag('headline', b.heading); flag('label', b.eyebrow); flag('text', b.body);
  for (const x of b.extras || []) flag(x.kind === 'heading' ? 'headline' : x.kind, x.text);
  (b.items || []).filter((it) => !it.hidden).forEach((it, j) => {
    const frame = real(it.heading) ? `frame “${short(it.heading!)}”` : real(it.label) ? `frame “${short(it.label!)}”` : `frame ${j + 1}`;
    for (const e of itemEls(it)) if (!e.hidden && e.kind !== 'button' && isPlaceholder(e.text)) out.push(`${where}, ${frame}: still says “${short(e.text!)}”`);
  });
  for (const s of b.swatches || []) if (isPlaceholder(s.name) || (norm(s.name) === 'colour' && s.hex.toUpperCase() === '#000000')) out.push(`${where}: a colour swatch still says “${s.name} ${s.hex}”`);
  if ((b.kind === 'image' || b.kind === 'split' || b.kind === 'media') && !(b.media || []).length && !b.backdrop) out.push(`${where}: no image added`);
  return out;
}

/** The unwritten points per published chapter, for the studio. Chapters with nothing to finish are left out. */
export function kitGaps(snapshot: Snapshot): { chapter: string; points: string[] }[] {
  const out: { chapter: string; points: string[] }[] = [];
  const chapters = snapshot.guide?.chapters;
  if (chapters) {
    for (const c of chapters) {
      const points = [...(c.rules || []).filter((r) => isPlaceholder(r.text) || isPlaceholder(r.title)).map((r) => `Rule “${short(r.title)}”: not written yet`), ...c.blocks.flatMap((b, i) => blockGaps(b, i))];
      if (isPlaceholder(c.lede)) points.unshift(`Introduction still says “${short(c.lede)}”`);
      if (!c.blocks.length && !(c.rules || []).length) points.push('Nothing written in this chapter yet');
      if (points.length) out.push({ chapter: c.title, points });
    }
    return out;
  }
  // Older snapshots carry only the flattened rules
  for (const c of snapshot.chapters) {
    const points = c.rules.filter((r) => isPlaceholder(r.text)).map((r) => `${r.title === 'From the guidelines' ? 'A point' : `Rule “${short(r.title)}”`} still says “${short(r.text)}”`);
    if (!c.rules.length) points.push('Nothing written in this chapter yet');
    if (points.length) out.push({ chapter: c.title, points });
  }
  return out;
}

// ── For the studio's overview: the same gaps as to-dos, one per section, with what's missing, a suggestion of what to
// write, and where to go to fix it.

export type GuideTodo = { chapterId: string; chapter: string; blockId: string | null; section: string; missing: string; suggestion: string };

/** What a good answer looks like, by what the chapter is about: exact, measurable specs Claude can follow */
const SUGGEST: { re: RegExp; text: string }[] = [
  { re: /logo|wordmark|symbol|marque/, text: 'Say exactly how it works: the minimum size (in mm and px), the clear space around it (for example “the height of the symbol on every side”), which version goes on light and on dark backgrounds, and what never to do with it.' },
  { re: /colou?r|palette/, text: 'Give each colour its name, HEX, RGB and CMYK, what it’s for (backgrounds, text, accents) and roughly how much of a page it takes.' },
  { re: /typ(e|ography)|font/, text: 'Name the typeface and weight for each level (for example “headlines in Die Grotesk D Heavy”), with size, line spacing, letter spacing and the case rule.' },
  { re: /layout|grid|template|format/, text: 'Give the grid for each format: columns, outer margins and gutters (for example “A4: 12 columns, 15mm margins, 5mm gutters”), and how far type and logos sit from the edges.' },
  { re: /imag|photo|art direction|picture/, text: 'Describe the treatment exactly: crops and ratios, colour and grain, how see-through layered images are (for example “60% opacity”) and the most layers allowed.' },
  { re: /graphic|device|pattern|tile|grid of dots|dot/, text: 'Give its construction: sizes and spacing (for example “4px dots on an 8px grid”), colours, how it’s built (such as how to make a word tile), and where it may and may not be used.' },
  { re: /voice|tone|writ|messag/, text: 'Write the principle in one line, then one example that’s on brand and one that isn’t.' },
  { re: /icon/, text: 'Give the icon style: stroke weight, corner radius, grid size and the sizes they’re used at.' }
];
const suggestFor = (chapter: string, section: string) => (SUGGEST.find((s) => s.re.test(`${section} ${chapter}`.toLowerCase())) || { text: 'Replace the stand-in text with the actual rule, with measurable values (sizes, spacing, percentages) wherever there are any.' }).text;

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The gaps in the guidelines as to-dos: one per section that has stand-in text or a missing image */
export function guideTodos(snapshot: Snapshot): GuideTodo[] {
  const out: GuideTodo[] = [];
  for (const c of snapshot.guide?.chapters || []) {
    if (isPlaceholder(c.lede)) out.push({ chapterId: c.id, chapter: c.title, blockId: null, section: 'Introduction', missing: 'The chapter’s introduction is still stand-in text', suggestion: 'Say in one or two sentences what this chapter covers and the one thing to get right.' });
    c.blocks.forEach((b, i) => {
      const n = { headline: 0, text: 0, label: 0, image: 0, swatch: 0 };
      const count = (t?: string, kind: keyof typeof n = 'text') => { if (isPlaceholder(t)) n[kind]++; };
      count(b.heading, 'headline'); count(b.eyebrow, 'label'); count(b.body);
      for (const x of b.extras || []) count(x.text, x.kind === 'heading' ? 'headline' : 'text');
      (b.items || []).filter((it) => !it.hidden).forEach((it) => { for (const e of itemEls(it)) if (!e.hidden && e.kind !== 'button' && isPlaceholder(e.text)) n[e.kind === 'heading' ? 'headline' : e.kind === 'label' ? 'label' : 'text']++; });
      for (const s of b.swatches || []) if (isPlaceholder(s.name) || (norm(s.name) === 'colour' && s.hex.toUpperCase() === '#000000')) n.swatch++;
      if ((b.kind === 'image' || b.kind === 'split' || b.kind === 'media') && !(b.media || []).length && !b.backdrop) n.image++;
      const parts = [n.headline ? plural(n.headline, 'headline') : '', n.text ? plural(n.text, 'description') : '', n.label ? plural(n.label, 'label') : '', n.swatch ? plural(n.swatch, 'colour swatch', 'colour swatches') : '', n.image ? 'an image' : ''].filter(Boolean);
      if (!parts.length) return;
      const section = real(b.heading) ? short(b.heading!) : `Section ${i + 1}`;
      out.push({ chapterId: c.id, chapter: c.title, blockId: b.id, section, missing: `Still needs ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}`, suggestion: n.image && parts.length === 1 ? 'Add the example image this section describes, so Claude can see what good looks like.' : suggestFor(c.title, section) });
    });
    if (!c.blocks.length && !(c.rules || []).length) out.push({ chapterId: c.id, chapter: c.title, blockId: null, section: 'Whole chapter', missing: 'Nothing written in this chapter yet', suggestion: suggestFor(c.title, '') });
  }
  return out;
}
