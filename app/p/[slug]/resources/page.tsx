import Link from 'next/link';
import { portalContext } from '@/lib/portal/context';
import { listTools } from '@/lib/tools';
import { Icon } from '@/lib/icons';
import { SKILLS, readSkillSettings, skillShown } from '@/lib/skills';
import { portalPackages, SECTIONS, visibleToClient, type Package } from '@/lib/portal/packages';
import { roles } from '@/lib/designSystem';
import { AppTile, SystemPreview } from '@/components/portal/ResourceVisuals';
import { PackageCard } from '@/components/portal/PackageCard';
import { JumpNav } from '@/components/portal/JumpNav';
import { TeamFileUpload } from '@/components/portal/TeamFiles';


// Resources: the apps tray at the top, then everything to take away, as packages in a long scroll with a jump bar.
// Only what this client has is shown, so a simple brand stays simple.
export default async function Resources({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const snap = ctx.snap!;
  const tools = await listTools(ctx.project.id, ctx.preview);
  const all = await portalPackages(ctx);
  // The studio previewing sees the empty core spaces too, so it knows what's still to add
  const shown = all.filter((p) => visibleToClient(p) || (ctx.preview && !p.hidden && p.enabled && p.core));
  const r = roles(snap.colours);
  const base = `/p/${slug}`;
  const skillSet = readSkillSettings(ctx.project.content);
  const skillsShown = SKILLS.filter((s) => skillShown(skillSet, s.id));
  // One Brand assets section, as in the studio: logo, colour and type, then the extras this brand has
  const sec = (p: Package) => (p.section === 'elements' ? 'brand' : p.section);
  const sections = SECTIONS.filter((s) => s.id !== 'elements').map((s) => ({ ...s, items: shown.filter((p) => sec(p) === s.id) })).filter((s) => s.items.length || (s.id === 'team' && ctx.access.canManage));
  const jump = [{ id: 'apps', label: 'Apps' }, ...sections.filter((s) => s.id === 'brand' || s.id === 'elements').map((s) => ({ id: s.id, label: s.title })), { id: 'ai', label: 'For AI' }, ...sections.filter((s) => s.id === 'builders' || s.id === 'team').map((s) => ({ id: s.id, label: s.id === 'builders' ? 'For developers' : 'Team files' }))];

  const card = (p: Package) => <PackageCard key={p.id} p={p} slug={slug} colours={snap.colours} logoUrl={ctx.logoUrl} preview={ctx.preview} fonts={ctx.fonts} canManage={ctx.access.canManage} />;

  return (
    <div className="pt-page rs">
      <header className="pt-chhead">
        <p className="mute">Make and take away</p>
        <h1 className="pt-display">Resources</h1>
        <p className="pt-lede">Apps for making {ctx.project.client} work, and everything you need to take with you, packaged by type.</p>
      </header>
      <JumpNav items={jump} />

      <section id="apps" className="rs-sec" aria-labelledby="h-apps">
        <div className="rs-sec-head"><h2 id="h-apps" className="pt-h2">Apps</h2><p className="mute">Built for the {ctx.project.client} brand, with the rules built in.</p></div>
        <div className="rs-tray">
          {tools.map((t, i) => <Link key={t.id} href={`${base}/tools/${t.id}`} className={'rs-app' + (t.visible ? '' : ' off')}>
            <AppTile icon={t.icon} />
            <span className="rs-app-name">{t.name}{t.ai_enabled ? <span className="rs-pill">AI</span> : null}{t.visible ? null : <span className="rs-pill">Hidden</span>}</span>
            <span className="mute rs-app-desc">{t.description}</span>
          </Link>)}
          <Link href={`${base}/resources/design-system`} className="rs-app">
            <span className="rs-tile rs-tile-sys"><SystemPreview colours={snap.colours} logoUrl={ctx.logoUrl} client={ctx.project.client} roles={r} /></span>
            <span className="rs-app-name">Design system<span className="rs-pill">For Claude</span></span>
            <span className="mute rs-app-desc">The brand as a system AI can build with.</span>
          </Link>
        </div>
      </section>

      {sections.filter((s) => s.id === 'brand' || s.id === 'elements').map((s) => (
        <section key={s.id} id={s.id} className="rs-sec" aria-labelledby={`h-${s.id}`}>
          <div className="rs-sec-head"><h2 id={`h-${s.id}`} className="pt-h2">{s.title}</h2><p className="mute">{s.blurb}</p></div>
          <div className="rs-grid">{s.items.map(card)}</div>
        </section>
      ))}

      <section id="ai" className="rs-sec" aria-labelledby="h-ai">
        <div className="rs-sec-head"><h2 id="h-ai" className="pt-h2">For AI</h2><p className="mute">Take the brand into Claude, so what it makes follows the guidelines.</p></div>
        <div className="rs-grid">
          <article className="rs-card wide">
            <div className="rs-pv rs-dspv"><SystemPreview colours={snap.colours} logoUrl={ctx.logoUrl} client={ctx.project.client} roles={r} /></div>
            <div className="rs-card-txt">
              <h3>Design system</h3>
              <p className="mute">Colours, type, spacing, components and logo rules in one folder, written for AI. Claude uses it to build interfaces, documents and layouts in the brand.</p>
              <div className="rs-card-foot"><a className="btn solid" href={`/api/p/${slug}/design-system`} download>Download</a><Link className="btn" href={`${base}/resources/design-system`}>See it and how to add it</Link></div>
            </div>
          </article>
        </div>
        {skillsShown.length ? <div className="rs-skills">
          <div className="rs-skills-head"><h3>Claude skills</h3><p className="mute">A skill teaches Claude how to do one kind of work for {ctx.project.client}: slides, documents, social posts or writing. Add one to Claude and it follows the brand whenever you ask for that kind of thing.</p></div>
          {skillsShown.map((s) => (
            <div key={s.id} className="rs-skillrow">
              <span className="rs-skillicon"><Icon name={s.icon} size={18} /></span>
              <div className="rs-skilltxt"><p>{s.title}</p><p className="mute">{s.blurb}</p></div>
              <a className="btn" href={`/api/p/${slug}/skills/${s.id}`} download>Download</a>
            </div>
          ))}
        </div> : null}
        <p className="mute rs-note">To add a skill or the design system: in Claude, open <strong>Settings → Capabilities → Skills</strong> and upload the .zip. Download again after a new version of the guidelines.</p>
      </section>

      {sections.filter((s) => s.id === 'builders' || s.id === 'team').map((s) => (
        <section key={s.id} id={s.id} className="rs-sec" aria-labelledby={`h-${s.id}`}>
          <div className="rs-sec-head"><h2 id={`h-${s.id}`} className="pt-h2">{s.title}</h2><p className="mute">{s.blurb}{s.id === 'builders' && ctx.project.repo_full_name ? ((ctx.project.content as { repoShared?: boolean } | null)?.repoShared || ctx.preview ? <> Also on <a href={`https://github.com/${ctx.project.repo_full_name}`} target="_blank" rel="noopener">GitHub</a>{ctx.preview && !(ctx.project.content as { repoShared?: boolean } | null)?.repoShared ? <span className="tag">Studio only: clients don’t see this link</span> : null}.</> : <> Your developers can also work from the kit on GitHub: ask Lost Property for access.</>) : null}</p></div>
          {s.id === 'team' && ctx.access.canManage ? <TeamFileUpload slug={slug} /> : null}
          <div className="rs-grid">{s.items.map(card)}</div>
        </section>
      ))}
    </div>
  );
}
