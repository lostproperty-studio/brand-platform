import { adminClient } from '@/lib/supabase/server';
import type { Snapshot } from '@/lib/ai/project';
import type { Guide } from '@/lib/portal/guide';

/** The published view of a project: what clients, the chat and the connector are allowed to see. */
export async function publishedSnapshot(projectId: string): Promise<Snapshot | null> {
  const { data } = await adminClient().from('project_versions').select('snapshot').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.snapshot as Snapshot) ?? null;
}

export async function projectBySlug(slug: string) {
  const { data } = await adminClient().from('projects').select('id, client, name, slug, status, repo_full_name, mcp_token_hash, ai_key_hint, ai_provider').eq('slug', slug).maybeSingle();
  return data;
}

/** Builds the snapshot from the working copy (guidelines from Figma + review, brand basics, deliverables). Called on Publish,
 *  and used directly for studio previews so the studio sees changes before they're published. */
export async function buildSnapshot(projectId: string): Promise<Snapshot> {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, line, brand, content').eq('id', projectId).single();
  if (error) throw error;
  const { data: parts } = await sb.from('deliverable_parts').select('title, status, visible').eq('project_id', projectId).order('ord');
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: { role: string; name: string; label?: string }[] };
  const content = (p.content || {}) as { guide?: Guide };
  const guide = content.guide ? { ...content.guide, chapters: content.guide.chapters.filter((c) => !c.hidden).map((c) => ({ ...c, frames: c.frames.filter((f) => !f.hidden) })) } : undefined;
  const colours = (brand.core?.length ? brand.core.map((c) => ({ name: c.name, hex: c.hex, role: c.note || '' })) : guide?.colours || []);
  return {
    client: p.client, line: p.line || '',
    colours,
    fonts: (brand.fonts || []).filter((f) => f.name).map((f) => ({ role: f.role, name: f.name, usage: f.label || '' })),
    // What the chat and connector know: each chapter's rules plus the text written on its Figma frames
    chapters: (guide?.chapters || []).map((c) => ({ id: c.id, title: c.title, rules: [...c.rules, ...c.frames.flatMap((f) => f.text.filter((t) => t.length > 24).map((t) => ({ title: 'From the guidelines', text: t })))].slice(0, 60) })),
    deliverables: (parts || []).filter((d) => d.visible).map((d) => ({ title: d.title, status: d.status })),
    guide: guide ? { ...guide, colours } : undefined
  };
}
