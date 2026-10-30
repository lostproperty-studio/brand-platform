import Link from 'next/link';
import { portalContext } from '@/lib/portal/context';
import { listTools } from '@/lib/tools';
import { Icon } from '@/lib/icons';
import { SKILLS } from '@/lib/skills';

// Tools: apps for making on-brand work, plus Claude skills to take the brand into Claude.
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const tools = await listTools(ctx.project.id, ctx.preview);
  return (
    <div className="pt-page">
      <header className="pt-chhead">
        <p className="mute">Make something</p>
        <h1 className="pt-display">Tools</h1>
        <p className="pt-lede">Apps built for the {ctx.project.client} brand. The rules are built in, and with AI connected you can describe what you need and let the tool set itself up.</p>
      </header>
      <section aria-labelledby="h-apps">
        <h2 id="h-apps" className="sr">Apps</h2>
        <div className="tl-grid">{tools.map((t) => <Link key={t.id} href={`/p/${slug}/tools/${t.id}`} className={'tl-app' + (t.visible ? '' : ' off')}><span className="tl-icon"><Icon name={t.icon} size={28} /></span><span className="tl-name">{t.name}{t.visible ? '' : ' · hidden'}</span><span className="mute">{t.description}</span></Link>)}</div>
      </section>
      <section aria-labelledby="h-skills" className="pt-blk">
        <h2 id="h-skills" className="pt-h2">Claude skills</h2>
        <p className="mute" style={{ marginTop: -6, maxWidth: 640 }}>Add these to your own Claude and it will make decks, documents and posts with the {ctx.project.client} logos, colours and fonts, following every rule in these guidelines. Download a skill, then in Claude open <strong style={{ color: '#000' }}>Settings → Capabilities → Skills</strong> and upload the .zip.</p>
        <div className="tl-skills">{SKILLS.map((s) => <div key={s.id} className="tl-skill"><span className="tl-icon sm"><Icon name={s.icon} size={20} /></span><div style={{ flex: 1 }}><p style={{ margin: 0 }}>{s.title}</p><p className="mute" style={{ margin: 0 }}>{s.blurb}</p></div><a className="btn" href={`/api/p/${slug}/skills/${s.id}`} download>Download</a></div>)}</div>
        <p className="mute">Skills update when the guidelines are republished, so download them again after a new version.</p>
      </section>
    </div>
  );
}
