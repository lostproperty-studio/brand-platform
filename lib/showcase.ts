// The showcase: the brand at work, as a full-width scroll. Rows are either one 3:2 frame across the full width,
// or two 3:4 frames side by side. A frame holds an image, an MP4, or a code snippet (HTML, CSS and JS that runs
// in a sandboxed frame), with an optional caption.

export type FrameKind = 'empty' | 'image' | 'video' | 'code';
export type ShowcaseFrame = { kind: FrameKind; path?: string; code?: string; caption?: string; fit?: 'cover' | 'contain'; bg?: string };
export type ShowcaseRow = { id: string; layout: 'full' | 'half'; frames: ShowcaseFrame[] };
export type Showcase = { title?: string; intro?: string; rows: ShowcaseRow[] };

export const emptyFrame = (): ShowcaseFrame => ({ kind: 'empty' });
export const newRow = (layout: 'full' | 'half'): ShowcaseRow => ({ id: 'r-' + Math.random().toString(36).slice(2, 9), layout, frames: layout === 'full' ? [emptyFrame()] : [emptyFrame(), emptyFrame()] });

export function readShowcase(content: unknown): Showcase {
  const s = (content as { showcase?: Showcase } | null)?.showcase;
  return { title: s?.title, intro: s?.intro, rows: Array.isArray(s?.rows) ? s!.rows : [] };
}
export const showcasePaths = (s: Showcase) => s.rows.flatMap((r) => r.frames.map((f) => f.path)).filter(Boolean) as string[];
export const hasShowcase = (s?: Showcase | null) => !!s?.rows.some((r) => r.frames.some((f) => f.kind !== 'empty'));

/** A code snippet as a full page for a sandboxed frame: fills the frame, no margins. */
export const codeDoc = (code: string) => /<html[\s>]/i.test(code) ? code : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}</style></head><body>${code}</body></html>`;
