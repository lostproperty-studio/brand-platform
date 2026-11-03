import { adminClient } from '@/lib/supabase/server';
import { studioAnthropic } from '@/lib/ai/studio';
import { exportNodes } from '@/lib/figma/scan';
import { aboutMd, readForm } from '@/lib/brandForm';
import { chapterText, normaliseGuide, type Guide } from '@/lib/portal/guide';
import { readSources } from '@/lib/figma/sources';

// The brand's design qualities, read from its guidelines by AI: concrete settings the design system is built from
// (how much accent, grid and margins, type habits, image treatment, shapes, graphic devices, do's and don'ts).
// Each setting says where it came from: a chapter of the guidelines (with the words or frame that show it), or a
// judgement call when the guidelines don't say. The studio can correct a setting, lock it (a re-read keeps it) or
// switch it off (the system's default is used). Nothing here is strategy or copy: only visual rules.

import { SETTING_INFO, type Profile, type Setting, type SettingKey, type Source } from '@/lib/designProfileInfo';
export { SETTING_INFO, type Profile, type Setting, type SettingKey, type Source };

/** The JSON shape the model fills, one entry per setting: a value, then where it came from */
const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries((Object.keys(SETTING_INFO) as SettingKey[]).map((k) => [k, {
    type: 'object',
    properties: {
      value: {}, from: { type: 'string', enum: ['guidelines', 'judgement'] },
      chapter: { type: 'string', description: 'The chapter title it was read from (from: guidelines).' },
      evidence: { type: 'string', description: 'Up to 20 words: the guideline words, or what a frame shows (from: guidelines).' },
      why: { type: 'string', description: 'Up to 20 words: why this judgement suits the brand (from: judgement).' }
    },
    required: ['value', 'from']
  }])),
  required: Object.keys(SETTING_INFO)
};

const VALUE_RULES = `Value shapes, exactly:
- accent: {"hex": one of the palette hexes, "use": "sparing"|"moderate"|"bold"}
- ground: "light"|"dark"
- corners: {"controls": px 0–999, "cards": px 0–40} (999 = pill)
- headlineCase: "sentence"|"upper"|"lower"|"title"
- headlineWeight: 100–900
- headlineTracking: em, -0.05 to 0.1
- displayScale: "restrained"|"large"|"huge"
- bodySize: px 13–20
- grid: {"columns": 4–16, "marginPct": 2–12, "gutter": px 8–40}
- density: "airy"|"balanced"|"dense"
- buttons: "solid"|"outline"|"underline"
- imagery: {"treatment": "full-bleed"|"framed"|"cutout"|"mixed", "ratio": "4:5"|"1:1"|"3:2"|"16:9", "corners": true|false}
- rules: true|false
- devices: up to 5 short descriptions of recurring graphic devices actually shown or described (empty if none)
- dos / donts: up to 8 short visual rules each, taken from the guidelines (empty if none)`;

const clampN = (n: unknown, lo: number, hi: number, d: number) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T) => (opts.includes(v as T) ? (v as T) : d);
const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim().slice(0, 160)).slice(0, n) : []);

/** Makes the model's answer safe: every value in range, every source well-formed */
function clean(raw: Record<string, { value?: unknown; from?: string; chapter?: string; evidence?: string; why?: string }>, palette: string[]): Profile['settings'] {
  const src = (k: string): Source => { const r = raw[k] || {}; return r.from === 'guidelines' && r.chapter ? { from: 'guidelines', chapter: String(r.chapter).slice(0, 80), evidence: String(r.evidence || '').slice(0, 200) } : { from: 'judgement', why: String(r.why || 'The guidelines don’t say.').slice(0, 200) }; };
  const v = (k: string) => raw[k]?.value as Record<string, unknown> & unknown;
  const a = (v('accent') || {}) as { hex?: string; use?: string };
  const hex = palette.find((h) => h.toUpperCase() === String(a.hex || '').toUpperCase()) || palette[0] || '#000000';
  const c = (v('corners') || {}) as { controls?: number; cards?: number };
  const g = (v('grid') || {}) as { columns?: number; marginPct?: number; gutter?: number };
  const im = (v('imagery') || {}) as { treatment?: string; ratio?: string; corners?: boolean };
  return {
    accent: { value: { hex, use: pick(a.use, ['sparing', 'moderate', 'bold'] as const, 'sparing') }, source: src('accent') },
    ground: { value: pick(v('ground'), ['light', 'dark'] as const, 'light'), source: src('ground') },
    corners: { value: { controls: clampN(c.controls, 0, 999, 4), cards: clampN(c.cards, 0, 40, 4) }, source: src('corners') },
    headlineCase: { value: pick(v('headlineCase'), ['sentence', 'upper', 'lower', 'title'] as const, 'sentence'), source: src('headlineCase') },
    headlineWeight: { value: Math.round(clampN(v('headlineWeight'), 100, 900, 400) / 100) * 100, source: src('headlineWeight') },
    headlineTracking: { value: Math.round(clampN(v('headlineTracking'), -0.05, 0.1, -0.01) * 1000) / 1000, source: src('headlineTracking') },
    displayScale: { value: pick(v('displayScale'), ['restrained', 'large', 'huge'] as const, 'large'), source: src('displayScale') },
    bodySize: { value: Math.round(clampN(v('bodySize'), 13, 20, 16)), source: src('bodySize') },
    grid: { value: { columns: Math.round(clampN(g.columns, 4, 16, 12)), marginPct: clampN(g.marginPct, 2, 12, 4), gutter: Math.round(clampN(g.gutter, 8, 40, 20)) }, source: src('grid') },
    density: { value: pick(v('density'), ['airy', 'balanced', 'dense'] as const, 'balanced'), source: src('density') },
    buttons: { value: pick(v('buttons'), ['solid', 'outline', 'underline'] as const, 'solid'), source: src('buttons') },
    imagery: { value: { treatment: pick(im.treatment, ['full-bleed', 'framed', 'cutout', 'mixed'] as const, 'framed'), ratio: pick(im.ratio, ['4:5', '1:1', '3:2', '16:9'] as const, '4:5'), corners: !!im.corners }, source: src('imagery') },
    rules: { value: !!v('rules'), source: src('rules') },
    devices: { value: strs(v('devices'), 5), source: src('devices') },
    dos: { value: strs(v('dos'), 8), source: src('dos') },
    donts: { value: strs(v('donts'), 8), source: src('donts') }
  };
}

/** Keeps what the studio locked or switched off when the guidelines are read again */
export function mergeProfile(next: Profile['settings'], prev?: Profile['settings']) {
  if (!prev) return next;
  const out = { ...next } as Record<string, Setting<unknown>>;
  for (const k of Object.keys(prev) as SettingKey[]) { const p = prev[k] as Setting<unknown>; if (p?.locked) out[k] = p; else if (p?.off) out[k] = { ...out[k], off: true }; }
  return out as Profile['settings'];
}

export function readProfile(content: unknown): Profile | null {
  const p = (content as { dsProfile?: Profile } | null)?.dsProfile;
  return p && p.settings ? p : null;
}

/** Reads the guidelines (text and pictures of the frames) and saves the profile on the project */
export async function readDesignProfile(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, line, brand, content, figma_key, figma_page_id').eq('id', projectId).single();
  if (error) throw error;
  const content = (p.content || {}) as { guide?: Guide; typeScale?: { name: string; size?: number; weight?: number; tracking?: number; lineHeight?: number; family?: string }[]; dsProfile?: Profile };
  const guide = normaliseGuide(content.guide);
  const chapters = (guide?.chapters || []).filter((c) => !c.removed && !c.hidden && !c.id.startsWith('draft-'));
  if (!chapters.length) throw new Error('Import some guidelines chapters first: the design profile is read from them.');
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: { role: string; name: string }[] };
  const palette = (brand.core || []).map((c) => c.hex.toUpperCase()).filter((h) => /^#[0-9A-F]{6}$/.test(h));

  // Pictures of the frames: the visual chapters first, a few frames each, at a size the model reads well
  const src = readSources(p.content, p).guidelines;
  const visual = /logo|colou?r|type|typograph|layout|grid|image|photo|graphic|pattern|applica|example|in use|social|signage/i;
  const ordered = [...chapters].sort((a, b) => Number(visual.test(b.title)) - Number(visual.test(a.title)));
  const frameIds = ordered.flatMap((c) => c.blocks.filter((b) => b.source && !b.hidden).slice(0, visual.test(c.title) ? 4 : 1).map((b) => ({ id: b.source!, chapter: c.title }))).slice(0, 18);
  let images: { url: string; chapter: string }[] = [];
  if (src?.key && frameIds.length) {
    const urls = await exportNodes(src.key, frameIds.map((f) => f.id), 'jpg', 0.6).catch(() => ({} as Record<string, string | null>));
    images = frameIds.filter((f) => urls[f.id]).map((f) => ({ url: urls[f.id]!, chapter: f.chapter }));
  }

  const text = chapters.map((c) => `## ${c.title}\n${[c.lede, ...c.rules.map((r) => `${r.title}: ${r.text}`), ...chapterText(c)].filter(Boolean).join('\n').slice(0, 2500)}`).join('\n\n').slice(0, 40000);
  const scale = (content.typeScale || []).map((s) => `${s.name}: ${s.size}px, weight ${s.weight || '?'}, tracking ${s.tracking ?? 0}%, line height ${s.lineHeight || '?'}%${s.family ? `, ${s.family}` : ''}`).join('\n');
  const system = `You are a senior brand designer at Lost Property Studio. Read a client's brand guidelines (text and pictures of the guideline pages) and record the brand's visual qualities as settings for a design system that people and AI will build web pages, documents, slides and social posts with.
- Read, don't invent. When the guidelines state or clearly show a setting, give from: "guidelines" with the chapter title and the words or what the picture shows.
- When they don't, make the judgement a senior designer would make for THIS brand from everything you can see (palette, type, logo, imagery, tone), and give from: "judgement" with a short reason. Never copy a generic house style.
- Visual rules only. Never write strategy, positioning, claims or copy.
- Answer by calling the tool once.`;
  const user = `CLIENT: ${p.client}${p.line ? ` · ${p.line}` : ''}
PALETTE: ${(brand.core || []).map((c) => `${c.name} ${c.hex}${c.note ? ` (${c.note})` : ''}`).join('; ') || 'none'}
TYPEFACES: ${(brand.fonts || []).filter((f) => f.name).map((f) => `${f.role}: ${f.name}`).join('; ') || 'none'}
${scale ? `TYPE SCALE (from the Assets page):\n${scale}\n` : ''}${aboutMd(readForm(p.content))}
THE GUIDELINES:
${text}

${VALUE_RULES}
${images.length ? `\nThe ${images.length} pictures that follow are guideline pages, each labelled with its chapter.` : ''}`;
  const blocks: unknown[] = [{ type: 'text', text: user }];
  for (const im of images) { blocks.push({ type: 'text', text: `Page from “${im.chapter}”:` }); blocks.push({ type: 'image', source: { type: 'url', url: im.url } }); }
  const res = await studioAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 4000, system,
    tools: [{ name: 'record_profile', description: 'Record the brand’s design settings.', input_schema: SCHEMA as never }],
    tool_choice: { type: 'tool', name: 'record_profile' },
    messages: [{ role: 'user', content: blocks as never }]
  });
  const call = res.content.find((c) => c.type === 'tool_use') as { input?: Record<string, never> } | undefined;
  if (!call?.input) throw new Error('The AI didn’t return a profile. Try again.');
  const settings = mergeProfile(clean(call.input, palette.length ? palette : ['#000000']), content.dsProfile?.settings);
  const profile: Profile = { at: new Date().toISOString(), chapters: chapters.map((c) => c.title), frames: images.length, settings };
  const { data: cur } = await sb.from('projects').select('content').eq('id', projectId).single();
  await sb.from('projects').update({ content: { ...((cur?.content as object) || {}), dsProfile: profile } }).eq('id', projectId);
  return profile;
}
