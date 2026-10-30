import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chapterNum, chapterSlug, downloadUrl, portalContext, signFrames } from '@/lib/portal/context';
import { CopyHex, TypeTester } from '@/components/portal/Interactive';
import { fontState } from '@/lib/fonts';
import { GuideBlock } from '@/components/portal/GuideBlock';

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
  const dl = c.key && DOWNLOADS[c.key] ? ctx.files.filter((f) => DOWNLOADS[c.key!][0].test(f.path) && !/LICENCE|manifest/.test(f.path)) : [];
  const dlLinks = await Promise.all(dl.slice(0, 24).map(async (f) => ({ ...f, href: await downloadUrl(f, ctx.preview) })));
  const prev = chapters[idx - 1], next = chapters[idx + 1];
  const base = `/p/${slug}/guidelines`;

  return (
    <article className="pt-page">
      <header className="pt-chhead">
        <p className="mute"><span className="pt-n">{chapterNum(idx)}</span>{c.kicker || 'Chapter'}</p>
        <h1 className={hasCover ? 'sr' : 'pt-display'}>{c.title}</h1>
        {c.lede ? <p className="pt-lede">{c.lede}</p> : null}
      </header>

      {c.key === 'colour' && ctx.snap?.colours.length ? <section className="pt-blk" aria-labelledby="h-c">
        <h2 id="h-c" className="pt-h2">The colours</h2>
        <div className="pt-cc">{ctx.snap.colours.map((col) => <div key={col.hex} className="pt-ccc" style={{ background: col.hex, color: textOn(col.hex) }}><span className="pt-ccn">{col.name}</span><span><CopyHex hex={col.hex} /><br /><span style={{ opacity: .75 }}>{rgb(col.hex)}</span></span></div>)}</div>
      </section> : null}

      {c.key === 'type' && ctx.fonts.some((f) => f.name) ? <section className="pt-blk" aria-labelledby="h-t">
        <h2 id="h-t" className="pt-h2">The typefaces</h2>
        <TypeTester fonts={ctx.fonts.filter((f) => f.name).map((f) => ({ role: f.role, label: f.label, name: f.name, hasFiles: f.files.length > 0, licensed: fontState(f) === 'licensed', weights: [...new Set(f.files.map((x) => x.weight))].sort() }))} />
      </section> : null}

      <div className="pt-blocks">{c.blocks.map((b, k) => <GuideBlock key={b.id} b={b} urls={urls} headingLevel={k === 0 && hasCover ? 2 : 3} />)}</div>

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
