import { usesStudioAi } from '@/lib/portal/switches';
import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { portalV2 } from '@/lib/portalVersion';
import { PortalSettings } from '@/components/portal/Settings';
import { Plugins } from '@/components/portal/Plugins';
import { pluginViews } from '@/lib/plugins/views';
import { JumpNav } from '@/components/portal/JumpNav';
import { canSee, projectStages, stageBadge } from '@/lib/features';

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
  // Working with Lost Property (behind its release stage): chat, tickets and sessions in place of the old request form
  const supStage = portalV2() ? (await projectStages(ctx.project.id)).support : 'off';
  const support = canSee(supStage, ctx.preview) ? { badge: stageBadge(supStage) } : null;
  return (
    <div className="pt-page rs">
      <header className="pt-chhead"><p className="mute">{ctx.access.clientAdmin ? 'For admins' : 'For managers'}</p><h1 className="pt-display">Settings</h1><p className="pt-lede">Your team, your AI and how the platform connects to the rest of your organisation.</p></header>
      <JumpNav items={[{ id: 'team', label: 'Team' }, ...(ctx.access.clientAdmin ? [{ id: 'ai', label: 'AI' }, { id: 'claude', label: 'Your own Claude' }] : []), ...(storage ? [{ id: 'storage', label: 'Storage' }] : []), ...(ctx.access.clientAdmin ? [{ id: 'requests', label: support ? 'Lost Property' : 'Requests' }] : [])]} />
      <PortalSettings studioAi={usesStudioAi(ctx.project.content)} slug={slug} hint={ctx.project.ai_key_hint} rejected={!!(ctx.project.content as { aiKeyRejectedAt?: string } | null)?.aiKeyRejectedAt} isAdmin={ctx.access.clientAdmin} usage={usage} support={support}
        storage={storage ? { title: <>Storage{storage.badge ? <span className="beta-tag">{storage.badge}</span> : null}</>, body: <Plugins group="storage" slug={slug} client={ctx.project.client} lead={ctx.access.clientAdmin} staff={ctx.access.staff} items={storage.items} panel={storage.panel} preview={null} dbReady={storage.ready} flash={sp.plugin && sp.msg ? { plugin: sp.plugin, msg: sp.msg } : undefined} /> } : null} />
    </div>
  );
}
