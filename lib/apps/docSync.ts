// Live editing for a Writer doc: each change goes out as small operations on the doc's parts (the title, the intro,
// the tone, the details, one piece, one block, or the order of pieces or blocks), and everyone applies the others'
// operations to their own copy. Two people working on different pieces or blocks never overwrite each other;
// the same block is held by whoever is in it (see the presence labels), so it's rare for two edits to meet.

type Keyed = { id: string };
export type SyncDoc = { title: string; intro?: string; tone?: number; props?: unknown; pieces: Keyed[]; blocks?: Keyed[] };
export type Op =
  | { k: 'f'; f: 'title' | 'intro' | 'tone' | 'props'; v: unknown }
  | { k: 'p' | 'b'; id: string; v: Keyed | null; /** New ones: the one it goes after (null for the top) */ after?: string | null; before?: string | null }
  | { k: 'po' | 'bo'; ids: string[] };

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function diffList(a: Keyed[] | undefined, b: Keyed[] | undefined, k: 'p' | 'b', order: 'po' | 'bo', out: Op[]) {
  if (a === b) return;
  const A = new Map((a || []).map((x) => [x.id, x])), B = new Map((b || []).map((x) => [x.id, x]));
  (b || []).forEach((x, i) => {
    if (!A.has(x.id)) out.push({ k, id: x.id, v: x, after: i ? b![i - 1].id : null, before: b![i + 1]?.id ?? null });
    else if (!same(A.get(x.id), x)) out.push({ k, id: x.id, v: x });
  });
  for (const id of A.keys()) if (!B.has(id)) out.push({ k, id, v: null });
  // A move: only when things that were already there changed order (new ones carry their own place)
  const ao = (a || []).map((x) => x.id).filter((id) => B.has(id)), bo = (b || []).map((x) => x.id).filter((id) => A.has(id));
  if (!same(ao, bo)) out.push({ k: order, ids: bo });
}

/** What changed between two versions of the doc, as operations */
export function diff(a: SyncDoc, b: SyncDoc): Op[] {
  const out: Op[] = [];
  for (const f of ['title', 'intro', 'tone', 'props'] as const) if (!same(a[f], b[f])) out.push({ k: 'f', f, v: b[f] });
  diffList(a.pieces, b.pieces, 'p', 'po', out);
  diffList(a.blocks, b.blocks, 'b', 'bo', out);
  return out;
}

function applyList<T extends Keyed>(list: T[] | undefined, ops: Op[], k: 'p' | 'b', order: 'po' | 'bo'): T[] | undefined {
  let l = list ? [...list] : undefined, touched = false;
  for (const o of ops) {
    if (o.k === k) {
      touched = true; l = l || [];
      const i = l.findIndex((x) => x.id === o.id);
      if (o.v === null) { if (i >= 0) l.splice(i, 1); }
      else if (i >= 0) l[i] = o.v as T;
      else if (o.after === undefined) l.push(o.v as T);
      else {
        // Between the one it follows and the one it came before; anything else added there at the same time is
        // ordered by id, so everyone ends up with the same order
        const j = o.after === null ? -1 : l.findIndex((x) => x.id === o.after);
        let at = j >= 0 || o.after === null ? j + 1 : l.length;
        const end = o.before ? l.findIndex((x, n) => n >= at && x.id === o.before) : -1;
        if (end > at) while (at < end && l[at].id < o.id) at++;
        l.splice(at, 0, o.v as T);
      }
    } else if (o.k === order && l) {
      touched = true;
      // Their order for what they knew about; anything they didn't (just added here) stays after the one it followed
      const pos = new Map(o.ids.map((id, n) => [id, n]));
      const out = l.filter((x) => pos.has(x.id)).sort((x, y) => pos.get(x.id)! - pos.get(y.id)!);
      l.forEach((x, i) => {
        if (pos.has(x.id)) return;
        const prev = i ? l![i - 1].id : null; const j = prev === null ? -1 : out.findIndex((y) => y.id === prev);
        out.splice(prev === null ? 0 : j >= 0 ? j + 1 : out.length, 0, x);
      });
      l = out;
    }
  }
  return touched ? l : list;
}

/** Someone else's operations, applied to your copy */
export function apply<D extends SyncDoc>(d: D, ops: Op[]): D {
  const n = { ...d } as D & Record<string, unknown>;
  for (const o of ops) if (o.k === 'f') (n as Record<string, unknown>)[o.f] = o.v;
  n.pieces = applyList(d.pieces, ops, 'p', 'po') || [];
  const bl = applyList(d.blocks, ops, 'b', 'bo');
  if (bl !== d.blocks) n.blocks = bl;
  return n;
}
