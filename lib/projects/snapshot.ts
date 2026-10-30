import { adminClient } from '@/lib/supabase/server';
import type { Snapshot } from '@/lib/ai/project';

/** The published view of a project: what clients, the chat and the connector are allowed to see. */
export async function publishedSnapshot(projectId: string): Promise<Snapshot | null> {
  const { data } = await adminClient().from('project_versions').select('snapshot').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.snapshot as Snapshot) ?? null;
}

export async function projectBySlug(slug: string) {
  const { data } = await adminClient().from('projects').select('id, client, name, slug, status, repo_full_name, mcp_token_hash, ai_key_hint, ai_provider').eq('slug', slug).maybeSingle();
  return data;
}

/** Builds the snapshot from the working copy (studio content + brand basics + deliverables). Called on Publish. */
export async function buildSnapshot(projectId: string): Promise<Snapshot> {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('client, line, brand, content').eq('id', projectId).single();
  if (error) throw error;
  const { data: parts } = await sb.from('deliverable_parts').select('title, status, visible').eq('project_id', projectId).order('ord');
  const brand = (p.brand || {}) as { core?: { name: string; hex: string; note?: string }[]; fonts?: { role: string; name: string; label?: string }[] };
  const content = (p.content || {}) as { sections?: { id: string; title: string; hidden?: boolean; blocks?: { t: string; h?: string; p?: string; hidden?: boolean; items?: { h?: string; p?: string }[] }[] }[] };
  return {
    client: p.client, line: p.line || '',
    colours: (brand.core || []).map((c) => ({ name: c.name, hex: c.hex, role: c.note || '' })),
    fonts: (brand.fonts || []).map((f) => ({ role: f.role, name: f.name, usage: f.label || '' })),
    chapters: (content.sections || []).filter((s) => !s.hidden).map((s) => ({ id: s.id, title: s.title, rules: (s.blocks || []).filter((b) => !b.hidden).flatMap((b) => b.t === 'cards' ? (b.items || []).map((i) => ({ title: i.h || '', text: i.p || '' })) : (b.h ? [{ title: b.h, text: b.p || '' }] : [])) })),
    deliverables: (parts || []).filter((d) => d.visible).map((d) => ({ title: d.title, status: d.status }))
  };
}
