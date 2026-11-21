import { readSwitches } from '@/lib/portal/switches';
import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { Writer } from '@/components/portal/Writer';
import { voiceHas, voiceMissing, voiceReady } from '@/lib/voice';
import { portalV2 } from '@/lib/portalVersion';
import { WriterApp } from '@/components/portal/v2/WriterApp';
import { nameOf } from '@/lib/guideVersions';
import { canSee, projectStages } from '@/lib/features';

// The Writer: on-brand copy from a brief, in the voice Lost Property set with the client
export default async function WriterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await portalContext(slug);
  if (ctx && !readSwitches(ctx.project.content).writer) notFound();
  if (!ctx?.snap) notFound();
  const v = ctx.snap.voice;
  const ready = !!v && voiceReady(v);
  // Clients see the Writer once it's set up, switched on and published. The studio can always try it, even with
  // the voice still in progress, to see what the client will get.
  if (!ctx.preview && !(ready && v!.writer)) notFound();
  if (!v || !voiceHas(v)) return <div className="pt-page wr-page"><div className="wr-off"><h1 className="pt-display">Writer</h1>
    <p className="mute">The Writer works only from the voice you set, and there’s nothing in it yet. Add the voice work in the studio’s Voice tab, then come back to try it.</p>
    <a className="btn solid" href={`/studio/projects/${ctx.project.id}?tab=voice`}>Open the Voice tab</a></div></div>;
  // Audiences from the voice, by name ("Regulars: warm…" → "Regulars")
  const audiences = (v!.fields?.audiences || '').split(/\n+/).map((l) => l.replace(/^[-•*]\s*/, '').split(/[:–—]| - /)[0].trim()).filter((x) => x && x.length < 60).slice(0, 12);
  // Portal v2 (staging): Docs first, then a doc of pieces
  if (portalV2()) {
    // The brand's darkest and lightest colours, for previews of where the copy is going
    const lum = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };
    const cols = (ctx.snap.colours || []).map((c) => c.hex).filter((h) => /^#?[0-9a-f]{6}/i.test(h)).map((h) => (h.startsWith('#') ? h : `#${h}`)).sort((a, b) => lum(a) - lum(b));
    const brand = { name: ctx.project.client, handle: ctx.project.slug.replace(/[^a-z0-9]/gi, '').toLowerCase(), dark: cols[0] || '#1a1a1a', light: cols[cols.length - 1] || '#f4f1ec', avatar: ctx.sidebar.mini };
    return <div className="v2-app"><WriterApp studio={ctx.access.staff} facts={canSee((await projectStages(ctx.project.id)).facts, ctx.preview)} brand={brand} slug={slug} client={ctx.project.client} audiences={audiences} me={nameOf(ctx.access.user)} note={ctx.preview && !(ready && v.writer) ? 'Studio test: clients can’t see the Writer until the voice is ready and switched on in the Voice tab.' : undefined} /></div>;
  }
  const missing = voiceMissing(v).filter((f) => f.core).map((f) => f.label.toLowerCase());
  const note = v.writer && ready ? 'Studio preview: this is what clients see once you publish.'
    : `Studio test: clients can’t see the Writer yet.${missing.length ? ` The voice is still in progress (missing: ${missing.join(', ')}), so results will get better as you fill it in.` : ' Switch it on in the Voice tab and publish to give it to the client.'}`;
  return <div className="pt-page wide wr-page">
    <Writer slug={slug} client={ctx.project.client} audiences={audiences} aiConnected={!!ctx.project.ai_key_hint || ctx.preview} canConnect={ctx.access.clientAdmin} note={ctx.preview ? note : undefined} />
  </div>;
}
