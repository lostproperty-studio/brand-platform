import { after } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { render } from '@/lib/email/templates';
import { studioBrand } from '@/lib/email/brand';
import { noteEmailError } from '@/lib/email/status';

// Tells the studio by email when a client sends a request or writes to Lost Property. Goes to REQUESTS_EMAIL (one or
// more addresses, comma-separated) when it's set, otherwise to every active studio admin. Sent after the response, so
// it never slows the client down or fails their request.

async function recipients() {
  const set = (process.env.REQUESTS_EMAIL || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (set.length) return set;
  const { data } = await adminClient().from('staff').select('email, active').eq('role', 'admin');
  return (data || []).filter((s) => s.active !== false && s.email).map((s) => String(s.email));
}

export function notifyStudio(n: { client: string; kind: string; title: string; body: string; from: string; url: string; followUp?: boolean }) {
  after(async () => {
    try {
      const to = await recipients(); if (!to.length) return;
      const mail = render(studioBrand(), {
        subject: n.followUp ? `${n.client}: new message on “${n.title}”` : `${n.client}: ${n.kind.toLowerCase()} · ${n.title}`,
        preheader: n.body.slice(0, 120) || n.title,
        heading: n.followUp ? `New message from ${n.client}` : `New ${n.kind.toLowerCase()} from ${n.client}`,
        lines: [`From ${n.from}`, `“${n.title}”`, ...(n.body ? [n.body.slice(0, 2000)] : [])],
        button: { label: 'Open in the studio', url: n.url },
        note: 'Reply from the project’s Requests in the studio, so the client sees it in their portal.'
      });
      for (const addr of to) await sendEmail({ to: addr, ...mail }).catch((e) => noteEmailError('request notification', e));
    } catch (e) { await noteEmailError('request notification', e).catch(() => {}); }
  });
}
