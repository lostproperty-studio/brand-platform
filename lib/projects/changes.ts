import { adminClient } from '@/lib/supabase/server';

// What's changed on a project and what's been published, for the studio: like a site builder's versions, each
// publish is a version holding the studio edits made since the one before, and edits made since the last publish
// are waiting to go live. Built from what's already recorded: an 'edit' row in `activity` per person and area (at
// most one every ten minutes, see lib/studioTeam.ts) and a row in `project_versions` per publish.

/** Areas whose changes reach the client only when the project is published. Others (the team, requests, the
 *  sign-in page, motion, which has its own Submit) apply straight away, so they never wait for a publish. */
const NEEDS_PUBLISH: Record<string, string> = {
  guidelines: 'Guidelines', typefaces: 'Typefaces', showcase: 'Showcase', project: 'Brand details and voice', tools: 'Apps and tools',
  downloads: 'Downloads', kit: 'Kit', connector: 'Claude connector'
};
const OTHER: Record<string, string> = { 'login screen': 'Sign-in page', motion: 'Motion', requests: 'Requests', review: 'Review notes', team: 'Studio team' };
export const areaLabel = (a: string) => NEEDS_PUBLISH[a] || OTHER[a] || a.charAt(0).toUpperCase() + a.slice(1);

export type Change = { who: string; area: string; label: string; at: string; needsPublish: boolean };
export type Version = { version: string; at: string; by: string; changes: Change[] };
export type ChangeFeed = {
  /** The version clients see now, or null if never published */
  live: Version | null;
  /** Edits made since the last publish that clients can't see yet (newest first) */
  pending: Change[];
  /** Edits since the last publish that apply straight away (newest first) */
  direct: Change[];
  /** Every publish, newest first, each with the edits it took live */
  versions: Version[];
};

/** Names for studio staff, from the staff list */
async function staffNames() {
  const { data } = await adminClient().from('staff').select('user_id, email, name');
  const rows = data || [];
  return (uid?: string | null) => { const s = rows.find((x) => x.user_id === uid); return s ? s.name || String(s.email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Someone'; };
}

/** The project's changes and publishes over the last 90 days (and the last publish, however old). Never throws. */
export async function changeFeed(projectId: string): Promise<ChangeFeed> {
  const empty: ChangeFeed = { live: null, pending: [], direct: [], versions: [] };
  try {
    const sb = adminClient();
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const [{ data: vers }, { data: edits }, name] = await Promise.all([
      sb.from('project_versions').select('version, published_by, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(40),
      sb.from('activity').select('user_id, detail, created_at').eq('project_id', projectId).eq('kind', 'edit').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
      staffNames()
    ]);
    const changes: Change[] = (edits || []).filter((e) => e.detail !== 'publish').map((e) => {
      const area = e.detail || 'project';
      return { who: name(e.user_id), area, label: areaLabel(area), at: e.created_at, needsPublish: area in NEEDS_PUBLISH };
    });
    const versions: Version[] = (vers || []).map((v) => ({ version: v.version, at: v.created_at, by: name(v.published_by), changes: [] }));
    // Each edit belongs to the first publish after it; edits after the newest publish are still waiting
    const pending: Change[] = [], direct: Change[] = [];
    for (const c of changes) {
      const t = new Date(c.at).getTime();
      // versions are newest first, so the one that took this edit live is the oldest publish after it
      let home: Version | null = null;
      for (const v of versions) { if (new Date(v.at).getTime() >= t) home = v; else break; }
      if (home) home.changes.push(c);
      else (c.needsPublish ? pending : direct).push(c);
    }
    return { live: versions[0] || null, pending, direct, versions };
  } catch { return empty; }
}

/** The pending changes as one line per area, newest first: "Typefaces · Steffan, Rosie · 2 hours ago" */
export function byArea(list: Change[]) {
  const out: { area: string; label: string; who: string[]; at: string }[] = [];
  for (const c of list) {
    const row = out.find((x) => x.area === c.area);
    if (!row) out.push({ area: c.area, label: c.label, who: [c.who], at: c.at });
    else if (!row.who.includes(c.who)) row.who.push(c.who);
  }
  return out;
}
