import { adminClient } from '@/lib/supabase/server';
import { signMany, signOne } from '@/lib/storage/signed';

// A project's picture, made from its logo: the logo on the brand's primary colour, using the version made for that
// background (white or reversed on dark, black or positive on light). Used on the Overview and on the Projects page.
export type LogoThumb = { bg: string; logo: string | null; client: string };
type P = { id: string; client: string; brand?: unknown; content?: unknown };

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ON_DARK = /white|light|reverse|negative|knock|inverse/i;
const ON_LIGHT = /black|dark|positive|mono/i;

function pick(paths: string[], dark: boolean) {
  const name = (p: string) => p.split('/').pop() || '';
  const svg = paths.filter((p) => /\.svg$/i.test(p));
  const pool = svg.length ? svg : paths;
  const forDark = pool.filter((p) => ON_DARK.test(name(p)));
  const forLight = pool.filter((p) => ON_LIGHT.test(name(p)) && !ON_DARK.test(name(p)));
  const other = pool.filter((p) => !forDark.includes(p) && !forLight.includes(p));
  // Prefer the primary lockup (wordmark or logo) over symbols and marks
  const main = (l: string[]) => l.find((p) => /wordmark|logo|primary|lockup/i.test(name(p))) || l[0];
  if (dark) return main(forDark) ? { path: main(forDark), dark: true } : main(forLight) || main(other) ? { path: main(forLight) || main(other), dark: false } : null;
  return main(forLight) || main(other) ? { path: main(forLight) || main(other), dark: false } : main(forDark) ? { path: main(forDark), dark: true } : null;
}

export async function logoThumbs(projects: P[]): Promise<Record<string, LogoThumb>> {
  const sb = adminClient();
  const ids = projects.map((p) => p.id);
  if (!ids.length) return {};
  const { data } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id)').in('deliverable_parts.project_id', ids).like('path', 'assets/logo/%');
  const byProject = new Map<string, Map<string, string>>(); // project → file path → storage path
  for (const f of (data || []) as unknown as { path: string; storage_path: string | null; deliverable_parts: { project_id: string } }[]) {
    if (!f.storage_path) continue;
    const m = byProject.get(f.deliverable_parts.project_id) || new Map(); m.set(f.path, f.storage_path); byProject.set(f.deliverable_parts.project_id, m);
  }
  // Logos imported from the Figma assets page take over from the kit's; other uploads to the Logos download join them
  for (const p of projects) {
    const files = ((p.content as { packages?: { logos?: { files?: { name: string; path: string; fromFigma?: boolean }[] } } } | null)?.packages?.logos?.files) || [];
    if (!files.length) continue;
    const m: Map<string, string> = files.some((f) => f.fromFigma) ? new Map() : byProject.get(p.id) || new Map();
    for (const f of files) if (!m.has('pkg/' + f.name)) m.set('pkg/' + f.name, f.path); byProject.set(p.id, m);
  }
  const chosen: Record<string, { bg: string; storage: string | null }> = {};
  for (const p of projects) {
    const core = ((p.brand as { core?: { hex: string }[] } | null)?.core || []).map((c) => c.hex).filter((h) => /^#[0-9A-F]{6}$/i.test(h));
    const primary = core[0] || '#F7F7F7';
    const files = byProject.get(p.id);
    const choice = files ? pick([...files.keys()], lum(primary) < 0.5) : null;
    // A logo made for a light ground can't sit on a dark primary: use the light studio fill instead
    const bg = !choice ? primary : choice.dark === lum(primary) < 0.5 ? primary : choice.dark ? '#111111' : '#F7F7F7';
    chosen[p.id] = { bg, storage: choice && files ? files.get(choice.path)! : null };
  }
  const paths = Object.values(chosen).map((c) => c.storage).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await signMany('kits', paths, 6 * 3600) : { data: [] };
  const url = new Map((signed || []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
  return Object.fromEntries(projects.map((p) => [p.id, { bg: chosen[p.id].bg, logo: chosen[p.id].storage ? url.get(chosen[p.id].storage!) || null : null, client: p.client }]));
}
