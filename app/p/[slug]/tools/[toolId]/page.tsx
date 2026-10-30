import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { signFontUrls } from '@/lib/projects/fonts';
import { listTools, prepareToolHtml } from '@/lib/tools';
import { Icon } from '@/lib/icons';
import { ToolRunner } from '@/components/portal/ToolRunner';
import { LayoutMaker } from '@/components/portal/LayoutMaker';

export default async function ToolPage({ params }: { params: Promise<{ slug: string; toolId: string }> }) {
  const { slug, toolId } = await params;
  const ctx = (await portalContext(slug))!;
  const tool = (await listTools(ctx.project.id, ctx.preview)).find((t) => t.id === toolId);
  if (!tool) notFound();
  const head = <header className="tl-head"><Link className="btn" href={`/p/${slug}/tools`}>← Tools</Link><span className="tl-icon sm"><Icon name={tool.icon} size={18} /></span><h1>{tool.name}</h1><span className="mute">{tool.description}</span></header>;
  if (tool.kind === 'layouts') return <div className="pt-page wide">{head}<LayoutMaker slug={slug} toolId={tool.id} /></div>;

  // Brand files the tool can use (logos, tokens, imagery), as signed links in window.LP_BRAND.assets
  const used = ctx.files.filter((f) => f.storage_path && /^(tokens|assets\/(logo|imagery|patterns?|icons?))\//.test(f.path));
  const { data } = used.length ? await adminClient().storage.from('kits').createSignedUrls(used.map((f) => f.storage_path!), 6 * 3600) : { data: [] };
  const byStorage = Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  const assets = Object.fromEntries(used.filter((f) => byStorage[f.storage_path!]).map((f) => [f.path, byStorage[f.storage_path!]]));
  const html = await prepareToolHtml(tool, ctx, await signFontUrls(ctx.fonts, 6 * 3600), assets);
  if (!html) return <div className="pt-page">{head}<p className="mute">This tool’s file couldn’t be loaded.</p></div>;
  return <div className="pt-page wide tl-page">{head}<ToolRunner slug={slug} toolId={tool.id} name={tool.name} html={html} aiEnabled={tool.ai_enabled} aiConnected={!!ctx.project.ai_key_hint} canConnect={ctx.access.clientAdmin} /></div>;
}
