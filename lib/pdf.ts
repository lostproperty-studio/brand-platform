// The guidelines as a PDF: 16:9 slides built from the guide, with a title slide, a divider for each chapter and a page
// for each section. The studio sets the templates and margins in the PDF tab; the content always comes from the guide.

export const SLIDE_W = 1920, SLIDE_H = 1080;
export type LogoPlace = 'none' | 'top-left' | 'top-right' | 'centre' | 'bottom-left' | 'bottom-right';
export type PdfSettings = {
  /** Space around the content on every slide, in pixels of a 1920×1080 slide */
  margins: { top: number; right: number; bottom: number; left: number };
  title: { heading?: string; sub?: string; meta?: string; bg: string; ink: string; align: 'left' | 'centre'; place: 'top' | 'centre' | 'bottom'; logo: LogoPlace; image?: string };
  divider: { bg: string; ink: string; align: 'left' | 'centre'; place: 'top' | 'centre' | 'bottom'; number: boolean; intro: boolean; logo: LogoPlace };
  section: { bg: string; ink: string; header: boolean; pageNumbers: boolean; logo: LogoPlace; place: 'top' | 'centre' };
  /** Changed words for a chapter's divider */
  dividers?: Record<string, { title?: string; intro?: string }>;
  /** Chapters and sections left out of the PDF */
  skip?: string[];
};

export function readPdf(content: unknown, colours: { hex: string }[] = []): PdfSettings {
  const saved = ((content as { pdf?: Partial<PdfSettings> } | null)?.pdf || {}) as Partial<PdfSettings>;
  // Defaults from the brand: its first colour for the covers, paper white for the pages
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const brand = colours.find((c) => /^#[0-9a-f]{6}$/i.test(c.hex))?.hex || '#111111';
  const on = (h: string) => (lum(h) > 0.6 ? '#111111' : '#ffffff');
  return {
    margins: { top: 96, right: 120, bottom: 96, left: 120, ...(saved.margins || {}) },
    title: { bg: brand, ink: on(brand), align: 'left', place: 'bottom', logo: 'top-left', ...(saved.title || {}) },
    divider: { bg: brand, ink: on(brand), align: 'left', place: 'bottom', number: true, intro: true, logo: 'none', ...(saved.divider || {}) },
    section: { bg: '#ffffff', ink: '#111111', header: true, pageNumbers: true, logo: 'none', place: 'top', ...(saved.section || {}) },
    dividers: saved.dividers || {}, skip: saved.skip || []
  };
}

export type SlideRef = { kind: 'title' } | { kind: 'divider'; chapter: string; n: number } | { kind: 'section'; chapter: string; block: string };
