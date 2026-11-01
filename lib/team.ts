import { noteEmailError } from '@/lib/email/status';
import { appOrigin } from '@/lib/origin';
import { createHash, randomBytes } from 'node:crypto';
import { adminClient, ROLE_OF, type ClientRole } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { emailProvider, sendEmail } from '@/lib/email/send';
import { clientBrand } from '@/lib/email/brand';
import { clientInviteEmail } from '@/lib/email/templates';
import { ensureUser, signInUrl } from '@/lib/auth/links';

export type Member = { user_id: string; email: string | null; role: ClientRole; created_at: string; last_sign_in_at?: string | null };
export const ROLE_LABEL: Record<ClientRole, string> = { creator: 'Creator', manager: 'Manager', admin: 'Admin' };
export const ROLE_HELP: Record<ClientRole, string> = {
  creator: 'Uses the guidelines, downloads the kit and makes things with the tools.',
  manager: 'Also uploads and updates team files, and invites creators and managers.',
  admin: 'Everything, including AI settings and usage, all people and permissions, and requests to Lost Property.'
};
const DB: Record<ClientRole, string> = { admin: 'client_admin', manager: 'client_manager', creator: 'client_viewer' };

/** Managers can give Creator or Manager; only admins (and the studio) can make admins. */
export const canGrant = (by: ClientRole, role: ClientRole) => by === 'admin' || role !== 'admin';

export async function listMembers(projectId: string): Promise<Member[]> {
  const sb = adminClient();
  const { data } = await sb.from('project_members').select('user_id, email, role, created_at').eq('project_id', projectId).order('created_at');
  return Promise.all((data || []).map(async (m) => {
    const { data: u } = await sb.auth.admin.getUserById(m.user_id);
    return { user_id: m.user_id, email: m.email || u.user?.email || null, role: ROLE_OF[m.role as string] || 'creator', created_at: m.created_at, last_sign_in_at: u.user?.last_sign_in_at ?? null };
  }));
}

export async function addMember(projectId: string, userId: string, role: ClientRole, email: string | null, invitedBy: string | null) {
  const { error } = await adminClient().from('project_members').upsert({ project_id: projectId, user_id: userId, role: DB[role], email, invited_by: invitedBy }, { onConflict: 'project_id,user_id' });
  if (error) throw error;
}

/** Invites someone by email. New people get an invite email; people with an account are added straight away. */
export async function inviteMember(projectId: string, slug: string, email: string, role: ClientRole, invitedBy: string) {
  const sb = adminClient();
  const clean = email.trim().toLowerCase();
  let userId: string | null = null, emailed = false;
  // With the platform's own email set up: a branded invite in the client's look, signing them straight in
  if (emailProvider()) {
    const user = await ensureUser(clean);
    await addMember(projectId, user.id, role, clean, invitedBy);
    try {
      const { url } = await signInUrl(clean, '/p/' + slug);
      const { data: by } = await sb.auth.admin.getUserById(invitedBy);
      const { data: st } = await sb.from('staff').select('name').eq('user_id', invitedBy).maybeSingle();
      await sendEmail({ to: clean, ...clientInviteEmail(await clientBrand(slug), url, ROLE_LABEL[role].toLowerCase() === 'admin' ? 'an admin' : `a ${ROLE_LABEL[role].toLowerCase()}`, (st?.name as string) || by.user?.email || null) });
      emailed = true;
    } catch (e) { await noteEmailError('invite', e); }
    return { userId: user.id, emailed };
  }
  const { data: inv, error } = await sb.auth.admin.inviteUserByEmail(clean, { redirectTo: `${await appOrigin()}/auth/confirm?next=${encodeURIComponent('/p/' + slug)}` });
  if (inv?.user) { userId = inv.user.id; emailed = true; }
  else if (error && /already|registered|exists/i.test(error.message)) { const { data: link } = await sb.auth.admin.generateLink({ type: 'magiclink', email: clean }); userId = link?.user?.id ?? null; }
  else if (error) throw new Error(/rate|limit/i.test(error.message) ? 'Too many invite emails in the last hour. Try again later, or share an invite link instead.' : error.message);
  if (!userId) throw new Error('Couldn’t find or create that account.');
  await addMember(projectId, userId, role, clean, invitedBy);
  return { userId, emailed };
}

// ---------- invite links
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export type InviteLink = { id: string; role: ClientRole; label: string; expires_at: string | null; max_uses: number | null; uses: number; revoked: boolean; created_at: string };

export async function createInviteLink(projectId: string, role: ClientRole, by: string, opts: { label?: string; days?: number; maxUses?: number }) {
  const token = randomBytes(18).toString('base64url');
  const { error } = await adminClient().from('invite_links').insert({ project_id: projectId, role: DB[role], token_hash: hashToken(token), label: opts.label || '', created_by: by, expires_at: opts.days ? new Date(Date.now() + opts.days * 864e5).toISOString() : null, max_uses: opts.maxUses || null });
  if (error) throw error;
  return `${await appOrigin()}/join/${token}`;
}

export async function listInviteLinks(projectId: string): Promise<InviteLink[]> {
  const { data } = await adminClient().from('invite_links').select('id, role, label, expires_at, max_uses, uses, revoked, created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  return (data || []).map((l) => ({ ...l, role: ROLE_OF[l.role as string] || 'creator' })) as InviteLink[];
}

/** Finds a usable invite link by its token. */
export async function findInvite(token: string) {
  const { data } = await adminClient().from('invite_links').select('id, project_id, role, expires_at, max_uses, uses, revoked, projects(slug, client)').eq('token_hash', hashToken(token)).maybeSingle();
  if (!data) return { error: 'This invite link doesn’t exist.' as const };
  const p = data.projects as unknown as { slug: string; client: string };
  if (data.revoked) return { error: 'This invite link has been turned off.' as const, project: p };
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'This invite link has expired.' as const, project: p };
  if (data.max_uses && data.uses >= data.max_uses) return { error: 'This invite link has been used the maximum number of times.' as const, project: p };
  return { link: { id: data.id as string, projectId: data.project_id as string, role: ROLE_OF[data.role as string] || 'creator', uses: data.uses as number }, project: p };
}
