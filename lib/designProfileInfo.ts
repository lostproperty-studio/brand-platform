// The design profile's shape and labels, shared by the server (reading the guidelines) and the studio's editor.

export type Source = { from: 'guidelines'; chapter: string; evidence: string } | { from: 'judgement'; why: string } | { from: 'studio' };
export type Setting<T> = { value: T; source: Source; locked?: boolean; off?: boolean };
export type Profile = {
  at: string; chapters: string[]; frames: number;
  settings: {
    accent: Setting<{ hex: string; use: 'sparing' | 'moderate' | 'bold' }>;
    ground: Setting<'light' | 'dark'>;
    corners: Setting<{ controls: number; cards: number }>;
    headlineCase: Setting<'sentence' | 'upper' | 'lower' | 'title'>;
    headlineWeight: Setting<number>;
    headlineTracking: Setting<number>;
    displayScale: Setting<'restrained' | 'large' | 'huge'>;
    bodySize: Setting<number>;
    grid: Setting<{ columns: number; marginPct: number; gutter: number }>;
    density: Setting<'airy' | 'balanced' | 'dense'>;
    buttons: Setting<'solid' | 'outline' | 'underline'>;
    imagery: Setting<{ treatment: 'full-bleed' | 'framed' | 'cutout' | 'mixed'; ratio: '4:5' | '1:1' | '3:2' | '16:9'; corners: boolean }>;
    rules: Setting<boolean>;
    devices: Setting<string[]>;
    dos: Setting<string[]>;
    donts: Setting<string[]>;
  };
};
export type SettingKey = keyof Profile['settings'];

export const SETTING_INFO: Record<SettingKey, { label: string; help: string }> = {
  accent: { label: 'Accent colour', help: 'The lead colour and how much of it a page carries.' },
  ground: { label: 'Default ground', help: 'Whether pages start light or dark.' },
  corners: { label: 'Corners', help: 'Radius of buttons and inputs, and of cards and images (px).' },
  headlineCase: { label: 'Headline case', help: 'How headlines are set.' },
  headlineWeight: { label: 'Headline weight', help: '100–900.' },
  headlineTracking: { label: 'Headline tracking', help: 'Letter spacing in em (−0.05 to 0.1).' },
  displayScale: { label: 'Display size', help: 'How big the biggest type gets.' },
  bodySize: { label: 'Body size', help: 'Reading text size in px.' },
  grid: { label: 'Grid', help: 'Columns, outer margin (% of width) and gutter (px).' },
  density: { label: 'Density', help: 'How much space between things.' },
  buttons: { label: 'Buttons', help: 'How the main action looks.' },
  imagery: { label: 'Imagery', help: 'How photos are placed and cropped.' },
  rules: { label: 'Hairline rules', help: 'Whether thin lines divide content.' },
  devices: { label: 'Graphic devices', help: 'Recurring shapes or motifs the layouts should use.' },
  dos: { label: 'Do', help: 'Visual rules to follow.' },
  donts: { label: 'Don’t', help: 'Visual rules never to break.' }
};


/** A setting's value in words */
export const showSetting = (v: unknown, k?: string): string => {
  const o = v as Record<string, unknown>;
  if (k === 'accent') return `${String(o.hex).toUpperCase()}, used ${o.use}ly`;
  if (k === 'corners') return Number(o.controls) >= 999 ? `Pill controls · ${o.cards}px cards` : `${o.controls}px controls · ${o.cards}px cards`;
  if (k === 'grid') return `${o.columns} columns · ${o.marginPct}% margins · ${o.gutter}px gutter`;
  if (k === 'imagery') return `${o.treatment} · ${o.ratio} · ${o.corners ? 'rounded' : 'square'} corners`;
  if (k === 'headlineTracking') return `${v}em`;
  if (k === 'bodySize') return `${v}px`;
  if (k === 'headlineCase') return `${v} case`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return Array.isArray(v) ? (v.length ? v.join('; ') : 'none') : typeof v === 'object' && v ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${x}`).join(', ') : String(v);
};

