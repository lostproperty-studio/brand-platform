// Effects: layers that sit on top of footage and images, in Director (an effects track on the timeline) and
// Photographer (an image's edit). Each layer is a stack of effects, each with a blend mode, an opacity and its own
// settings. Lost Property sets up presets (combinations with set values); clients add presets, the studio can open
// any effect and change everything. Pure data, safe on the server and in the browser; drawing is in ./render.ts.

export type EffectKind = 'noise' | 'rgbShift' | 'frameDrop' | 'vignette' | 'starGlow' | 'bloom' | 'halation' | 'grade' | 'levels' | 'exposure' | 'contrast';
export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'softLight', 'add', 'lighten', 'darken', 'colourDodge', 'difference'] as const;
export type Blend = (typeof BLENDS)[number];
export const BLEND_LABEL: Record<Blend, string> = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', softLight: 'Soft light', add: 'Add', lighten: 'Lighten', darken: 'Darken', colourDodge: 'Colour dodge', difference: 'Difference' };

/** A setting's value: a number, an on/off, a colour (#hex), a choice, or a pair (an xy point, or a colour wheel's hue and amount) */
export type Value = number | boolean | string | [number, number];
export type Effect = { id: string; kind: EffectKind; on: boolean; blend: Blend; opacity: number; params: Record<string, Value> };
/** A layer: one or more effects, applied together, with the layer's own strength. From a preset, or built by the studio. */
export type EffectLayer = { id: string; name: string; preset?: string; on: boolean; opacity: number; effects: Effect[] };

export type Param =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; def: number; digits?: number }
  | { key: string; label: string; kind: 'toggle'; def: boolean }
  | { key: string; label: string; kind: 'colour'; def: string }
  | { key: string; label: string; kind: 'xy'; def: [number, number] }
  | { key: string; label: string; kind: 'wheel'; def: [number, number] }
  | { key: string; label: string; kind: 'steps'; options: string[]; def: number };
/** A collapsible group of settings, like colour grading's zones */
export type Group = { title: string; params: Param[] };
export type EffectDef = { kind: EffectKind; name: string; about: string; params: Param[]; groups?: Group[] };

const r = (key: string, label: string, min: number, max: number, step: number, def: number, digits = 2): Param => ({ key, label, kind: 'range', min, max, step, def, digits });
const zone = (z: string, label: string): Group => ({ title: label, params: [{ key: `${z}.tint`, label: 'Tint', kind: 'wheel', def: [0, 0] }, r(`${z}.exposure`, 'Exposure', -2, 2, 0.01, 0), r(`${z}.saturation`, 'Saturation', 0, 2, 0.01, 1)] });

export const EFFECTS: EffectDef[] = [
  { kind: 'noise', name: 'Noise', about: 'Grain, weighted by tone', params: [r('amount', 'amount', 0, 3, 0.01, 0.9), r('size', 'size', 0.5, 5, 0.01, 1), r('floor', 'floor', 0, 0.5, 0.01, 0.02), r('chroma', 'chroma', 0, 1, 0.01, 0.8), r('shadow', 'shadow', 0, 1, 0.01, 1), r('midtone', 'mid-tone', 0, 1, 0.01, 0.5), r('highlight', 'highlight', 0, 1, 0.01, 0.8), r('speed', 'speed', 0, 60, 1, 0, 0)] },
  { kind: 'rgbShift', name: 'RGB shift', about: 'Red and blue pulled apart from a centre', params: [r('red', 'red offset', 0, 0.2, 0.001, 0.02, 3), r('blue', 'blue offset', 0, 0.2, 0.001, 0.02, 3), r('stretch', 'stretch ratio', 0.2, 1.6, 0.01, 1.3), { key: 'centre', label: 'aberration centre', kind: 'xy', def: [0, 0] }] },
  { kind: 'frameDrop', name: 'Frame drop', about: 'Holds frames, like low frame-rate footage', params: [r('fps', 'FPS', 1, 30, 1, 8, 0), r('irregularity', 'Irregularity', 0, 1, 0.01, 0.35), r('ghost', 'Opacity', 0, 1, 0.01, 0)] },
  { kind: 'vignette', name: 'Vignette', about: 'Darkens or tints the edges', params: [{ key: 'shape', label: 'Border Shape', kind: 'steps', options: ['Oval', 'Rounded', 'Rectangle'], def: 0 }, r('size', 'size', 0, 2, 0.01, 0.65), r('anamorphism', 'anamorphism', 0, 4, 0.01, 1), r('rotation', 'rotation', -180, 180, 0.1, 0, 1), { key: 'centre', label: 'centre', kind: 'xy', def: [0, 0] }, r('softness', 'softness', 0, 1, 0.01, 1), r('transparency', 'transparency', 0, 1, 0.01, 1), { key: 'colour', label: 'colour', kind: 'colour', def: '#000000' }] },
  { kind: 'starGlow', name: 'Star glow', about: 'Streaks of light from the brightest points', params: [r('threshold', 'threshold', 0, 2, 0.01, 0.5), r('knee', 'knee', 0, 1, 0.01, 0.05), r('intensity', 'intensity', 0, 4, 0.01, 0.5), r('boost', 'highlight boost', 0, 4, 0.01, 0), r('streaks', 'streaks', 1, 8, 1, 3, 0), r('samples', 'sample count', 4, 64, 1, 30, 0), r('length', 'length', 0, 200, 0.1, 80, 1), r('alternate', 'alternate', 0, 1, 0.01, 1), r('falloff', 'falloff', 0, 1, 0.01, 0.45)] },
  { kind: 'bloom', name: 'Bloom', about: 'A soft glow around bright areas', params: [r('threshold', 'threshold', 0, 2, 0.01, 0.8), r('intensity', 'intensity', 0, 5, 0.01, 1.5), r('knee', 'knee', 0, 1, 0.01, 0.4), r('factor', 'bloom factor', 0, 1, 0.01, 0.6), { key: 'mode', label: 'blend mode', kind: 'steps', options: ['Add', 'Screen'], def: 0 }, { key: 'tonemapper', label: 'tonemapper', kind: 'steps', options: ['None', 'Reinhard', 'Filmic'], def: 0 }] },
  { kind: 'halation', name: 'Halation', about: 'Film’s warm red glow bleeding round highlights', params: [r('threshold', 'threshold', 0, 1, 0.01, 0.65), r('knee', 'knee', 0, 1, 0.01, 0.2), r('radius', 'radius', 0, 1, 0.01, 0.5), r('intensity', 'intensity', 0, 3, 0.01, 0.8), { key: 'tint', label: 'tint', kind: 'colour', def: '#ff4a1c' }, r('saturation', 'saturation', 0, 1, 0.01, 1)] },
  { kind: 'grade', name: 'Colour grading', about: 'Tint, exposure and saturation, overall and by tone', params: [{ key: 'tint', label: 'Global tint', kind: 'wheel', def: [0, 0] }, r('exposure', 'Global Exposure', -3, 3, 0.01, 0), r('saturation', 'Global Saturation', 0, 2, 0.1, 1, 1)],
    groups: [zone('black', 'Black'), zone('shadow', 'Shadow'), zone('light', 'Light'), zone('highlight', 'Highlight'), zone('specular', 'Specular'), { title: 'Zones', params: [r('zones.width', 'Width', 0.05, 0.5, 0.01, 0.2), r('zones.balance', 'Balance', -0.5, 0.5, 0.01, 0), r('strength', 'Strength', 0, 1, 0.01, 1)] }] },
  { kind: 'levels', name: 'Levels', about: 'Input and output black and white points, and gamma', params: [r('inBlack', 'input black', 0, 1, 0.01, 0), r('inWhite', 'input white', 0, 1, 0.01, 1), r('gamma', 'gamma', 0.1, 3, 0.01, 1), r('outBlack', 'output black', 0, 1, 0.01, 0), r('outWhite', 'output white', 0, 1, 0.01, 1)] },
  { kind: 'exposure', name: 'Exposure', about: 'Stops of light, with tone mapping', params: [r('exposure', 'exposure', -5, 5, 0.01, 0), r('gamma', 'gamma', 1, 3, 0.01, 2.2), r('gamut', 'gamut mapping', 0, 1, 0.01, 0), { key: 'reinhard', label: 'reinhard', kind: 'toggle', def: false }, { key: 'clipping', label: 'show clipping', kind: 'toggle', def: false }] },
  { kind: 'contrast', name: 'Contrast', about: 'An S-curve around a pivot', params: [r('strength', 'contrast strength', -1, 1, 0.1, 0.2, 1), r('pivot', 'pivot point', 0, 1, 0.01, 0.5), r('output', 'output mapping', 0, 1, 0.01, 1), r('gamma', 'gamma', 1, 3, 0.01, 2.2)] }
];
export const defOf = (k: EffectKind) => EFFECTS.find((e) => e.kind === k)!;
export const allParams = (d: EffectDef) => [...d.params, ...(d.groups || []).flatMap((g) => g.params)];

export const uid = () => Math.random().toString(36).slice(2, 10);
/** An effect at its default settings */
export function newEffect(kind: EffectKind, over: Partial<Record<string, Value>> = {}): Effect {
  const d = defOf(kind);
  return { id: uid(), kind, on: true, blend: 'normal', opacity: 100, params: { ...Object.fromEntries(allParams(d).map((p) => [p.key, p.def])), ...over } as Record<string, Value> };
}
/** A setting's value, or its default */
export function val<T extends Value>(e: Effect, key: string): T {
  if (key in e.params) return e.params[key] as T;
  return allParams(defOf(e.kind)).find((p) => p.key === key)?.def as T;
}
/** Random settings for an effect, within sensible ranges (the shuffle button) */
export function shuffle(e: Effect): Effect {
  const ps = allParams(defOf(e.kind));
  const pick = (p: Param): Value => {
    if (p.kind === 'range') { const span = (p.max - p.min) * 0.35, mid = Math.min(p.max, Math.max(p.min, p.def + (Math.random() - 0.5) * 2 * span)); return Math.round(mid / p.step) * p.step; }
    if (p.kind === 'toggle') return p.def;
    if (p.kind === 'colour') return p.def;
    if (p.kind === 'steps') return Math.floor(Math.random() * p.options.length);
    if (p.kind === 'wheel') return Math.random() < 0.5 ? p.def : [Math.round(Math.random() * 360), +(Math.random() * 0.4).toFixed(2)];
    return [+(Math.random() * 1.2 - 0.6).toFixed(2), +(Math.random() * 1.2 - 0.6).toFixed(2)];
  };
  return { ...e, params: Object.fromEntries(ps.map((p) => [p.key, pick(p)])) };
}
/** Whether any effect in the layers changes over time (grain that moves, frame drop), so video and play need redraws */
export const animated = (layers: EffectLayer[]) => layers.some((l) => l.on && l.effects.some((e) => e.on && (e.kind === 'frameDrop' || (e.kind === 'noise' && Number(val(e, 'speed')) > 0))));

// ---------- Lost Property's presets: combinations of effects with set values. Clients add these; the studio can
// change anything. Which presets each client's apps allow will be set in the studio later (for now, all of them).
export type Preset = { id: string; name: string; about: string; effects: { kind: EffectKind; blend?: Blend; opacity?: number; params?: Record<string, Value> }[] };
export const PRESETS: Preset[] = [
  { id: 'grain', name: 'Fine grain', about: 'Soft film grain, mostly in the mid-tones', effects: [{ kind: 'noise', params: { amount: 0.5, size: 1.2, chroma: 0.3, shadow: 0.7, midtone: 1, highlight: 0.4, speed: 24 } }] },
  { id: '35mm', name: '35mm', about: 'Halation, grain, a warm grade and a gentle vignette', effects: [
    { kind: 'halation', params: { threshold: 0.7, radius: 0.45, intensity: 0.7 } },
    { kind: 'grade', params: { tint: [40, 0.12], saturation: 0.9, 'shadow.tint': [200, 0.12], 'highlight.tint': [35, 0.15] } },
    { kind: 'noise', params: { amount: 0.8, size: 1.4, chroma: 0.5, speed: 24 } },
    { kind: 'vignette', opacity: 60, params: { size: 0.8, softness: 1 } }] },
  { id: 'night', name: 'Night glow', about: 'Bloom and star streaks on the lights', effects: [{ kind: 'bloom', params: { threshold: 0.7, intensity: 1.2 } }, { kind: 'starGlow', params: { threshold: 0.75, intensity: 0.6, streaks: 2, length: 70 } }] },
  { id: 'dream', name: 'Soft dream', about: 'Lifted blacks, a big soft bloom, less colour', effects: [{ kind: 'bloom', params: { threshold: 0.5, intensity: 0.9, factor: 0.9, tonemapper: 1 } }, { kind: 'levels', params: { outBlack: 0.08, outWhite: 0.97 } }, { kind: 'grade', params: { saturation: 0.75 } }] },
  { id: 'cinema', name: 'Cinema', about: 'Teal shadows, warm highlights, more contrast', effects: [{ kind: 'grade', params: { 'shadow.tint': [195, 0.25], 'black.tint': [200, 0.15], 'highlight.tint': [30, 0.2], saturation: 1.1 } }, { kind: 'contrast', params: { strength: 0.3 } }, { kind: 'vignette', opacity: 70, params: { size: 0.9, anamorphism: 1.6 } }] },
  { id: 'bleach', name: 'Bleach bypass', about: 'Hard contrast, silvery and desaturated', effects: [{ kind: 'grade', params: { saturation: 0.45 } }, { kind: 'contrast', params: { strength: 0.6 } }, { kind: 'levels', params: { inBlack: 0.05, inWhite: 0.92 } }] },
  { id: 'glitch', name: 'Glitch', about: 'Split channels, dropped frames, coarse grain', effects: [{ kind: 'rgbShift', params: { red: 0.03, blue: 0.03, centre: [-1, 0] } }, { kind: 'frameDrop', params: { fps: 10, irregularity: 0.5 } }, { kind: 'noise', params: { amount: 1.2, size: 2, chroma: 1, speed: 30 } }] },
  { id: 'stop', name: 'Stop motion', about: 'Footage held at 8 frames a second', effects: [{ kind: 'frameDrop', params: { fps: 8, irregularity: 0.35 } }] },
  { id: 'mono', name: 'Mono', about: 'Black and white, rich blacks', effects: [{ kind: 'grade', params: { saturation: 0 } }, { kind: 'contrast', params: { strength: 0.25 } }, { kind: 'noise', params: { amount: 0.6, chroma: 0 } }] }
];
/** A layer made from a preset */
export function presetLayer(p: Preset): EffectLayer {
  return { id: uid(), name: p.name, preset: p.id, on: true, opacity: 1, effects: p.effects.map((x) => ({ ...newEffect(x.kind, x.params), blend: x.blend || 'normal', opacity: x.opacity ?? 100 })) };
}
/** Keeps layers to what the platform knows, whatever was saved */
export function cleanLayers(v: unknown): EffectLayer[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).flatMap((l: Partial<EffectLayer>) => !l || !Array.isArray(l.effects) ? [] : [{ id: String(l.id || uid()), name: String(l.name || 'Effects').slice(0, 60), preset: l.preset ? String(l.preset) : undefined, on: l.on !== false, opacity: Math.min(1, Math.max(0, Number(l.opacity ?? 1))),
    effects: l.effects.slice(0, 16).filter((e) => e && EFFECTS.some((d) => d.kind === e.kind)).map((e) => ({ id: String(e.id || uid()), kind: e.kind, on: e.on !== false, blend: (BLENDS as readonly string[]).includes(e.blend) ? e.blend : 'normal', opacity: Math.min(100, Math.max(0, Number(e.opacity ?? 100))), params: (e.params && typeof e.params === 'object' ? e.params : {}) as Record<string, Value> })) }]);
}
