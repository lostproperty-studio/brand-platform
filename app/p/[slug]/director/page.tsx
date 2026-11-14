import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { canSee, projectStages, stageBadge } from '@/lib/features';

// Director: plan, shoot and generate short-form video from the creative direction Lost Property set for the brand.
// Gated by the release stage (Admin settings → Releases); studio-only while it's a prototype.
const STEPS = [
  ['Brief', 'Say what the video is for, in a line.'],
  ['Plan', 'A shot list in the brand’s world, with a mode and a prompt for every shot.'],
  ['Keyframes', 'Stills made with the brand’s references. Approve one per shot, or drop in your own footage.'],
  ['Motion', 'Each approved frame comes to life, at the pace and camera the direction sets.'],
  ['Finish', 'Logo, type, end card and sound from the brand kit, never generated.'],
  ['Review', 'Checked against the creative direction, then saved to your team’s library.']
] as const;

export default async function DirectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx?.snap) notFound();
  const stage = (await projectStages(ctx.project.id)).director;
  if (!canSee(stage, ctx.preview)) notFound();
  const badge = stageBadge(stage);
  return <div className="pt-page dr-page">
    <header className="dr-head">
      <h1 className="pt-display">Director{badge ? <span className={'pt-badge big ' + badge.toLowerCase()}>{badge}</span> : null}</h1>
      <p className="mute dr-lede">Short-form video for {ctx.project.client}, made from the world and creative direction Lost Property set for the brand.</p>
      {stage === 'studio' ? <p className="pt-preview" role="status">Labs: only the studio can see this. {ctx.project.client}’s team won’t see Director until it’s moved to Client beta in Admin settings → Releases.</p> : null}
    </header>
    <ol className="dr-steps">
      {STEPS.map(([t, d], i) => <li key={t} className="dr-step"><span className="dr-n">{String(i + 1).padStart(2, '0')}</span><div><p className="dr-t">{t}</p><p className="mute">{d}</p></div></li>)}
    </ol>
  </div>;
}
