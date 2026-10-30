import Link from 'next/link';
import { chapterNum, chapterSlug, portalContext, signFrames } from '@/lib/portal/context';
import type { GuideChapter } from '@/lib/portal/guide';

// The picture that stands for a chapter: its divider's backdrop, first image, or the slide itself
const thumbOf = (c: GuideChapter) => { for (const b of c.blocks) { const m = b.backdrop || b.media?.[0]; if (m) return { path: m.path, w: m.w, h: m.h }; if (b.original) return { path: b.original, w: 16, h: 9 }; } return null; };

// Portal home: the cover of the guidelines, the chapters, and the ways into the kit.
export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const guide = ctx.snap?.guide;
  const chapters = guide?.chapters || [];
  const cover = chapters.map(thumbOf).find(Boolean) || null;
  const thumbs = await signFrames([...(cover ? [cover.path] : []), ...chapters.map((c) => thumbOf(c)?.path).filter(Boolean) as string[]]);
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
        <Link href={`${base}/downloads`} className="pt-way"><span className="pt-n">02</span><strong>Download the kit</strong><span className="mute">Logos, colours, fonts, templates and the guidelines as files.</span></Link>
        <Link href={`${base}/canvas`} className="pt-way"><span className="pt-n">03</span><strong>Make a layout</strong><span className="mute">Fill a template with your copy and image. The brand rules are built in.</span></Link>
        <Link href={`${base}/ask`} className="pt-way"><span className="pt-n">04</span><strong>Ask a question</strong><span className="mute">“Can I put the logo on a photo?” Answers come from these guidelines.</span></Link>
      </section>

      {chapters.length ? <section aria-labelledby="h-ch">
        <h2 id="h-ch" className="pt-h2">Chapters</h2>
        <div className="pt-chgrid">
          {chapters.map((c, i) => { const t = thumbOf(c); return (
            <Link key={c.id} href={`${base}/guidelines/${chapterSlug(c.id)}`} className="pt-chcard">
              <div className="pt-chthumb">{t && thumbs[t.path] ? <img src={thumbs[t.path]} alt="" loading="lazy" /> : <span>{c.title}</span>}</div>
              <p><span className="pt-n">{chapterNum(i)}</span>{c.title}</p>
            </Link>); })}
        </div>
      </section> : null}

      {ctx.snap?.colours.length ? <section aria-labelledby="h-col">
        <h2 id="h-col" className="pt-h2">Colours</h2>
        <div className="pt-swrow">{ctx.snap.colours.slice(0, 8).map((c) => <div key={c.hex} className="pt-swmini"><i style={{ background: c.hex }} /><span>{c.name}</span><span className="mute">{c.hex}</span></div>)}</div>
      </section> : null}
    </div>
  );
}
