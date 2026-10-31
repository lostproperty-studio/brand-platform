import { notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { PortalSettings } from '@/components/portal/Settings';

// Settings: managers see the team; admins also see AI and its usage, the Claude connector, and requests to Lost Property.
export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  if (!ctx.access.canManage) notFound();
  let usage: { requests: number; input: number; output: number } | null = null;
  if (ctx.access.clientAdmin) {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await adminClient().from('ai_usage').select('input_tokens, output_tokens').eq('project_id', ctx.project.id).gte('created_at', since);
    usage = { requests: (data || []).length, input: (data || []).reduce((n, r) => n + (r.input_tokens || 0), 0), output: (data || []).reduce((n, r) => n + (r.output_tokens || 0), 0) };
  }
  return (
    <div className="pt-page">
      <header className="pt-chhead"><p className="mute">{ctx.access.clientAdmin ? 'For admins' : 'For managers'}</p><h1 className="pt-display">Settings</h1></header>
      <PortalSettings slug={slug} hint={ctx.project.ai_key_hint} isAdmin={ctx.access.clientAdmin} usage={usage} />
    </div>
  );
}
