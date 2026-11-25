import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug } from '@/lib/projects/snapshot';
import { projectStages, canSee } from '@/lib/features';
import { nameOf } from '@/lib/guideVersions';
import { slackPost, toSlack } from '@/lib/lp/slack';
import { notifyStudio } from '@/lib/email/studioNotify';

// Working with Lost Property: conversations (requests with messages), each mirrored as a thread in the studio's
// Slack. Everyone in a portal can talk to Lost Property; people see their own conversations, admins see all.

export type Thread = { id: string; kind: string; title: string; status: string; mine: boolean; name: string; created_at: string; last_message_at: string | null; preview: string };
export type Message = { id: string; author: 'client' | 'lp'; name: string; body: string; created_at: string; mine: boolean };
export const KINDS: Record<string, string> = { chat: 'Chat', edit: 'Change to the guidelines', asset: 'New or updated asset', feedback: 'Feedback on our work', session: 'Session', domain: 'Own domain', access: 'Access', other: 'Something else' };

/** Who can talk to Lost Property here: anyone on the portal, once the 'support' release stage lets them see it */
export async function supportAccess(slug: string) {
  const p = await projectBySlug(slug); if (!p) return null;
  const acc = await requireProjectAccess(p.id); if (acc instanceof Response) return null;
  if (!canSee((await projectStages(p.id)).support, acc.staff)) return null;
  return { p, acc, all: acc.clientAdmin || acc.staff, name: nameOf(acc.user as Parameters<typeof nameOf>[0]) };
}
type Access = NonNullable<Awaited<ReturnType<typeof supportAccess>>>;

export async function threads(a: Access): Promise<Thread[]> {
  let q = adminClient().from('requests').select('id, kind, title, details, status, user_id, created_at, last_message_at').eq('project_id', a.p.id).order('created_at', { ascending: false }).limit(100);
  if (!a.all) q = q.eq('user_id', a.acc.user.id);
  const { data } = await q;
  const rows = (data || []) as { id: string; kind: string; title: string; details: string; status: string; user_id: string | null; created_at: string; last_message_at: string | null }[];
  const { data: last } = rows.length ? await adminClient().from('request_messages').select('request_id, body, name, created_at').in('request_id', rows.map((r) => r.id)).order('created_at', { ascending: false }) : { data: [] };
  const lastBy = new Map<string, { body: string; name: string }>(); for (const m of (last || []) as { request_id: string; body: string; name: string }[]) if (!lastBy.has(m.request_id)) lastBy.set(m.request_id, m);
  const { data: firsts } = rows.length ? await adminClient().from('request_messages').select('request_id, name').in('request_id', rows.map((r) => r.id)).eq('author', 'client').order('created_at') : { data: [] };
  const who = new Map<string, string>(); for (const m of (firsts || []) as { request_id: string; name: string }[]) if (!who.has(m.request_id)) who.set(m.request_id, m.name);
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, mine: r.user_id === a.acc.user.id, name: who.get(r.id) || '', created_at: r.created_at, last_message_at: r.last_message_at, preview: (lastBy.get(r.id)?.body || r.details || '').slice(0, 140) }));
}

export async function thread(a: Access, id: string) {
  const { data: r } = await adminClient().from('requests').select('id, kind, title, details, status, user_id, created_at').eq('id', id).eq('project_id', a.p.id).maybeSingle();
  if (!r || (!a.all && r.user_id !== a.acc.user.id)) return null;
  const { data: ms } = await adminClient().from('request_messages').select('id, author, name, body, created_at, user_id').eq('request_id', id).order('created_at');
  let messages: Message[] = ((ms || []) as (Message & { user_id: string | null })[]).map(({ user_id, ...m }) => ({ ...m, mine: m.author === 'client' && user_id === a.acc.user.id }));
  // Requests sent before conversations: their details (and any reply) read as the first messages
  if (!messages.length && r.details) messages = [{ id: `${r.id}-d`, author: 'client', name: '', body: r.details, created_at: r.created_at, mine: r.user_id === a.acc.user.id }];
  return { id: r.id, kind: r.kind, title: r.title, status: r.status, messages };
}

function slackHead(a: Access, kind: string, title: string, origin: string, id: string) {
  return `*${toSlack(a.p.client)}* · ${KINDS[kind] || 'Request'} from ${toSlack(a.name)}${a.acc.clientAdmin ? ' (admin)' : ''}\n*${toSlack(title)}*\n<${origin}/studio/projects/${a.p.id}?tab=requests&r=${id}|Open in the studio>`;
}

/** Starts a conversation: the request, its first message, and a new thread in Slack */
export async function startThread(a: Access, v: { kind: string; title: string; body: string; origin: string }) {
  const sb = adminClient();
  const now = new Date().toISOString();
  const { data: r, error } = await sb.from('requests').insert({ project_id: a.p.id, user_id: a.acc.user.id, kind: v.kind, title: v.title, details: v.body, last_message_at: now }).select('id').single();
  if (error || !r) throw new Error('Conversations with Lost Property aren’t set up in this database yet.');
  await sb.from('request_messages').insert({ request_id: r.id, author: 'client', user_id: a.acc.user.id, name: a.name, body: v.body });
  const ts = await slackPost(`${slackHead(a, v.kind, v.title, v.origin, r.id)}\n>${toSlack(v.body).replace(/\n/g, '\n>')}`);
  if (ts) await sb.from('requests').update({ slack_ts: ts }).eq('id', r.id);
  notifyStudio({ client: a.p.client, kind: KINDS[v.kind] || 'Request', title: v.title, body: v.body, from: a.name, url: `${v.origin}/studio/projects/${a.p.id}?tab=requests` });
  return r.id as string;
}

export async function reply(a: Access, id: string, body: string, origin: string) {
  const t = await thread(a, id); if (!t) return false;
  const sb = adminClient();
  const { data: r } = await sb.from('requests').select('slack_ts, status, title, kind').eq('id', id).single();
  await sb.from('request_messages').insert({ request_id: id, author: 'client', user_id: a.acc.user.id, name: a.name, body });
  await sb.from('requests').update({ last_message_at: new Date().toISOString(), ...(r?.status === 'done' ? { status: 'open' } : {}), updated_at: new Date().toISOString() }).eq('id', id);
  notifyStudio({ client: a.p.client, kind: KINDS[r?.kind || 'chat'] || 'Request', title: r?.title || 'Conversation', body, from: a.name, url: `${origin}/studio/projects/${a.p.id}?tab=requests`, followUp: true });
  if (r?.slack_ts) await slackPost(`*${toSlack(a.name)}:* ${toSlack(body)}`, r.slack_ts);
  else { const ts = await slackPost(`${slackHead(a, r?.kind || 'chat', r?.title || 'Conversation', origin, id)}\n>${toSlack(body)}`); if (ts) await sb.from('requests').update({ slack_ts: ts }).eq('id', id); }
  return true;
}
