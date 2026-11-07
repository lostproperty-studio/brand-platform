import type { TextStyle } from '@/lib/figma/blocks';

/** CSS for text styled in the editor. Sentence case has no CSS equivalent, so it's a class (lowercase, first letter up). */
export function textProps(s?: TextStyle): { style?: React.CSSProperties; className: string } {
  if (!s) return { className: '' };
  const style: React.CSSProperties = {
    ...(s.size ? { fontSize: s.size } : {}), ...(s.weight ? { fontWeight: s.weight } : {}), ...(s.color ? { color: s.color } : {}),
    ...(s.font ? { fontFamily: `var(--font-${s.font})` } : {}),
    ...(s.tracking !== undefined ? { letterSpacing: `${s.tracking}em` } : {}),
    ...(s.leading ? { lineHeight: s.leading } : {}),
    ...(s.case === 'upper' ? { textTransform: 'uppercase' } : s.case === 'lower' || s.case === 'sentence' ? { textTransform: 'lowercase' } : s.case === 'title' ? { textTransform: 'capitalize' } : {})
  };
  return { style: Object.keys(style).length ? style : undefined, className: [s.case === 'sentence' ? 'tc-sentence' : '', s.ts ? `ts-${s.ts}` : ''].filter(Boolean).join(' ') };
}
