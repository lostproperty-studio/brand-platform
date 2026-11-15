import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appAccess, db } from '@/lib/apps/server';
import { appOrigin } from '@/lib/origin';
import { clientBrand } from '@/lib/email/brand';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { render } from '@/lib/email/templates';
import { nameOf } from '@/lib/guideVersions';

export const runtime = 'nodejs';
type P = { params: Promise<{ slug: string; app: string; id: string }> };

// Portal v2: tell someone on the project about a file: it's been handed to them to review, changes were asked for,
// or it was signed off. Only people on the project (or Lost Property) can be told. The app still works if no email
// service is set up; it just says so.
const Body = z.object({
  to: z.string().uuid(),
  kind: z.enum(['handoff', 'changes', 'signed']),
  pieces: z.array(z.string().max(160)).max(40).default([]),
  note: z.string().max(2000).optional()
});
const APP_NAME: Record<string, string> = { writer: 'Writer', director: 'Director', designer: 'Designer', photographer: 'Photographer' };

export async function POST(req: Request, ctx: P) {
  const { slug, app, id } = await ctx.params;
  const a = await appAccess(slug, app); if (!a) return new Response('Not found', { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = db();
  const { data: file } = await sb.from('app_files').select('title').eq('id', id).eq('project_id', a.p.id).eq('app', a.app).maybeSingle();
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [{ data: member }, { data: staff }] = await Promise.all([
    sb.from('project_members').select('email').eq('project_id', a.p.id).eq('user_id', b.data.to).maybeSingle(),
    sb.from('staff').select('email').eq('user_id', b.data.to).maybeSingle()
  ]);
  if (!member && !staff) return NextResponse.json({ error: 'They’re not on this project.' }, { status: 403 });
  let email = member?.email || staff?.email || null;
  if (!email) { const { data } = await sb.auth.admin.getUserById(b.data.to); email = data.user?.email || null; }
  if (!email || !emailProvider()) return NextResponse.json({ emailed: false });
  const by = nameOf(a.acc.user);
  const what = b.data.pieces.length ? b.data.pieces.map((x) => `“${x}”`).join(', ') : `“${file.title}”`;
  const url = `${await appOrigin()}/p/${slug}/${a.app}?${a.app === 'director' ? 'p' : 'f'}=${id}`;
  const e = b.data.kind === 'handoff'
    ? { subject: `${by} sent you ${file.title} to review`, heading: 'Ready for your review', lines: [`${by} has sent you ${what} in ${file.title}, in ${APP_NAME[a.app]}.`] }
    : b.data.kind === 'changes'
      ? { subject: `Changes asked for: ${file.title}`, heading: 'Changes asked for', lines: [`${by} has asked for changes to ${what} in ${file.title}.`] }
      : { subject: `Signed off: ${file.title}`, heading: 'Signed off', lines: [`${by} has signed off ${what} in ${file.title}.`] };
  const mail = render(await clientBrand(slug), { ...e, preheader: b.data.note?.slice(0, 120) || e.lines[0], lines: [...e.lines, ...(b.data.note ? [`“${b.data.note}”`] : [])], button: { label: `Open in ${APP_NAME[a.app]}`, url } });
  try { await sendEmail({ to: email, ...mail }); return NextResponse.json({ emailed: true }); }
  catch { return NextResponse.json({ emailed: false }); }
}
