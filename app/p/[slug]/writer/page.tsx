import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { Writer } from '@/components/portal/Writer';
import { voiceHas, voiceMissing, voiceReady } from '@/lib/voice';

// The Writer: on-brand copy from a brief, in the voice Lost Property set with the client
export default async function WriterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (!ctx?.snap) notFound();
  const v = ctx.snap.voice;
  const ready = !!v && voiceReady(v);
  // Clients see the Writer once it's set up, switched on and published. The studio can always try it, even with
  // the voice still in progress, to see what the client will get.
  if (!ctx.preview && !(ready && v!.writer)) notFound();
  if (!v || !voiceHas(v)) return <div className="pt-page wr-page"><div className="wr-off"><h1 className="pt-display">Writer</h1>
    <p className="mute">The Writer works only from the voice you set, and there’s nothing in it yet. Add the voice work in the studio’s Voice tab, then come back to try it.</p>
    <a className="btn solid" href={`/studio/projects/${ctx.project.id}?tab=voice`}>Open the Voice tab</a></div></div>;
  const missing = voiceMissing(v).filter((f) => f.core).map((f) => f.label.toLowerCase());
  const note = v.writer && ready ? 'Studio preview: this is what clients see once you publish.'
    : `Studio test: clients can’t see the Writer yet.${missing.length ? ` The voice is still in progress (missing: ${missing.join(', ')}), so results will get better as you fill it in.` : ' Switch it on in the Voice tab and publish to give it to the client.'}`;
  // Audiences from the voice, by name ("Regulars: warm…" → "Regulars")
  const audiences = (v!.fields?.audiences || '').split(/\n+/).map((l) => l.replace(/^[-•*]\s*/, '').split(/[:–—]| - /)[0].trim()).filter((x) => x && x.length < 60).slice(0, 12);
  return <div className="pt-page wide wr-page">
    <Writer slug={slug} client={ctx.project.client} audiences={audiences} aiConnected={!!ctx.project.ai_key_hint || ctx.preview} canConnect={ctx.access.clientAdmin} note={ctx.preview ? note : undefined} />
  </div>;
}
