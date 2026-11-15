import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { teamGate } from '@/lib/studioTeam';
import { portalV2 } from '@/lib/portalVersion';
import { normaliseGuide, type Block, type BlockMedia, type Guide, type GuideChapter } from '@/lib/portal/guide';
import { describe, easeName, motionTokens, readDraft, typeFor, type BrandMotion } from '@/lib/motion/model';

// Submit: a project lead approves the motion. What's submitted becomes the brand's motion (content.motion): Director
// and the motion package use it, the design system and AI read it as tokens and rules, and a Motion chapter is
// written into the guidelines as drafts for the studio to check and accept before clients see it.
// 'sign' gives an upload link for the chapter's example videos (built in the browser) first.
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), name: z.string().min(1).max(120) }),
  z.object({ action: z.literal('submit'), media: z.array(z.object({ path: z.string().max(400), w: z.number(), h: z.number(), caption: z.string().max(200).optional() })).max(8).default([]),
    fonts: z.array(z.object({ role: z.string().max(60), name: z.string().max(120) })).max(20).default([]) })
]);
const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'file';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!portalV2()) return new Response('Not found', { status: 404 });
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'lead', 'motion'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();

  if (b.data.action === 'sign') {
    const path = `${id}/guide/motion/${safe(b.data.name)}`;
    const { data, error } = await sb.storage.from('previews').createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }

  const { data: p } = await sb.from('projects').select('client, content').eq('id', id).single();
  if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const content = (p.content || {}) as Record<string, unknown>;
  const draft = readDraft(content);
  const prev = (content.motion as Partial<BrandMotion> | undefined)?.version || 0;
  const meta = st.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const motion: BrandMotion = { ...draft, status: 'submitted', version: prev + 1, submittedAt: new Date().toISOString(), submittedBy: meta?.full_name || meta?.name || 'Lost Property' };
  const media = b.data.media.filter((m) => m.path.startsWith(`${id}/guide/motion/`)).map((m): BlockMedia => ({ path: m.path, w: m.w, h: m.h, caption: m.caption, kind: 'graphic', video: true }));
  const guide = motionChapter(normaliseGuide(content.guide as Guide | undefined), p.client, motion, media, b.data.fonts);
  const next: Record<string, unknown> = { ...content, motion, motionDraft: { ...draft, status: 'submitted', version: motion.version, submittedAt: motion.submittedAt } };
  if (guide) next.guide = { ...guide, _rev: ((content.guide as { _rev?: number } | undefined)?._rev || 0) + 1 };
  const { error } = await sb.from('projects').update({ content: next }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ motion, chapter: !!guide });
}

/** Writes the Motion chapter: blocks this route wrote before are replaced (as drafts again); anything the studio
 *  added to the chapter stays. Placed after the logo and type chapters. */
function motionChapter(g: Guide | null, client: string, m: BrandMotion, media: BlockMedia[], fonts: { role: string; name: string }[]): Guide | null {
  if (!g) return null;
  const k = motionTokens(m), L = m.logo;
  const note = 'Written from the motion submitted in the Motion tab. Check it, then accept it to show clients.';
  const blk = (src: string, x: Partial<Block>): Block => ({ id: `motion-${src}-${Date.now().toString(36)}`, source: `motion-${src}`, kind: 'text', draft: 'draft', draftNote: note, slot: 'motion', ...x } as Block);
  const fname = (r: string) => fonts.find((f) => f.role === r)?.name || r;
  const typeLines = (m.assets?.fonts?.length ? m.assets.fonts : ['display']).map((r) => `${fname(r)}: ${describe(typeFor(m, r))}`);
  const blocks: Block[] = [
    blk('intro', { eyebrow: 'Motion', heading: `How ${client} moves`, body: [m.brief?.trim(), describe(L)].filter(Boolean).join('\n\n') }),
    ...(media.length ? [blk('logos', { kind: 'media', heading: 'The logo in motion', body: 'Every logo is supplied animated in Resources → Motion logos: video on a brand colour, transparent video, Lottie and animated SVG.', media })] : []),
    blk('ease', { heading: 'Easing and timing', body: [
      `Ease: ${easeName(L.ease)}, ${k.ease.brand}.`,
      L.out === 'mirror' ? `On the way out, the mirror: ${k.ease['brand-out']}.` : '',
      `Logo: ${L.length} s overall, each part ${k.duration['logo-part']}, ${k.duration['logo-stagger']} apart.`,
      `Type: each ${m.type.split === 'whole' ? 'block' : m.type.split.replace(/s$/, '')} ${k.duration['type-part']}, ${k.duration['type-stagger']} apart, ${easeName(m.type.ease)} (${k.ease.type}).`
    ].filter(Boolean).join('\n') }),
    blk('type', { heading: 'Type in motion', body: typeLines.join('\n') }),
    blk('rules', { heading: 'Using motion', body: [
      'Use the motion logo files rather than animating the logo again.',
      `In interfaces, decks and video, move things with the brand ease (${k.ease.brand}) and durations near ${k.duration['logo-part']}.`,
      'Keep to these behaviours: no bounces, spins, overshoots or effects that aren’t described here.'
    ].join('\n') })
  ];
  const at = g.chapters.findIndex((c) => c.id === 'motion');
  if (at >= 0) {
    const c = g.chapters[at];
    const kept = c.blocks.filter((x) => !(x.source || '').startsWith('motion-'));
    const chapters = [...g.chapters]; chapters[at] = { ...c, removed: false, blocks: [...blocks, ...kept] };
    return { ...g, chapters };
  }
  const ch: GuideChapter = { id: 'motion', key: 'motion', title: 'Motion', kicker: '', lede: `How the ${client} logo and type move.`, blocks, rules: [], slot: 'motion' };
  const last = Math.max(-1, ...g.chapters.map((c, i) => (c.key === 'logo' || c.key === 'type' || c.key === 'colour' ? i : -1)));
  const chapters = [...g.chapters]; chapters.splice(last + 1, 0, ch);
  return { ...g, chapters };
}
