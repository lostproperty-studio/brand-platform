import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chapterNum, chapterSlug, downloadUrl, portalContext, signFrames } from '@/lib/portal/context';
import { TypeTester } from '@/components/portal/Interactive';
import { fontState } from '@/lib/fonts';
import { GuideBlock } from '@/components/portal/GuideBlock';
import { SubNav } from '@/components/portal/SubNav';
import { Swatch } from '@/components/portal/Swatch';

const textOn = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#000' : '#fff'; };
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };
const DOWNLOADS: Record<string, [RegExp, string]> = { logo: [/^assets\/logo\//, 'Logo files'], colour: [/^tokens\//, 'Colour and design tokens'], type: [/^assets\/fonts\//, 'Font files'], imagery: [/^assets\/(imagery|patterns?)\//, 'Imagery'], layout: [/^templates\//, 'Templates'] };

// One chapter of the guidelines: the Figma frames as designed, then the exact rules, then the files.
export default async function Chapter({ params }: { params: Promise<{ slug: string; chapter: string }> }) {
  const { slug, chapter } = await params;
  const ctx = (await portalContext(slug))!;
  const chapters = ctx.snap?.guide?.chapters || [];
  const idx = chapters.findIndex((c) => chapterSlug(c.id) === chapter);
  if (idx < 0) notFound();
  const c = chapters[idx];
  const urls = await signFrames(c.blocks.flatMap((b) => [b.original, b.backdrop?.path, ...(b.media || []).map((m) => m.path)]).filter(Boolean) as string[]);
  const hasCover = c.blocks[0]?.kind === 'cover' && !c.blocks[0].hidden;
  // Subsections: each divider slide starts one (e.g. Wordmark, Symbol, How to use)
  const subs = c.blocks.filter((b) => b.kind === 'divider' && !b.hidden && b.heading).map((b) => ({ id: 's-' + b.id.replace(/[^a-z0-9]/gi, '-'), title: b.heading!.replace(/\n/g, ' '), block: b.id }));
  const dl = c.key && DOWNLOADS[c.key] ? ctx.files.filter((f) => DOWNLOADS[c.key!][0].test(f.path) && !/LICENCE|manifest/.test(f.path)) : [];
  const dlLinks = await Promise.all(dl.slice(0, 24).map(async (f) => ({ ...f, href: await downloadUrl(f, ctx.preview, slug) })));
  const prev = chapters[idx - 1], next = chapters[idx + 1];
  const base = `/p/${slug}/guidelines`;

  return (
    <article className="pt-page">
      <header className="pt-chhead">
        <p className="mute"><span className="pt-n">{chapterNum(idx)}</span>{c.kicker || 'Chapter'}</p>
        <h1 className={hasCover ? 'sr' : 'pt-display'}>{c.title}</h1>
        {c.lede ? <p className="pt-lede">{c.lede}</p> : null}
      </header>

      {c.key === 'colour' && ctx.snap?.colours.length && !c.blocks.some((b) => b.kind === 'swatches' && !b.hidden) ? <section className="pt-blk" aria-labelledby="h-c">
        <h2 id="h-c" className="pt-h2">The colours</h2>
        <p className="mute" style={{ marginTop: -6 }}>Click a colour to copy its HEX code.</p>
        <div className="pt-cc">{ctx.snap.colours.map((col) => <Swatch key={col.hex} className="pt-ccc" name={col.name} hex={col.hex} note={[col.role, rgb(col.hex)].filter(Boolean).join(' · ')} ink={textOn(col.hex)} />)}</div>
      </section> : null}

      {c.key === 'type' && ctx.fonts.some((f) => f.name) ? <section className="pt-blk" aria-labelledby="h-t">
        <h2 id="h-t" className="pt-h2">The typefaces</h2>
        <TypeTester fonts={ctx.fonts.filter((f) => f.name).map((f) => ({ role: f.role, label: f.label, name: f.name, hasFiles: f.files.length > 0, licensed: fontState(f) === 'licensed', weights: [...new Set(f.files.map((x) => x.weight))].sort() }))} />
      </section> : null}

      {subs.length > 1 ? <SubNav items={subs} /> : null}
      <div className="pt-blocks">{c.blocks.map((b, k) => { const si = subs.findIndex((x) => x.block === b.id); return <GuideBlock key={b.id} b={b} urls={urls} headingLevel={k === 0 && hasCover ? 2 : 3} anchor={si >= 0 ? subs[si].id : undefined} number={si >= 0 ? String(si + 1).padStart(2, '0') : undefined} chapter={c.title} />; })}</div>

      {c.rules.length ? <section className="pt-blk" aria-labelledby="h-r">
        <h2 id="h-r" className="pt-h2">The rules</h2>
        <p className="mute" style={{ marginTop: -6 }}>Exact values to follow, for people and for AI tools.</p>
        <div className="pt-rules">{c.rules.map((r, k) => <div key={k} className="pt-rule"><span className="pt-n">{chapterNum(k)}</span><p className="pt-rule-h">{r.title}</p><p>{r.text}</p></div>)}</div>
      </section> : null}

      {dlLinks.length ? <section className="pt-blk" aria-labelledby="h-d">
        <h2 id="h-d" className="pt-h2">{DOWNLOADS[c.key!][1]}</h2>
        <div className="pt-files">{dlLinks.map((f) => <div key={f.path} className="pt-file"><span>{f.path.split('/').pop()}</span><span className="mute">{f.format}</span>{f.href ? <a className="btn" href={f.href}>Download</a> : <span className="mute">Coming soon</span>}</div>)}</div>
        <Link href={`/p/${slug}/downloads`} className="mute">Everything in the kit →</Link>
      </section> : null}

      <nav className="pt-pn" aria-label="Chapters">
        {prev ? <Link className="btn" href={`${base}/${chapterSlug(prev.id)}`}>← {prev.title}</Link> : <span />}
        {next ? <Link className="btn solid" href={`${base}/${chapterSlug(next.id)}`}>{next.title} →</Link> : null}
      </nav>
    </article>
  );
}
