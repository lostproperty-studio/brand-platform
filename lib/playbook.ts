// The studio's playbook: how Lost Property writes guidelines, and what each tier of guide contains.
// The studio edits it on /studio/playbook. It feeds the scan, the review questions, gap drafts and the AI rules in every kit.

export type Tier = 'essentials' | 'standard' | 'comprehensive';
export const TIERS: { id: Tier; label: string; blurb: string }[] = [
  { id: 'essentials', label: 'Essentials', blurb: 'Smaller clients. The brand idea, the brand in action, and five to seven elements with basic usage and the assets.' },
  { id: 'standard', label: 'Standard', blurb: 'Medium clients. Three chapters: the brand, the system and in use, with principles, voice and every element one level deeper.' },
  { id: 'comprehensive', label: 'Comprehensive', blurb: 'Large clients. Strategy and voice as full chapters, expression levels, architecture, layout, specialist chapters and watchouts.' }
];
export const tierLabel = (t?: Tier) => TIERS.find((x) => x.id === t)?.label || 'Not set';
export const tierOf = (content: unknown): Tier | undefined => { const t = (content as { tier?: string } | null)?.tier; return TIERS.some((x) => x.id === t) ? (t as Tier) : undefined; };

export type SlotNeed = 'fixed' | 'optional' | 'none';
export type Slot = {
  id: string; title: string;
  /** Words that identify the slot in a chapter title or a section headline */
  match: string;
  /** Strategy is never drafted: if it's missing, it's called out as missing */
  strategy?: boolean;
  /** Needs the studio's artwork or judgement, so a gap is called out rather than written */
  needsArtwork?: boolean;
  need: Record<Tier, SlotNeed>;
  /** What the slot holds at each tier */
  depth: Record<Tier, string>;
};

export const DEFAULT_SLOTS: Slot[] = [
  { id: 'intro', title: 'Introduction', match: 'introduction, intro, about, brand idea, concept, story, nutshell, welcome', strategy: true,
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'One paragraph on what the brand is and the idea behind it.', standard: 'Introduction, the concept and the brand world, a page each.', comprehensive: 'Story, then the concept.' } },
  { id: 'purpose', title: 'Purpose, vision and mission', match: 'purpose, vision, mission, north star, proposition, platform, why we exist', strategy: true,
    need: { essentials: 'none', standard: 'optional', comprehensive: 'fixed' },
    depth: { essentials: '', standard: 'One big line for the purpose.', comprehensive: 'Purpose, vision, mission, proposition and platform, each on its own page with one big line.' } },
  { id: 'principles', title: 'Brand principles', match: 'principles, values, beliefs', strategy: true,
    need: { essentials: 'none', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: '', standard: 'Three numbered principles, a one-line headline and a short paragraph each.', comprehensive: 'Principles, plus a named range of expression levels (for example Hyper, Active, Calm) that every element follows.' } },
  { id: 'voice', title: 'Tone of voice', match: 'voice, tone, verbal, copy, writing, how we speak, how we write', strategy: true,
    need: { essentials: 'none', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: '', standard: 'Three or four verbal behaviours, or principles as We are / We aren’t pairs with an example line.', comprehensive: 'Guiding principles, pillars, flexibility, then long-, mid- and short-form examples.' } },
  { id: 'in-action', title: 'Brand in action', match: 'in action, in use, applications, touchpoints, brand world, examples', needsArtwork: true,
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'Three to eight full-bleed applications before any rules.', standard: 'Applications as their own chapter.', comprehensive: 'Applications per team or channel.' } },
  { id: 'overview', title: 'Design system overview', match: 'overview, design system, elements, toolkit, dna, at a glance',
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'Every element on one page so the system reads as a whole.', standard: 'Every element on one page, each with a line on its role.', comprehensive: 'The system’s DNA and the toolkit, each element with its role.' } },
  { id: 'logo', title: 'Logo', match: 'logo, wordmark, logotype, symbol, marque, lockup, emblem',
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'What it is and why, the layouts, the colourways.', standard: 'Plus size and position as a share of the canvas, and how it sits on imagery.', comprehensive: 'Plus architecture, co-branding, endorsement and motion behaviour.' } },
  { id: 'type', title: 'Typography', match: 'typography, typeface, type, font',
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'The typefaces, then three named styles with what each is for.', standard: 'Plus full specs per style (typeface, weight, tracking, line height, case, colour) and named layout modes.', comprehensive: 'Plus typesetting, system alternatives and local-language typefaces.' } },
  { id: 'colour', title: 'Colour', match: 'colour, color, palette',
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'The palette with values, then how to apply it.', standard: 'Plus when each sub-palette is allowed, light and dark modes, and pairings.', comprehensive: 'Plus ratio, accessibility and recommended pairings.' } },
  { id: 'imagery', title: 'Imagery', match: 'imagery, photography, art direction, image, film', needsArtwork: true,
    need: { essentials: 'fixed', standard: 'fixed', comprehensive: 'fixed' },
    depth: { essentials: 'Principles for choosing images, then the image style.', standard: 'Three tiers of imagery, each with three principles and where it’s used.', comprehensive: 'Plus who we capture, using stock, and film.' } },
  { id: 'layout', title: 'Layout', match: 'layout, grid, composition', needsArtwork: true,
    need: { essentials: 'none', standard: 'optional', comprehensive: 'fixed' },
    depth: { essentials: '', standard: 'How the elements combine on a page.', comprehensive: 'A grid that works at any size, building new grids, and working with each element.' } },
  { id: 'watchouts', title: 'Watchouts', match: 'watchouts, avoid, don’ts, donts, misuse, how not to',
    need: { essentials: 'none', standard: 'none', comprehensive: 'fixed' },
    depth: { essentials: '', standard: '', comprehensive: 'One short visual list of common mistakes at the end of each design chapter.' } }
];

export const DEFAULT_HOUSE = `How Lost Property writes guidelines. Every guide follows these, at every tier.

1. One point per page, said as a headline. The rest of the page proves it. Body copy is short, rarely more than three sentences.
2. Headlines count or claim. "We have three logo layouts to choose from", "One symbol, three ways to use it", "Our wordmark is our primary asset", "We apply the wordmark in three colourways". First person plural (we, our), sentence case, no full stop.
3. Rules come in modes. Usually three, sometimes two or four, each with a name and one "Used when…" line. The order depends on the system but usually runs from loudest to quietest.
4. Two to four examples under each point, labelled with the mode name and a one-line note. Real applications where possible.
5. Do-led, not don't-led. Say what to do. Don'ts only for elements that are easy to misuse (characters, icons, seals), and at Comprehensive as one Watchouts page per chapter.
6. Logo in use, not clear space: layouts, colourways, position and scale on the canvas, and how it sits on imagery.
7. Each element runs the same way: a divider with its name, a page on what it is and why, the rule pages, then the asset download.
8. Show the brand working before the rules.
9. Assets sit next to the rule that explains them, with formats and specs.
10. Every brand has elements of its own beyond logo, type, colour and imagery. They follow the same rhythm.
11. Never invent strategy (purpose, principles, voice). If it's missing, say it's missing.`;

export const DEFAULT_AI_DONTS = [
  'Don’t redraw, retype, recolour, stretch, crop or add effects to the logo. Use the supplied files only.',
  'Don’t invent colours, tints, gradients or effects the guidelines don’t list.',
  'Don’t substitute the brand typefaces with lookalikes. Use the named fallback and say so.',
  'Don’t generate new versions of the brand’s characters, icons, patterns or other artwork.',
  'Don’t put text or other elements over the logo.',
  'Don’t use stock imagery where the guidelines say the brand makes its own.'
];

export type Playbook = { house: string; slots: Slot[]; aiDonts: string[]; updatedAt?: string };
export const DEFAULT_PLAYBOOK: Playbook = { house: DEFAULT_HOUSE, slots: DEFAULT_SLOTS, aiDonts: DEFAULT_AI_DONTS };

/** True when a chapter title or section headline belongs to the slot. */
export function matchesSlot(slot: Slot, text: string) {
  const t = text.toLowerCase();
  return slot.match.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t));
}

/** The tier outline as text, for prompts. */
export function tierOutline(p: Playbook, tier: Tier) {
  return p.slots.filter((s) => s.need[tier] !== 'none').map((s) => `- ${s.title} (${s.need[tier]}${s.strategy ? ', strategy: never drafted' : ''}): ${s.depth[tier]}`).join('\n');
}
