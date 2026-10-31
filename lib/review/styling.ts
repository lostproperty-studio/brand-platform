import type { FigmaScan } from '@/lib/figma/scan';

// Finds styling that is almost consistent: the same typeface and weight used at nearly the same size, line height
// or letter spacing, and colours that are visually the same but not identical. These are usually slips in the file;
// the review asks which value is right so the kit (and AI) only ever sees one.

export type StyleIssue = { chapter: 'type' | 'colour'; title: string; found: string; proposal: string; options: string[]; recommend: string; node_id: string | null; swatches: { hex: string; label: string }[]; key: string };

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.sqrt((x[0] - y[0]) ** 2 * 0.3 + (x[1] - y[1]) ** 2 * 0.59 + (x[2] - y[2]) ** 2 * 0.11); };
const times = (n: number) => `used ${n} time${n === 1 ? '' : 's'}`;

export function findStyleMismatches(scan: FigmaScan): StyleIssue[] {
  const out: StyleIssue[] = [];

  // Colours: near-identical solid colours (an eye can't tell them apart, but tools and AI treat them as different)
  const cols = scan.colours.filter((c) => c.opacity === 100).sort((a, b) => b.count - a.count);
  const seen = new Set<string>();
  for (const main of cols) {
    if (seen.has(main.hex)) continue;
    const near = cols.filter((c) => c.hex !== main.hex && !seen.has(c.hex) && dist(c.hex, main.hex) > 0 && dist(c.hex, main.hex) < 9);
    if (!near.length) continue;
    [main, ...near].forEach((c) => seen.add(c.hex));
    const group = [main, ...near];
    const odd = near.sort((a, b) => a.count - b.count)[0];
    out.push({
      key: 'colour:' + main.hex, chapter: 'colour',
      title: `${group.map((c) => c.hex).join(' and ')} look the same`,
      found: `${group.map((c) => `${c.hex} (${times(c.count)})`).join(', ')}. They’re almost identical, so they’re probably meant to be one colour.`,
      proposal: `Use ${main.hex} everywhere.`,
      options: [...group.map((c) => `${c.hex} (${times(c.count)})`), 'They’re meant to be different'],
      recommend: `${main.hex} (${times(main.count)})`,
      node_id: odd.examples?.[0] ?? null,
      swatches: group.map((c) => ({ hex: c.hex, label: times(c.count) }))
    });
  }

  // Type: same family and weight with sizes within ~8%, or same size with different line height or tracking
  const fam = (f: string) => f.replace(/\s+\d+$/, '');
  const byFace = new Map<string, FigmaScan['type']>();
  for (const t of scan.type) { const k = t.font; byFace.set(k, [...(byFace.get(k) || []), t]); }
  for (const [face, list] of byFace) {
    const used = new Set<FigmaScan['type'][number]>();
    for (const main of list.slice().sort((a, b) => b.count - a.count)) {
      if (used.has(main) || main.size < 8) continue;
      const sizeNear = list.filter((t) => t !== main && !used.has(t) && t.size !== main.size && Math.abs(t.size - main.size) / main.size <= 0.08 && t.textCase === main.textCase);
      const sameSize = list.filter((t) => t !== main && !used.has(t) && t.size === main.size && t.textCase === main.textCase && (t.lineHeight !== main.lineHeight || t.tracking !== main.tracking));
      const group = [main, ...sizeNear, ...sameSize];
      if (group.length < 2 || main.count < 2) continue;
      group.forEach((t) => used.add(t));
      const describe = (t: FigmaScan['type'][number]) => `${t.size}px${t.lineHeight ? ` / ${t.lineHeight}% line height` : ''}${t.tracking ? ` / ${t.tracking > 0 ? '+' : ''}${t.tracking}px tracking` : ''}`;
      const odd = group.slice(1).sort((a, b) => a.count - b.count)[0];
      out.push({
        key: `type:${face}:${main.size}`, chapter: 'type',
        title: `${fam(face)} at ${main.size}px is set ${group.length} slightly different ways`,
        found: group.map((t) => `${describe(t)} (${times(t.count)}${t.sample ? `, e.g. “${t.sample}”` : ''})`).join('; '),
        proposal: `Use ${describe(main)} for this style everywhere.`,
        options: [...group.map((t) => `${describe(t)} (${times(t.count)})`), 'They’re meant to be different'],
        recommend: `${describe(main)} (${times(main.count)})`,
        node_id: odd.examples?.[0] ?? null,
        swatches: []
      });
    }
  }
  return out.slice(0, 12);
}
