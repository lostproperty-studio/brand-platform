import { adminClient } from '@/lib/supabase/server';
import { withFigmaLogos } from '@/lib/portal/logo';
import { readFonts } from '@/lib/projects/fonts';
import { buildSnapshot } from '@/lib/projects/snapshot';
import { resolvePackages } from '@/lib/portal/packages';
import type { KitFileRow, PortalCtx } from '@/lib/portal/context';
import { dsSource } from '@/lib/designSystemSource';
import { designSystemFiles } from '@/lib/designSystem';
import { SETTING_INFO, type Profile, type SettingKey } from '@/lib/designProfileInfo';

// What a refresh did: what changed since last time, and what's in the package now, so the studio can see the client
// will get what they need.

export type PkgEntry = { name: string; bytes?: number; from?: string };
export type RefreshReport = { title: string; summary: string; changes: string[]; contents: PkgEntry[]; previews?: string[]; designMd?: string };

/** Fresh from the database (not the page's cached copy): what's in one package now */
export async function packageContents(projectId: string, pkg: string): Promise<{ entries: PkgEntry[]; previews: string[]; title: string } | null> {
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('content').eq('id', projectId).single();
  const { data: parts } = await sb.from('deliverable_parts').select('key, status, deliverable_files(path, format, storage_path)').eq('project_id', projectId).order('ord');
  const files: KitFileRow[] = withFigmaLogos((parts || []).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string }))), p?.content, { format: 'svg', part: 'assets', partStatus: 'ready' });
  const snap = await buildSnapshot(projectId).catch(() => null);
  const { fonts } = await readFonts(projectId);
  const all = await resolvePackages({ files, content: p?.content, colours: snap?.colours || [], fonts, preview: true, hasLogo: files.some((f) => /^assets\/logo\/.+\.svg$/i.test(f.path)) });
  const it = all.find((x) => x.id === pkg); if (!it) return null;
  const entries: PkgEntry[] = [
    ...it.uploads.map((u) => ({ name: u.name, bytes: u.bytes, from: u.fromFigma ? 'Figma' : 'Uploaded' })),
    ...it.kitFiles.map((f) => ({ name: f.path.replace(/^(assets|tokens|templates)\//, ''), from: 'Kit' }))
  ];
  if (it.kind === 'colours') for (const f of ['colours.ase', 'colours.css', 'colours.json', 'colours.txt']) entries.push({ name: f, from: 'Made from the guidelines' });
  return { entries, previews: it.images.slice(0, 8).map((im) => im.url), title: it.title };
}

/** What's different between two lists of files */
export function fileChanges(before: PkgEntry[], after: PkgEntry[]): string[] {
  const b = new Map(before.map((e) => [e.name, e])), a = new Map(after.map((e) => [e.name, e]));
  const added = [...a.keys()].filter((k) => !b.has(k)), removed = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && (b.get(k)!.bytes ?? -1) !== (a.get(k)!.bytes ?? -1));
  const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));
  return [
    ...(added.length ? [`Added ${added.length} file${added.length === 1 ? '' : 's'}: ${list(added)}`] : []),
    ...(removed.length ? [`Removed ${removed.length}: ${list(removed)}`] : []),
    ...(changed.length ? [`Updated ${changed.length}: ${list(changed)}`] : [])
  ];
}

const show = (v: unknown): string => {
  if (Array.isArray(v)) return v.length ? v.slice(0, 3).join('; ') + (v.length > 3 ? ` (+${v.length - 3})` : '') : 'none';
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ');
  return String(v);
};
/** What the AI changed in the design system's settings */
export function profileChanges(before: Profile | undefined, after: Profile): string[] {
  if (!before) return ['Read the guidelines for the first time and set every design setting.'];
  const out: string[] = [];
  for (const k of Object.keys(SETTING_INFO) as SettingKey[]) {
    const x = before.settings?.[k]?.value, y = after.settings?.[k]?.value;
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${SETTING_INFO[k].label}: ${show(x)} → ${show(y)}`);
  }
  const newCh = after.chapters.filter((c) => !before.chapters.includes(c));
  if (newCh.length) out.push(`Read new chapters: ${newCh.join(', ')}`);
  return out;
}

/** The design system's files, as the client downloads them */
export async function designSystemContents(pc: PortalCtx): Promise<{ entries: PkgEntry[]; designMd: string }> {
  const { input } = await dsSource(pc);
  const ds = designSystemFiles(input);
  const entries: PkgEntry[] = [...Object.entries(ds.files).map(([k, v]) => ({ name: k, bytes: v.length, from: 'Written from the guidelines' })), ...[...new Set(ds.include)].map((k) => ({ name: k, from: 'From the kit' }))];
  const md = ds.files['DESIGN.md'] || ds.files['SKILL.md'] || Object.entries(ds.files).find(([k]) => /\.md$/i.test(k))?.[1] || '';
  return { entries: entries.sort((a, b) => a.name.localeCompare(b.name)), designMd: md.slice(0, 6000) };
}
