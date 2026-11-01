import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { Review, type Item } from '@/components/Review';
import { ProjectActions } from '@/components/ProjectActions';
import { FontManager } from '@/components/FontManager';
import { DeleteProjectButton } from '@/components/DeleteProject';
import { GuideEditor } from '@/components/GuideEditor';
import { TeamManager } from '@/components/TeamManager';
import { ToolManager } from '@/components/ToolManager';
import { LoginLookEditor, StudioRequests } from '@/components/ClientAdmin';
import { listMembers, ROLE_LABEL } from '@/lib/team';
import { DEFAULT_LOOK, type LoginLook } from '@/lib/branding';
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
import { resolvePackages } from '@/lib/portal/packages';
import { buildSnapshot } from '@/lib/projects/snapshot';
import type { KitFileRow } from '@/lib/portal/context';
import { tierLabel, tierOf } from '@/lib/playbook';

const TABS = [['overview', 'Overview'], ['review', 'Review'], ['guidelines', 'Guidelines'], ['showcase', 'Showcase'], ['typefaces', 'Typefaces'], ['resources', 'Resources'], ['client', 'Client']] as const;
const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string; skipped?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  // Tools and Deliverables now live inside Resources
  const asked = sp.tab === 'tools' || sp.tab === 'deliverables' ? 'resources' : sp.tab;
  const tab = TABS.some(([k]) => k === asked) ? asked! : 'overview';
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, client, name, line, slug, status, figma_key, repo_full_name, kit_version, published_at, ai_key_hint, mcp_token_hash, content').eq('id', id).maybeSingle();
  if (!p) notFound();

  async function setPartStatus(form: FormData) {
    'use server';
    const s = await requireStaff(); if (s instanceof Response) return;
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
    const { data: scan } = await sb.from('scans').select('id').eq('project_id', id).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { data: rv } = scan ? await sb.from('review_items').select('status').eq('scan_id', scan.id) : { data: [] as { status: string }[] };
    const open = (rv || []).filter((r) => r.status === 'open').length;
    const total = (rv || []).length;
    const checks = [
      { ok: !!scan && open === 0, title: !scan ? 'Figma file not scanned yet' : open ? `Review: ${open} of ${total} items still open` : `Review complete (${total} items)`, note: open ? 'Open items use the suggested option. You can come back to them any time.' : '', href: `?tab=review`, cta: open ? 'Continue review' : 'Open review' },
      { ok: fonts.length > 0 && pendingFonts.length === 0, title: !fonts.length ? 'No typefaces added' : pendingFonts.length ? `Typefaces: ${pendingFonts.length} still need licensed files` : 'Typefaces: all licensed', note: pendingFonts.map((f) => `${f.name || f.label}: ${fontState(f) === 'none' ? 'no files' : fontState(f) === 'mixed' ? 'some trial files' : 'trial files'}`).join(' · '), href: `?tab=typefaces`, cta: pendingFonts.length ? 'Add licensed files' : 'Open typefaces' },
      { ok: !!guide, title: guide ? `Guidelines: ${guide.chapters.filter((c) => !c.hidden && (!c.id.startsWith('draft-') || c.blocks.some((b) => !b.draft))).length} chapters` : 'Guidelines not built yet', note: guide ? '' : 'Builds the client’s online guidelines from the Figma page.', href: `?tab=guidelines`, cta: guide ? 'Edit guidelines' : 'Build guidelines' },
      ...(guide && (drafts || missing) ? [{ ok: false, title: `${tierLabel(tier)} tier: ${[drafts ? `${drafts} draft section${drafts === 1 ? '' : 's'} to check` : '', missing ? `${missing} missing` : ''].filter(Boolean).join(', ')}`, note: 'Drafts and missing items stay hidden from the client until you accept them.', href: `?tab=guidelines`, cta: 'Check drafts' }] : []),
      ...(!tier ? [{ ok: false, title: 'Guide tier not set', note: 'Choose Essentials, Standard or Comprehensive below.', href: '', cta: '' }] : []),
      { ok: !!p.repo_full_name, title: p.repo_full_name ? 'Kit built' : 'Kit not built yet', note: '', href: '', cta: '' }
    ];
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
      {sp.created ? <div className="card" style={{ background: '#000', color: '#fff' }}>Project created and kit built. The client portal stays in draft until you publish it.{sp.skipped ? ' You skipped the review; pick it up from the checklist below.' : ''}</div> : null}
      <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>{p.client}</h1>
      <p className="mute" style={{ margin: 0 }}>{p.line}</p>
      <div className="card">
        <p style={{ margin: '0 0 4px' }}>Before you publish</p>
        <div className="ck">{checks.map((c) => <div key={c.title} className="ck-row"><span className={'dot ' + (c.ok ? 'done' : 'warn')} /><div><p>{c.title}</p>{c.note ? <p className="mute">{c.note}</p> : null}</div>{c.href ? <Link className="btn" href={c.href}>{c.cta}</Link> : null}</div>)}</div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>Portal: <a href={`/p/${p.slug}`}>/p/{p.slug}</a> · <span className={'tag ' + p.status}>{p.status}</span></p>
        <p style={{ margin: 0 }}>Kit repository: {p.repo_full_name ? <a href={`https://github.com/${p.repo_full_name}`} target="_blank" rel="noopener">{p.repo_full_name}</a> : <span className="mute">not built yet</span>} · v{p.kit_version}</p>
        <p style={{ margin: 0 }}>Figma: {p.figma_key ? <a href={`https://www.figma.com/design/${p.figma_key}`} target="_blank" rel="noopener">open file</a> : <span className="mute">not linked</span>}</p>
        <p style={{ margin: 0 }}>Client AI: {p.ai_key_hint ? `connected (key ending ${p.ai_key_hint})` : <span className="mute">not connected; the client adds their key in portal settings</span>}</p>
      </div>
      <TierSetting projectId={p.id} tier={tier} hasGuide={!!guide} />
      <HomeIntro projectId={p.id} value={(content as { homeIntro?: string }).homeIntro || ''} fallback={defaultIntro(p.client)} />
      <ProjectActions id={p.id} status={p.status} hasRepo={!!p.repo_full_name} />
      <div className="danger-zone"><p className="mute">Deleting removes the project, its portal and all uploaded files. You choose whether the GitHub repository goes too.</p><DeleteProjectButton id={p.id} client={p.client} repo={p.repo_full_name} /></div>
    </div>;
  }
  if (tab === 'guidelines') {
    const paths = guide ? guidePaths(guide) : [];
    const { data: signed } = paths.length ? await sb.storage.from('previews').createSignedUrls(paths, 3600) : { data: [] };
    const thumbs = Object.fromEntries((signed || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    const { fonts } = await readFonts(id);
    const disp = fonts.find((f) => f.role === 'display' && f.files.length), bod = fonts.find((f) => f.role === 'body' && f.files.length);
    const fontCss = fontFaceCss(fonts, await signFontUrls(fonts)) + `\n.ve-canvas.pt { ${disp ? `--pt-display: var(--font-${disp.role});` : ''} ${bod ? `--pt-body: var(--font-${bod.role});` : ''} }`;
    const snapG = await buildSnapshot(id).catch(() => null);
    const { data: logoRow } = await sb.from('deliverable_files').select('path, storage_path, deliverable_parts!inner(project_id)').eq('deliverable_parts.project_id', id).like('path', 'assets/logo/%.svg').limit(1).maybeSingle();
    const logoUrl = logoRow?.storage_path ? (await sb.storage.from('kits').createSignedUrl(logoRow.storage_path, 3600)).data?.signedUrl ?? null : null;
    body = <GuideEditor projectId={id} slug={p.slug} guide={guide} content={content as Record<string, unknown>} thumbs={thumbs} fontCss={fontCss} fonts={fonts} tier={tier} colours={snapG?.colours || []} logoUrl={logoUrl} />;
  }
  if (tab === 'showcase') {
    const sc = readShowcase(p.content);
    const paths = showcasePaths(sc);
    const { data: signedSc } = paths.length ? await sb.storage.from('previews').createSignedUrls(paths, 6 * 3600) : { data: [] };
    body = <ShowcaseEditor projectId={id} slug={p.slug} initial={sc} initialUrls={Object.fromEntries((signedSc || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]))} />;
  }
  if (tab === 'resources') {
    const { data: parts } = await sb.from('deliverable_parts').select('key, status, deliverable_files(path, format, storage_path)').eq('project_id', id).order('ord');
    const files: KitFileRow[] = (parts || []).flatMap((d) => ((d.deliverable_files || []) as Omit<KitFileRow, 'part' | 'partStatus'>[]).map((f) => ({ ...f, part: d.key as string, partStatus: d.status as string })));
    const snap = await buildSnapshot(id).catch(() => null);
    const { fonts } = await readFonts(id);
    const packages = await resolvePackages({ files, content: p.content, colours: snap?.colours || [], fonts, preview: true, hasLogo: files.some((f) => /^assets\/logo\/.+\.svg$/i.test(f.path)) });
    const logo = files.find((f) => /^assets\/logo\/.+\.svg$/i.test(f.path) && f.storage_path);
    const logoUrl = logo ? (await sb.storage.from('kits').createSignedUrl(logo.storage_path!, 3600)).data?.signedUrl ?? null : null;
    const { data: dparts } = await sb.from('deliverable_parts').select('id, title, contains, format, status, deliverable_files(path)').eq('project_id', id).order('ord');
    body = <div className="rs-studio">
      <nav className="rs-studio-nav" aria-label="Resources"><a href="#apps">Apps and tools</a><a href="#downloads">Downloads</a><a href="#deliverables">Deliverables</a></nav>
      <section id="apps" className="rs-studio-sec"><h2 className="rs-studio-h">Apps and tools</h2><ToolManager projectId={id} slug={p.slug} /></section>
      <section id="downloads" className="rs-studio-sec"><h2 className="rs-studio-h">Downloads</h2><ResourceManager projectId={id} slug={p.slug} packages={packages} colours={snap?.colours || []} logoUrl={logoUrl} /></section>
      <section id="deliverables" className="rs-studio-sec"><h2 className="rs-studio-h">Deliverables</h2><p className="mute" style={{ marginTop: -4 }}>What the kit contains, and where each part is up to.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
          {(dparts || []).map((d) => <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0 }}>{d.title} <span className="mute">· {d.format}</span></p>
            <p className="mute" style={{ margin: 0 }}>{d.contains} · {(d.deliverable_files || []).length} files</p>
            <form action={setPartStatus} className="row"><input type="hidden" name="part" value={d.id} />{Object.entries(STATUS).map(([k, label]) => <button key={k} name="status" value={k} className={'btn' + (d.status === k ? ' solid' : '')}>{label}</button>)}</form>
          </div>)}
          {!dparts?.length ? <p className="mute">Build the kit to create the deliverables.</p> : null}
        </div>
      </section>
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
    const VERB: Record<string, string> = { visit: 'visited', download: 'downloaded', tool: 'opened', skill: 'downloaded the skill', ask: 'asked a question on', join: 'joined as', upload: 'uploaded' };
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1000 }}>
      <section className="cl-sec">
        <h2>Last 30 days</h2>
        <div className="cl-stats">
          <div className="cl-stat"><strong>{members.length}</strong><span className="mute">people</span></div>
          <div className="cl-stat"><strong>{activeUsers}</strong><span className="mute">active</span></div>
          <div className="cl-stat"><strong>{count('visit')}</strong><span className="mute">visits</span></div>
          <div className="cl-stat"><strong>{count('download') + count('skill')}</strong><span className="mute">downloads</span></div>
          <div className="cl-stat"><strong>{count('tool')}</strong><span className="mute">tool uses</span></div>
          <div className="cl-stat"><strong>{count('ask')}</strong><span className="mute">questions asked</span></div>
        </div>
      </section>
      <section className="cl-sec">
        <h2>AI</h2>
        <div className="tm-row"><div style={{ flex: 1 }}><p style={{ margin: 0 }}>{p.ai_key_hint ? `Anthropic connected (key ending ${p.ai_key_hint})` : 'Not connected'}{p.mcp_token_hash ? ' · Claude connector created' : ''}</p><p className="mute" style={{ margin: 0 }}>{p.ai_key_hint ? `${(usage || []).length} AI requests and ${tokens.toLocaleString('en-GB')} tokens in the last 30 days, billed to the client’s Anthropic account. ${convs || 0} conversations in total.` : 'A client admin connects their Anthropic account in Settings. Until then, Ask and AI in tools are off.'}</p></div></div>
      </section>
      <section className="cl-sec">
        <h2>Requests</h2>
        <StudioRequests projectId={id} initial={reqs || []} />
      </section>
      <section className="cl-sec">
        <h2>People</h2>
        {members.length ? <table className="cl-table"><thead><tr><th>Person</th><th>Role</th><th>Last signed in</th><th>Visits</th><th>Downloads</th><th>Tools</th><th>Questions</th></tr></thead><tbody>{members.map((m) => <tr key={m.user_id}><td>{m.email}</td><td>{ROLE_LABEL[m.role]}</td><td>{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not yet'}</td><td className="n">{per(m.user_id, 'visit')}</td><td className="n">{per(m.user_id, 'download') + per(m.user_id, 'skill')}</td><td className="n">{per(m.user_id, 'tool')}</td><td className="n">{per(m.user_id, 'ask')}</td></tr>)}</tbody></table> : <p className="mute" style={{ margin: 0 }}>No one yet.</p>}
        <details className="card"><summary>Invite and manage people</summary><div style={{ marginTop: 12 }}><TeamManager slug={p.slug} studio /></div></details>
      </section>
      <section className="cl-sec">
        <h2>Most downloaded</h2>
        {downloads.length ? <div className="tm-list">{downloads.map(([f, n]) => <div key={f} className="tm-row"><span style={{ flex: 1, overflowWrap: 'anywhere' }}>{f}</span><span className="mute">{n}×</span></div>)}</div> : <p className="mute" style={{ margin: 0 }}>Nothing downloaded yet.</p>}
      </section>
      <section className="cl-sec">
        <h2>Recent activity</h2>
        {a.length ? <div className="tm-list">{a.filter((x) => x.kind !== 'visit').slice(0, 25).map((x, k) => <div key={k} className="tm-row"><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{emailOf[x.user_id || ''] || 'Someone'} {VERB[x.kind] || x.kind} {x.detail || ''}</span><span className="mute">{new Date(x.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>)}</div> : <p className="mute" style={{ margin: 0 }}>No activity yet.</p>}
      </section>
      <section className="cl-sec">
        <h2>Sign-in page</h2>
        <LoginLookEditor projectId={id} slug={p.slug} initial={look} />
      </section>
    </div>;
  }
  if (tab === 'typefaces') {
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
      <p className="mute" style={{ margin: 0 }}>Upload trial files to design with. When the client buys the licences, use <strong style={{ color: '#000' }}>Replace with licensed files</strong>: each licensed weight replaces its trial file. Only licensed files go into the kit.</p>
      <FontManager projectId={id} />
    </div>;
  }
  if (tab === 'review') {
    const { data: scan } = await sb.from('scans').select('id, figma_key').eq('project_id', id).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { data: items } = scan ? await sb.from('review_items').select('*').eq('scan_id', scan.id).order('ord') : { data: [] };
    const withPrev = await Promise.all((items || []).map(async (it) => ({ ...it, preview: it.preview_path ? (await sb.storage.from('previews').createSignedUrl(it.preview_path, 3600)).data?.signedUrl ?? null : null })));
    body = scan ? <Review initial={withPrev as Item[]} figmaKey={scan.figma_key} scanId={scan.id} /> : <p className="mute">No scan yet.</p>;
  }
  return (
    <div>
      <div className="pj-head"><Link href="/studio" className="pj-bp" aria-label="Brand Platform home"><img src="/lp-logo.svg" alt="" /><span className="bp-sub">Brand Platform</span></Link><Link className="btn" href="/studio">← Projects</Link><span className="pj-client">{p.client}</span><nav className="pj-tabs">{TABS.map(([k, l]) => <Link key={k} className={'pj-tab' + (k === tab ? ' on' : '')} href={`/studio/projects/${id}?tab=${k}`}>{l}</Link>)}</nav><a className="btn solid" style={{ marginLeft: 'auto' }} href={`/p/${p.slug}`}>Preview as client</a></div>
      <div style={{ padding: '20px 20px 80px' }}>{body}</div>
    </div>
  );
}
