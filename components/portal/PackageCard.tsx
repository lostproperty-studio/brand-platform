import { fontState, type ProjectFont } from '@/lib/fonts';
import type { Package } from '@/lib/portal/packages';
import { PackagePreview } from '@/components/portal/ResourceVisuals';
import { TeamFileRemove } from '@/components/portal/TeamFiles';

type Colour = { name: string; hex: string; role?: string };
const STATUS: Record<string, string> = { in_review: 'In review', in_production: 'In production', not_in_scope: 'Not in scope' };
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${Math.round(b / 1e3)} KB` : '');

/** One package to take away: a preview, what it's for, and one download. Used in Resources and at the end of a chapter. */
export function PackageCard({ p, slug, colours, logoUrl, preview, fonts = [], canManage }: {
  p: Package; slug: string; colours: Colour[]; logoUrl?: string | null; preview?: boolean; fonts?: ProjectFont[]; canManage?: boolean;
}) {
  const href = `/api/p/${slug}/package/${p.id}`;
  const meta = [p.count ? `${p.count} file${p.count === 1 ? '' : 's'}` : '', p.formats.join(', '), size(p.bytes)].filter(Boolean).join(' · ');
  // Fonts download only once every family's files are licensed for the client
  const named = fonts.filter((f) => f.name);
  const unlicensed = p.kind === 'fonts' && named.some((f) => fontState(f) !== 'licensed');
  return (
    <article className={'rs-card' + (p.empty ? ' is-empty' : '')}>
      <PackagePreview p={p} colours={colours} logoUrl={logoUrl || null} />
      <div className="rs-card-txt">
        <h3>{p.title}</h3>
        {p.purpose ? <p className="mute">{p.purpose}</p> : null}
        <div className="rs-card-foot">
          {p.empty ? <span className="mute">{preview ? 'Not added yet. Add it in the studio’s Resources tab.' : 'Coming soon'}</span>
            : !p.ready ? <span className="tag">{STATUS[p.status || ''] || 'Coming soon'}</span>
            : unlicensed || (p.kind === 'fonts' && p.kitFiles.length + p.uploads.length === 0) ? <><button type="button" className="btn solid" disabled aria-disabled title="The font licence hasn’t been bought for you yet">Download</button><span className="mute rs-meta">Available once the fonts are licensed</span></>
            : <a className="btn solid" href={href} download>Download</a>}
          {meta && !p.empty && !unlicensed ? <span className="mute rs-meta">{meta}</span> : null}
        </div>
        {p.kind === 'team' ? <div className="rs-team">{p.kitFiles.map((f) => <div key={f.path} className="pt-file"><span>{f.path.replace(/^team\//, '')}</span><a className="btn" href={`${href}?file=${encodeURIComponent(f.path)}`}>Download</a>{canManage ? <TeamFileRemove slug={slug} path={f.path} /> : null}</div>)}</div> : null}
      </div>
    </article>
  );
}
