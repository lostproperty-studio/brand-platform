import { adminClient } from '@/lib/supabase/server';
import { DEFAULT_AI_DONTS, DEFAULT_HOUSE, DEFAULT_PLAYBOOK, DEFAULT_SLOTS, type Playbook } from '@/lib/playbook';

// Reads and saves the studio playbook (server only).

/** The studio's current playbook (falls back to the default if none is saved or the table isn't there yet). */
export async function getPlaybook(): Promise<Playbook> {
  try {
    const { data } = await adminClient().from('studio_settings').select('value, updated_at').eq('key', 'playbook').maybeSingle();
    const v = data?.value as Partial<Playbook> | undefined;
    if (!v) return DEFAULT_PLAYBOOK;
    return { house: v.house || DEFAULT_HOUSE, slots: v.slots?.length ? v.slots : DEFAULT_SLOTS, aiDonts: v.aiDonts?.length ? v.aiDonts : DEFAULT_AI_DONTS, updatedAt: data?.updated_at };
  } catch { return DEFAULT_PLAYBOOK; }
}

export async function savePlaybook(p: Playbook) {
  const { error } = await adminClient().from('studio_settings').upsert({ key: 'playbook', value: { house: p.house, slots: p.slots, aiDonts: p.aiDonts }, updated_at: new Date().toISOString() });
  if (error) throw error;
}
