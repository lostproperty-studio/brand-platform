import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { photoAccess, artDirection } from '@/lib/photographer/server';
import { portalAnthropic } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';

export const maxDuration = 60;
export const runtime = 'nodejs';

// Rules of thumb from the guidelines' art direction, a few short pointers the team keeps in view while choosing
// images. Worked out once by Claude from the imagery chapter and kept until the guidelines change.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await photoAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const ad = await artDirection(a.p.id, a.acc.staff);
  if (!ad.text && !ad.design.length) return NextResponse.json({ pointers: [], prompt: '', empty: true });
  const key = String(ad.text.length) + ':' + ad.text.slice(0, 200) + ad.design.join('|');
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', a.p.id).single();
  const content = (p?.content || {}) as Record<string, unknown>;
  const cached = content.photoDirection as { key: string; pointers: string[]; prompt: string } | undefined;
  if (cached?.key === key && !new URL(req.url).searchParams.has('fresh')) return NextResponse.json(cached);
  try {
    const { ai } = await portalAnthropic(a.p.id, a.acc.staff, a.acc.user.id);
    const r = await callTool<{ pointers: string[]; prompt: string }>(ai, {
      model: 'claude-sonnet-5-5', max_tokens: 1200,
      system: `You are Lost Property's art director for ${ad.client}. From the brand's art direction, write the rules of thumb a team keeps in mind when choosing or making photographs: 4 to 6 pointers, each under 14 words, concrete and visual (light, colour, framing, subject, mood), in the guidelines' own terms. Then one paragraph describing the photographic style, to steer an image generator: no brand names, no text in images.`,
      messages: [{ role: 'user', content: `${ad.line}\nDesign qualities: ${ad.design.join('; ') || 'none'}\nColours: ${ad.colours.join(', ')}\n\nArt direction from the guidelines:\n${ad.text || '(none written yet)'}` }],
      tool: { name: 'art_direction', description: 'Pointers and a style paragraph', input_schema: { type: 'object', properties: { pointers: { type: 'array', items: { type: 'string' }, maxItems: 6 }, prompt: { type: 'string' } }, required: ['pointers', 'prompt'] } }
    });
    const out = { key, pointers: (r.input?.pointers || []).slice(0, 6), prompt: r.input?.prompt || '' };
    await sb.from('projects').update({ content: { ...content, photoDirection: out } }).eq('id', a.p.id);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ pointers: [], prompt: '', error: (e as Error).message });
  }
}
