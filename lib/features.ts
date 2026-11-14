import { adminClient } from '@/lib/supabase/server';
import pkg from '@/package.json';
import { FEATURES, FEATURE_KEYS, isFeature, isStage, type FeatureKey, type Stage } from '@/lib/featureStages';

// Server side of the release gate (see lib/featureStages.ts for the stages and the registry)
export * from '@/lib/featureStages';

/** Each feature's stage for one project: its own setting, or the default. Falls back to defaults if the table
 *  isn't there yet (a preview deploy before its migration has run). */
export async function projectStages(projectId: string): Promise<Record<FeatureKey, Stage>> {
  const out = Object.fromEntries(FEATURE_KEYS.map((k) => [k, FEATURES[k].default])) as Record<FeatureKey, Stage>;
  const { data, error } = await adminClient().from('project_features').select('feature, stage').eq('project_id', projectId);
  if (error) return out;
  for (const r of data || []) if (isFeature(r.feature) && isStage(r.stage)) out[r.feature] = r.stage;
  return out;
}

/** What's running: version from package.json, plus Vercel's environment, branch and commit when deployed */
export function releaseInfo() {
  return {
    version: pkg.version,
    env: process.env.VERCEL_ENV || 'local',
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null
  };
}
