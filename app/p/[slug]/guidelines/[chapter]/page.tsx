import { textProps } from '@/lib/textStyle';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chapterNum, chapterSlug, portalContext, signFrames } from '@/lib/portal/context';
import { portalPackages, visibleToClient } from '@/lib/portal/packages';
import { PackageCard } from '@/components/portal/PackageCard';
import { GuideBlock } from '@/components/portal/GuideBlock';
import { SubNav } from '@/components/portal/SubNav';
import { Swatch } from '@/components/portal/Swatch';
import { systemCss, systemFor } from '@/lib/guideSystem';
import { blockPaths } from '@/lib/figma/blocks';

const textOn = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#000' : '#fff'; };
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `RGB ${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };
const PACKS: Record<string, string[]> = { logo: ['logos'], colour: ['colours'], type: ['fonts'], imagery: ['images', 'graphics'], layout: ['templates'], iconography: ['icons'], icons: ['icons'] };

// One chapter of the guidelines: the Figma frames as designed, then the exact rules, then its resources.
export default async function Chapter({ params }: { params: Promise<{ slug: string; chapter: string }> }) {
  const { slug, chapter } = await params;
  const ctx = (await portalContext(slug))!;
  const chapters = ctx.snap?.guide?.chapters || [];
  const idx = chapters.findIndex((c) => chapterSlug(c.id) === chapter);
  if (idx < 0) notFound();
  const c = chapters[idx];
  const urls = await signFrames(c.blocks.flatMap(blockPaths));
  const hasCover = c.blocks[0]?.kind === 'cover' && !c.blocks[0].hidden;
  // Subsections: each divider slide starts one (e.g. Wordmark, Symbol, How to use)
  const subs = c.blocks.filter((b) => b.kind === 'divider' && !b.hidden && b.heading).map((b) => ({ id: 's-' + b.id.replace(/[^a-z0-9]/gi, '-'), title: b.heading!.replace(/\n/g, ' '), block: b.id }));
  // The packages this chapter is about, as in Resources: one card each, one download
  const kinds = c.key ? PACKS[c.key] || [] : [];
  const packs = kinds.length ? (await portalPackages(ctx)).filter((p) => kinds.includes(p.kind) && (visibleToClient(p) || (ctx.preview && !p.hidden && p.enabled && p.core))) : [];
  const prev = chapters[idx - 1], next = chapters[idx + 1];
  // The guide's text styles and spacing
  const pc = (ctx.project.content || {}) as { typeScale?: never; dsProfile?: never };
  const sysCss = systemCss(systemFor(ctx.snap?.guide?.system, { typeScale: pc.typeScale, profile: pc.dsProfile, fonts: ctx.fonts.filter((f) => f.files.length) }));
  const base = `/p/${slug}/guidelines`;
  // Styling set in the editor for the label, title and introduction
  const cls = (k: string, base0 = '') => { const t = textProps(c.styles?.[k]); return { style: t.style, className: [base0, t.className].filter(Boolean).join(' ') }; };

  return (
    <article className="pt-page gsys">
      <style dangerouslySetInnerHTML={{ __html: sysCss }} />
      <header className="pt-chhead">
        <p className="mute"><span className="pt-n">{chapterNum(idx)}</span><span {...cls('kicker')}>{c.kicker || 'Chapter'}</span></p>
        <h1 className={hasCover ? 'sr' : 'pt-display ' + cls('title').className} style={hasCover ? undefined : cls('title').style}>{c.title}</h1>
        {c.lede ? <p {...cls('lede', 'pt-lede')}>{c.lede}</p> : null}
      </header>

      {c.key === 'colour' && ctx.snap?.colours.length && !c.blocks.some((b) => b.kind === 'swatches' && !b.hidden) ? <section className="pt-blk" aria-labelledby="h-c">
        <h2 id="h-c" className="pt-h2">The colours</h2>
        <p className="mute" style={{ marginTop: -6 }}>Click a colour to copy its HEX code.</p>
        <div className="pt-cc">{ctx.snap.colours.map((col) => <Swatch key={col.hex} className="pt-ccc" name={col.name} hex={col.hex} note={[col.role, rgb(col.hex)].filter(Boolean).join(' · ')} ink={textOn(col.hex)} />)}</div>
      </section> : null}

      {subs.length > 1 ? <SubNav items={subs} /> : null}
      <div className="pt-blocks">{c.blocks.map((b, k) => { const si = subs.findIndex((x) => x.block === b.id); return <GuideBlock key={b.id} b={b} urls={urls} headingLevel={k === 0 && hasCover ? 2 : 3} anchor={si >= 0 ? subs[si].id : undefined} number={si >= 0 ? String(si + 1).padStart(2, '0') : undefined} chapter={c.title} />; })}</div>

      {c.rules.length ? <section className="pt-blk" aria-labelledby="h-r">
        <h2 id="h-r" className="pt-h2">The rules</h2>
        <p className="mute" style={{ marginTop: -6 }}>Exact values to follow, for people and for AI tools.</p>
        <div className="pt-rules">{c.rules.map((r, k) => <div key={k} className="pt-rule"><span className="pt-n">{chapterNum(k)}</span><p className="pt-rule-h">{r.title}</p><p>{r.text}</p></div>)}</div>
      </section> : null}

      {packs.length ? <section className="pt-blk" aria-labelledby="h-d">
        <h2 id="h-d" className="pt-h2">Resources</h2>
        <div className="rs-grid">{packs.map((p) => <PackageCard key={p.id} p={p} slug={slug} colours={ctx.snap?.colours || []} logoUrl={ctx.logoUrl} preview={ctx.preview} fonts={ctx.fonts} />)}</div>
        <Link href={`/p/${slug}/resources`} className="mute">Everything in the kit →</Link>
      </section> : null}

      <nav className="pt-pn" aria-label="Chapters">
        {prev ? <Link className="btn" href={`${base}/${chapterSlug(prev.id)}`}>← {prev.title}</Link> : <span />}
        {next ? <Link className="btn solid" href={`${base}/${chapterSlug(next.id)}`}>{next.title} →</Link> : null}
      </nav>
    </article>
  );
}
