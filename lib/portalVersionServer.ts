import { cookies } from 'next/headers';
import { adminClient } from '@/lib/supabase/server';
import { LATEST_PORTAL, PORTALS, portalV2, type BetaAccess } from '@/lib/portalVersion';

// Server side of the portal versions (see lib/portalVersion.ts). The main version is a studio setting; each project's
// beta access is a row in project_features (feature 'portal': off, studio, or live for the client). Both fall back to
// safe defaults (Portal 1 main, beta for the studio only) when the tables aren't there yet. The staging site
// (PORTAL_V2=1) runs the latest version everywhere.

export const BETA_COOKIE = 'lp-portal-beta';

/** The main portal and the beta (null when nothing newer is in the code) */
export async function portalLine(): Promise<{ main: number; beta: number | null }> {
  if (portalV2()) return { main: LATEST_PORTAL, beta: null };
  const { data, error } = await adminClient().from('studio_settings').select('value').eq('key', 'portal').maybeSingle();
  const v = !error ? (data?.value as { main?: number } | null) : null;
  const main = PORTALS.some((p) => p.n === v?.main) ? v!.main! : 1;
  return { main, beta: PORTALS.some((p) => p.n === main + 1) ? main + 1 : null };
}

export async function setMainPortal(main: number) {
  if (!PORTALS.some((p) => p.n === main)) throw new Error('No such portal version.');
  const { error } = await adminClient().from('studio_settings').upsert({ key: 'portal', value: { main, at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const fromStage = (s?: string | null): BetaAccess => (s === 'off' ? 'off' : s === 'beta' || s === 'live' ? 'client' : 'studio');
const toStage: Record<BetaAccess, string> = { off: 'off', studio: 'studio', client: 'live' };

/** Each project's beta access (default Studio only) */
export async function betaAccess(projectIds: string[]): Promise<Record<string, BetaAccess>> {
  const out = Object.fromEntries(projectIds.map((id) => [id, 'studio' as BetaAccess]));
  if (!projectIds.length) return out;
  const { data, error } = await adminClient().from('project_features').select('project_id, stage').eq('feature', 'portal').in('project_id', projectIds);
  if (!error) for (const r of data || []) out[r.project_id] = fromStage(r.stage);
  return out;
}

export async function setBetaAccess(projectId: string, access: BetaAccess, by: string) {
  const { error } = await adminClient().from('project_features').upsert({ project_id: projectId, feature: 'portal', stage: toStage[access], updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw error;
}

export type PortalView = { portal: number; main: number; beta: number | null; access: BetaAccess; onBeta: boolean; canToggle: boolean };

/** Which portal this person sees on this project. Clients: the beta if their access is Client, otherwise main.
 *  Studio staff in the preview (Staging): the same as the client, unless they've switched to the beta there. */
export async function portalView(projectId: string, slug: string, preview: boolean): Promise<PortalView> {
  const line = await portalLine();
  const access = (await betaAccess([projectId]))[projectId];
  if (!line.beta || access === 'off') return { portal: line.main, ...line, access, onBeta: false, canToggle: false };
  const wants = preview ? (await cookies()).get(BETA_COOKIE)?.value : undefined;
  const onBeta = access === 'client' ? wants !== `main:${slug}` : wants === `beta:${slug}`;
  return { portal: onBeta ? line.beta : line.main, ...line, access, onBeta, canToggle: preview };
}

/** Whether the studio's tools for Portal 2 (Motion, the apps' files) are open on this project */
export async function portalV2Studio(projectId: string) {
  const line = await portalLine();
  if (line.main >= 2) return true;
  if (!line.beta || line.beta < 2) return false;
  return (await betaAccess([projectId]))[projectId] !== 'off';
}
