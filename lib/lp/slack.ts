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
