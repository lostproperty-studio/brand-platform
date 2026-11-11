import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { Writer } from '@/components/portal/Writer';
import { voiceReady } from '@/lib/voice';

// The Writer: on-brand copy from a brief, in the voice Lost Property set with the client
export default async function WriterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx?.snap) notFound();
  const v = ctx.snap.voice;
  const ready = !!v && voiceReady(v);
  // The studio always sees the Writer in its preview; clients see it once it's set up, switched on and published
  if (!ctx.preview && !(ready && v!.writer)) notFound();
  if (!ready) return <div className="pt-page wr-page"><div className="wr-off"><h1 className="pt-display">Writer</h1>
    <p className="mute">The Writer works only from the voice you set, so it needs a few answers first: what the brand says, who it talks to, its personality, its verbal behaviours and some on-brand examples. Read your notes in the studio’s Voice tab and keep or answer those, then switch the Writer on for the client.</p>
    <a className="btn solid" href={`/studio/projects/${ctx.project.id}?tab=voice`}>Open the Voice tab</a></div></div>;
  // Audiences from the voice, by name ("Regulars: warm…" → "Regulars")
  const audiences = (v!.fields?.audiences || '').split(/\n+/).map((l) => l.replace(/^[-•*]\s*/, '').split(/[:–—]| - /)[0].trim()).filter((x) => x && x.length < 60).slice(0, 12);
  return <div className="pt-page wide wr-page">
    <Writer slug={slug} client={ctx.project.client} audiences={audiences} aiConnected={!!ctx.project.ai_key_hint || ctx.preview} canConnect={ctx.access.clientAdmin} preview={ctx.preview && !v!.writer} />
  </div>;
}
