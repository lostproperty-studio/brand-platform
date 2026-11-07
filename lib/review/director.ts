import type { Guide, GuideChapter } from '@/lib/portal/guide';
import { itemEls, type Block } from '@/lib/figma/blocks';

// The creative director's view of a guide: every piece of text with a short reference (C2.S4.F1.body) the AI can
// point at, and the editor can jump to or change. References map back to ids, so they survive reordering.

export type Depth = 'big' | 'detail' | 'both';
export type Ref = { chapter: string; block?: string; item?: string; field: string };
export type BigNote = { id: string; title: string; steer: string; why?: string; question?: string; refs?: string[] };
export type DetailNote = { id: string; ref: string; kind: 'spelling' | 'grammar' | 'punctuation' | 'clarity' | 'consistency' | 'headline' | 'house style'; quote: string; suggestion: string; note?: string };
export type ReviewResult = { summary: string; strengths: string[]; big: BigNote[]; detail: DetailNote[]; questions: string[] };
export type ReviewSession = {
  at: string; depth: Depth; chapter?: string | null; focus?: string; result: ReviewResult; refs: Record<string, Ref>;
  /** Notes dealt with: applied, done or dismissed */ closed?: Record<string, 'applied' | 'done' | 'dismissed'>;
  messages?: { role: 'user' | 'assistant'; content: string }[];
};

const live = (c: GuideChapter) => !c.removed && !c.hidden;

/** The guide as text with references, for the prompt; and the references, for the editor */
export function guideMap(g: Guide, chapter?: string | null): { text: string; refs: Record<string, Ref> } {
  const refs: Record<string, Ref> = {};
  const out: string[] = [];
  g.chapters.forEach((c, ci) => {
    if (!live(c) || (chapter && c.id !== chapter)) return;
    const C = `C${ci + 1}`;
    const put = (r: string, ref: Ref, label: string, text?: string) => { if (!text?.trim()) return; refs[r] = ref; out.push(`  [${r}] ${label}: ${text.replace(/\s+/g, ' ').trim().slice(0, 1200)}`); };
    out.push(`\n# ${C} Chapter: ${c.title}`);
    put(`${C}.title`, { chapter: c.id, field: 'title' }, 'Chapter title', c.title);
    put(`${C}.kicker`, { chapter: c.id, field: 'kicker' }, 'Chapter label', c.kicker);
    put(`${C}.lede`, { chapter: c.id, field: 'lede' }, 'Chapter introduction', c.lede);
    c.blocks.filter((b) => !b.hidden && b.draft !== 'missing').forEach((b: Block, bi) => {
      const S = `${C}.S${bi + 1}`;
      out.push(` ## ${S} ${b.kind} section${b.draft ? ' (AI draft, not yet accepted)' : ''}${(b.media || []).length ? ` · ${(b.media || []).length} image(s)` : ''}${(b.swatches || []).length ? ` · ${(b.swatches || []).length} colour swatches` : ''}`);
      put(`${S}.eyebrow`, { chapter: c.id, block: b.id, field: 'eyebrow' }, 'Label', b.eyebrow);
      put(`${S}.heading`, { chapter: c.id, block: b.id, field: 'heading' }, 'Headline', b.heading);
      put(`${S}.body`, { chapter: c.id, block: b.id, field: 'body' }, 'Text', b.body);
      (b.extras || []).forEach((x) => put(`${S}.x-${x.id}`, { chapter: c.id, block: b.id, field: 'x-' + x.id }, x.kind === 'heading' ? 'Headline' : x.kind === 'label' ? 'Label' : 'Text', x.text));
      (b.items || []).forEach((it, ii) => {
        const F = `${S}.F${ii + 1}`;
        for (const e of itemEls(it)) if (e.kind !== 'image' && e.kind !== 'spacer') put(`${F}.${e.id}`, { chapter: c.id, block: b.id, item: it.id, field: e.id }, `Frame ${ii + 1} ${e.kind === 'text' ? 'text' : e.kind}`, e.text);
      });
      (b.media || []).forEach((m, mi) => put(`${S}.cap${mi}`, { chapter: c.id, block: b.id, field: `cap:${mi}` }, 'Caption', m.caption));
    });
  });
  return { text: out.join('\n'), refs };
}

/** How the studio's other guides are built, as counts only: which chapters they have and how many sections.
 *  No client's words or names ever leave their own guide. */
export function benchmark(guides: Guide[]): string {
  if (!guides.length) return '';
  const keys = new Map<string, number>(); let sections = 0, chapters = 0;
  for (const g of guides) {
    const seen = new Set<string>();
    for (const c of g.chapters.filter(live)) { chapters++; sections += c.blocks.filter((b) => !b.hidden).length; if (c.key && !seen.has(c.key)) { seen.add(c.key); keys.set(c.key, (keys.get(c.key) || 0) + 1); } }
  }
  const n = guides.length;
  return `Across the studio's ${n} other guide${n === 1 ? '' : 's'} (structure only): ${[...keys].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} chapter in ${Math.round((v / n) * 100)}%`).join(', ')}; on average ${Math.round(chapters / n)} chapters and ${Math.round(sections / Math.max(1, chapters))} sections per chapter.`;
}
