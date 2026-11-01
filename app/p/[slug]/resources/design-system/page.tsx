import Link from 'next/link';
import { portalContext } from '@/lib/portal/context';
import { roles } from '@/lib/designSystem';

// The design system: what's in it, a live specimen in the brand, and how to add it to Claude.
export default async function DesignSystem({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const snap = ctx.snap!;
  const r = roles(snap.colours);
  const named = ctx.fonts.filter((f) => f.name);
  return (
    <div className="pt-page rs">
      <p><Link className="btn" href={`/p/${slug}/resources`}>← Resources</Link></p>
      <header className="pt-chhead">
        <p className="mute">For Claude and other AI tools</p>
        <h1 className="pt-display">Design system</h1>
        <p className="pt-lede">The {ctx.project.client} brand as one folder AI can build with: colours, type, spacing, components, logo files and the rules, written precisely enough that what it makes stays on brand.</p>
        <div className="row" style={{ marginTop: 12 }}><a className="btn solid" href={`/api/p/${slug}/design-system`} download>Download the design system</a><span className="mute">ZIP · for Claude, Cursor or any AI tool</span></div>
      </header>

      <section className="ds-spec" style={{ background: r.paper.hex, color: r.ink.hex }} aria-label="Specimen">
        <p className="ds-eb">Specimen</p>
        <p className="ds-h" style={{ fontFamily: 'var(--pt-display)' }}>{snap.line || ctx.project.client}</p>
        <p style={{ fontFamily: 'var(--pt-body)', maxWidth: 520 }}>Body copy in {named.find((f) => f.role === 'body')?.name || 'the body typeface'}. Every value here comes from the guidelines.</p>
        <div className="row"><span className="ds-btn" style={{ background: r.accent.hex, color: r.onAccent.hex }}>Primary action</span><span className="ds-btn line" style={{ borderColor: r.ink.hex }}>Secondary</span></div>
        <div className="ds-card" style={{ background: r.surface.hex }}><p className="ds-eb">Card</p><p style={{ margin: 0 }}>On the surface colour.</p></div>
      </section>

      <section className="rs-sec">
        <div className="rs-sec-head"><h2 className="pt-h2">What’s in it</h2></div>
        <div className="ds-list">
          <div><strong>DESIGN.md</strong><span className="mute">The spec: colour roles, type scale, spacing, components, the guidelines and the rules for AI.</span></div>
          <div><strong>brand.css</strong><span className="mute">The system as working CSS variables and classes.</span></div>
          <div><strong>preview.html</strong><span className="mute">Open it to see the system working.</span></div>
          <div><strong>SKILL.md</strong><span className="mute">Tells Claude when and how to use it.</span></div>
          <div><strong>assets/ and tokens/</strong><span className="mute">Logo files, licensed fonts and design tokens from the kit.</span></div>
        </div>
        <div className="ds-roles">{[['Background', r.paper], ['Text', r.ink], ['Accent', r.accent], ['Surface', r.surface]].map(([l, c]) => { const col = c as { name: string; hex: string }; return <div key={l as string}><span style={{ background: col.hex }} /><p>{l as string}<br /><span className="mute">{col.name !== col.hex ? `${col.name} · ` : ''}{col.hex}</span></p></div>; })}</div>
      </section>

      <section className="rs-sec">
        <div className="rs-sec-head"><h2 className="pt-h2">Add it to Claude</h2></div>
        <ol className="ds-steps">
          <li>Download the design system.</li>
          <li>In Claude, open <strong>Settings → Capabilities → Skills</strong> and upload the .zip.</li>
          <li>Ask for anything in the brand, for example “Build a landing page for our new space in the {ctx.project.client} design system.”</li>
        </ol>
        <p className="mute">Using another AI tool? Unzip it and point the tool at DESIGN.md. Download it again when the guidelines are updated.</p>
      </section>
    </div>
  );
}
