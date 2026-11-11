import { adminClient } from '@/lib/supabase/server';
import { studioAnthropic } from '@/lib/ai/studio';
import { normaliseGuide, type Block, type Guide, type GuideChapter } from '@/lib/portal/guide';
import { matchesSlot, tierLabel, tierOf, tierOutline, type Playbook, type Slot, type Tier } from '@/lib/playbook';
import { getPlaybook } from '@/lib/playbookStore';

// Checks a project's guidelines against its tier and the studio playbook, then fills the gaps:
// - a section the platform can write from what's already in the file becomes a draft ("Draft, check this")
// - strategy, and anything that needs the studio's artwork, is called out as missing, never written
// Drafts and missing notes stay out of the client portal until the studio accepts them.

const uid = () => Math.random().toString(36).slice(2, 10);
const KEY_SLOT: Record<string, string> = { logo: 'logo', type: 'type', colour: 'colour', imagery: 'imagery', layout: 'layout', voice: 'voice', applications: 'in-action' };

type Draft = { slot: string; chapterId?: string | null; afterBlockId?: string | null; basedOn: string; blocks: { kind: 'text' | 'divider'; eyebrow?: string; heading: string; body?: string }[] };
type Missing = { slot: string; chapterId?: string | null; title: string; note: string };

/** Removes earlier drafts and missing notes the studio hasn't accepted, so a re-check starts clean. */
/** A chapter the tier calls for that the guidelines don't have: offered to the studio, never added by itself */
export type ChapterSuggestion = { slot: string; title: string; note?: string; blocks: Block[] };
export const readSuggestions = (content: unknown): ChapterSuggestion[] => ((content as { chapterSuggestions?: ChapterSuggestion[] } | null)?.chapterSuggestions) || [];

/** Chapters drafted by an earlier version (draft-…) that nobody has kept anything in: taken out of the guide and
 *  offered as suggestions instead. Chapters with anything accepted in them stay. */
export function draftChaptersToSuggestions(g: Guide): { guide: Guide; suggestions: ChapterSuggestion[] } {
  const suggestions: ChapterSuggestion[] = [];
  const chapters = g.chapters.filter((c) => {
    if (!c.id.startsWith('draft-') || c.blocks.some((b) => !b.draft) || c.edited) return true;
    suggestions.push({ slot: c.slot || c.id.slice(6), title: c.title, note: c.blocks.find((b) => b.draftNote)?.draftNote, blocks: c.blocks });
    return false;
  });
  return { guide: { ...g, chapters }, suggestions };
}

export function stripDrafts(g: Guide): Guide {
  return { ...g, chapters: g.chapters.map((c) => ({ ...c, blocks: c.blocks.filter((b) => !b.draft) })).filter((c) => !c.id.startsWith('draft-') || c.blocks.length) };
}

function slotOfChapter(p: Playbook, c: GuideChapter) {
  if (c.slot) return c.slot;
  if (c.key && KEY_SLOT[c.key]) return KEY_SLOT[c.key];
  return p.slots.find((s) => matchesSlot(s, `${c.title} ${c.kicker}`))?.id;
}
const covered = (p: Playbook, g: Guide, s: Slot) => g.chapters.some((c) => !c.hidden && (slotOfChapter(p, c) === s.id || c.blocks.some((b) => !b.hidden && !b.draft && (b.kind === 'divider' || b.kind === 'cover') && matchesSlot(s, `${b.eyebrow || ''} ${b.heading || ''}`))));

function outline(g: Guide) {
  let budget = 40000;
  return g.chapters.filter((c) => !c.hidden).map((c) => {
    const blocks = c.blocks.filter((b) => !b.hidden).map((b) => {
      const line = `  [${b.id}] ${b.kind}${b.eyebrow ? ` · ${b.eyebrow}` : ''}: ${(b.heading || '').replace(/\n/g, ' ')}${b.body ? ` — ${b.body.replace(/\s+/g, ' ').slice(0, 320)}` : ''}${b.swatches?.length ? ` — swatches: ${b.swatches.map((s) => `${s.name} ${s.hex}`).join(', ')}` : ''}${b.media?.length ? ` — ${b.media.length} image(s)` : ''}`;
      budget -= line.length; return budget > 0 ? line : '';
    }).filter(Boolean).join('\n');
    return `CHAPTER [${c.id}] ${c.title}${c.kicker ? ` (${c.kicker})` : ''}\n${blocks}${c.rules.length ? `\n  Rules: ${c.rules.map((r) => `${r.title}: ${r.text}`).join(' | ').slice(0, 600)}` : ''}`;
  }).join('\n\n');
}

async function askClaude(input: { client: string; line: string; tier: Tier; playbook: Playbook; guide: Guide; draftable: Slot[]; fonts: string[] }) {
  const { client, line, tier, playbook, guide, draftable, fonts } = input;
  const system = `You are a senior designer at Lost Property, a brand studio, checking a client's online brand guidelines against the studio's playbook for a ${tierLabel(tier)} guide.

THE PLAYBOOK
${playbook.house}

WHAT A ${tierLabel(tier).toUpperCase()} GUIDE CONTAINS
${tierOutline(playbook, tier)}

YOUR JOB
1. For each slot in "Slots with no chapter yet", draft the section as new pages, using only facts already in the guidelines (names, values, typefaces, colourways, files, how things are used). Set chapterId to null.
2. For chapters that exist but are thinner than the tier asks for, add the missing pages inside that chapter (chapterId and afterBlockId set), again only from facts already in the guidelines.
3. When something the tier asks for can't be written from what's there (it needs artwork, a decision or strategy), list it under missing instead, with a one-line note on what's needed.

HARD RULES
- Never write strategy: purpose, vision, mission, principles, values or tone of voice. Those go under missing.
- Never invent values, colours, typefaces, logo versions, sizes, stocks, Pantone references or new brand elements. If a number isn't in the guidelines, don't give one.
- Write every page in the house style: one point per page, a headline that counts or claims ("We apply the wordmark in three colourways", "Our wordmark is our primary asset"), we / our, sentence case, no full stop, short body copy (one to three sentences), modes with a name and a "Used when…" line, usually loudest to quietest.
- No don'ts, except a Watchouts page when the tier asks for one.
- basedOn says in one short sentence what the draft was written from, naming the chapter, e.g. "Written from the three colourways in Logo".
- Plain British English. Be selective: only what the tier really needs, at most 12 drafts.
Always answer by calling save_gaps once.`;
  const user = `CLIENT: ${client}${line ? ` · ${line}` : ''}
TYPEFACES: ${fonts.join(', ') || 'not given'}

Slots with no chapter yet (draft these): ${draftable.map((s) => `${s.id} (${s.title})`).join(', ') || 'none'}

THE GUIDELINES AS THEY STAND (block ids in brackets)
${outline(guide)}`;
  const res = await studioAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 12000, system,
    tools: [{ name: 'save_gaps', description: 'Save the drafted pages and the missing items.', input_schema: { type: 'object', properties: {
      drafts: { type: 'array', items: { type: 'object', properties: { slot: { type: 'string' }, chapterId: { type: ['string', 'null'] }, afterBlockId: { type: ['string', 'null'] }, basedOn: { type: 'string' }, blocks: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: ['text', 'divider'] }, eyebrow: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' } }, required: ['kind', 'heading'] } } }, required: ['slot', 'basedOn', 'blocks'] } },
      missing: { type: 'array', items: { type: 'object', properties: { slot: { type: 'string' }, chapterId: { type: ['string', 'null'] }, title: { type: 'string' }, note: { type: 'string' } }, required: ['slot', 'title', 'note'] } }
    }, required: ['drafts', 'missing'] } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }]
  });
  const call = res.content.find((b) => b.type === 'tool_use');
  const out = (call && call.type === 'tool_use' ? call.input : {}) as { drafts?: Draft[]; missing?: Missing[] };
  return { drafts: out.drafts || [], missing: out.missing || [] };
}

/** Where a new chapter for a slot goes: before the first chapter that belongs to a later slot. */
function placeFor(p: Playbook, chapters: GuideChapter[], slotId: string) {
  const order = (id?: string) => (id ? p.slots.findIndex((s) => s.id === id) : -1);
  const mine = order(slotId);
  const i = chapters.findIndex((c) => { const o = order(slotOfChapter(p, c)); return o > mine; });
  return i < 0 ? chapters.length : i;
}

export async function draftGaps(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, line, content, brand').eq('id', projectId).single();
  if (error) throw error;
  const content = (p.content || {}) as { guide?: Guide; tier?: Tier; dismissedSlots?: string[] };
  const tier = tierOf(content);
  const g0 = normaliseGuide(content.guide);
  if (!g0) throw new Error('Build the guidelines first.');
  if (!tier) return { tier: null, drafts: 0, missing: 0 };
  const playbook = await getPlaybook();
  const dismissed = new Set(content.dismissedSlots || []);
  const moved = draftChaptersToSuggestions(g0);
  let guide = stripDrafts(moved.guide);

  const needed = playbook.slots.filter((s) => s.need[tier] === 'fixed' && !dismissed.has(s.id) && !covered(playbook, guide, s));
  const callOut = needed.filter((s) => s.strategy || s.needsArtwork);
  const draftable = needed.filter((s) => !s.strategy && !s.needsArtwork);
  const fonts = ((p.brand as { fonts?: { name?: string; label?: string }[] } | null)?.fonts || []).map((f) => f.name || f.label || '').filter(Boolean);

  let drafts: Draft[] = [], missing: Missing[] = [];
  try { ({ drafts, missing } = await askClaude({ client: p.client, line: p.line || '', tier, playbook, guide, draftable, fonts })); }
  catch { /* without Claude, the gaps are still called out below */ }

  const slotById = new Map(playbook.slots.map((s) => [s.id, s]));
  // Strategy is never drafted, whatever comes back
  for (const d of drafts) if (slotById.get(d.slot)?.strategy) missing.push({ slot: d.slot, chapterId: d.chapterId, title: slotById.get(d.slot)!.title, note: 'Needs to come from the client and the studio.' });
  drafts = drafts.filter((d) => !slotById.get(d.slot)?.strategy && !dismissed.has(d.slot)).slice(0, 12);
  // Every needed slot is either drafted or called out
  for (const s of [...callOut, ...draftable]) if (!drafts.some((d) => d.slot === s.id && !d.chapterId) && !missing.some((m) => m.slot === s.id && !m.chapterId)) missing.push({ slot: s.id, chapterId: null, title: s.title, note: s.strategy ? 'Needs to come from the client and the studio.' : 'Needs the studio’s artwork or direction.' });
  missing = missing.filter((m) => !dismissed.has(m.slot));

  let chapters = [...guide.chapters];
  // Gaps that need a chapter the guidelines don't have become suggestions; chapters are never added here
  const sugg = new Map<string, ChapterSuggestion>();
  const suggest = (slotId: string, blocks: Block[], note?: string) => { const x = sugg.get(slotId) || { slot: slotId, title: slotById.get(slotId)?.title || 'New chapter', note, blocks: [] }; x.blocks.push(...blocks); if (note && !x.note) x.note = note; sugg.set(slotId, x); };
  const toBlocks = (d: Draft): Block[] => d.blocks.slice(0, 6).map((b) => ({ id: 'd-' + uid(), kind: b.kind, eyebrow: b.eyebrow || undefined, heading: b.heading, body: b.body || undefined, media: [], draft: 'draft' as const, draftNote: d.basedOn, slot: d.slot }));
  let nDrafts = 0, nMissing = 0;
  for (const d of drafts) {
    const blocks = toBlocks(d); if (!blocks.length) continue;
    const target = d.chapterId ? chapters.find((c) => c.id === d.chapterId) : undefined;
    if (!target) { suggest(d.slot, blocks); continue; }
    const c = target;
    const list = [...c.blocks];
    const at = d.afterBlockId ? list.findIndex((b) => b.id === d.afterBlockId) + 1 : list.length;
    list.splice(at > 0 ? at : list.length, 0, ...blocks);
    chapters = chapters.map((x) => (x.id === c.id ? { ...c, blocks: list } : x));
    nDrafts += blocks.length;
  }
  for (const m of missing) {
    const target = m.chapterId ? chapters.find((c) => c.id === m.chapterId) : undefined;
    const s = slotById.get(m.slot);
    const block: Block = { id: 'm-' + uid(), kind: 'text', heading: m.title, body: s ? s.depth[tier] : undefined, media: [], draft: 'missing', draftNote: m.note, slot: m.slot };
    if (!target) { suggest(m.slot, [block], m.note); nMissing++; continue; }
    const c = target;
    chapters = chapters.map((x) => (x.id === c.id ? { ...c, blocks: [...c.blocks, block] } : x));
    nMissing++;
  }
  guide = { ...guide, chapters };
  const chapterSuggestions = [...sugg.values()].filter((x) => !dismissed.has(x.slot));
  const { error: ue } = await sb.from('projects').update({ content: { ...content, guide, chapterSuggestions } }).eq('id', projectId);
  if (ue) throw ue;
  return { tier, drafts: nDrafts, missing: nMissing };
}

/** After rebuilding chosen chapters: nothing else is drafted or added. Chapters an earlier version drafted by
 *  itself (with nothing kept in them) are taken out and offered as suggestions instead. */
export async function tidyDraftChapters(projectId: string) {
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', projectId).single();
  const content = (p?.content || {}) as { guide?: Guide; dismissedSlots?: string[] };
  const g = normaliseGuide(content.guide);
  if (!g) return { moved: 0 };
  const { guide, suggestions } = draftChaptersToSuggestions(g);
  if (!suggestions.length) return { moved: 0 };
  const dismissed = new Set(content.dismissedSlots || []);
  const had = readSuggestions(content);
  const chapterSuggestions = [...had.filter((x) => !suggestions.some((y) => y.slot === x.slot)), ...suggestions].filter((x) => !dismissed.has(x.slot));
  await sb.from('projects').update({ content: { ...content, guide: { ...guide, _rev: ((content.guide as { _rev?: number } | undefined)?._rev || 0) + 1 }, chapterSuggestions } }).eq('id', projectId);
  return { moved: suggestions.length };
}
