// The consistency check: words the guide writes more than one way, so the team can pick one and use it everywhere.
// Three kinds: joined, hyphenated or spaced (lockup, lock-up, lock up), UK and US spelling (colour, color), and
// capitals mid-sentence (Wordmark, wordmark). It reads the guide's own text, so it's instant and every match is exact.

export type ConsistencyForm = { form: string; count: number; refs: string[] };
export type ConsistencyGroup = {
  key: string; type: 'joined' | 'spelling' | 'case';
  forms: ConsistencyForm[];
  /** The form to use, and why */ recommend: string; why: string;
  /** What the team chose, once they have */ chosen?: string; state?: 'fixed' | 'skipped';
};

const WORD = /\p{L}[\p{L}'’]*(?:-\p{L}[\p{L}'’]*)*/gu;
type Tok = { ref: string; s: string; i: number; end: number; start: boolean };

// -our words (UK) and their US -or forms; a list, so "four" never becomes "for"
const OUR = ['colour', 'favour', 'flavour', 'behaviour', 'honour', 'humour', 'labour', 'neighbour', 'harbour', 'rumour', 'savour', 'vapour', 'odour', 'armour', 'endeavour', 'parlour', 'valour', 'vigour', 'saviour', 'splendour', 'rigour', 'clamour'];
const RE_ = ['centre', 'metre', 'litre', 'fibre', 'theatre', 'calibre', 'sombre', 'spectre', 'lustre', 'meagre'];
const PAIRS: [string, string][] = [['grey', 'gray'], ['catalogue', 'catalog'], ['dialogue', 'dialog'], ['analogue', 'analog'], ['cheque', 'check'], ['jewellery', 'jewelry'], ['travelled', 'traveled'], ['travelling', 'traveling'], ['modelling', 'modeling'], ['labelled', 'labeled'], ['labelling', 'labeling'], ['cancelled', 'canceled'], ['focussed', 'focused'], ['licence', 'license'], ['defence', 'defense'], ['offence', 'offense'], ['aluminium', 'aluminum'], ['ageing', 'aging'], ['programme', 'program']];

/** The UK spelling a US one stands for, if it's one we know */
function ukOf(w: string): string | null {
  for (const [uk, us] of PAIRS) if (w === us) return uk;
  for (const s of OUR) { const us = s.replace(/our$/, 'or'); const m = w.match(new RegExp(`^${us}(s|ed|ing|ite|ites|ful|less|able|ably)?$`)); if (m) return s + (m[1] || ''); }
  for (const s of RE_) { const us = s.replace(/re$/, 'er'); const m = w.match(new RegExp(`^${us}(s|d)?$`)); if (m) return s + (m[1] || ''); }
  const z = w.match(/^(\p{L}{3,})iz(e|es|ed|ing|ation|ations|er|ers)$/u); if (z) return `${z[1]}is${z[2]}`;
  const y = w.match(/^(\p{L}{2,})yz(e|es|ed|ing)$/u); if (y) return `${y[1]}ys${y[2]}`; // analyze → analyse
  return null;
}

/** Find the inconsistencies across the given texts (reference → text). known: how the brand writes its own words. */
export function findInconsistencies(texts: Record<string, string>, known: string[] = []): ConsistencyGroup[] {
  const toks: Tok[] = [];
  const pairs: Tok[] = [];
  for (const [ref, t] of Object.entries(texts)) {
    const list: Tok[] = []; let m: RegExpExecArray | null; WORD.lastIndex = 0;
    while ((m = WORD.exec(t))) {
      const before = t.slice(0, m.index);
      list.push({ ref, s: m[0].replace(/['’]s$/, ''), i: m.index, end: m.index + m[0].length, start: !before.trim() || /[.!?:;\n•–—]\s*$/.test(before) || /^\s*[-*\d.)]+\s*$/.test(before.split('\n').pop() || '') });
    }
    toks.push(...list);
    // Two words with one space between: "lock up", for matching against "lockup" and "lock-up"
    for (let k = 0; k + 1 < list.length; k++) if (t.slice(list[k].end, list[k + 1].i) === ' ' && !list[k].s.includes('-') && !list[k + 1].s.includes('-')) pairs.push({ ref, s: `${list[k].s} ${list[k + 1].s}`, i: list[k].i, end: list[k + 1].end, start: list[k].start });
  }
  const knownLower = new Map(known.flatMap((k) => k.split(/[\n,]/)).map((k) => k.trim()).filter(Boolean).map((k) => [k.toLowerCase(), k]));
  const groups: ConsistencyGroup[] = [];
  const add = (key: string, type: ConsistencyGroup['type'], m: Map<string, Tok[]>, uk?: string) => {
    const forms = [...m].map(([form, ts]) => ({ form, count: ts.length, refs: [...new Set(ts.map((x) => x.ref))] })).sort((a, b) => b.count - a.count);
    if (forms.length < 2) return;
    const total = forms.reduce((n, f) => n + f.count, 0);
    // What to recommend: how the brand writes it, then UK English, then what the guide uses most
    const own = type === 'case' ? forms.find((f) => knownLower.get(f.form.toLowerCase()) === f.form) : forms.find((f) => knownLower.has(f.form.toLowerCase()) && !forms.some((g) => g !== f && knownLower.has(g.form.toLowerCase())));
    let recommend = forms[0].form, why = `Used most: ${forms[0].count} of ${total}`;
    if (own) { recommend = own.form; why = 'How the brand writes it, in the guide’s dictionary'; }
    else if (uk) { recommend = uk; why = 'UK English, as the house style asks'; }
    else if (type === 'case') { const low = forms.find((f) => f.form === f.form.toLowerCase()); if (low && low.count >= forms[0].count) { recommend = low.form; why = 'Sentence case: no capital mid-sentence'; } }
    else if (forms.length > 1 && forms[0].count === forms[1].count) { const simple = [...forms].sort((a, b) => a.form.replace(/[^- ]/g, '').length - b.form.replace(/[^- ]/g, '').length)[0]; recommend = simple.form; why = 'Used as often as the others; the simplest form'; }
    groups.push({ key: `${type}:${key}`, type, forms, recommend, why });
  };

  // 1. Joined, hyphenated or spaced
  const fold = (w: string) => w.toLowerCase().replace(/[- ]/g, '');
  const joined = new Map<string, Map<string, Tok[]>>();
  const single = new Set(toks.map((t) => fold(t.s)));
  for (const t of [...toks, ...pairs]) {
    const k = fold(t.s); if (k.length < 4) continue;
    // A pair only counts against a joined or hyphenated form somewhere else
    if (t.s.includes(' ') && !single.has(k)) continue;
    const m = joined.get(k) || new Map(); const f = t.s.toLowerCase(); m.set(f, [...(m.get(f) || []), t]); joined.set(k, m);
  }
  for (const [k, m] of joined) add(k, 'joined', m);

  // 2. UK and US spelling
  const spell = new Map<string, Map<string, Tok[]>>();
  for (const t of toks) {
    const w = t.s.toLowerCase(); const uk = ukOf(w);
    const k = uk || w;
    if (!uk && !spell.has(k)) { continue; }
    const m = spell.get(k) || new Map(); m.set(w, [...(m.get(w) || []), t]); spell.set(k, m);
  }
  // The UK forms seen anywhere join their group
  for (const [uk, m] of spell) { const all = toks.filter((x) => x.s.toLowerCase() === uk); if (all.length) m.set(uk, all); }
  for (const [uk, m] of spell) add(uk, 'spelling', m, uk);

  // 3. Capitals mid-sentence: the same word with and without one, away from the start of a sentence
  const cases = new Map<string, Map<string, Tok[]>>();
  for (const t of toks) {
    if (t.s.length < 3 || t.s === t.s.toUpperCase()) continue;
    // At the start of a sentence a capital is expected, so only a capital further in counts (TileYard), or the brand's own form
    if (t.start && t.s.slice(1) === t.s.slice(1).toLowerCase() && knownLower.get(t.s.toLowerCase()) !== t.s) continue;
    const k = t.s.toLowerCase(); const m = cases.get(k) || new Map(); m.set(t.s, [...(m.get(t.s) || []), t]); cases.set(k, m);
  }
  for (const [k, m] of cases) add(k, 'case', m);

  // Biggest first, so the ones that matter most come up first
  return groups.sort((a, b) => b.forms.reduce((n, f) => n + f.count, 0) - a.forms.reduce((n, f) => n + f.count, 0));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Rewrite one text so every other form becomes the chosen one, keeping a capital at the start of a word */
export function applyForm(text: string, g: ConsistencyGroup, to: string): string {
  const others = g.forms.map((f) => f.form).filter((f) => f !== to).sort((a, b) => b.length - a.length);
  if (!others.length) return text;
  const bound = (f: string) => `(?<![\\p{L}'’-])${esc(f).replace(/\\-|-| /g, (x) => (x === ' ' ? ' ' : '-'))}(?![\\p{L}-])`;
  if (g.type === 'case') {
    // Only mid-sentence: a capital that starts a sentence is right
    return text.replace(new RegExp(others.map(bound).join('|'), 'gu'), (m, ...rest) => {
      const at = rest[rest.length - 2] as number; const before = text.slice(0, at);
      return (!before.trim() || /[.!?:;\n•–—]\s*$/.test(before)) && m.slice(1) === to.slice(1) ? m : to;
    });
  }
  return text.replace(new RegExp(others.map(bound).join('|'), 'giu'), (m) => (m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to));
}
