import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** Supabase client acting as the signed-in user (row-level security applies). */
export async function userClient() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a server component */ } }
    }
  });
}

/** Service-role client. Server only: bypasses RLS, used for scans, kit builds and encrypted keys. */
export function adminClient() {
  return createClient(env.supabaseUrl(), env.supabaseService(), { auth: { persistSession: false } });
}

export async function currentUser() {
  const sb = await userClient();
  const { data } = await sb.auth.getUser();
  return data.user;
}

export type Staff = { user: NonNullable<Awaited<ReturnType<typeof currentUser>>>; role: 'admin' | 'editor' };
/** Returns the staff member, or a Response to send back (401/403). */
export async function requireStaff(): Promise<Staff | Response> {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const { data } = await adminClient().from('staff').select('role').eq('user_id', user.id).maybeSingle();
  if (!data) return new Response('Studio access only', { status: 403 });
  return { user, role: data.role as Staff['role'] };
}

/** Staff, or a signed-in member of the project. */
export async function requireProjectAccess(projectId: string): Promise<{ user: Staff['user']; staff: boolean; clientAdmin: boolean } | Response> {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const sb = adminClient();
  const { data: st } = await sb.from('staff').select('role').eq('user_id', user.id).maybeSingle();
  if (st) return { user, staff: true, clientAdmin: true };
  const { data: m } = await sb.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle();
  if (!m) return new Response('Not found', { status: 404 });
  return { user, staff: false, clientAdmin: m.role === 'client_admin' };
}
