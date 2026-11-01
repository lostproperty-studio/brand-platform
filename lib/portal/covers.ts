import type { Guide, GuideChapter } from '@/lib/portal/guide';

// What a chapter's cover on the home page shows, worked out from the chapter itself. The studio can upload a
// thumbnail instead, or change the type sample and the tone-of-voice words.

export type CoverKind = 'upload' | 'slide' | 'logo' | 'type' | 'colour' | 'grid' | 'imagery' | 'voice' | 'image' | 'title';

export function coverKind(c: GuideChapter, index: number): CoverKind {
  if (c.thumb) return 'upload';
  const t = `${c.key || ''} ${c.title} ${c.kicker}`.toLowerCase();
  if (/logo|wordmark|symbol|marque|lock-?up|emblem/.test(t)) return 'logo';
  if (/typo|typeface|\btype\b|font/.test(t)) return 'type';
  if (/colou?r|palette/.test(t)) return 'colour';
  if (/grid|layout|composition/.test(t)) return 'grid';
  if (/imag|photo|art direction|film/.test(t)) return 'imagery';
  if (/voice|tone|verbal|writing|copy/.test(t)) return 'voice';
  if (index === 0 && c.blocks.some((b) => b.original || b.backdrop)) return 'slide';
  return c.blocks.some((b) => b.backdrop || b.media?.length) ? 'image' : 'title';
}

/** Lowercase when the brand writes its own titles in lowercase (a stylistic choice worth keeping). */
export function typeSample(c: GuideChapter, g: Guide) {
  if (c.thumbSample) return c.thumbSample;
  const titles = g.chapters.map((x) => x.title).filter((x) => /[a-z]/i.test(x));
  const lower = titles.filter((x) => x === x.toLowerCase()).length;
  return titles.length && lower / titles.length > 0.6 ? 'abc' : 'Abc';
}

/** Three key words for a tone of voice cover: the studio's, or short headlines from the chapter. */
export function voiceWords(c: GuideChapter) {
  if (c.thumbWords) return c.thumbWords.split(/[,\n]/).map((w) => w.trim()).filter(Boolean).slice(0, 3);
  const words = [...new Set(c.blocks.flatMap((b) => [b.heading, b.eyebrow]).filter(Boolean).map((h) => h!.replace(/\s+/g, ' ').trim())
    .filter((h) => h.length <= 22 && h.split(' ').length <= 3 && h.toLowerCase() !== c.title.toLowerCase() && !/^\d+$/.test(h)))];
  return (words.length >= 2 ? words : c.title.split(' ')).slice(0, 3);
}

/** Photos from the chapter for the art direction carousel. */
export const chapterPhotos = (c: GuideChapter) => [...new Set(c.blocks.flatMap((b) => [...(b.media || []).filter((m) => m.kind === 'photo'), ...(b.backdrop?.kind === 'photo' ? [b.backdrop] : [])]).map((m) => m.path))].slice(0, 8);

/** The one picture for a 'slide' or 'image' cover. */
export const chapterImage = (c: GuideChapter, slide: boolean) => { for (const b of c.blocks) { const m = b.backdrop || b.media?.[0]; if (m) return m.path; if (slide && b.original) return b.original; } return null; };

/** Every stored image the covers need, so they can be signed in one go. */
export function coverPaths(g: Guide) {
  return g.chapters.flatMap((c, i) => { const k = coverKind(c, i); return k === 'upload' ? [c.thumb!] : k === 'imagery' ? chapterPhotos(c) : k === 'slide' || k === 'image' ? [chapterImage(c, k === 'slide')].filter(Boolean) as string[] : []; });
}
