import Link from 'next/link';
import { chapterNum, chapterSlug, signFrames, type PortalCtx } from '@/lib/portal/context';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverPaths } from '@/lib/portal/covers';
import { showcasePaths } from '@/lib/showcase';
import { systemCss, systemFor } from '@/lib/guideSystem';
import { recentFiles } from '@/lib/apps/server';
import { APPS, type AppKey } from '@/lib/portalVersion';
import { readSwitches } from '@/lib/portal/switches';
import type { GreetingSet } from '@/lib/portal/greetings';
import { AppIcon } from '@/components/portal/AppIcon';
import { nameOf } from '@/lib/guideVersions';
import { HomeTop } from './HomeTop';
import { ShowcaseStrip } from './ShowcaseStrip';

const short = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : `${Math.round(m / 10080)}w`; };
const NAME: Record<AppKey, string> = { writer: 'Writer', director: 'Director', designer: 'Designer', photographer: 'Photographer' };

/** What a file looks like as a small preview: a page with its headline for a doc, a strip of videos for a project */
function Preview({ app, data, title }: { app: AppKey; data: Record<string, unknown>; title: string }) {
  if (app === 'writer') {
    const pieces = (data.pieces as { name?: string; text?: string }[] | undefined) || [];
    const first = pieces.find((p) => p.text?.trim());
    const head = first?.text?.split(/\n/)[0]?.slice(0, 80) || title;
    const rest = first?.text?.split(/\n/).slice(1).join(' ').slice(0, 220);
    return <span className="h2-pv-doc"><span className="h2-pv-k">{first?.name || 'Doc'}</span><span className="h2-pv-h">{head}</span>{rest ? <span className="h2-pv-b">{rest}</span> : null}</span>;
  }
  if (app === 'director') {
    const vids = ((data.videos as string[] | undefined) || []).slice(0, 4);
    return <span className="h2-pv-film">{(vids.length ? vids : ['a']).map((v, i) => <i key={v + i} />)}</span>;
  }
  return <span className="h2-pv-icon"><AppIcon app={app} size={28} still /></span>;
}

// Portal v2 home (staging): greeting, Ask, the apps, what you were working on, the chapters and the showcase
export async function HomeV2({ ctx, slug }: { ctx: PortalCtx; slug: string }) {
  const guide = ctx.snap?.guide;
  const chapters = guide?.chapters || [];
  const base = `/p/${slug}`;
  const on = readSwitches(ctx.project.content);
  const rows = (on.showcase ? ctx.snap?.showcase?.rows || [] : []).filter((r) => r.frames.some((f) => f.kind !== 'empty'));
  const items = rows.flatMap((r) => r.frames.filter((f) => f.kind !== 'empty').map((f) => ({ f, wide: r.layout === 'full' })));
  const urls = await signFrames([...new Set([...(guide ? coverPaths(guide) : []), ...(ctx.snap?.showcase ? showcasePaths(ctx.snap.showcase) : [])])]);
  const recent = (await recentFiles(ctx.project.id, 8)).filter((f) => on[f.app as keyof typeof on] !== false);
  const firstName = nameOf(ctx.access.user).split(/\s+/)[0] || '';
  const greetings = (ctx.project.content as { portalGreetings?: GreetingSet } | null)?.portalGreetings;
  return (
    <div className="pt-page wide h2 gsys">
      <style dangerouslySetInnerHTML={{ __html: systemCss(systemFor(ctx.snap?.guide?.system, { typeScale: (ctx.project.content as { typeScale?: never })?.typeScale, profile: (ctx.project.content as { dsProfile?: never })?.dsProfile, fonts: ctx.fonts.filter((f) => f.files.length) })) }} />
      <HomeTop slug={slug} client={ctx.project.client} firstName={firstName} greetings={greetings} apps={APPS.filter((a) => on[a.key as keyof typeof on] !== false).map((a) => ({ key: a.key, name: a.name, ready: a.ready }))} studio={ctx.preview} />

      {recent.length ? <section aria-labelledby="h2-cc">
        <div className="h2-row"><h2 id="h2-cc" className="pt-h2">Continue creating</h2></div>
        <div className="h2-cc">
          {recent.map((f) => <Link key={f.id} href={`${base}/${f.app}?${f.app === 'director' ? 'p' : f.app === 'photographer' ? 'c' : 'f'}=${f.id}`} className="h2-card">
            <span className="h2-pv"><Preview app={f.app} data={f.data} title={f.title} /></span>
            <span className="h2-card-t">{f.title}</span>
            <span className="h2-card-m"><span className="h2-tag"><AppIcon app={f.app} size={12} still />{NAME[f.app]}</span><span className="mute" title={new Date(f.updated_at).toLocaleString('en-GB')}>{short(f.updated_at)}</span></span>
          </Link>)}
        </div>
      </section> : null}

      {chapters.length ? <section aria-labelledby="h2-ch">
        <div className="h2-row"><h2 id="h2-ch" className="pt-h2">Chapters</h2><Link href={`${base}/guidelines`} className="mute">Open guidelines</Link></div>
        <div className="h2-ch">
          {chapters.map((c, i) => <Link key={c.id} href={`${base}/guidelines/${chapterSlug(c.id)}`} className="pt-chcard">
            <div className="pt-chthumb"><ChapterCover c={c} i={i} g={guide!} urls={urls} colours={ctx.snap?.colours || []} logoUrl={ctx.logoUrl} /></div>
            <p><span className="pt-n">{chapterNum(i)}</span>{c.title}</p>
          </Link>)}
        </div>
      </section> : null}

      {items.length ? <ShowcaseStrip items={items} urls={urls} href={`${base}/showcase`} title={ctx.snap?.showcase?.nav || 'Showcase'} /> : null}
    </div>
  );
}
