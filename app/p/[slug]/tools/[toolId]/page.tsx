import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { signFontUrls } from '@/lib/projects/fonts';
import { listTools, prepareToolHtml } from '@/lib/tools';
import { Icon } from '@/lib/icons';
import { ToolRunner } from '@/components/portal/ToolRunner';
import { LayoutMaker } from '@/components/portal/LayoutMaker';
import { logActivity } from '@/lib/activity';

export default async function ToolPage({ params }: { params: Promise<{ slug: string; toolId: string }> }) {
  const { slug, toolId } = await params;
  const ctx = (await portalContext(slug))!;
  const tool = (await listTools(ctx.project.id, ctx.preview)).find((t) => t.id === toolId);
  if (!tool) notFound();
  if (!ctx.access.staff) await logActivity(ctx.project.id, ctx.access.user.id, 'tool', tool.name);
  // Full-screen: a slim bar with Back, then the tool fills the rest of the space beside the portal sidebar
  const head = <><Link className="btn" href={`/p/${slug}/resources#apps`}>← Resources</Link><span className="tl-icon sm"><Icon name={tool.icon} size={16} /></span><h1>{tool.name}</h1><span className="mute tl-desc">{tool.description}</span></>;
  if (tool.kind === 'layouts') return <div className="tl-full"><header className="tl-bar">{head}</header><div className="tl-body"><LayoutMaker slug={slug} toolId={tool.id} /></div></div>;

  // Brand files the tool can use (logos, tokens, imagery), as signed links in window.LP_BRAND.assets
  const used = ctx.files.filter((f) => f.storage_path && /^(tokens|assets\/(logo|imagery|patterns?|icons?))\//.test(f.path));
  const { data } = used.length ? await adminClient().storage.from('kits').createSignedUrls(used.map((f) => f.storage_path!), 6 * 3600) : { data: [] };
  const byStorage = Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  const assets = Object.fromEntries(used.filter((f) => byStorage[f.storage_path!]).map((f) => [f.path, byStorage[f.storage_path!]]));
  const { data: pr } = await adminClient().from('projects').select('content').eq('id', ctx.project.id).single();
  const settings = ((pr?.content as { toolSettings?: Record<string, { artwork?: string }> } | null)?.toolSettings || {})[tool.id] || {};
  const html = await prepareToolHtml(tool, ctx, await signFontUrls(ctx.fonts, 6 * 3600), assets, settings);
  if (!html) return <div className="tl-full"><header className="tl-bar">{head}</header><div className="tl-body"><p className="mute">This tool’s file couldn’t be loaded.</p></div></div>;
  return <ToolRunner slug={slug} toolId={tool.id} name={tool.name} html={html} aiEnabled={tool.ai_enabled} aiConnected={!!ctx.project.ai_key_hint} canConnect={ctx.access.clientAdmin} head={head} />;
}
