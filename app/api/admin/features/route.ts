import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { FEATURES, FEATURE_KEYS, STAGES, isFeature, isStage, releaseInfo, type Stage } from '@/lib/features';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Releases: what's running, and each feature's stage for each project. Admins only: this is the gate between
// what the studio is building and what clients see.
export async function GET() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const sb = adminClient();
  const [{ data: projects }, flags] = await Promise.all([
    sb.from('projects').select('id, slug, client, status').neq('status', 'archived').order('client'),
    sb.from('project_features').select('project_id, feature, stage')
  ]);
  const set: Record<string, Record<string, Stage>> = {};
  for (const r of flags.data || []) if (isFeature(r.feature) && isStage(r.stage)) (set[r.project_id] ||= {})[r.feature] = r.stage;
  return NextResponse.json({
    release: releaseInfo(),
    ready: !flags.error,
    features: FEATURE_KEYS.map((k) => ({ key: k, ...FEATURES[k] })),
    projects: (projects || []).map((p) => ({ ...p, stages: Object.fromEntries(FEATURE_KEYS.map((k) => [k, set[p.id]?.[k] || FEATURES[k].default])) }))
  });
}

export async function PUT(req: Request) {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  const b = z.object({ projectId: z.string().uuid(), feature: z.string(), stage: z.enum(STAGES) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success || !isFeature(b.data.feature)) return NextResponse.json({ error: 'Unknown feature or stage.' }, { status: 400 });
  const { error } = await adminClient().from('project_features').upsert({ project_id: b.data.projectId, feature: b.data.feature, stage: b.data.stage, updated_at: new Date().toISOString(), updated_by: st.user.id });
  if (error) return NextResponse.json({ error: 'Couldn’t save: ' + error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
