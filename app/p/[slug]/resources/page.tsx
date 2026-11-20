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
import { Plugins, type PluginView } from '@/components/portal/Plugins';
import { portalV2 } from '@/lib/portalVersion';
import { projectStages, canSee, stageBadge } from '@/lib/features';
import { PLUGINS, readPanel } from '@/lib/plugins/catalog';
import { configured, connections, googleAddonUrl, visibleSettings } from '@/lib/plugins/server';
import { panelClients } from '@/lib/plugins/panelAuth';
import { panelBrand } from '@/lib/plugins/panelData';
import { canvaApp, canvaCallback } from '@/lib/plugins/canva';
import { secretOf } from '@/lib/plugins/server';
import { appOrigin } from '@/lib/origin';


// Resources: the apps tray at the top, then everything to take away, as packages in a long scroll with a jump bar.
// Only what this client has is shown, so a simple brand stays simple.
export default async function Resources({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ plugin?: string; msg?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
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
  const sections = SECTIONS.filter((s) => s.id !== 'elements').map((s) => ({ ...s, items: shown.filter((p) => sec(p) === s.id) })).filter((s) => s.items.length); // Team files only show where the team has already shared some
  // Plug-ins (portal v2, behind its release stage): what's ready for everyone; what's coming, for the studio only
  const plugStage = portalV2() ? (await projectStages(ctx.project.id)).plugins : 'off';
  const plugins = canSee(plugStage, ctx.preview) ? await (async () => {
    const origin = await appOrigin();
    const [{ rows, ready }, creds, preview, canvaUses, own] = await Promise.all([connections(ctx.project.id), panelClients(ctx.project.id), panelBrand(ctx.project.id, slug, ctx.preview, origin).catch(() => null), canvaApp(ctx.project.id).catch(() => null), secretOf<{ app?: unknown }>(ctx.project.id, 'canva').catch(() => null)]);
    const staff = ctx.access.staff;
    const items: PluginView[] = PLUGINS.filter((d) => staff || (d.panel?.status === 'ready' && configured(d.id).panel) || (d.account?.status === 'ready' && (d.id === 'canva' ? !!canvaUses : configured(d.id).account))).map((d) => {
      const c = rows[d.id];
      const ready = d.id === 'canva' ? { ...configured(d.id), account: !!canvaUses } : configured(d.id);
      return { def: d, ready, panelSet: !!d.panel && creds.some((x) => x.host === d.panel!.host), ...(d.id === 'canva' && staff ? { canva: { ownApp: !!own?.app, callback: canvaCallback(origin) } } : {}), ...(d.id === 'google' ? { marketplace: googleAddonUrl() } : {}), connected: c?.account ? { account: c.account, settings: visibleSettings(d.id, c.settings, staff) as Record<string, boolean | string>, last: (c.state as { last?: NonNullable<PluginView['connected']>['last'] }).last } : null };
    });
    return { items, ready, preview, panel: readPanel(ctx.project.content), badge: stageBadge(plugStage) };
  })() : null;
  const jump = [{ id: 'apps', label: 'Custom Apps' }, ...sections.filter((s) => s.id === 'brand' || s.id === 'elements').map((s) => ({ id: s.id, label: s.title })), { id: 'ai', label: 'For AI' }, ...(plugins ? [{ id: 'plugins', label: 'Plug-ins' }] : []), ...sections.filter((s) => s.id === 'builders' || s.id === 'team').map((s) => ({ id: s.id, label: s.id === 'builders' ? 'For developers' : 'Team files' }))];

  const card = (p: Package) => <PackageCard key={p.id} p={p} slug={slug} colours={snap.colours} logoUrl={ctx.logoUrl} preview={ctx.preview} fonts={ctx.fonts} canManage={ctx.access.canManage} />;

  return (
    <div className="pt-page rs">
      <header className="pt-chhead">
        <p className="mute">Make and take away</p>
        <h1 className="pt-display">Resources</h1>
        <p className="pt-lede">Download assets, use custom apps, and plug the platform into the tools you use day to day.</p>
      </header>
      <JumpNav items={jump} />

      <section id="apps" className="rs-sec" aria-labelledby="h-apps">
        <div className="rs-sec-head"><h2 id="h-apps" className="pt-h2">Custom Apps</h2><p className="mute">Built for the {ctx.project.client} brand, with the rules built in.</p></div>
        <div className="rs-tray">
          {tools.map((t, i) => <Link key={t.id} href={`${base}/tools/${t.id}`} className={'rs-app' + (t.visible ? '' : ' off')}>
            <AppTile icon={t.icon} />
            <span className="rs-app-name">{t.name}{t.beta ? <span className="beta-tag" title="A work in progress: it may change, and things may not always work as expected">Beta</span> : null}{t.ai_enabled ? <span className="rs-pill">AI</span> : null}{t.visible ? null : <span className="rs-pill">Hidden</span>}</span>
            <span className="mute rs-app-desc">{t.description}</span>
          </Link>)}
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

      {plugins ? <section id="plugins" className="rs-sec" aria-labelledby="h-plugins">
        <div className="rs-sec-head"><h2 id="h-plugins" className="pt-h2">Plug-ins{plugins.badge ? <span className="beta-tag">{plugins.badge}</span> : null}</h2><p className="mute">{ctx.project.client}, inside the tools your team already uses.</p></div>
        <Plugins slug={slug} client={ctx.project.client} lead={ctx.access.clientAdmin} staff={ctx.access.staff} items={plugins.items} panel={plugins.panel} preview={plugins.preview} dbReady={plugins.ready} flash={sp.plugin && sp.msg ? { plugin: sp.plugin, msg: sp.msg } : undefined} />
      </section> : null}

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
