import { createHmac, timingSafeEqual } from 'node:crypto';

// Lost Property's Slack: every conversation with a client is a thread in one channel, so anyone in the studio can
// reply there. Needs a Slack app in Lost Property's workspace with a bot token (chat:write, users:read,
// channels:history, reactions:read), its signing secret, and the channel's ID:
//   SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_LP_CHANNEL
// Without them, conversations are still kept in the platform and answered from the studio.

export const slackReady = () => !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_LP_CHANNEL);

async function api<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  const r = await fetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await r?.json().catch(() => null);
  return j?.ok ? (j as T) : null;
}

/** Posts a message in the channel (or in a thread); returns its timestamp, which is Slack's id for it */
export async function slackPost(text: string, thread?: string | null, blocks?: unknown[]) {
  if (!slackReady()) return null;
  const j = await api<{ ts: string }>('chat.postMessage', { channel: process.env.SLACK_LP_CHANNEL, text, ...(blocks ? { blocks } : {}), ...(thread ? { thread_ts: thread } : {}), unfurl_links: false, unfurl_media: false });
  return j?.ts || null;
}

export async function slackName(user: string) {
  const j = await api<{ user: { profile?: { display_name?: string; real_name?: string } } }>('users.info', { user });
  const p = j?.user?.profile;
  return (p?.display_name || p?.real_name || 'Lost Property').trim();
}

/** Slack signs every request it sends; anything older than five minutes or unsigned is refused */
export function slackVerified(raw: string, ts: string | null, sig: string | null) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex');
  return mine.length === sig.length && timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
}

/** Slack's own formatting from plain text (and back), enough for messages between people */
export const toSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fromSlack = (s: string) => s.replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)').replace(/<(https?:[^>]+)>/g, '$1').replace(/<@[A-Z0-9]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

/** Admin settings → Slack: checks the settings and posts a test message, saying in plain words what's wrong if it
 *  doesn't arrive (Slack's own error codes, translated) */
export async function slackCheck(by: string): Promise<{ ok: boolean; message: string; team?: string }> {
  const token = process.env.SLACK_BOT_TOKEN, channel = process.env.SLACK_LP_CHANNEL;
  const missing = [!token && 'SLACK_BOT_TOKEN', !channel && 'SLACK_LP_CHANNEL', !process.env.SLACK_SIGNING_SECRET && 'SLACK_SIGNING_SECRET'].filter(Boolean);
  if (!token || !channel) return { ok: false, message: `Vercel is missing ${missing.join(' and ')}. Add ${missing.length === 1 ? 'it' : 'them'} under Settings → Environment Variables (Production), then redeploy.` };
  const call = async (method: string, body: Record<string, unknown>) => {
    const r = await fetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }).catch(() => null);
    return ((await r?.json().catch(() => null)) || { ok: false, error: 'no_response' }) as { ok: boolean; error?: string; team?: string };
  };
  const WHY: Record<string, string> = {
    invalid_auth: 'Slack doesn’t recognise the bot token. Copy the Bot User OAuth Token (starts xoxb-) from the app’s OAuth & Permissions page into SLACK_BOT_TOKEN, then redeploy.',
    not_authed: 'The bot token is empty. Copy the Bot User OAuth Token into SLACK_BOT_TOKEN, then redeploy.',
    account_inactive: 'The Slack app has been uninstalled or switched off. Reinstall it from its OAuth & Permissions page, then copy the new token into SLACK_BOT_TOKEN.',
    token_revoked: 'The bot token was revoked. Reinstall the app and copy the new token into SLACK_BOT_TOKEN, then redeploy.',
    channel_not_found: 'Slack can’t find that channel. Check SLACK_LP_CHANNEL is the channel ID (starts with C, from the channel’s About tab), not its name. For a private channel, invite the app first.',
    not_in_channel: 'The app isn’t in the channel yet. In the channel, type /invite @LP Platform, then try again.',
    missing_scope: 'The app is missing a permission. Add chat:write (and users:read, channels:history, groups:history, reactions:read) under OAuth & Permissions, reinstall, and copy the new token.',
    is_archived: 'That channel is archived. Unarchive it or use another channel’s ID.',
    no_response: 'Couldn’t reach Slack from the platform. Try again in a minute.'
  };
  const auth = await call('auth.test', {});
  if (!auth.ok) return { ok: false, message: WHY[auth.error || ''] || `Slack said “${auth.error}”.` };
  const post = await call('chat.postMessage', { channel, text: `Test from the Lost Property platform, sent by ${by}. Client requests and messages to Lost Property arrive in this channel.`, unfurl_links: false });
  if (!post.ok) return { ok: false, team: auth.team, message: WHY[post.error || ''] || `Slack said “${post.error}”.` };
  return { ok: true, team: auth.team, message: `Sent. Look in the channel in ${auth.team || 'your workspace'}.${process.env.SLACK_SIGNING_SECRET ? '' : ' Replies from Slack won’t reach the portal until SLACK_SIGNING_SECRET is set too.'}` };
}
