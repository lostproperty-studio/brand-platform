import { publishedSnapshot } from '@/lib/projects/snapshot';
import { signMany, signOne } from '@/lib/storage/signed';
import { ProjectTabs } from '@/components/ProjectTabs';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { ProjectActions } from '@/components/ProjectActions';
import { FontManager } from '@/components/FontManager';
import { DeleteProjectButton } from '@/components/DeleteProject';
import { GuideEditor } from '@/components/GuideEditor';
import { nameOf } from '@/lib/guideVersions';
import { TeamManager } from '@/components/TeamManager';
import { ToolManager } from '@/components/ToolManager';
import { LoginLookEditor, StudioRequests } from '@/components/ClientAdmin';
import { listMembers, ROLE_LABEL } from '@/lib/team';
import { DEFAULT_LOOK, type LoginLook } from '@/lib/branding';
import { readSources, type Source } from '@/lib/figma/sources';
import { pickLogo, sidebarChoice, withFigmaLogos } from '@/lib/portal/logo';
import { SidebarLogoPicker } from '@/components/SidebarLogoPicker';
import { DashCard } from '@/components/DashCard';
import { Activity, BarChart3, Download, Inbox, LogIn, PanelLeft, Sparkles, Users } from 'lucide-react';
import { VoiceStudio } from '@/components/VoiceStudio';
import { readVoice, voiceReady } from '@/lib/voice';
import { readKnowledge } from '@/lib/voiceKnowledge';
import { avatarUrl } from '@/lib/portal/context';
import { DesignProfile } from '@/components/DesignProfile';
import { readProfile } from '@/lib/designProfile';
import type { AssetsReport } from '@/lib/portal/templateBuild';
import { guidePaths, normaliseGuide, type Guide } from '@/lib/portal/guide';
import { signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss } from '@/lib/fonts';
import { readFonts } from '@/lib/projects/fonts';
import { fontState, fontsNeedingLicence } from '@/lib/fonts';
import { TierSetting } from '@/components/TierPicker';
import { ResourceManager } from '@/components/ResourceManager';
import { ShowcaseEditor } from '@/components/ShowcaseEditor';
import { HomeIntro } from '@/components/HomeIntro';
import { defaultIntro } from '@/lib/portal/home';
import { readShowcase, showcasePaths } from '@/lib/showcase';
import { packageSettings, resolvePackages } from '@/lib/portal/packages';
import { PdfStudio } from '@/components/PdfStudio';
import { hasShowcase } from '@/lib/showcase';
import { GithubPanel } from '@/components/GithubPanel';
import { systemCss, systemFor } from '@/lib/guideSystem';
import { roles as dsRoles } from '@/lib/designSystem';
import { buildSnapshot } from '@/lib/projects/snapshot';
import type { KitFileRow } from '@/lib/portal/context';
import { tierLabel, tierOf } from '@/lib/playbook';
import { Overview, type OverviewData } from '@/components/Overview';
import { portalShot } from '@/lib/projects/overview';
import { logoThumbs } from '@/lib/projects/logoThumb';
import { portalUrl } from '@/lib/domain';
import { PortalAddress } from '@/components/PortalAddress';
import { env } from '@/lib/env';
import { teamGate, teamRole } from '@/lib/studioTeam';

const TABS = [['overview', 'Overview'], ['guidelines', 'Guidelines'], ['showcase', 'Showcase'], ['typefaces', 'Typefaces'], ['voice', 'Voice'], ['resources', 'Resources'], ['pdf', 'PDF'], ['client', 'Client']] as const;
const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string; skipped?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  // Tools and Deliverables now live inside Resources
  const asked = sp.tab === 'tools' || sp.tab === 'deliverables' ? 'resources' : sp.tab;
  // The old Review tab is now the creative director, inside the guidelines editor
  const tab = asked === 'review' ? 'guidelines' : TABS.some(([k]) => k === asked) ? asked! : 'overview';
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, client, name, line, slug, status, figma_key, figma_page_id, repo_full_name, kit_version, published_at, ai_key_hint, mcp_token_hash, content, brand').eq('id', id).maybeSingle();
  if (!p) notFound();
  // The studio team: people not on a project's team can't open it; viewers see it read-only
  const me = st;
  const myRole = me instanceof Response ? null : await teamRole(id, me);
  if (!myRole) return <div className="ov-denied"><h1>You’re not on the {p.client} team</h1><p className="mute">Ask the project’s lead to add you, then reload this page.</p><Link className="btn" href="/studio">← Projects</Link></div>;

  async function setPartStatus(form: FormData) {
    'use server';
    const s = await requireStaff(); if (s instanceof Response) return;
    if (await teamGate(id, s, 'editor', 'deliverables')) return;
    await adminClient().from('deliverable_parts').update({ status: String(form.get('status')) }).eq('id', String(form.get('part')));
    redirect(`/studio/projects/${id}?tab=resources#deliverables`);
  }

  const content = (p.content || {}) as { guide?: Guide };
  const guide = normaliseGuide(content.guide);
  const tier = tierOf(content);
  const drafts = guide ? guide.chapters.flatMap((c) => c.blocks).filter((b) => b.draft === 'draft').length : 0;
  const missing = guide ? guide.chapters.flatMap((c) => c.blocks).filter((b) => b.draft === 'missing').length : 0;
  let body: React.ReactNode = null;
  if (tab === 'overview') {
    const { fonts } = await readFonts(id);
    const pendingFonts = fontsNeedingLicence(fonts);
    const checks = [
      (() => { const rs = (p.content as { reviewSession?: { at: string; result: { big: { id: string }[]; detail: { id: string }[] }; closed?: Record<string, string> } } | null)?.reviewSession; const left = rs ? [...rs.result.big, ...rs.result.detail].filter((n) => !rs.closed?.[n.id]).length : 0;
        return { ok: !!rs && left === 0, title: !rs ? 'No review session yet' : left ? `Review: ${left} note${left === 1 ? '' : 's'} still open` : 'Review: all notes dealt with', note: rs ? `Last session ${new Date(rs.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : 'Start a review session in the guidelines editor, with the pink Review button.', href: '?tab=guidelines', cta: rs ? 'Open the editor' : 'Start a review' }; })(),
      { ok: fonts.length > 0 && pendingFonts.length === 0, title: !fonts.length ? 'No typefaces added' : pendingFonts.length ? `Typefaces: ${pendingFonts.length} still need licensed files` : 'Typefaces: all licensed', note: pendingFonts.map((f) => `${f.name || f.label}: ${fontState(f) === 'none' ? 'no files' : fontState(f) === 'mixed' ? 'some trial files' : 'trial files'}`).join(' · '), href: `?tab=typefaces`, cta: pendingFonts.length ? 'Add licensed files' : 'Open typefaces' },
      { ok: !!guide, title: guide ? `Guidelines: ${guide.chapters.filter((c) => !c.hidden && (!c.id.startsWith('draft-') || c.blocks.some((b) => !b.draft))).length} chapters` : 'Guidelines not built yet', note: guide ? '' : 'Builds the client’s online guidelines from the Figma page.', href: `?tab=guidelines`, cta: guide ? 'Edit guidelines' : 'Build guidelines' },
      ...(guide && (drafts || missing) ? [{ ok: false, title: `${tierLabel(tier)} tier: ${[drafts ? `${drafts} draft section${drafts === 1 ? '' : 's'} to check` : '', missing ? `${missing} missing` : ''].filter(Boolean).join(', ')}`, note: 'Drafts and missing items stay hidden from the client until you accept them.', href: `?tab=guidelines`, cta: 'Check drafts' }] : []),
      ...(!tier ? [{ ok: false, title: 'Guide tier not set', note: 'Choose Essentials, Standard or Comprehensive below.', href: '', cta: '' }] : []),
      { ok: !!p.repo_full_name, title: p.repo_full_name ? 'Kit built' : 'Kit not built yet', note: '', href: '', cta: '' }
    ];
    // The dashboard: portal status, sharing and views, edits, team, files
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const [{ data: ver }, { data: links }, members, { data: act }, { data: edited }, { data: staffRows }, shot] = await Promise.all([
      sb.from('project_versions').select('version, published_by, created_at').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('invite_links').select('uses, revoked, expires_at, created_at').eq('project_id', id),
      listMembers(id),
      sb.from('activity').select('user_id, kind, detail, created_at').eq('project_id', id).gte('created_at', since30).order('created_at', { ascending: false }).limit(3000),
      sb.from('projects').select('last_edited_by, last_edited_at, updated_at').eq('id', id).maybeSingle(),
      sb.from('staff').select('user_id, email, name'),
      portalShot(id, content, p.figma_key)
    ]);
    const thumb = (await logoThumbs([{ id, client: p.client, brand: p.brand, content }]))[id];
    const staffName = (uid?: string | null) => { const s0 = (staffRows || []).find((x) => x.user_id === uid); return s0 ? s0.name || String(s0.email).split('@')[0] : null; };
    const memberName = (uid?: string | null) => members.find((m) => m.user_id === uid)?.email || staffName(uid) || 'Someone';
    const a30 = act || [];
    const clientAct = a30.filter((x) => x.kind !== 'edit');
    const visits = clientAct.filter((x) => x.kind === 'visit');
    const days = Array.from({ length: 30 }, (_, k) => { const d0 = new Date(Date.now() - (29 - k) * 864e5).toDateString(); return visits.filter((v) => new Date(v.created_at).toDateString() === d0).length; });
    const VERB: Record<string, string> = { visit: 'visited the portal', download: 'downloaded', tool: 'opened', skill: 'downloaded the skill', ask: 'asked a question', join: 'joined as', upload: 'uploaded' };
    const activeLinks = (links || []).filter((l) => !l.revoked && (!l.expires_at || new Date(l.expires_at) > new Date()));
    const lastEdit = (edited as { last_edited_by?: string; last_edited_at?: string } | null)?.last_edited_at ? edited as { last_edited_by?: string; last_edited_at: string } : null;
    const editAt = lastEdit?.last_edited_at || (edited as { updated_at?: string } | null)?.updated_at || null;
    const data: OverviewData = {
      projectId: id, client: p.client, line: p.line || '', slug: p.slug, status: p.status as OverviewData['status'], portalUrl: await portalUrl(p.slug),
      thumb,
      published: ver ? { at: ver.created_at, version: ver.version, by: staffName(ver.published_by) } : null,
      changedSince: !!ver && !!editAt && new Date(editAt) > new Date(ver.created_at),
      share: { links: activeLinks.length, linkUses: (links || []).reduce((n, l) => n + (l.uses || 0), 0), members: members.length, firstAt: [...(links || []).map((l) => l.created_at), ...members.map((m) => m.created_at)].sort()[0] || null, pending: 0 },
      views: { total: visits.length, viewers: new Set(visits.map((v) => v.user_id)).size, last: visits[0] ? { who: memberName(visits[0].user_id), at: visits[0].created_at } : null, days,
        recent: clientAct.slice(0, 8).map((x) => ({ who: memberName(x.user_id), what: [VERB[x.kind] || x.kind, x.kind === 'visit' ? '' : x.detail || ''].filter(Boolean).join(' '), at: x.created_at, kind: x.kind })) },
      edit: lastEdit ? { who: staffName(lastEdit.last_edited_by) || 'a teammate', at: lastEdit.last_edited_at } : null,
      edits: a30.filter((x) => x.kind === 'edit').map((x) => ({ who: staffName(x.user_id) || 'Someone', area: x.detail || 'project', at: x.created_at })),
      figma: p.figma_key ? { key: p.figma_key, ...shot.figma } : null,
      sources: (() => { const s = readSources(p.content, p as { figma_key?: string | null }); const row = (x?: Source) => (x ? { url: x.url, file: x.file || (x === s.guidelines ? shot.figma?.name : undefined), pageName: x.pageName, importedAt: x.importedAt } : null); return { assets: row(s.assets), guidelines: row(s.guidelines), report: ((p.content as { assetsReport?: AssetsReport } | null)?.assetsReport) || null }; })(),
      repo: p.repo_full_name ? { name: p.repo_full_name, version: p.kit_version } : null, ai: p.ai_key_hint || null, aiRejected: !!(p.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt,
      chapters: guide ? guide.chapters.filter((c) => !c.hidden && !c.removed && (!c.id.startsWith('draft-') || c.blocks.some((b) => !b.draft))).length : 0,
      checks,
      delivery: {
        projectId: id, slug: p.slug, client: p.client, portalUrl: await portalUrl(p.slug), status: p.status as 'draft' | 'live' | 'archived',
        published: ver ? { at: ver.created_at, version: ver.version } : null,
        changedSince: !!ver && !!editAt && new Date(editAt) > new Date(ver.created_at),
        checks, people: members.length,
        gets: await (async () => {
          // What the client will find, in a line each, so nothing's a surprise after the email goes
          const chapters = guide ? guide.chapters.filter((c) => !c.hidden && !c.removed && c.blocks.some((b) => !b.draft)).length : 0;
          const [{ count: apps }, { count: logos }] = await Promise.all([
            sb.from('tools').select('id', { count: 'exact', head: true }).eq('project_id', id).eq('visible', true),
            sb.from('deliverable_files').select('id, deliverable_parts!inner(project_id)', { count: 'exact', head: true }).eq('deliverable_parts.project_id', id).like('path', 'assets/logo/%')
          ]);
          const v = readVoice(content);
          return [
            { ok: chapters > 0, text: chapters ? `Guidelines: ${chapters} chapter${chapters === 1 ? '' : 's'}` : 'No guidelines yet' },
            { ok: (logos || 0) > 0, text: logos ? `Downloads: ${logos} logo files, colours, fonts${fonts.some((f) => fontsNeedingLicence([f]).length) ? ' (once licensed)' : ''} and the rest of Resources` : 'Downloads: no logo files yet; build the kit' },
            { ok: hasShowcase(readShowcase(content)), text: hasShowcase(readShowcase(content)) ? 'Showcase: the brand at work' : 'No showcase (the page is hidden until it has pictures)' },
            { ok: !!v.writer && voiceReady(v), text: v.writer && voiceReady(v) ? 'Writer: copy in the brand voice' : 'Writer is off' },
            { ok: (apps || 0) > 0, text: apps ? `${apps} app${apps === 1 ? '' : 's'} in Resources` : 'No apps' },
            { ok: !!p.ai_key_hint, text: p.ai_key_hint ? 'AI (Ask, Writer and apps): connected with their key' : 'AI needs the client’s own key: their admin adds it after joining, until then Ask and the Writer are off' }
          ];
        })()
      }
    };
    body = <div className="ov-wrap">
      <Overview d={data} created={!!sp.created} skipped={!!sp.skipped} />
      <h2 className="ov-sec-h">Settings</h2>
      <div className="ov-settings">
      <PortalAddress projectId={p.id} host={data.portalUrl.replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '')} slug={p.slug} />
      <TierSetting projectId={p.id} tier={tier} hasGuide={!!guide} />
      <ProjectActions id={p.id} status={p.status} hasRepo={!!p.repo_full_name} />
      <div className="danger-zone"><p className="mute">Deleting removes the project, its portal and all uploaded files. You choose whether the GitHub repository goes too.</p><DeleteProjectButton id={p.id} client={p.client} repo={p.repo_full_name} /></div>
      </div>
    </div>;
  }
  if (tab === 'guidelines') {
    const paths = guide ? guidePaths(guide) : [];
    const { data: signed } = paths.length ? await signMany('previews', paths, 3600) : { data: [] };
    const thumbs = Object.fromEntries((signed || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    const { fonts } = await readFonts(id);
    const disp = fonts.find((f) => f.role === 'display' && f.files.length), bod = fonts.find((f) => f.role === 'body' && f.files.length);
    const fontCss = fontFaceCss(fonts, await signFontUrls(fonts)) + `\n.ve-canvas.pt { ${disp ? `--pt-display: var(--font-${disp.role});` : ''} ${bod ? `--pt-body: var(--font-${bod.role});` : ''} }`;
    const snapG = await buildSnapshot(id).catch(() => null);
    const { data: homeVer } = await sb.from('project_versions').select('version').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { data: logoRows } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', id).like('path', 'assets/logo/%');
    const logoRow = pickLogo(withFigmaLogos((logoRows || []).map((l) => ({ path: l.path, storage_path: l.storage_path })), p.content, {})).main;
    const logoUrl = logoRow?.storage_path ? (await signOne('kits', logoRow.storage_path, 3600)).data?.signedUrl ?? null : null;
    body = <GuideEditor me={me instanceof Response ? null : { id: me.user.id, name: nameOf(me.user), avatar: ((me.user.user_metadata || {}) as { avatar_url?: string }).avatar_url || null }} projectId={id} slug={p.slug} guide={guide} content={content as Record<string, unknown>} thumbs={thumbs} fontCss={fontCss} fonts={fonts} tier={tier} colours={snapG?.colours || []} logoUrl={logoUrl} home={{ client: p.client, line: p.line || '', title: (content as { homeTitle?: string }).homeTitle || undefined, styles: (content as { homeStyles?: Record<string, never> }).homeStyles || undefined, intro: (content as { homeIntro?: string }).homeIntro || '', fallback: defaultIntro(p.client), version: homeVer?.version }} />;
  }
  if (tab === 'showcase') {
    const sc = readShowcase(p.content);
    const paths = showcasePaths(sc);
    const { data: signedSc } = paths.length ? await signMany('previews', paths, 6 * 3600) : { data: [] };
    body = <ShowcaseEditor colours={((p.brand as { core?: { name: string; hex: string }[] } | null)?.core || []).filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex))} projectId={id} slug={p.slug} initial={sc} initialUrls={Object.fromEntries((signedSc || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]))} />;
  }
  if (tab === 'resources') {
    const { data: parts } = await sb.from('deliverable_parts').select('key, status, deliverable_files(path, format, storage_path)').eq('project_id', id).order('ord');
    const files: KitFileRow[] = withFigmaLogos((parts || []).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string }))), p.content, { format: 'svg', part: 'assets', partStatus: 'ready' });
    const snap = await buildSnapshot(id).catch(() => null);
    const { fonts } = await readFonts(id);
    const packages = await resolvePackages({ files, content: p.content, colours: snap?.colours || [], fonts, preview: true, hasLogo: files.some((f) => /^assets\/logo\/.+\.svg$/i.test(f.path)) });
    const logo = pickLogo(files).main;
    const logoUrl = logo ? (await signOne('kits', logo.storage_path!, 3600)).data?.signedUrl ?? null : null;
    body = <div className="rs-studio">
      <nav className="rs-studio-nav" aria-label="Resources"><a href="#design-system">Design system</a><a href="#apps">Apps and tools</a><a href="#downloads">Downloads</a></nav>
      <section id="design-system" className="rs-studio-sec"><h2 className="rs-studio-h">Design system</h2><DesignProfile projectId={id} slug={p.slug} initial={readProfile(p.content)} chapters={(normaliseGuide((p.content as { guide?: Guide } | null)?.guide)?.chapters || []).filter((c) => !c.removed).length} /></section>
      <section id="apps" className="rs-studio-sec"><h2 className="rs-studio-h">Apps and tools</h2><ToolManager projectId={id} slug={p.slug} /></section>
      <section id="downloads" className="rs-studio-sec"><h2 className="rs-studio-h">Downloads</h2><ResourceManager projectId={id} slug={p.slug} client={p.client} roles={dsRoles(snap?.colours || [])} packages={packages} colours={snap?.colours || []} logoUrl={logoUrl} guideRev={((p.content as { guide?: { _rev?: number } } | null)?.guide?._rev) || 0} ai={{ 'design-system': packageSettings(p.content)['design-system'] || {}, skills: packageSettings(p.content).skills || {} }} /></section>
        <GithubPanel projectId={id} repo={p.repo_full_name} sync={(content as { kitSync?: never }).kitSync} shared={!!(content as { repoShared?: boolean }).repoShared} />
    </div>;
  }
  if (tab === 'client') {
    // Everything about how the client uses their portal
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [members, { data: act }, { data: usage }, { data: reqs }, { count: convs }] = await Promise.all([
      listMembers(id),
      sb.from('activity').select('user_id, kind, detail, created_at').eq('project_id', id).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
      sb.from('ai_usage').select('feature, input_tokens, output_tokens').eq('project_id', id).gte('created_at', since),
      sb.from('requests').select('id, kind, title, details, status, reply, email, created_at').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('conversations').select('id', { count: 'exact', head: true }).eq('project_id', id)
    ]);
    const a = act || [];
    const count = (k: string) => a.filter((x) => x.kind === k).length;
    const activeUsers = new Set(a.map((x) => x.user_id).filter(Boolean)).size;
    const per = (uid: string, k: string) => a.filter((x) => x.user_id === uid && x.kind === k).length;
    const downloads = Object.entries(a.filter((x) => x.kind === 'download').reduce((m, x) => ({ ...m, [x.detail || '?']: (m[x.detail || '?'] || 0) + 1 }), {} as Record<string, number>)).sort((x, y) => y[1] - x[1]).slice(0, 10);
    const tokens = (usage || []).reduce((n, r) => n + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
    const emailOf = Object.fromEntries(members.map((m) => [m.user_id, m.email]));
    const look: LoginLook = { ...DEFAULT_LOOK, ...((content as { login?: Partial<LoginLook> }).login || {}) };
    // The portal sidebar's logos
    const { data: kparts } = await sb.from('deliverable_parts').select('key, status, deliverable_files(path, format, storage_path)').eq('project_id', id).order('ord');
    const kfiles: KitFileRow[] = withFigmaLogos((kparts || []).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string }))), p.content, { format: 'svg', part: 'assets', partStatus: 'ready' });
    const logoRows = kfiles.filter((f) => /^assets\/logo\/.+\.(svg|png)$/i.test(f.path) && f.storage_path);
    const signed = await Promise.all(logoRows.map(async (f) => ({ path: f.path, name: f.path.split('/').pop()!, url: (await signOne('kits', f.storage_path!, 3600)).data?.signedUrl ?? null })));
    const core = ((p.brand as { core?: { name: string; hex: string }[] } | null)?.core || []).filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex));
    const avatar = await avatarUrl(kfiles, p.client, core).catch(() => null);
    const autoFull = signed.find((x) => x.path === pickLogo(kfiles).main?.path)?.url ?? null;
    const sideNow = sidebarChoice(p.content);
    const VERB: Record<string, string> = { visit: 'visited', download: 'downloaded', tool: 'opened', skill: 'downloaded the skill', ask: 'asked a question on', join: 'joined as', upload: 'uploaded' };
    const openReqs = (reqs || []).filter((r) => !['done', 'closed', 'resolved'].includes(String(r.status))).length;
    const shownFull = signed.find((x) => x.path === sideNow.full)?.url ?? autoFull;
    const shownMini = signed.find((x) => x.path === sideNow.mini)?.url ?? avatar;
    const recentList = a.filter((x) => x.kind !== 'visit');
    body = <div className="dash">
      <DashCard title="Last 30 days" icon={<BarChart3 size={16} strokeWidth={1.75} aria-hidden />} sheet={<>
        {a.length ? <div className="tm-list">{a.filter((x) => x.kind !== 'visit').slice(0, 25).map((x, k) => <div key={k} className="tm-row"><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{emailOf[x.user_id || ''] || 'Someone'} {VERB[x.kind] || x.kind} {x.detail || ''}</span><span className="mute">{new Date(x.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>)}</div> : <p className="mute" style={{ margin: 0 }}>No activity yet.</p>}
      </>} action="Activity" sheetTitle="Recent activity">
        <div className="dc-stats">
          <div><strong>{activeUsers}</strong><span>active people</span></div>
          <div><strong>{count('visit')}</strong><span>visits</span></div>
          <div><strong>{count('download') + count('skill')}</strong><span>downloads</span></div>
          <div><strong>{count('tool')}</strong><span>tool uses</span></div>
          <div><strong>{count('ask')}</strong><span>questions</span></div>
          <div><strong>{(usage || []).length}</strong><span>AI requests</span></div>
        </div>
      </DashCard>
      <DashCard title="People" icon={<Users size={16} strokeWidth={1.75} aria-hidden />} action="Manage" sheetTitle={`People on the ${p.client} portal`} sheet={<>
        {members.length ? <table className="cl-table"><thead><tr><th>Person</th><th>Role</th><th>Last signed in</th><th>Visits</th><th>Downloads</th><th>Tools</th><th>Questions</th></tr></thead><tbody>{members.map((m) => <tr key={m.user_id}><td>{m.email}</td><td>{ROLE_LABEL[m.role]}</td><td>{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not yet'}</td><td className="n">{per(m.user_id, 'visit')}</td><td className="n">{per(m.user_id, 'download') + per(m.user_id, 'skill')}</td><td className="n">{per(m.user_id, 'tool')}</td><td className="n">{per(m.user_id, 'ask')}</td></tr>)}</tbody></table> : <p className="mute" style={{ margin: 0 }}>No one yet.</p>}
        <h3 className="sh-sub">Invite and manage</h3><TeamManager slug={p.slug} studio />
      </>}>
        <p className="dc-big">{members.length}</p>
        {members.length ? <div className="dc-faces" aria-hidden>{members.slice(0, 6).map((m) => <span key={m.user_id}>{(m.email || '?').slice(0, 2)}</span>)}</div> : <p className="mute">No one invited yet.</p>}
      </DashCard>
      <DashCard title="Requests" icon={<Inbox size={16} strokeWidth={1.75} aria-hidden />} action="See all" sheet={<StudioRequests projectId={id} initial={reqs || []} />} tone={openReqs ? 'warn' : undefined}>
        <p className="dc-big">{openReqs}</p><p className="mute">{openReqs ? `open request${openReqs === 1 ? '' : 's'} from the client` : (reqs || []).length ? 'All requests answered' : 'No requests yet'}</p>
      </DashCard>
      <DashCard title="Portal sidebar" icon={<PanelLeft size={16} strokeWidth={1.75} aria-hidden />} action="Change" sheetTitle="Logos in the portal sidebar" sheet={<>
        <p className="mute" style={{ margin: 0 }}>The full logo shows when the sidebar is open, the small one when it’s closed. Clients open and close it themselves.</p>
        {signed.length ? <SidebarLogoPicker projectId={id} logos={signed} full={sideNow.full} mini={sideNow.mini} avatarUrl={avatar} autoFullUrl={autoFull} /> : <p className="mute">Add logos to the kit or import them from Figma to choose them here.</p>}
      </>}>
        <div className="dc-logos">
          <figure><span className="art">{shownFull ? <img src={shownFull} alt="" /> : <span className="mute">None</span>}</span><figcaption>Open{sideNow.full ? '' : ' · automatic'}</figcaption></figure>
          <figure><span className="art sm">{shownMini ? <img src={shownMini} alt="" /> : <span className="mute">–</span>}</span><figcaption>Closed{sideNow.mini ? '' : ' · avatar'}</figcaption></figure>
        </div>
      </DashCard>
      <DashCard title="Sign-in page" icon={<LogIn size={16} strokeWidth={1.75} aria-hidden />} action="Edit" sheet={<LoginLookEditor projectId={id} slug={p.slug} initial={look} />}>
        <p className="mute">What people see when they sign in to the portal.</p>
        <a className="ve-linkbtn" href={`/p/${p.slug}`} target="_blank" rel="noopener">Open the portal</a>
      </DashCard>
      <DashCard title="AI" icon={<Sparkles size={16} strokeWidth={1.75} aria-hidden />} tone={p.ai_key_hint ? 'good' : undefined}>
        <div className="tm-row"><div style={{ flex: 1 }}><p style={{ margin: 0 }}>{p.ai_key_hint ? `Anthropic connected (key ending ${p.ai_key_hint})` : 'Not connected'}{p.mcp_token_hash ? ' · Claude connector created' : ''}</p><p className="mute" style={{ margin: 0 }}>{p.ai_key_hint ? `${(usage || []).length} AI requests and ${tokens.toLocaleString('en-GB')} tokens in the last 30 days, billed to the client’s Anthropic account (studio previews run on Lost Property’s AI and aren’t counted). ${convs || 0} conversations in total.` : 'A client admin connects their Anthropic account in Settings. Until then, clients can’t use Ask or AI in tools; the studio can, when previewing, on Lost Property’s AI.'}</p></div></div>
      </DashCard>
      <DashCard title="Most downloaded" icon={<Download size={16} strokeWidth={1.75} aria-hidden />} action="See all" sheet={<>
        {downloads.length ? <div className="tm-list">{downloads.map(([f, n]) => <div key={f} className="tm-row"><span style={{ flex: 1, overflowWrap: 'anywhere' }}>{f}</span><span className="mute">{n}×</span></div>)}</div> : <p className="mute" style={{ margin: 0 }}>Nothing downloaded yet.</p>}
      </>}>
        {downloads.length ? <ul className="dc-list">{downloads.slice(0, 3).map(([f, n]) => <li key={f}><span>{f.split('/').pop()}</span><span className="mute">{n}×</span></li>)}</ul> : <p className="mute">Nothing downloaded yet.</p>}
      </DashCard>
      <DashCard title="Recent activity" icon={<Activity size={16} strokeWidth={1.75} aria-hidden />} action="See all" sheet={<>
        {a.length ? <div className="tm-list">{a.filter((x) => x.kind !== 'visit').slice(0, 25).map((x, k) => <div key={k} className="tm-row"><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{emailOf[x.user_id || ''] || 'Someone'} {VERB[x.kind] || x.kind} {x.detail || ''}</span><span className="mute">{new Date(x.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>)}</div> : <p className="mute" style={{ margin: 0 }}>No activity yet.</p>}
      </>}>
        {recentList.length ? <ul className="dc-list">{recentList.slice(0, 4).map((x, k) => <li key={k}><span>{(emailOf[x.user_id || ''] || 'Someone').split('@')[0]} {VERB[x.kind] || x.kind} {x.detail || ''}</span><span className="mute">{new Date(x.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></li>)}</ul> : <p className="mute">Nothing yet.</p>}
      </DashCard>
    </div>;
  }
  if (tab === 'voice') {
    // How the brand writes: the voice work and what the AI needs, for the Writer, Ask, the skill and the connector
    const g = normaliseGuide((p.content as { guide?: Guide } | null)?.guide);
    const pub = await publishedSnapshot(id).catch(() => null);
    body = <VoiceStudio knowledge={readKnowledge(p.content)} liveWriter={!!pub?.voice?.writer && voiceReady(pub.voice)} published={!!pub} projectId={id} slug={p.slug} initial={readVoice(p.content)} hasGuide={!!g} hasChapter={!!g?.chapters.some((c) => c.key === 'voice' && !c.removed)} />;
  }
  if (tab === 'pdf') {
    // The guidelines as 16:9 slides, from templates the studio sets, exported to PDF
    const pdfImg = (content as { pdf?: { title?: { image?: string } } }).pdf?.title?.image;
    const paths = [...(guide ? guidePaths(guide) : []), ...(pdfImg ? [pdfImg] : [])];
    const { data: signed } = paths.length ? await signMany('previews', paths, 6 * 3600) : { data: [] };
    const urls = Object.fromEntries((signed || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    const { fonts } = await readFonts(id);
    const disp = fonts.find((f) => f.role === 'display' && f.files.length), bod = fonts.find((f) => f.role === 'body' && f.files.length);
    const fontCss = fontFaceCss(fonts, await signFontUrls(fonts)) + `\n.pdf-root.pt { ${disp ? `--pt-display: var(--font-${disp.role});` : ''} ${bod ? `--pt-body: var(--font-${bod.role});` : ''} }`;
    const snapP = await buildSnapshot(id).catch(() => null);
    const pc = content as { typeScale?: never; dsProfile?: never };
    const sysCss = systemCss(systemFor(guide?.system, { typeScale: pc.typeScale, profile: pc.dsProfile, fonts: fonts.filter((f) => f.files.length) }));
    const { data: logoRows } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', id).like('path', 'assets/logo/%');
    const logoRow = pickLogo(withFigmaLogos((logoRows || []).map((l) => ({ path: l.path, storage_path: l.storage_path })), p.content, {})).main;
    const logoUrl = logoRow?.storage_path ? (await signOne('kits', logoRow.storage_path, 6 * 3600)).data?.signedUrl ?? null : null;
    body = <PdfStudio projectId={id} client={p.client} guide={guide} urls={urls} logoUrl={logoUrl} colours={snapP?.colours || []} content={content} sysCss={sysCss} fontCss={fontCss} />;
  }
  if (tab === 'typefaces') {
    body = <FontManager projectId={id} />;
  }
  return (
    <div>
      <header className="pj-head">
        <div className="pj-bar"><Link href="/studio" className="pj-bp" aria-label="Brand Platform home"><img src="/lp-logo.svg" alt="" /><span className="bp-sub">Brand Platform</span></Link><Link className="btn ic" href="/studio"><ArrowLeft size={15} strokeWidth={1.75} aria-hidden />Projects</Link></div>
        <h1 className="pj-title">{p.client}</h1>
        <div className="pj-nav"><ProjectTabs id={id} tabs={TABS} current={tab} /><a className="btn solid ic pj-preview" href={`/p/${p.slug}`}><ExternalLink size={15} strokeWidth={1.75} aria-hidden />Preview as client</a></div>
      </header>
      {myRole === 'viewer' ? <p className="ov-viewer" role="note">You’re a viewer on this project, so changes you try to make won’t be saved.</p> : null}
      <div id="pj-panel" role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]} style={{ padding: '20px 20px 80px' }}>{body}</div>
    </div>
  );
}
