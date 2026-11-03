import Link from 'next/link';
import { portalContext } from '@/lib/portal/context';
import { buildSpec, contrast } from '@/lib/designSystem';
import { dsSource } from '@/lib/designSystemSource';
import { DsPreviewFrame } from '@/components/portal/DsPreviewFrame';

// The design system: a live preview of it in use (foundations, elements, modules, layouts), what's in the
// download, and how to add it to Claude.
export default async function DesignSystem({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const { input } = await dsSource(ctx);
  const s = buildSpec(input);
  const client = ctx.project.client;
  const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;
  return (
    <div className="pt-page rs">
      <p><Link className="btn" href={`/p/${slug}/resources`}>← Resources</Link></p>
      <header className="pt-chhead">
        <p className="mute">For Claude and other AI tools</p>
        <h1 className="pt-display">Design system</h1>
        <p className="pt-lede">The {client} brand as one folder people and AI can build with: colours, type, spacing, components, page modules and whole layouts, written precisely enough that what gets made stays on brand.</p>
        <div className="row" style={{ marginTop: 12 }}><a className="btn solid" href={`/api/p/${slug}/design-system`} download>Download the design system</a><a className="btn" href={`/api/p/${slug}/design-system/preview`} target="_blank" rel="noopener">Open the preview full screen</a><span className="mute">ZIP · for Claude, Cursor or any AI tool</span></div>
      </header>

      <section className="ds-facts" aria-label="At a glance">
        <div><b>{n(s.colour.length, 'colour token')}</b><span className="mute">Light and dark themes</span></div>
        <div><b>{n(s.styles.length, 'type style')}</b><span className="mute">{[s.display?.name, s.body?.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') || 'System font'}</span></div>
        <div><b>9 components</b><span className="mute">Buttons, forms, cards, navigation, modules</span></div>
        <div><b>5 layouts</b><span className="mute">Landing page, social, slides, email, poster</span></div>
      </section>

      <DsPreviewFrame src={`/api/p/${slug}/design-system/preview`} title={`${client} design system preview`} />

      <section className="rs-sec">
        <div className="rs-sec-head"><h2 className="pt-h2">What’s in it</h2></div>
        <div className="ds-list">
          <div><strong>DESIGN.md</strong><span className="mute">The brand book: voice, colour roles, type scale, space and shape, imagery, logo, components, layouts, the guidelines and the rules for AI.</span></div>
          <div><strong>tokens.json · tokens.css</strong><span className="mute">Every value as tokens, in light and dark.</span></div>
          <div><strong>brand.css</strong><span className="mute">The components as ready-to-use classes, built only from the tokens.</span></div>
          <div><strong>components/</strong><span className="mute">A guide and a live preview for each component and module.</span></div>
          <div><strong>preview.html</strong><span className="mute">Everything above in use: this page, offline.</span></div>
          <div><strong>assets/</strong><span className="mute">{[s.logo.all.length ? n(s.logo.all.length, 'logo file') : '', s.images.length ? n(s.images.length, 'image') : '', s.graphics.length ? n(s.graphics.length, 'graphic') : '', s.fontFiles.length ? n(s.fontFiles.length, 'font file') : ''].filter(Boolean).join(', ') || 'Logo files and fonts, once supplied'}.</span></div>
          <div><strong>SKILL.md</strong><span className="mute">Tells Claude when and how to use it.</span></div>
        </div>
        <div className="ds-roles">{([['Background', s.lt.surface], ['Text', s.lt.ink], ['Accent', s.accent], ['Text on accent', s.onAccent]] as const).map(([l, hex]) => <div key={l}><span style={{ background: hex }} /><p>{l}<br /><span className="mute">{hex}{l === 'Text on accent' ? ` · ${contrast(s.onAccent, s.accent).toFixed(1)}:1` : ''}</span></p></div>)}</div>
      </section>

      {ctx.preview && s.judgement.length ? <section className="rs-sec">
        <div className="rs-sec-head"><h2 className="pt-h2">Judgement calls</h2><p className="mute">Only the studio sees this list here; it’s also in DESIGN.md. Fill the gaps in the guidelines to replace them.</p></div>
        <ul className="ds-judge">{s.judgement.map((j) => <li key={j}>{j}</li>)}</ul>
      </section> : null}

      <section className="rs-sec">
        <div className="rs-sec-head"><h2 className="pt-h2">Add it to Claude</h2></div>
        <ol className="ds-steps">
          <li>Download the design system.</li>
          <li>In Claude, open <strong>Settings → Capabilities → Skills</strong> and upload the .zip.</li>
          <li>Ask for anything in the brand, for example “Build a landing page for our new space in the {client} design system.”</li>
        </ol>
        <p className="mute">Using another AI tool? Unzip it and point the tool at DESIGN.md. Download it again when the guidelines are updated.</p>
      </section>
    </div>
  );
}
