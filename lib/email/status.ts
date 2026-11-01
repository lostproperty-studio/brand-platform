import { adminClient } from '@/lib/supabase/server';

/** Remembers the last email that failed, and why, so Admin settings can show it */
export async function noteEmailError(where: string, e: unknown) {
  const message = String((e as Error)?.message || e).slice(0, 400);
  console.error(`[email] ${where}:`, message);
  try { await adminClient().from('studio_settings').upsert({ key: 'email_error', value: { where, message, at: new Date().toISOString() }, updated_at: new Date().toISOString() }); } catch { /* best effort */ }
}
export async function clearEmailError() {
  try { await adminClient().from('studio_settings').delete().eq('key', 'email_error'); } catch { /* best effort */ }
}
export async function lastEmailError(): Promise<{ where: string; message: string; at: string } | null> {
  const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'email_error').maybeSingle();
  return (data?.value as { where: string; message: string; at: string }) || null;
}
