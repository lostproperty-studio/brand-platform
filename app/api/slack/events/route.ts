import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { fromSlack, slackName, slackVerified } from '@/lib/lp/slack';

// Replies from Lost Property's Slack: a message in a client's thread goes back to the portal as Lost Property's
// reply; a ✅ on the thread's first message marks it done. Slack signs each call; anything unsigned is refused.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!slackVerified(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) return new Response('Unauthorised', { status: 401 });
  const j = JSON.parse(raw);
  if (j.type === 'url_verification') return NextResponse.json({ challenge: j.challenge });
  const e = j.event || {};
  const sb = adminClient();
  if (e.channel && process.env.SLACK_LP_CHANNEL && e.channel !== process.env.SLACK_LP_CHANNEL && e.item?.channel !== process.env.SLACK_LP_CHANNEL) return NextResponse.json({ ok: true });

  if (e.type === 'message' && !e.subtype && !e.bot_id && e.thread_ts && e.thread_ts !== e.ts && e.text) {
    const { data: r } = await sb.from('requests').select('id, status').eq('slack_ts', e.thread_ts).maybeSingle();
    if (r) {
      const body = fromSlack(e.text);
      if (body) {
        await sb.from('request_messages').upsert({ request_id: r.id, author: 'lp', name: await slackName(e.user), body, slack_ts: e.ts }, { onConflict: 'slack_ts', ignoreDuplicates: true });
        await sb.from('requests').update({ reply: body, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(r.status === 'open' ? { status: 'in_progress' } : {}) }).eq('id', r.id);
      }
    }
  }
  if (e.type === 'reaction_added' && /^(white_check_mark|heavy_check_mark|white_tick)$/.test(e.reaction) && e.item?.ts) {
    await sb.from('requests').update({ status: 'done', updated_at: new Date().toISOString() }).eq('slack_ts', e.item.ts);
  }
  return NextResponse.json({ ok: true });
}
