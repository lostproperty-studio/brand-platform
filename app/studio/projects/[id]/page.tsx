import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { Review, type Item } from '@/components/Review';
import { ProjectActions } from '@/components/ProjectActions';
import { FontManager } from '@/components/FontManager';
import { DeleteProjectButton } from '@/components/DeleteProject';
import { GuideEditor } from '@/components/GuideEditor';
import { guidePaths, normaliseGuide, type Guide } from '@/lib/portal/guide';
import { signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss } from '@/lib/fonts';
import { readFonts } from '@/lib/projects/fonts';
import { fontState, fontsNeedingLicence } from '@/lib/fonts';

const TABS = [['overview', 'Overview'], ['review', 'Review'], ['guidelines', 'Guidelines'], ['typefaces', 'Typefaces'], ['deliverables', 'Deliverables']] as const;
const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string; skipped?: string }> }) {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'overview';
  const sb = adminClient();
  const { data: p } = await sb.from('projects').select('id, client, name, line, slug, status, figma_key, repo_full_name, kit_version, published_at, ai_key_hint, content').eq('id', id).maybeSingle();
  if (!p) notFound();

  async function setPartStatus(form: FormData) {
    'use server';
    const s = await requireStaff(); if (s instanceof Response) return;
    await adminClient().from('deliverable_parts').update({ status: String(form.get('status')) }).eq('id', String(form.get('part')));
    redirect(`/studio/projects/${id}?tab=deliverables`);
  }

  const content = (p.content || {}) as { guide?: Guide };
  const guide = normaliseGuide(content.guide);
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
      { ok: !!guide, title: guide ? `Guidelines: ${guide.chapters.filter((c) => !c.hidden).length} chapters` : 'Guidelines not built yet', note: guide ? '' : 'Builds the client’s online guidelines from the Figma page.', href: `?tab=guidelines`, cta: guide ? 'Edit guidelines' : 'Build guidelines' },
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
    const fontCss = fontFaceCss(fonts, await signFontUrls(fonts)) + `\n.ge-prev.pt { ${disp ? `--pt-display: var(--font-${disp.role});` : ''} ${bod ? `--pt-body: var(--font-${bod.role});` : ''} }`;
    body = <GuideEditor projectId={id} slug={p.slug} guide={guide} content={content as Record<string, unknown>} thumbs={thumbs} fontCss={fontCss} />;
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
    body = scan ? <Review initial={withPrev as Item[]} figmaKey={scan.figma_key} /> : <p className="mute">No scan yet.</p>;
  }
  if (tab === 'deliverables') {
    const { data: parts } = await sb.from('deliverable_parts').select('id, title, contains, format, status, deliverable_files(path)').eq('project_id', id).order('ord');
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
      {(parts || []).map((d) => <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>{d.title} <span className="mute">· {d.format}</span></p>
        <p className="mute" style={{ margin: 0 }}>{d.contains} · {(d.deliverable_files || []).length} files</p>
        <form action={setPartStatus} className="row"><input type="hidden" name="part" value={d.id} />{Object.entries(STATUS).map(([k, label]) => <button key={k} name="status" value={k} className={'btn' + (d.status === k ? ' solid' : '')}>{label}</button>)}</form>
      </div>)}
      {!parts?.length ? <p className="mute">Build the kit to create the deliverables.</p> : null}
    </div>;
  }
  return (
    <div>
      <div className="pj-head"><Link className="btn" href="/studio">← Projects</Link><span className="pj-client">{p.client}</span><nav className="pj-tabs">{TABS.map(([k, l]) => <Link key={k} className={'pj-tab' + (k === tab ? ' on' : '')} href={`/studio/projects/${id}?tab=${k}`}>{l}</Link>)}</nav><a className="btn solid" style={{ marginLeft: 'auto' }} href={`/p/${p.slug}`}>Preview as client</a></div>
      <div style={{ padding: '20px 20px 80px' }}>{body}</div>
    </div>
  );
}
