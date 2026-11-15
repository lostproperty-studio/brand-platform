import { BUILDS, CONTROLS, EASES } from '@/lib/motion/model';

// What Claude knows about motion settings, shared by the Motion tab's routes: chat, directions, import.

/** The settings Claude can set, as a JSON schema, for logos or type */
export function presetSchema(target: 'logo' | 'type') {
  return {
    type: 'object',
    properties: {
      build: { type: 'string', enum: target === 'logo' ? BUILDS : BUILDS.filter((b) => b !== 'draw'), description: 'The main reveal. wipe: a hard-edged mask from one side. draw: the outlines draw on, then the fill comes up (logos only). fade, rise, scale, blur: the part arrives that way. none: a cut.' },
      from: { type: 'string', enum: ['left', 'right', 'top', 'bottom'], description: 'Where a wipe starts or movement comes from' },
      split: { type: 'string', enum: target === 'logo' ? ['whole', 'parts'] : ['whole', 'lines', 'words', 'letters'] },
      order: { type: 'string', enum: ['left', 'right', 'centre', 'top'] },
      length: { type: 'number', description: 'Seconds overall, 0.6 to 8' },
      wipe: { type: 'number', description: 'Each part’s build in ms, at refLength' },
      stagger: { type: 'number', description: 'ms between parts, at refLength' },
      delay: { type: 'number', description: 'ms before the first part' },
      drift: { type: 'number', description: 'How far the whole thing glides while it builds, % of its width, 0 to 40' },
      driftTo: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
      ease: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: 'cubic-bezier x1 y1 x2 y2' },
      out: { type: 'string', enum: ['none', 'mirror', 'fade'], description: 'Stay, reverse out, or fade out' },
      opacityFrom: { type: 'number', description: 'Opacity each part starts at, 0 to 1. Mixes with any build.' },
      scaleFrom: { type: 'number', description: 'Size each part starts at, 0.2 to 1.6 (1 = none). Mixes with any build.' },
      blurFrom: { type: 'number', description: 'Blur each part starts with, % of the logo height, 0 to 20. Mixes with any build.' },
      offset: { type: 'number', description: 'How far each part travels in from `from`, % of its size, 0 to 200. Mixes with any build.' },
      ...(target === 'logo' ? { line: { type: 'number', description: 'Drawn on line weight, % of logo height, 0.1 to 6' }, scale: { type: 'number', description: 'Size in a video frame, % of frame width, 8 to 100' } } : {}),
      refLength: { type: 'number', description: 'Keep equal to length' }
    }
  };
}

export const controlEnum = { type: 'array', items: { type: 'string', enum: CONTROLS.map((c) => c.id) } };

export const MOTION_TASTE = `Taste: restrained, precise, confident, made for brands (Lost Property works across luxury, hospitality and culture). Channels combine: a reveal (wipe or drawn on) with opacity, scale, blur and movement, and the whole logo can drift while it builds. Prefer few channels used well. Eases available: ${EASES.map((e) => `${e.label} [${e.ease.join(', ')}]`).join('; ')}; any cubic-bezier is fine. Timings are in ms at refLength and scale with length; set refLength equal to length. Qualities the team can play with: ${CONTROLS.map((c) => `${c.id} (${c.about})`).join(', ')}.`;
