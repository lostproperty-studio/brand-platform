import type { PortalCtx } from '@/lib/portal/context';
import type { DSInput, TypeStyle } from '@/lib/designSystem';
import { getPlaybook } from '@/lib/playbookStore';

// What the design system is built from, for a portal: the published snapshot, the typefaces, the type scale read
// from the Assets page, and the files (kit files, the Figma logos, and the imagery and graphic language downloads),
// each with the folder path it gets in the download and where it's stored.
export async function dsSource(pc: PortalCtx) {
  const storage = new Map<string, string>();
  for (const f of pc.files) if (f.storage_path && (pc.preview || f.partStatus === 'ready')) storage.set(f.path, f.storage_path);
  const content = (pc.project.content || {}) as { typeScale?: TypeStyle[]; packages?: Record<string, { files?: { name: string; path: string; type: string }[]; hidden?: boolean }> };
  const pk = content.packages || {};
  for (const [key, folder] of [['images', 'imagery'], ['graphics', 'graphics']] as const) {
    if (pk[key]?.hidden && !pc.preview) continue;
    for (const f of (pk[key]?.files || []).filter((x) => /^image\/(png|jpeg|webp|svg\+xml)$/.test(x.type)).slice(0, 12)) storage.set(`assets/${folder}/${f.name}`, f.path);
  }
  const input: DSInput = { snap: pc.snap!, fonts: pc.fonts, typeScale: content.typeScale, files: [...storage.keys()], aiDonts: (await getPlaybook()).aiDonts };
  return { input, storage };
}
