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
  const on = !!v && voiceReady(v) && (!!v.writer || ctx.preview);
  if (!on) notFound();
  // Audiences from the voice, by name ("Regulars: warm…" → "Regulars")
  const audiences = (v!.fields?.audiences || '').split(/\n+/).map((l) => l.replace(/^[-•*]\s*/, '').split(/[:–—]| - /)[0].trim()).filter((x) => x && x.length < 60).slice(0, 12);
  return <div className="pt-page wide wr-page">
    <Writer slug={slug} client={ctx.project.client} audiences={audiences} aiConnected={!!ctx.project.ai_key_hint || ctx.preview} canConnect={ctx.access.clientAdmin} preview={ctx.preview && !v!.writer} />
  </div>;
}
