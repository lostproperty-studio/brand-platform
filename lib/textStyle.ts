import type { TextStyle } from '@/lib/figma/blocks';

const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a) / 100})`; };

/** CSS for text styled in the editor. Sentence case has no CSS equivalent, so it's a class (lowercase, first letter up);
 *  lists, paragraph spacing and truncation are classes too. */
export function textProps(s?: TextStyle): { style?: React.CSSProperties; className: string } {
  if (!s) return { className: '' };
  const color = s.color && /^#[0-9a-f]{6}$/i.test(s.color) ? (s.alpha !== undefined && s.alpha < 100 ? rgba(s.color, s.alpha) : s.color) : s.color;
  const style: React.CSSProperties & Record<string, unknown> = {
    ...(s.size ? { fontSize: s.size } : {}), ...(s.weight ? { fontWeight: s.weight } : {}), ...(color ? { color } : {}),
    ...(s.font ? { fontFamily: `var(--font-${s.font})` } : {}),
    ...(s.tracking !== undefined ? { letterSpacing: `${s.tracking}em` } : {}),
    ...(s.leading ? { lineHeight: s.leading } : {}),
    ...(s.case === 'upper' ? { textTransform: 'uppercase' } : s.case === 'lower' || s.case === 'sentence' ? { textTransform: 'lowercase' } : s.case === 'title' ? { textTransform: 'capitalize' } : s.case === 'smallcaps' ? { fontVariantCaps: 'all-small-caps', textTransform: 'none' } : {}),
    ...(s.align ? { textAlign: s.align } : {}),
    ...(s.decoration ? { textDecoration: s.decoration === 'strike' ? 'line-through' : 'underline' } : {}),
    ...(s.wrap ? { textWrap: s.wrap } : {}),
    ...(s.opacity !== undefined && s.opacity < 100 ? { opacity: s.opacity / 100 } : {}),
    ...(s.paraGap !== undefined ? { '--pgap': `${s.paraGap}px` } : {})
  };
  const className = [s.case === 'sentence' ? 'tc-sentence' : '', s.ts ? `ts-${s.ts}` : '', s.list ? `tl-${s.list}` : '', s.paraGap !== undefined ? 'tl-pgap' : '', s.truncate ? 'tl-trunc' : ''].filter(Boolean).join(' ');
  return { style: Object.keys(style).length ? (style as React.CSSProperties) : undefined, className };
}
