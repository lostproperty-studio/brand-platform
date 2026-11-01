import Link from 'next/link';
import { chapterNum, chapterSlug, portalContext, signFrames } from '@/lib/portal/context';
import type { GuideChapter } from '@/lib/portal/guide';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverPaths } from '@/lib/portal/covers';

// The picture that stands for a chapter: its divider's backdrop, first image, or the slide itself
const thumbOf = (c: GuideChapter) => { for (const b of c.blocks) { const m = b.backdrop || b.media?.[0]; if (m) return { path: m.path, w: m.w, h: m.h }; if (b.original) return { path: b.original, w: 16, h: 9 }; } return null; };

// Portal home: the cover of the guidelines, the chapters, and the ways into the kit.
export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const guide = ctx.snap?.guide;
  const chapters = guide?.chapters || [];
  const cover = chapters.map(thumbOf).find(Boolean) || null;
  const thumbs = await signFrames([...new Set([...(cover ? [cover.path] : []), ...(guide ? coverPaths(guide) : [])])]);
  const base = `/p/${slug}`;
  return (
    <div className="pt-page">
      <header className="pt-hero">
        <p className="mute">Brand guidelines{guide ? ` · from ${guide.file}` : ''}</p>
        <h1 className="pt-display">{ctx.project.client}</h1>
        {ctx.snap?.line ? <p className="pt-lede">{ctx.snap.line}</p> : null}
        {cover && thumbs[cover.path] ? <img className="pt-cover" src={thumbs[cover.path]} alt="" style={{ aspectRatio: `${cover.w} / ${cover.h}` }} /> : null}
      </header>

      <section aria-labelledby="h-ways" className="pt-ways">
        <h2 id="h-ways" className="sr">Get started</h2>
        <Link href={`${base}/guidelines`} className="pt-way"><span className="pt-n">01</span><strong>Read the guidelines</strong><span className="mute">{chapters.length} chapters, the rules and why they matter.</span></Link>
        <Link href={`${base}/resources#apps`} className="pt-way"><span className="pt-n">02</span><strong>Make something</strong><span className="mute">Apps with the brand built in, and a design system for Claude.</span></Link>
        <Link href={`${base}/resources#brand`} className="pt-way"><span className="pt-n">03</span><strong>Take the assets</strong><span className="mute">Logos, colours, fonts and more, packaged by type.</span></Link>
        <div className="pt-way"><span className="pt-n">04</span><strong>Ask anything</strong><span className="mute">Use the bar at the bottom of any page. It knows what you’re looking at.</span></div>
      </section>

      {chapters.length ? <section aria-labelledby="h-ch">
        <h2 id="h-ch" className="pt-h2">Chapters</h2>
        <div className="pt-chgrid">
          {chapters.map((c, i) => (
            <Link key={c.id} href={`${base}/guidelines/${chapterSlug(c.id)}`} className="pt-chcard">
              <div className="pt-chthumb"><ChapterCover c={c} i={i} g={guide!} urls={thumbs} colours={ctx.snap?.colours || []} logoUrl={ctx.logoUrl} /></div>
              <p><span className="pt-n">{chapterNum(i)}</span>{c.title}</p>
            </Link>))}
        </div>
      </section> : null}

      {ctx.snap?.colours.length ? <section aria-labelledby="h-col">
        <h2 id="h-col" className="pt-h2">Colours</h2>
        <div className="pt-swrow">{ctx.snap.colours.slice(0, 8).map((c) => <div key={c.hex} className="pt-swmini"><i style={{ background: c.hex }} /><span>{c.name}</span><span className="mute">{c.hex}</span></div>)}</div>
      </section> : null}
    </div>
  );
}
