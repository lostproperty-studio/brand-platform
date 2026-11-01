import { noteEmailError } from '@/lib/email/status';
import { appOrigin } from '@/lib/origin';
import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { clientBrand } from '@/lib/email/brand';
import { requestUpdateEmail } from '@/lib/email/templates';

const STATUS_LABEL: Record<string, string> = { open: 'Received', in_progress: 'In progress', done: 'Done', declined: 'Declined' };

// Studio: update a client request's status and reply (the client sees both in their Settings).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'requests'); if (gate) return gate; }
  const b = z.object({ requestId: z.string().uuid(), status: z.enum(['open', 'in_progress', 'done', 'declined']).optional(), reply: z.string().max(4000).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { requestId, ...patch } = b.data;
  const sb = adminClient();
  const { data: before } = await sb.from('requests').select('title, status, reply, email').eq('id', requestId).eq('project_id', id).maybeSingle();
  await sb.from('requests').update(patch).eq('id', requestId).eq('project_id', id);
  // Tell the client when their request moves on or gets a reply
  const changed = before && ((patch.status && patch.status !== before.status) || (patch.reply !== undefined && patch.reply.trim() && patch.reply !== before.reply));
  if (changed && before.email && emailProvider()) {
    try {
      const { data: p } = await sb.from('projects').select('slug').eq('id', id).single();
      const status = STATUS_LABEL[patch.status || before.status] || 'updated';
      await sendEmail({ to: String(before.email), ...requestUpdateEmail(await clientBrand(p!.slug), `${await appOrigin()}/p/${p!.slug}/settings`, String(before.title), status, (patch.reply ?? before.reply) || undefined) });
    } catch (e) { await noteEmailError('request update', e); }
  }
  return NextResponse.json({ ok: true });
}
