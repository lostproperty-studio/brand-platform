import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/supabase/server';
import { DEFAULT_PLAYBOOK } from '@/lib/playbook';
import { getPlaybook, savePlaybook } from '@/lib/playbookStore';

const Need = z.enum(['fixed', 'optional', 'none']);
const Tiered = <T extends z.ZodTypeAny>(t: T) => z.object({ essentials: t, standard: t, comprehensive: t });
const Body = z.object({
  reset: z.boolean().optional(),
  house: z.string().max(20000).optional(),
  aiDonts: z.array(z.string().max(400)).max(30).optional(),
  slots: z.array(z.object({ id: z.string().max(40), title: z.string().max(80), match: z.string().max(400), strategy: z.boolean().optional(), needsArtwork: z.boolean().optional(), need: Tiered(Need), depth: Tiered(z.string().max(600)) })).max(40).optional()
});

export async function GET() {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  return NextResponse.json(await getPlaybook());
}

// Saves the studio playbook. It applies to every project the next time its guidelines are checked.
export async function PUT(req: Request) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Something in the playbook isn’t valid.' }, { status: 400 });
  const cur = b.data.reset ? DEFAULT_PLAYBOOK : await getPlaybook();
  const next = b.data.reset ? DEFAULT_PLAYBOOK : { house: b.data.house ?? cur.house, aiDonts: (b.data.aiDonts ?? cur.aiDonts).map((x) => x.trim()).filter(Boolean), slots: b.data.slots ?? cur.slots };
  try { await savePlaybook(next); } catch (e) { return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 }); }
  return NextResponse.json(await getPlaybook());
}
