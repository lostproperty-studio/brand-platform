import { portalContext } from '@/lib/portal/context';
import { Ask } from '@/components/portal/Ask';

export default async function AskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  return (
    <div className="pt-page">
      <header className="pt-chhead">
        <p className="mute">Questions about the brand</p>
        <h1 className="pt-display">Ask</h1>
        <p className="pt-lede">Answers come only from these guidelines, with exact values and the chapter they’re from.</p>
      </header>
      <Ask slug={slug} client={ctx.project.client} aiConnected={!!ctx.project.ai_key_hint} canConnect={ctx.access.clientAdmin} />
    </div>
  );
}
