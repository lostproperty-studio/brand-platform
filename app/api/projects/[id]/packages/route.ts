import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { packageSettings, type PackageMap } from '@/lib/portal/packages';
import { readSources } from '@/lib/figma/sources';
import { buildGuide } from '@/lib/portal/guide';
import { readDesignProfile } from '@/lib/designProfile';
import type { Profile } from '@/lib/designProfileInfo';
import { portalContext } from '@/lib/portal/context';
import { designSystemContents, fileChanges, packageContents, profileChanges, type RefreshReport } from '@/lib/portal/packageReport';

/** An error in words, not an API's raw reply */
const friendly = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return /^\d{3} \{/.test(m) || /invalid_request|rate_limit|overloaded/i.test(m) ? 'The AI couldn’t read the guidelines just now. Try again in a minute.' : m || 'The refresh didn’t finish. Try again.'; };

export const maxDuration = 300;
/** Packages whose files come from the Figma assets page */
const FROM_FIGMA = ['logos', 'icons', 'images', 'graphics', 'fonts', 'avatars'];
/** Packages built from the guidelines each time they're downloaded: a refresh just confirms it */
const REBUILT: Record<string, string> = {
  colours: 'Built from the guidelines’ colours every time it’s downloaded, so it’s up to date.',
  tokens: 'Built from the guidelines every time it’s downloaded, so it’s up to date.',
  guidelines: 'Written from the guidelines every time it’s downloaded, so it’s up to date.',
  skills: 'The skills are written from the published guidelines every time they’re downloaded. Publish to give clients the latest.'
};

// The studio's control of resource packages: upload files (straight to storage with a signed link, so size isn't
// limited by the server), set a cover, rename, hide, switch on drafted spaces, and add custom packages.

const safe = (s: string) => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 120) || 'file';
const Pkg = z.string().regex(/^(logos|colours|fonts|avatars|icons|images|graphics|tokens|guidelines|templates|team|custom-[a-z0-9]{4,12})$/);
/** Refresh also covers the AI deliverables, which have no files of their own */
const Refreshable = z.string().regex(/^(logos|colours|fonts|avatars|icons|images|graphics|tokens|guidelines|templates|team|design-system|skills|custom-[a-z0-9]{4,12})$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), pkg: Pkg, name: z.string().max(200), cover: z.boolean().optional() }),
  z.object({ action: z.literal('add'), pkg: Pkg, name: z.string().max(200), path: z.string().max(400), bytes: z.number(), type: z.string().max(100), cover: z.boolean().optional() }),
  z.object({ action: z.literal('custom'), title: z.string().min(1).max(80), purpose: z.string().max(300).optional() }),
  z.object({ action: z.literal('patch'), pkg: Pkg, title: z.string().max(80).optional(), purpose: z.string().max(300).optional(), hidden: z.boolean().optional(), enabled: z.boolean().optional(), owner: z.string().max(300).optional(), note: z.string().max(800).optional() }),
  z.object({ action: z.literal('remove-file'), pkg: Pkg, name: z.string().max(200).optional(), path: z.string().max(400).optional() }),
  z.object({ action: z.literal('restore-file'), pkg: Pkg, name: z.string().max(200).optional(), path: z.string().max(400).optional() }),
  z.object({ action: z.literal('remove-cover'), pkg: Pkg }),
  z.object({ action: z.literal('remove-package'), pkg: Pkg }),
  z.object({ action: z.literal('refresh'), pkg: Refreshable })
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'downloads'); if (gate) return gate; }
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const sb = adminClient();
  const d = b.data;

  if (d.action === 'sign') {
    const path = `${id}/packages/${d.pkg}/${d.cover ? 'cover-' + Date.now().toString(36) + '-' : ''}${safe(d.name)}`;
    const { data, error } = await sb.storage.from('kits').createSignedUploadUrl(path, { upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }

  // Refresh: bring a package up to date with the guidelines as they are now, then report what changed and what's in it
  if (d.action === 'refresh') {
    const { data: p0 } = await sb.from('projects').select('slug, content, figma_key, figma_page_id').eq('id', id).single();
    const src = readSources(p0?.content, p0 || undefined);
    const c0 = (p0?.content || {}) as Record<string, unknown>;
    const last = packageSettings(c0)[d.pkg]?.refreshedAt;
    let report: RefreshReport;
    try {
      if (d.pkg === 'design-system') {
        const before = c0.dsProfile as Profile | undefined;
        const after = await readDesignProfile(id);
        const pc = p0?.slug ? await portalContext(p0.slug) : null;
        const cont = pc ? await designSystemContents(pc) : { entries: [], designMd: '' };
        const changes = profileChanges(before, after);
        report = { title: 'Design system', summary: `Read ${after.chapters.length} chapter${after.chapters.length === 1 ? '' : 's'}${after.frames ? ` and ${after.frames} guideline pages` : ''} again. ${changes.length ? `${changes.length} setting${changes.length === 1 ? '' : 's'} changed${last ? ' since the last refresh' : ''}.` : 'The guidelines say the same as last time, so nothing needed to change.'}`, changes, contents: cont.entries, designMd: cont.designMd };
      } else if (d.pkg === 'skills') {
        report = { title: 'Claude skills', summary: REBUILT.skills, changes: [], contents: [] };
      } else {
        const before = await packageContents(id, d.pkg);
        let did = REBUILT[d.pkg] || 'Checked against the guidelines.';
        if (FROM_FIGMA.includes(d.pkg) && src.assets) { await buildGuide(id, 'update', { part: 'assets' }); did = 'Re-imported from the Figma assets page.'; }
        const after = await packageContents(id, d.pkg);
        const changes = fileChanges(before?.entries || [], after?.entries || []);
        report = { title: after?.title || d.pkg, summary: `${did} ${changes.length ? '' : FROM_FIGMA.includes(d.pkg) && src.assets ? 'Nothing had changed in Figma.' : ''}`.trim(), changes, contents: after?.entries || [], previews: after?.previews };
      }
    } catch (e) { return NextResponse.json({ error: friendly(e) }, { status: 500 }); }
    // Read again: an import may have changed the packages
    const { data: p1 } = await sb.from('projects').select('content').eq('id', id).single();
    const c1 = (p1?.content || {}) as Record<string, unknown>;
    const all: PackageMap = { ...packageSettings(c1) };
    const rev = ((c1.guide as { _rev?: number } | undefined)?._rev) || 0;
    all[d.pkg] = { ...(all[d.pkg] || {}), refreshedAt: new Date().toISOString(), refreshedRev: rev };
    await sb.from('projects').update({ content: { ...c1, packages: all } }).eq('id', id);
    return NextResponse.json({ ok: true, did: report.summary, report: { ...report, last }, refreshedAt: all[d.pkg].refreshedAt });
  }

  const { data: p } = await sb.from('projects').select('content').eq('id', id).single();
  const content = (p?.content || {}) as Record<string, unknown>;
  const pkgs: PackageMap = { ...packageSettings(content) };
  const cur = { ...(pkgs[('pkg' in d ? d.pkg : '') as string] || {}) };
  let created: string | undefined;

  if (d.action === 'add') {
    if (!d.path.startsWith(`${id}/packages/${d.pkg}/`)) return NextResponse.json({ error: 'Bad path' }, { status: 400 });
    if (d.cover) cur.cover = d.path;
    else cur.files = [...(cur.files || []).filter((f) => f.name !== safe(d.name)), { name: safe(d.name), path: d.path, bytes: d.bytes, type: d.type }];
    if (!d.cover && ['icons', 'images', 'graphics'].includes(d.pkg)) cur.enabled = true;
    pkgs[d.pkg] = cur;
  }
  if (d.action === 'custom') { created = 'custom-' + Math.random().toString(36).slice(2, 9); pkgs[created] = { title: d.title, purpose: d.purpose || '', enabled: true }; }
  if (d.action === 'patch') { for (const k of ['title', 'purpose', 'hidden', 'enabled', 'owner', 'note'] as const) if (d[k] !== undefined) (cur as Record<string, unknown>)[k] = d[k]; pkgs[d.pkg] = cur; }
  if (d.action === 'remove-file') {
    // Take a file out. Its stored copy is kept for a while, so it can be put back (Undo); a kit or Figma file is
    // remembered as taken out, so rebuilding from the kit or Figma doesn't bring it back.
    const f = d.name ? (cur.files || []).find((x) => x.name === d.name) : undefined;
    if (f) { cur.files = (cur.files || []).filter((x) => x.name !== d.name); cur.removed = [f, ...(cur.removed || []).filter((x) => x.name !== f.name)].slice(0, 50); if (f.fromFigma) cur.excluded = [...new Set([...(cur.excluded || []), f.name])]; }
    if (d.path && !f) cur.excluded = [...new Set([...(cur.excluded || []), d.path])];
    pkgs[d.pkg] = cur;
  }
  if (d.action === 'restore-file') {
    const f = d.name ? (cur.removed || []).find((x) => x.name === d.name) : undefined;
    if (f) { cur.files = [...(cur.files || []).filter((x) => x.name !== f.name), f]; cur.removed = (cur.removed || []).filter((x) => x.name !== f.name); }
    const back = d.path || f?.name; if (back) cur.excluded = (cur.excluded || []).filter((x) => x !== back);
    pkgs[d.pkg] = cur;
  }
  if (d.action === 'remove-cover') { if (cur.cover) await sb.storage.from('kits').remove([cur.cover]); delete cur.cover; pkgs[d.pkg] = cur; }
  if (d.action === 'remove-package') {
    const paths = [...(cur.files || []).map((f) => f.path), ...(cur.cover ? [cur.cover] : [])];
    if (paths.length) await sb.storage.from('kits').remove(paths);
    if (d.pkg.startsWith('custom-')) delete pkgs[d.pkg]; else pkgs[d.pkg] = { enabled: false };
  }
  const { error } = await sb.from('projects').update({ content: { ...content, packages: pkgs } }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, created });
}
