import { NextResponse } from 'next/server';
import { z } from 'zod';
import { photoAccess, artDirection } from '@/lib/photographer/server';
import { portalAnthropic, logUsage } from '@/lib/ai/project';
import { callTool } from '@/lib/ai/tool';
import { aiFailure } from '@/lib/ai/errors';

export const maxDuration = 60;
export const runtime = 'nodejs';

// The art director: looks at an image against the brand's art direction and says how close it is, what works and
// what to change. Runs on every image added (uploads, stock and generated) and again after an edit.
const Body = z.object({ image: z.string().max(3_000_000), source: z.string().max(20).default('upload'), note: z.string().max(400).optional() });
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const a = await photoAccess((await ctx.params).slug); if (!a) return new Response('Not found', { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const m = b.data.image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return NextResponse.json({ error: 'That isn’t an image.' }, { status: 400 });
  const ad = await artDirection(a.p.id, a.acc.staff);
  const { ai, studio } = await portalAnthropic(a.p.id, a.acc.staff);
  try {
    const r = await callTool<{ score: number; verdict: 'on' | 'close' | 'off'; summary: string; good: string[]; fix: string[] }>(ai, {
      model: 'claude-sonnet-5-5', max_tokens: 900,
      system: `You are Lost Property's art director for ${ad.client || 'this brand'}, checking images the team wants to use against the brand's art direction. Be direct and specific, like a good art director in a review: what in the picture fits, what doesn't, and the one or two changes that would bring it closer (crop, light, colour, subject, an effect). Judge only against the art direction below; if it says nothing about something, don't invent a rule.
${ad.line}
Design qualities: ${ad.design.join('; ') || 'none set'}
Colours: ${ad.colours.join(', ')}
Art direction:
${ad.text || '(The guidelines have no art direction written yet. Judge against the design qualities and colours, and say the art direction is thin.)'}`,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } },
        { type: 'text', text: `This image is ${b.data.source === 'generated' ? 'AI-generated' : b.data.source === 'stock' ? 'a stock photo' : b.data.source === 'edit' ? 'an edit of one of the team’s images' : 'uploaded by the team'}.${b.data.note ? ` ${b.data.note}` : ''} Score it 0–100 for fit with the art direction.` }
      ] }],
      tool: { name: 'review', description: 'The review', input_schema: { type: 'object', properties: { score: { type: 'number' }, verdict: { type: 'string', enum: ['on', 'close', 'off'], description: 'on: use it; close: usable with changes; off: not for this brand' }, summary: { type: 'string', description: 'One sentence' }, good: { type: 'array', items: { type: 'string' }, maxItems: 3 }, fix: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['score', 'verdict', 'summary', 'good', 'fix'] } }
    });
    await logUsage(a.p.id, a.acc.user.id, 'canvas', r.usage).catch(() => {});
    const x = r.input; if (!x) throw new Error('The art director didn’t answer.');
    return NextResponse.json({ review: { score: Math.round(Math.min(100, Math.max(0, x.score))), verdict: ['on', 'close', 'off'].includes(x.verdict) ? x.verdict : 'close', summary: x.summary || '', good: (x.good || []).slice(0, 3), fix: (x.fix || []).slice(0, 3), at: new Date().toISOString() } });
  } catch (e) {
    return NextResponse.json({ error: await aiFailure(a.p.id, e, studio) }, { status: 502 });
  }
}
