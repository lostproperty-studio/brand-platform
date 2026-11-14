// Director's file format: a short video as a list of scenes, each with its picture (generated, uploaded or a brand
// card), captions and an optional logo, plus a sound layer. Safe to import in client components.

export type Aspect = '9:16' | '16:9' | '1:1' | '4:5';
export const ASPECTS: { id: Aspect; label: string; use: string; w: number; h: number }[] = [
  { id: '9:16', label: 'Vertical', use: 'Reels, Stories, TikTok', w: 9, h: 16 },
  { id: '4:5', label: 'Portrait', use: 'Instagram feed', w: 4, h: 5 },
  { id: '1:1', label: 'Square', use: 'Feeds', w: 1, h: 1 },
  { id: '16:9', label: 'Landscape', use: 'Web, YouTube, screens', w: 16, h: 9 }
];
export const isAspect = (a: string): a is Aspect => ASPECTS.some((x) => x.id === a);

export type MediaRef = { path: string; kind: 'image' | 'video' | 'audio'; url?: string };

/** Where a scene's picture comes from: a prompt for an image or video model, footage the team uploads, or a plain
 *  brand-colour card for type and logo */
export type Source =
  | { kind: 'generate'; model: 'image' | 'video'; prompt: string }
  | { kind: 'upload'; ask: string }
  | { kind: 'card' };

export type Placement = 'top-left' | 'top' | 'top-right' | 'centre' | 'bottom-left' | 'bottom' | 'bottom-right';
export type Size = 'S' | 'M' | 'L' | 'XL';
export type TextAnim = 'none' | 'fade' | 'rise' | 'wipe' | 'type' | 'pop';
export const TEXT_ANIMS: { id: TextAnim; label: string }[] = [
  { id: 'fade', label: 'Fade' }, { id: 'rise', label: 'Rise' }, { id: 'wipe', label: 'Wipe' }, { id: 'type', label: 'Type on' }, { id: 'pop', label: 'Pop' }, { id: 'none', label: 'Cut' }
];

export type Caption = {
  id: string; text: string;
  /** Seconds from the start of its scene */
  start: number; end: number;
  position: 'top' | 'centre' | 'bottom' | 'lower-third';
  align: 'left' | 'centre' | 'right';
  size: Size;
  /** A brand font role: display, body, caption… */
  font: string;
  colour: string;
  /** A box behind the text, or none */
  box: string | null;
  anim: TextAnim;
};

export type Scene = {
  id: string; title: string;
  /** Seconds */
  duration: number;
  /** What happens in the shot, from the storyboard */
  note: string;
  source: Source;
  media?: MediaRef;
  /** Card colour, and the ground behind media that doesn't fill the frame */
  background: string;
  fit: 'cover' | 'contain';
  /** Slow movement for stills */
  motion: 'none' | 'push' | 'pull' | 'pan';
  logo?: { placement: Placement; size: Size; tone: 'dark' | 'light' } | null;
  captions: Caption[];
};

export type Track = {
  id: string; kind: 'music' | 'sfx'; name: string;
  /** What to ask Krea for, when it's generated */
  prompt?: string;
  media?: MediaRef;
  /** Seconds from the start of the video (sound effects) */
  at: number;
  volume: number;
};

export type Brief = { prompt: string; length: number; aspect: Aspect; mood?: string };

export type Doc = { v: 1; aspect: Aspect; brief?: Brief; logline?: string; scenes: Scene[]; audio: Track[] };

export type FileRow = { id: string; title: string; aspect: Aspect; status: 'plan' | 'edit'; data: Doc; thumb: string | null; updated_at: string; created_at?: string };

export type BrandKit = {
  client: string;
  colours: { name: string; hex: string; role?: string }[];
  fonts: { role: string; label: string; name: string }[];
  logos: { name: string; url: string; light: boolean }[];
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const emptyDoc = (aspect: Aspect): Doc => ({ v: 1, aspect, scenes: [], audio: [] });

export const total = (d: Doc) => d.scenes.reduce((s, x) => s + x.duration, 0);

/** Each scene's start time */
export const starts = (d: Doc) => { let t = 0; return d.scenes.map((s) => { const at = t; t += s.duration; return at; }); };

/** The scene playing at time t, and how far into it */
export function sceneAt(d: Doc, t: number): { scene: Scene; index: number; local: number } | null {
  let at = 0;
  for (let i = 0; i < d.scenes.length; i++) {
    const s = d.scenes[i];
    if (t < at + s.duration || i === d.scenes.length - 1) return { scene: s, index: i, local: clamp(t - at, 0, s.duration) };
    at += s.duration;
  }
  return null;
}

/** Brand colours picked for the defaults: a dark and a light, falling back to black and white */
export function brandPair(kit: BrandKit) {
  const lum = (h: string) => { const m = h.replace('#', '').match(/.{2}/g); if (!m) return 0.5; const [r, g, b] = m.map((x) => parseInt(x, 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const sorted = [...kit.colours].filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).sort((a, b) => lum(a.hex) - lum(b.hex));
  return { dark: sorted[0]?.hex || '#111111', light: sorted[sorted.length - 1]?.hex || '#ffffff', accent: sorted.find((c) => lum(c.hex) > 0.15 && lum(c.hex) < 0.85)?.hex || sorted[0]?.hex || '#111111' };
}

export function newCaption(kit: BrandKit, over: Partial<Caption> = {}): Caption {
  const { light } = brandPair(kit);
  return { id: uid(), text: 'Your words here', start: 0.3, end: 3, position: 'bottom', align: 'centre', size: 'M', font: kit.fonts.find((f) => f.role === 'display')?.role || kit.fonts[0]?.role || 'display', colour: light, box: null, anim: 'rise', ...over };
}

export function newScene(kit: BrandKit, over: Partial<Scene> = {}): Scene {
  const { dark } = brandPair(kit);
  return { id: uid(), title: 'New scene', duration: 3, note: '', source: { kind: 'generate', model: 'video', prompt: '' }, background: dark, fit: 'cover', motion: 'push', logo: null, captions: [], ...over };
}

/** Sequence templates: ready-made scenes in the brand's colours, type and logo */
export const TEMPLATES: { id: string; name: string; about: string; make: (kit: BrandKit) => Scene }[] = [
  { id: 'title', name: 'Title card', about: 'A headline on a brand colour', make: (k) => { const p = brandPair(k); return newScene(k, { title: 'Title', duration: 2.5, source: { kind: 'card' }, background: p.dark, motion: 'none', captions: [newCaption(k, { text: 'A headline', position: 'centre', size: 'XL', colour: p.light, start: 0.2, end: 2.4, anim: 'rise' })] }); } },
  { id: 'footage', name: 'Footage + caption', about: 'Full-bleed shot with a lower-third line', make: (k) => newScene(k, { title: 'Shot', duration: 3, captions: [newCaption(k, { text: 'A line about this moment', position: 'lower-third', size: 'M', font: k.fonts.find((f) => f.role === 'body')?.role || k.fonts[0]?.role || 'body', anim: 'fade' })] }) },
  { id: 'full', name: 'Full bleed', about: 'Just the picture', make: (k) => newScene(k, { title: 'Shot', duration: 2.5 }) },
  { id: 'quote', name: 'Statement', about: 'A sentence that types on', make: (k) => { const p = brandPair(k); return newScene(k, { title: 'Statement', duration: 3.5, source: { kind: 'card' }, background: p.light, motion: 'none', captions: [newCaption(k, { text: 'Something worth saying, in a sentence.', position: 'centre', size: 'L', align: 'left', colour: p.dark, start: 0.2, end: 3.4, anim: 'type' })] }); } },
  { id: 'end', name: 'Logo end card', about: 'The logo, centred, to close', make: (k) => { const p = brandPair(k); return newScene(k, { title: 'End card', duration: 2.5, source: { kind: 'card' }, background: p.dark, motion: 'none', logo: { placement: 'centre', size: 'L', tone: 'light' } }); } }
];

export const SIZE_SCALE: Record<Size, number> = { S: 0.045, M: 0.065, L: 0.09, XL: 0.13 };
export const LOGO_SCALE: Record<Size, number> = { S: 0.18, M: 0.28, L: 0.42, XL: 0.6 };

/** A caption's look at a moment in its scene: opacity, transform, clip, and how many letters show (for Type on) */
export function captionFrame(c: Caption, local: number): { visible: boolean; style: Record<string, string | number>; chars?: number } {
  if (local < c.start || local > c.end) return { visible: false, style: {} };
  const IN = 0.5, OUT = 0.3;
  const pin = clamp((local - c.start) / IN, 0, 1), pout = clamp((c.end - local) / OUT, 0, 1);
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  const a = ease(pin), o = Math.min(a, pout);
  switch (c.anim) {
    case 'fade': return { visible: true, style: { opacity: o } };
    case 'rise': return { visible: true, style: { opacity: o, transform: `translateY(${(1 - a) * 0.6}em)` } };
    case 'wipe': return { visible: true, style: { opacity: pout, clipPath: `inset(0 ${(1 - a) * 100}% 0 0)` } };
    case 'pop': return { visible: true, style: { opacity: o, transform: `scale(${0.85 + 0.15 * ease(clamp((local - c.start) / 0.35, 0, 1))})` } };
    case 'type': { const speed = 28; return { visible: true, style: { opacity: pout }, chars: Math.floor((local - c.start) * speed) }; }
    default: return { visible: true, style: {} };
  }
}

/** Slow camera move on stills, by progress through the scene (0–1) */
export function motionTransform(m: Scene['motion'], p: number) {
  if (m === 'push') return `scale(${1 + 0.08 * p})`;
  if (m === 'pull') return `scale(${1.08 - 0.08 * p})`;
  if (m === 'pan') return `scale(1.1) translateX(${(0.5 - p) * 6}%)`;
  return 'none';
}

/** Scenes that still need their picture */
export const missing = (d: Doc) => d.scenes.filter((s) => s.source.kind !== 'card' && !s.media);
