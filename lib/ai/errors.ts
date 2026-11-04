import { adminClient } from '@/lib/supabase/server';

// Plain-language messages for AI failures on the client's own key, and a note on the project when Anthropic
// rejects the key, so the studio's Overview and the portal's Settings can say it needs replacing.
export function aiErrorMessage(e: unknown) {
  const err = e as { status?: number; message?: string };
  const m = String(err?.message || e);
  const status = err?.status ?? Number(m.match(/^(\d{3})\b/)?.[1]);
  if (status === 401 || /authentication_error|invalid x-api-key/i.test(m)) return { rejected: true, text: 'Anthropic rejected the AI key saved for this portal: it may have been revoked, deleted or replaced. A portal admin can paste a new key in Settings, under AI.' };
  if (status === 403 || /permission_error/i.test(m)) return { rejected: true, text: 'The AI key saved for this portal doesn’t have permission to use this model. A portal admin can check the key’s workspace in the Anthropic Console, or paste a different key in Settings.' };
  if (/credit balance|billing/i.test(m)) return { rejected: false, text: 'The Anthropic account behind this portal’s AI key is out of credit. Its owner can add credit in the Anthropic Console.' };
  if (status === 429 || /rate_limit/i.test(m)) return { rejected: false, text: 'Too many requests at once. Wait a moment and ask again.' };
  if (status === 529 || /overloaded/i.test(m)) return { rejected: false, text: 'The AI is busy right now. Try again in a minute.' };
  return { rejected: false, text: 'The AI couldn’t answer just now. Try again in a minute.' };
}

/** Records (or clears) that Anthropic rejected the project's key */
export async function markKeyRejected(projectId: string, rejected: boolean) {
  const sb = adminClient();
  const { data } = await sb.from('projects').select('content').eq('id', projectId).single();
  const c = (data?.content || {}) as Record<string, unknown>;
  if (!!c.aiKeyRejectedAt === rejected) return;
  await sb.from('projects').update({ content: { ...c, aiKeyRejectedAt: rejected ? new Date().toISOString() : undefined } }).eq('id', projectId);
}

/** For JSON routes: the message, with the rejection recorded */
export async function aiFailure(projectId: string, e: unknown) {
  const r = aiErrorMessage(e);
  if (r.rejected) await markKeyRejected(projectId, true).catch(() => {});
  return r.text;
}
