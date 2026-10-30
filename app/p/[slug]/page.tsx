import { notFound } from 'next/navigation';
import { adminClient, requireProjectAccess } from '@/lib/supabase/server';
import { projectBySlug, publishedSnapshot } from '@/lib/projects/snapshot';
import { readFonts, signFontUrls } from '@/lib/projects/fonts';
import { fontFaceCss } from '@/lib/fonts';

// Client portal (first cut): published guidelines summary and the Deliverables space.
// The full portal (Home, Guidelines, Showcase, Canvas, Chat) is ported from the prototype next.
export default async function Portal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await projectBySlug(slug);
  if (!p) notFound();
  const acc = await requireProjectAccess(p.id);
  if (acc instanceof Response) notFound();
  const snap = await publishedSnapshot(p.id);
  const sb = adminClient();
  const { data: parts } = await sb.from('deliverable_parts').select('id, ord, title, contains, format, status, deliverable_files(path, format, storage_path)').eq('project_id', p.id).eq('visible', true).order('ord');
  const signed = async (path: string | null) => (path ? (await sb.storage.from('kits').createSignedUrl(path, 3600, { download: true })).data?.signedUrl : null);
  const withLinks = await Promise.all((parts || []).map(async (d) => ({ ...d, files: await Promise.all(((d.deliverable_files || []) as { path: string; format: string; storage_path: string | null }[]).map(async (f) => ({ ...f, href: await signed(f.storage_path) }))) })));
  // The client's own typefaces (licensed files when uploaded, trial files until then)
  const { fonts } = await readFonts(p.id);
  const fontCss = fontFaceCss(fonts, await signFontUrls(fonts, 6 * 3600));
  const display = fonts.find((f) => f.role === 'display') || fonts[0];
  const bodyFont = fonts.find((f) => f.role === 'body');
  const STATUS: Record<string, string> = { ready: 'Ready', in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };
  return (
    <main className="portal" style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 20px 80px', ...(bodyFont ? { fontFamily: `var(--font-${bodyFont.role})` } : {}) }}>
      <style>{fontCss + (display ? `\n.portal h1, .portal h2 { font-family: var(--font-${display.role}); }` : '')}</style>
      <p className="mute">{p.client}</p>
      <h1 style={{ fontSize: 28, fontWeight: 400, margin: '6px 0 4px' }}>Deliverables</h1>
      <p className="mute" style={{ maxWidth: 560 }}>Everything in the brief, in one place. {p.repo_full_name ? <>Repository: <a href={`https://github.com/${p.repo_full_name}`}>{p.repo_full_name}</a></> : null}</p>
      {!snap ? <p className="mute">This portal hasn’t been published yet.</p> : null}
      {withLinks.map((d, i) => (
        <section key={d.id} style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 16, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 24 }}>
          <div><p className="mute">{String(i + 1).padStart(2, '0')}</p><h2 style={{ fontSize: 20, fontWeight: 400, margin: '4px 0' }}>{d.title}</h2><p className="mute">{d.contains}</p><p><span className="tag">{d.format}</span> <span className={'tag' + (d.status === 'ready' ? ' live' : '')}>{STATUS[d.status]}</span></p></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{d.files.map((f) => <div key={f.path} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--fill)', borderRadius: 999, padding: '6px 8px 6px 14px' }}><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{f.path}</span><span className="mute">{f.format}</span>{f.href && d.status === 'ready' ? <a className="btn" href={f.href}>Download</a> : <span className="mute">{STATUS[d.status]}</span>}</div>)}</div>
        </section>
      ))}
    </main>
  );
}
