import { NextResponse } from 'next/server';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { readVoice, voiceTitle, type VoiceProfile } from '@/lib/voice';
import type { Block, Guide, GuideChapter } from '@/lib/portal/guide';
import type { BlockItem } from '@/lib/figma/blocks';

// The voice chapter in the guidelines: a first draft made from the studio's answers (never written by AI). After that
// the chapter is the studio's, curated for the client in the editor, and the Voice tab never overwrites it. Asking
// again only adds sections the chapter doesn't have yet (say, hard rules answered later); nothing there changes.
const lines = (t?: string) => (t || '').split(/\n+/).map((x) => x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
const item = (line: string, i: number, pre: string): BlockItem => {
  const m = /^(.{2,80}?)(?::|\s[–—-]\s)\s*(.+)$/.exec(line);
  return m ? { id: `${pre}${i}`, heading: m[1].trim(), body: m[2].trim() } : { id: `${pre}${i}`, body: line };
};
function voiceBlocks(v: VoiceProfile): Block[] {
  const f = v.fields || {}, out: Block[] = [];
  const text = (id: string, eyebrow: string, body?: string, heading?: string) => { if (body?.trim()) out.push({ id: `voice-${id}`, kind: 'text', eyebrow, heading, body: body.trim() }); };
  const cols = (id: string, heading: string, src?: string, body?: string) => { const l = lines(src); if (l.length) out.push({ id: `voice-${id}`, kind: 'columns', heading, body, items: l.slice(0, 8).map((x, i) => item(x, i, `${id}-`)), box: 'fill' }); };
  if (f.essence?.trim()) out.push({ id: 'voice-essence', kind: 'statement', heading: f.essence.trim().split(/\n/)[0] });
  cols('traits', 'Our personality', f.traits);
  cols('principles', 'How we write', f.principles);
  text('tone', 'Tone', f.tone, 'How the tone flexes');
  cols('audiences', 'Who we talk to', f.audiences);
  if (f.vocabulary?.trim() || f.avoid?.trim()) out.push({ id: 'voice-words', kind: 'columns', heading: 'Words', items: [...(f.vocabulary?.trim() ? [{ id: 'w-use', heading: 'Words we use', body: f.vocabulary.trim() }] : []), ...(f.avoid?.trim() ? [{ id: 'w-avoid', heading: 'Words we avoid', body: f.avoid.trim() }] : [])], box: 'fill' });
  if (f.examples?.trim() || f.offbrand?.trim()) out.push({ id: 'voice-examples', kind: 'columns', heading: 'Sounds like us', items: [...(f.examples?.trim() ? [{ id: 'x-on', heading: 'Sounds like us', body: f.examples.trim() }] : []), ...(f.offbrand?.trim() ? [{ id: 'x-off', heading: 'Doesn’t sound like us', body: f.offbrand.trim() }] : [])], box: 'fill' });
  text('formats', 'Formats', f.formats, 'Headlines, body and calls to action');
  text('style', 'House style', f.style, 'Grammar and style');
  text('never', 'Never', f.never, 'Hard rules');
  return out;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'project'); if (gate) return gate; }
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', id).maybeSingle();
  const content = (p?.content as Record<string, unknown>) || {};
  const guide = content.guide as (Guide & { _rev?: number }) | undefined;
  if (!guide) return NextResponse.json({ error: 'Build the guidelines first, then add the voice chapter.' }, { status: 409 });
  const v = readVoice(content);
  const made = voiceBlocks(v);
  if (!made.length) return NextResponse.json({ error: 'Answer a few of the questions first.' }, { status: 400 });
  const title = voiceTitle(v);
  const at = guide.chapters.findIndex((c) => c.key === 'voice' && !c.removed);
  let chapters: GuideChapter[];
  let added = 0;
  if (at >= 0) {
    // Only what's new: sections it already has (or had, and were deleted) are left exactly as they are
    const c = guide.chapters[at];
    const given = (c as { voiceMade?: string[] }).voiceMade || c.blocks.filter((b) => b.id.startsWith('voice-')).map((b) => b.id);
    const had = new Set([...c.blocks.map((b) => b.id), ...given]);
    const fresh = made.filter((b) => !had.has(b.id));
    added = fresh.length;
    if (!fresh.length) return NextResponse.json({ ok: true, added: false, sections: 0, chapter: c.id, note: 'The chapter already has a section for everything in the Voice tab. Nothing in it changed.' });
    chapters = guide.chapters.map((x, i) => (i === at ? { ...x, blocks: [...x.blocks, ...fresh.map((b) => ({ ...b, draft: 'draft' as const }))], voiceMade: [...given, ...fresh.map((b) => b.id)] } : x));
  } else {
    chapters = [...guide.chapters, { id: 'voice', key: 'voice', title, kicker: '', lede: '', blocks: made, rules: [], edited: true, voiceMade: made.map((b) => b.id) } as GuideChapter];
  }
  const next = { ...guide, chapters, _rev: (guide._rev || 0) + 1 };
  const { error } = await sb.from('projects').update({ content: { ...content, guide: next } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: at < 0, sections: at < 0 ? made.length : added, chapter: at >= 0 ? guide.chapters[at].id : 'voice' });
}
