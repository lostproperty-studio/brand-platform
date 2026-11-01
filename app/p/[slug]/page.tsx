import { textProps } from '@/lib/textStyle';
import type { TextStyle } from '@/lib/figma/blocks';
import Link from 'next/link';
import { adminClient } from '@/lib/supabase/server';
import { chapterNum, chapterSlug, portalContext, signFrames } from '@/lib/portal/context';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverPaths } from '@/lib/portal/covers';
import { HeroReel } from '@/components/portal/HeroReel';
import { showcasePaths } from '@/lib/showcase';
import { listTools } from '@/lib/tools';
import { AppTile, tileColours } from '@/components/portal/ResourceVisuals';
import { defaultIntro } from '@/lib/portal/home';


// Portal home: the showcase hero, the brand and its version, a welcome, the chapters and the apps you've used.
export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const guide = ctx.snap?.guide;
  const chapters = guide?.chapters || [];
  const base = `/p/${slug}`;
  const sb = adminClient();
  const content = (ctx.project.content || {}) as { homeIntro?: string; homeTitle?: string; homeStyles?: Record<string, TextStyle> };
  const hs = (k: string, cls: string) => { const t = textProps(content.homeStyles?.[k]); return { className: [cls, t.className].filter(Boolean).join(' '), style: t.style }; };

  // Version: the published one for clients, the working copy for the studio
  const { data: v } = await sb.from('project_versions').select('version').eq('project_id', ctx.project.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: kv } = ctx.preview ? await sb.from('projects').select('kit_version').eq('id', ctx.project.id).single() : { data: null };
  const version = ctx.preview ? kv?.kit_version : v?.version;

  // Hero: the showcase rows that have something in them
  const rows = (ctx.snap?.showcase?.rows || []).filter((r) => r.frames.some((f) => f.kind !== 'empty'));
  const urls = await signFrames([...new Set([...(guide ? coverPaths(guide) : []), ...(ctx.snap?.showcase ? showcasePaths(ctx.snap.showcase) : [])])]);

  // Apps: the ones this person used most recently, or all of them if they haven't used any yet
  const tools = await listTools(ctx.project.id, false);
  const { data: used } = await sb.from('activity').select('detail, created_at').eq('project_id', ctx.project.id).eq('user_id', ctx.access.user.id).eq('kind', 'tool').order('created_at', { ascending: false }).limit(50);
  const order = [...new Set((used || []).map((u) => u.detail))];
  const recent = order.map((n) => tools.find((t) => t.name === n || t.id === n)).filter(Boolean) as typeof tools;
  const apps = (recent.length ? recent : tools).slice(0, 4);
  const tiles = tileColours(ctx.snap?.colours || []);

  return (
    <div className="hm">
      {rows.length ? <HeroReel rows={rows} urls={urls} href={`${base}/showcase`} label={`${ctx.project.client} showcase`} /> : null}
      <div className="pt-page hm-body">
        <header className="hm-head">
          <h1 {...hs('title', 'pt-display')}>{content.homeTitle || ctx.project.client}</h1>
          <p className="mute hm-ver">Brand hub{version ? ` · v${version}` : ''}{ctx.preview ? ' · working copy' : ''}</p>
          <p {...hs('lede', 'pt-lede hm-intro')}>{content.homeIntro || defaultIntro(ctx.project.client)}</p>
        </header>

        {chapters.length ? <section aria-labelledby="h-ch">
          <h2 id="h-ch" className="pt-h2">Chapters</h2>
          <div className="pt-chgrid">
            {chapters.map((c, i) => (
              <Link key={c.id} href={`${base}/guidelines/${chapterSlug(c.id)}`} className="pt-chcard">
                <div className="pt-chthumb"><ChapterCover c={c} i={i} g={guide!} urls={urls} colours={ctx.snap?.colours || []} logoUrl={ctx.logoUrl} /></div>
                <p><span className="pt-n">{chapterNum(i)}</span>{c.title}</p>
              </Link>))}
          </div>
        </section> : null}

        {apps.length ? <section aria-labelledby="h-apps">
          <div className="hm-row"><h2 id="h-apps" className="pt-h2">{recent.length ? 'Recently used apps' : 'Apps'}</h2><Link href={`${base}/resources#apps`} className="mute">All resources →</Link></div>
          <div className="rs-tray">
            {apps.map((t, i) => <Link key={t.id} href={`${base}/tools/${t.id}`} className="rs-app">
              <AppTile icon={t.icon} colour={tiles.length ? tiles[tools.indexOf(t) % tiles.length].hex : undefined} seed={tools.indexOf(t)} />
              <span className="rs-app-name">{t.name}</span>
              <span className="mute rs-app-desc">{t.description}</span>
            </Link>)}
          </div>
        </section> : null}
      </div>
    </div>
  );
}
