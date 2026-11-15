// Photographer: collections of on-brand images. A collection is a file in the apps table (app 'photographer'); its
// images live in storage, and the collection keeps each one's path, where it came from, the art director's review
// and any edit (crop and effect layers, kept so it can be changed again from the original). Safe in the browser.
import type { EffectLayer } from '@/lib/effects/model';

export type Crop = { aspect: string; zoom: number; x: number; y: number };
export type Review = { score: number; verdict: 'on' | 'close' | 'off'; summary: string; good: string[]; fix: string[]; at: string };
export type Photo = {
  id: string; path: string; name: string; w: number; h: number;
  source: 'upload' | 'stock' | 'generated' | 'edit';
  /** For a generated image, what was asked for */
  prompt?: string;
  /** An edited image: the image it was made from, and the edit, so it can be opened again */
  from?: string; original?: string; edit?: { crop: Crop; layers: EffectLayer[] };
  review?: Review;
  added: string; by?: string;
  /** Signed link, added when the collection is opened; never saved */
  url?: string; originalUrl?: string;
};
export type Collection = { images: Photo[]; cover?: string };

export const ASPECTS: { id: string; label: string; r: number | null }[] = [
  { id: 'original', label: 'Original', r: null }, { id: '1:1', label: '1:1', r: 1 }, { id: '4:5', label: '4:5', r: 4 / 5 }, { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '9:16', label: '9:16', r: 9 / 16 }, { id: '3:2', label: '3:2', r: 3 / 2 }
];
export const NO_CROP: Crop = { aspect: 'original', zoom: 1, x: 0, y: 0 };
/** The part of the picture a crop keeps, in its own pixels */
export function cropRect(w: number, h: number, c: Crop) {
  const r = ASPECTS.find((a) => a.id === c.aspect)?.r ?? w / h;
  let cw = w, ch = w / r; if (ch > h) { ch = h; cw = h * r; }
  cw /= c.zoom; ch /= c.zoom;
  const cx = w / 2 + (c.x * (w - cw)) / 2, cy = h / 2 + (c.y * (h - ch)) / 2;
  return { x: Math.round(cx - cw / 2), y: Math.round(cy - ch / 2), w: Math.round(cw), h: Math.round(ch) };
}
export const strip = (c: Collection): Collection => ({ ...c, images: (c.images || []).map(({ url, originalUrl, ...p }) => p) }); // eslint-disable-line @typescript-eslint/no-unused-vars
export const VERDICT: Record<Review['verdict'], string> = { on: 'On brand', close: 'Close', off: 'Off brief' };
