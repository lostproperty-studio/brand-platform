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
