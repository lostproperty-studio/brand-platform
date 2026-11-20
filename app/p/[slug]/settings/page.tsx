import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { PortalSettings } from '@/components/portal/Settings';
import { Plugins } from '@/components/portal/Plugins';
import { pluginViews } from '@/lib/plugins/views';

// Settings: managers see the team; admins also see AI and its usage, the Claude connector, and requests to Lost Property.
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ plugin?: string; msg?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = (await portalContext(slug))!;
  if (!ctx.access.canManage) notFound();
  let usage: { requests: number; input: number; output: number } | null = null;
  if (ctx.access.clientAdmin) {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await adminClient().from('ai_usage').select('input_tokens, output_tokens').eq('project_id', ctx.project.id).gte('created_at', since);
    usage = { requests: (data || []).length, input: (data || []).reduce((n, r) => n + (r.input_tokens || 0), 0), output: (data || []).reduce((n, r) => n + (r.output_tokens || 0), 0) };
  }
  // Storage (portal v2, behind the Plug-ins release stage): where the platform keeps the kit and the apps' files
  const storage = await pluginViews({ projectId: ctx.project.id, slug, content: ctx.project.content, preview: ctx.preview, staff: ctx.access.staff }, 'storage');
  return (
    <div className="pt-page">
      <header className="pt-chhead"><p className="mute">{ctx.access.clientAdmin ? 'For admins' : 'For managers'}</p><h1 className="pt-display">Settings</h1></header>
      <PortalSettings slug={slug} hint={ctx.project.ai_key_hint} rejected={!!(ctx.project.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt} isAdmin={ctx.access.clientAdmin} usage={usage} />
      {storage ? <section id="storage" className="rs-sec" aria-labelledby="h-storage">
        <div className="rs-sec-head"><h2 id="h-storage" className="pt-h2">Storage{storage.badge ? <span className="beta-tag">{storage.badge}</span> : null}</h2><p className="mute">Keep the brand kit in your own storage, and choose where Photographer and Director keep their full-size files.</p></div>
        <Plugins group="storage" slug={slug} client={ctx.project.client} lead={ctx.access.clientAdmin} staff={ctx.access.staff} items={storage.items} panel={storage.panel} preview={null} dbReady={storage.ready} flash={sp.plugin && sp.msg ? { plugin: sp.plugin, msg: sp.msg } : undefined} />
      </section> : null}
    </div>
  );
}
