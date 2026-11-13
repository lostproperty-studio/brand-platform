import { ProtectImages } from '@/components/portal/ImageRights';
import { portalContext, signFrames } from '@/lib/portal/context';
import { hasShowcase, showcasePaths } from '@/lib/showcase';
import { ShowcaseMedia } from '@/components/portal/ShowcaseFrame';

// The showcase: the brand at work, full width beside the sidebar. 3:2 rows across, 3:4 rows in pairs.
export default async function ShowcasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const s = ctx.snap?.showcase;
  const urls = s ? await signFrames(showcasePaths(s)) : {};
  return (
    <div className="sc">
      <header className="sc-head">
        <p className="mute">The brand at work</p>
        <h1 className="pt-display">{s?.title || 'Showcase'}</h1>
        {s?.intro ? <p className="pt-lede">{s.intro}</p> : null}
      </header>
      {!hasShowcase(s) ? <p className="mute sc-empty">{ctx.preview ? 'Nothing here yet. Build the showcase in the studio’s Showcase tab.' : 'Coming soon.'}</p> : null}
      <ProtectImages className="sc-rows">
        {(s?.rows || []).filter((r) => r.frames.some((f) => f.kind !== 'empty')).map((r) => (
          <div key={r.id} className={'sc-row ' + r.layout}>
            {r.frames.map((f, i) => (
              <figure key={i} className="sc-frame">
                <div className="sc-media" style={f.bg ? { background: f.bg } : undefined}><ShowcaseMedia f={f} url={f.path ? urls[f.path] : undefined} label={`${ctx.project.client} showcase`} /></div>
                {f.caption ? <figcaption>{f.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        ))}
      </ProtectImages>
    </div>
  );
}
