import { appOrigin } from '@/lib/origin';
import { portalV2 } from '@/lib/portalVersion';
import { projectStages, canSee, stageBadge } from '@/lib/features';
import { PLUGINS, readPanel } from '@/lib/plugins/catalog';
import { configured, connections, googleAddonUrl, secretOf, visibleSettings } from '@/lib/plugins/server';
import { panelClients } from '@/lib/plugins/panelAuth';
import { panelBrand } from '@/lib/plugins/panelData';
import { canvaApp, canvaCallback } from '@/lib/plugins/canva';
import type { PluginView } from '@/components/portal/Plugins';

// What a portal page shows of the plug-ins: the apps (Resources → Plug-ins, with the brand panel) or storage
// (Settings → Storage). Behind the 'plugins' release stage. Clients see what's ready; the studio sees what's coming.
export async function pluginViews(p: { projectId: string; slug: string; content: unknown; preview: boolean; staff: boolean }, group: 'apps' | 'storage') {
  if (!portalV2()) return null;
  const stage = (await projectStages(p.projectId)).plugins;
  if (!canSee(stage, p.preview)) return null;
  const origin = await appOrigin();
  const [{ rows, ready }, creds, preview, canvaUses, own] = await Promise.all([
    connections(p.projectId),
    group === 'apps' ? panelClients(p.projectId) : Promise.resolve([]),
    group === 'apps' ? panelBrand(p.projectId, p.slug, p.preview, origin).catch(() => null) : Promise.resolve(null),
    canvaApp(p.projectId).catch(() => null),
    secretOf<{ app?: unknown }>(p.projectId, 'canva').catch(() => null)
  ]);
  const items: PluginView[] = PLUGINS.filter((d) => d.group === group)
    .filter((d) => p.staff || (d.panel?.status === 'ready' && configured(d.id).panel) || (d.account?.status === 'ready' && (d.id === 'canva' ? !!canvaUses : configured(d.id).account)))
    .map((d) => {
      const c = rows[d.id];
      const ready = d.id === 'canva' ? { ...configured(d.id), account: !!canvaUses } : configured(d.id);
      return {
        def: d, ready, panelSet: !!d.panel && creds.some((x) => x.host === d.panel!.host),
        ...(d.id === 'canva' && p.staff ? { canva: { ownApp: !!own?.app, callback: canvaCallback(origin) } } : {}),
        ...(d.id === 'google' ? { marketplace: googleAddonUrl() } : {}),
        connected: c?.account ? { account: c.account, settings: visibleSettings(d.id, c.settings, p.staff) as Record<string, boolean | string>, last: (c.state as { last?: NonNullable<PluginView['connected']>['last'] }).last } : null
      };
    });
  if (!items.length) return null;
  return { items, ready, preview, panel: readPanel(p.content), badge: stageBadge(stage) };
}
