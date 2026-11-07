import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { encryptSecret } from '@/lib/crypto';
import { kreaCheck, type KreaSetting } from '@/lib/krea';

export const runtime = 'nodejs';

// The studio's Krea connection: whether it's set, and saving or removing the key the admin pastes in
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'krea').maybeSingle();
  const v = data?.value as KreaSetting | undefined;
  return NextResponse.json({ connected: !!v?.key, hint: v?.hint || null, at: v?.at || null });
}

export async function PUT(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = z.object({ key: z.string().min(10).max(500) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Paste the whole key.' }, { status: 400 });
  const key = b.data.key.trim();
  try { await kreaCheck(key); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const value: KreaSetting = { key: encryptSecret(key), hint: key.slice(-4), at: new Date().toISOString() };
  await adminClient().from('studio_settings').upsert({ key: 'krea', value, updated_at: value.at });
  return NextResponse.json({ connected: true, hint: value.hint, at: value.at });
}

export async function DELETE() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  await adminClient().from('studio_settings').delete().eq('key', 'krea');
  return NextResponse.json({ connected: false });
}
