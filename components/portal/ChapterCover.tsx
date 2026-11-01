import type { Guide, GuideChapter } from '@/lib/portal/guide';
import { chapterImage, chapterPhotos, coverKind, typeSample, voiceWords } from '@/lib/portal/covers';

type Colour = { name: string; hex: string };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** Paper and ink from the palette: the lightest and darkest colours, or white and black. */
export function paperInk(colours: Colour[]) {
  const ok = colours.filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex));
  const sorted = [...ok].sort((a, b) => lum(b.hex) - lum(a.hex));
  const paper = sorted[0] && lum(sorted[0].hex) > 0.85 ? sorted[0].hex : '#FFFFFF';
  const ink = sorted.at(-1) && lum(sorted.at(-1)!.hex) < 0.2 ? sorted.at(-1)!.hex : '#000000';
  return { paper, ink };
}

// A generated cover that previews what's in the chapter: the logo, the typeface, the palette, the grid,
// a slow carousel of the photography, or the tone of voice in three words.
export function ChapterCover({ c, i, g, urls, colours, logoUrl }: { c: GuideChapter; i: number; g: Guide; urls: Record<string, string>; colours: Colour[]; logoUrl: string | null }) {
  const k = coverKind(c, i);
  const { paper, ink } = paperInk(colours);
  const base = { background: paper, color: ink };
  const img = (p: string | null) => (p && urls[p] ? <img src={urls[p]} alt="" loading="lazy" /> : null);
  switch (k) {
    case 'upload': case 'slide': case 'image': {
      const el = img(k === 'upload' ? c.thumb! : chapterImage(c, k === 'slide'));
      if (el) return <div className="cc cc-img">{el}</div>;
      break;
    }
    case 'logo':
      if (logoUrl) return <div className="cc cc-logo" style={base}><img src={logoUrl} alt="" /></div>;
      break;
    case 'type':
      return <div className="cc cc-type" style={base}><span style={{ fontFamily: 'var(--pt-display)' }}>{typeSample(c, g)}</span></div>;
    case 'colour':
      if (colours.length) return <div className="cc cc-colour">{colours.slice(0, 8).map((x) => <i key={x.hex} style={{ background: x.hex }} />)}</div>;
      break;
    case 'grid':
      return <div className="cc cc-grid" style={{ backgroundColor: paper, color: ink, backgroundImage: `radial-gradient(${ink} 1.2px, transparent 1.4px)` }} />;
    case 'imagery': {
      const photos = chapterPhotos(c).filter((p) => urls[p]);
      if (photos.length) return <div className="cc cc-reel" style={base}><div className="cc-strip" style={{ animationDuration: `${Math.max(24, photos.length * 8)}s` }}>{[...photos, ...photos].map((p, n) => <span key={n}><img src={urls[p]} alt="" loading="lazy" /></span>)}</div></div>;
      break;
    }
    case 'voice':
      return <div className="cc cc-voice" style={base}>{voiceWords(c).map((w) => <span key={w} style={{ fontFamily: 'var(--pt-display)' }}>{w}</span>)}</div>;
  }
  return <div className="cc cc-title" style={base}><span style={{ fontFamily: 'var(--pt-display)' }}>{c.title}</span></div>;
}
