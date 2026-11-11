import type { Block, Guide, GuideChapter } from '@/lib/portal/guide';

// Changes to the guidelines as patches, so several people can edit at once without overwriting each other.
// A patch says only what changed: guide-wide settings, the chapter order, and per chapter its settings, its section
// order and the sections that changed (or null when deleted). Two people editing different sections, or different
// chapters, both keep their work. Editing the same section at the same moment: the later change wins for that section.

type ChMeta = Omit<GuideChapter, 'blocks'>;
export type ChPatch = { meta?: ChMeta; order?: string[]; blocks?: Record<string, Block | null> };
export type GuidePatch = { top?: Record<string, unknown>; topDel?: string[]; order?: string[]; ch?: Record<string, ChPatch | null> };

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const meta = (c: GuideChapter): ChMeta => { const { blocks: _b, ...m } = c; return m; };

export function isEmpty(p: GuidePatch | null | undefined) {
  return !p || (!p.top && !p.topDel?.length && !p.order && !(p.ch && Object.keys(p.ch).length));
}

/** What changed from a to b. */
export function diff(a: Guide | null | undefined, b: Guide | null | undefined): GuidePatch {
  const p: GuidePatch = {};
  if (!b) return p;
  const A = (a || { chapters: [] }) as Guide & Record<string, unknown>, B = b as Guide & Record<string, unknown>;
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (k === 'chapters' || k === '_rev') continue;
    if (!(k in B) || B[k] === undefined) { if (k in A && A[k] !== undefined) (p.topDel ||= []).push(k); continue; }
    if (!same(A[k], B[k])) (p.top ||= {})[k] = B[k];
  }
  const ac = A.chapters || [], bc = B.chapters || [];
  if (!sameOrder(ac.map((c) => c.id), bc.map((c) => c.id))) p.order = bc.map((c) => c.id);
  const am = new Map(ac.map((c) => [c.id, c]));
  const bIds = new Set(bc.map((c) => c.id));
  for (const c of ac) if (!bIds.has(c.id)) (p.ch ||= {})[c.id] = null;
  for (const c of bc) {
    const o = am.get(c.id);
    if (o === c) continue;
    if (!o) { (p.ch ||= {})[c.id] = { meta: meta(c), order: c.blocks.map((x) => x.id), blocks: Object.fromEntries(c.blocks.map((x) => [x.id, x])) }; continue; }
    const cp: ChPatch = {};
    if (!same(meta(o), meta(c))) cp.meta = meta(c);
    if (o.blocks !== c.blocks) {
      if (!sameOrder(o.blocks.map((x) => x.id), c.blocks.map((x) => x.id))) cp.order = c.blocks.map((x) => x.id);
      const ob = new Map(o.blocks.map((x) => [x.id, x]));
      const nIds = new Set(c.blocks.map((x) => x.id));
      for (const x of o.blocks) if (!nIds.has(x.id)) (cp.blocks ||= {})[x.id] = null;
      for (const x of c.blocks) { const y = ob.get(x.id); if (y !== x && !same(y, x)) (cp.blocks ||= {})[x.id] = x; }
    }
    if (cp.meta || cp.order || cp.blocks) (p.ch ||= {})[c.id] = cp;
  }
  return p;
}

/** Puts things in the order wanted, keeping anything the order doesn't know about (added by someone else) after
 *  whatever it followed before. */
function mergeOrder<T extends { id: string }>(wanted: string[] | undefined, have: T[]): T[] {
  if (!wanted) return have;
  const by = new Map(have.map((x) => [x.id, x]));
  const out = wanted.filter((id) => by.has(id));
  const placed = new Set(out);
  have.forEach((x, i) => {
    if (placed.has(x.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(have[j].id); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, x.id); placed.add(x.id);
  });
  return out.map((id) => by.get(id)!);
}

/** The guide with a patch applied. Returns a new object; unchanged chapters and sections are shared. */
export function apply(g: Guide | null | undefined, p: GuidePatch | null | undefined): Guide | null {
  if (!g || isEmpty(p)) return g || null;
  const out = { ...g } as Guide & Record<string, unknown>;
  for (const [k, v] of Object.entries(p!.top || {})) out[k] = v;
  for (const k of p!.topDel || []) delete out[k];
  let chs = [...(g.chapters || [])];
  for (const [id, cp] of Object.entries(p!.ch || {})) {
    const i = chs.findIndex((c) => c.id === id);
    if (cp === null) { if (i >= 0) chs.splice(i, 1); continue; }
    const cur: GuideChapter = i >= 0 ? chs[i] : ({ ...(cp.meta as ChMeta), blocks: [] } as GuideChapter);
    let blocks = cur.blocks;
    if (cp.blocks) {
      blocks = [...blocks];
      for (const [bid, b] of Object.entries(cp.blocks)) {
        const j = blocks.findIndex((x) => x.id === bid);
        if (b === null) { if (j >= 0) blocks.splice(j, 1); } else if (j >= 0) blocks[j] = b; else blocks.push(b);
      }
    }
    blocks = mergeOrder(cp.order, blocks);
    const next = { ...(cp.meta || meta(cur)), blocks } as GuideChapter;
    if (i >= 0) chs[i] = next; else chs.push(next);
  }
  chs = mergeOrder(p!.order, chs);
  out.chapters = chs;
  return out;
}

/** One patch that does what a then b do. */
export function compose(a: GuidePatch | null | undefined, b: GuidePatch | null | undefined): GuidePatch {
  if (isEmpty(a)) return b || {};
  if (isEmpty(b)) return a!;
  const p: GuidePatch = {};
  const top = { ...(a!.top || {}) }; const del = new Set(a!.topDel || []);
  for (const [k, v] of Object.entries(b!.top || {})) { top[k] = v; del.delete(k); }
  for (const k of b!.topDel || []) { delete top[k]; del.add(k); }
  if (Object.keys(top).length) p.top = top;
  if (del.size) p.topDel = [...del];
  if (a!.order || b!.order) p.order = b!.order || a!.order;
  const ch: Record<string, ChPatch | null> = { ...(a!.ch || {}) };
  for (const [id, cb] of Object.entries(b!.ch || {})) {
    const ca = ch[id];
    if (cb === null || !ca) { ch[id] = cb; continue; }
    ch[id] = { meta: cb.meta || ca.meta, order: cb.order || ca.order, blocks: ca.blocks || cb.blocks ? { ...(ca.blocks || {}), ...(cb.blocks || {}) } : undefined };
    for (const k of ['meta', 'order', 'blocks'] as const) if (ch[id]![k] === undefined) delete ch[id]![k];
  }
  if (Object.keys(ch).length) p.ch = ch;
  return p;
}

/** Which sections a patch touches, for showing who changed what. */
export function touched(p: GuidePatch): string[] {
  return Object.values(p.ch || {}).flatMap((c) => (c?.blocks ? Object.keys(c.blocks) : []));
}
