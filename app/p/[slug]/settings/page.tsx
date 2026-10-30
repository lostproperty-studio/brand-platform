import { notFound } from 'next/navigation';
import { portalContext } from '@/lib/portal/context';
import { PortalSettings } from '@/components/portal/Settings';

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  if (!ctx.access.clientAdmin) notFound();
  return (
    <div className="pt-page">
      <header className="pt-chhead"><p className="mute">For admins</p><h1 className="pt-display">Settings</h1></header>
      <PortalSettings slug={slug} hint={ctx.project.ai_key_hint} />
    </div>
  );
}
