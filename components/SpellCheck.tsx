'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookPlus, EyeOff } from 'lucide-react';

// Live spell check for the editor, in British English: misspelt words get a red zigzag underline as you go, and
// clicking one offers corrections. Brand names, the brand's own words and anything added to the guide's dictionary
// count as spelt right. Underlines are drawn with the CSS Highlight API, so the text itself isn't touched.

type Speller = { correct(w: string): boolean; suggest(w: string): string[]; add(w: string): Speller };
let loading: Promise<Speller | null> | null = null;
function speller(): Promise<Speller | null> {
  if (!loading) loading = (async () => {
    try {
      const [{ default: nspell }, aff, dic] = await Promise.all([import('nspell'), fetch('/dict/en-gb.aff').then((r) => r.text()), fetch('/dict/en-gb.dic').then((r) => r.text())]);
      return nspell({ aff, dic }) as Speller;
    } catch { return null; }
  })();
  return loading;
}
// Words brand guidelines use that aren't in a general dictionary
const BRAND_WORDS = ['wordmark', 'wordmarks', 'lockup', 'lockups', 'monogram', 'monograms', 'favicon', 'favicons', 'kerning', 'cmyk', 'rgb', 'pantone', 'hex', 'colourway', 'colourways', 'colorway', 'typeset', 'serif', 'serifs', 'sans', 'glyph', 'glyphs', 'ligature', 'ligatures', 'pictogram', 'pictograms', 'iconography', 'wayfinding', 'signage', 'artwork', 'artworks', 'moodboard', 'moodboards', 'keyline', 'keylines', 'tagline', 'taglines', 'strapline', 'straplines', 'roundel', 'roundels', 'endframe', 'endframes', 'superscript', 'subhead', 'subheads', 'subheading', 'subheadings', 'microcopy', 'cta', 'ctas', 'ui', 'ux', 'svg', 'png', 'jpg', 'mp4', 'gif', 'pdf', 'figma', 'instagram', 'linkedin', 'tiktok', 'youtube'];
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*[A-Za-zÀ-ÖØ-öø-ÿ]|[A-Za-z]/g;
type Hit = { node: Text; start: number; end: number; word: string };
const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (window as unknown as { Highlight?: unknown }).Highlight === 'function';

export function useSpellCheck({ root, known, onAdd, on = true }: { root: string; known: string[]; onAdd: (w: string) => void; on?: boolean }) {
  const sp = useRef<Speller | null>(null);
  const hits = useRef<Hit[]>([]);
  const ignored = useRef(new Set<string>());
  const [pop, setPop] = useState<{ hit: Hit; x: number; y: number; sugg: string[] } | null>(null);
  const knownSet = useRef(new Set<string>());
  knownSet.current = new Set([...BRAND_WORDS, ...known.flatMap((k) => k.toLowerCase().split(/[^a-zà-ÿ'’-]+/i))].filter(Boolean));

  const ok = useCallback((w: string): boolean => {
    const s = sp.current; if (!s) return true;
    if (w.length < 2 || /\d/.test(w) || (w === w.toUpperCase() && w.length <= 6)) return true; // codes, acronyms
    const lw = w.toLowerCase().replace(/’/g, "'");
    if (knownSet.current.has(lw) || ignored.current.has(lw)) return true;
    const base = lw.replace(/'s$/, '');
    if (s.correct(w) || s.correct(lw) || s.correct(base) || s.correct(w.replace(/’/g, "'"))) return true;
    // Hyphenated: fine if every part is
    if (w.includes('-')) return w.split('-').every((p) => !p || ok(p));
    return false;
  }, []);

  const scan = useCallback(() => {
    if (!on || !sp.current || !supported()) return;
    const els = document.querySelectorAll(root);
    const found: Hit[] = [];
    els.forEach((el) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => ((n.parentElement?.closest('input, textarea, code, pre, [data-nospell], .ve-pgap, .ve-slide-label, .gb-swc, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)) });
      let n: Node | null;
      while ((n = walk.nextNode())) {
        const t = (n as Text).data; WORD.lastIndex = 0; let m: RegExpExecArray | null;
        while ((m = WORD.exec(t))) { const w = m[0].replace(/^['’-]+|['’-]+$/g, ''); if (!ok(w)) found.push({ node: n as Text, start: m.index, end: m.index + m[0].length, word: w }); }
      }
    });
    hits.current = found;
    const H = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
    const ranges = found.map((h) => { const r = document.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, Math.min(h.end, h.node.length)); return r; });
    (CSS as unknown as { highlights: Map<string, unknown> }).highlights.set('spell', new H(...ranges));
  }, [root, on, ok]);

  // Load the dictionary, then check now and whenever the text changes
  useEffect(() => {
    if (!on || !supported()) return;
    let alive = true, t: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (t) clearTimeout(t); t = setTimeout(scan, 350); };
    speller().then((s) => { if (!alive || !s) return; sp.current = s; scan(); });
    const mo = new MutationObserver(later);
    const target = document.querySelector('.ve-main') || document.body;
    mo.observe(target, { subtree: true, characterData: true, childList: true });
    return () => { alive = false; mo.disconnect(); if (t) clearTimeout(t); (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete('spell'); };
  }, [on, scan]);
  useEffect(() => { scan(); }, [known.join('|'), scan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click a misspelt word: corrections next to it
  useEffect(() => {
    if (!on) return;
    const click = (e: MouseEvent) => {
      if (!sp.current || !hits.current.length) return;
      const pos = (document as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(e.clientX, e.clientY);
      const r = !pos ? (document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY) : null;
      const node = pos ? pos.offsetNode : r?.startContainer, off = pos ? pos.offset : r?.startOffset ?? -1;
      const hit = hits.current.find((h) => h.node === node && off >= h.start && off <= h.end);
      if (!hit) return;
      const rr = document.createRange(); rr.setStart(hit.node, hit.start); rr.setEnd(hit.node, Math.min(hit.end, hit.node.length));
      const b = rr.getBoundingClientRect();
      setPop({ hit, x: b.left, y: b.bottom + 6, sugg: sp.current.suggest(hit.word).slice(0, 5) });
    };
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.spk')) setPop(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null); };
    document.addEventListener('click', click); document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', click); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [on]);

  function replace(to: string) {
    if (!pop) return;
    const { hit } = pop;
    const host = hit.node.parentElement?.closest('[contenteditable]') as HTMLElement | null;
    // Keep the original's capital
    const fixed = /^[A-Z]/.test(hit.word) ? to[0].toUpperCase() + to.slice(1) : to;
    const r = document.createRange(); r.setStart(hit.node, hit.start); r.setEnd(hit.node, Math.min(hit.end, hit.node.length));
    if (host) {
      host.focus(); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
      // Through the editor, so it's saved and undoable like typing
      if (!document.execCommand('insertText', false, fixed)) { r.deleteContents(); r.insertNode(document.createTextNode(fixed)); host.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    setPop(null); setTimeout(scan, 50);
  }
  const menu = pop ? createPortal(<div className="spk" role="menu" aria-label={`Spelling of ${pop.hit.word}`} style={{ left: Math.max(8, Math.min(pop.x, window.innerWidth - 240)), top: Math.min(pop.y, window.innerHeight - 220) }} onMouseDown={(e) => e.preventDefault()}>
    {pop.sugg.length ? pop.sugg.map((s) => <button key={s} type="button" role="menuitem" className="spk-s" onClick={() => replace(s)}>{s}</button>) : <p className="spk-none">No suggestions</p>}
    <div className="spk-sep" />
    <button type="button" role="menuitem" onClick={() => { ignored.current.add(pop.hit.word.toLowerCase()); setPop(null); scan(); }}><EyeOff size={13} strokeWidth={1.75} aria-hidden />Ignore</button>
    <button type="button" role="menuitem" onClick={() => { onAdd(pop.hit.word); setPop(null); }}><BookPlus size={13} strokeWidth={1.75} aria-hidden />Add “{pop.hit.word}” to the dictionary</button>
  </div>, document.body) : null;
  return { menu, rescan: scan };
}
