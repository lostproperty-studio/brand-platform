import { adminClient } from '@/lib/supabase/server';
import { readSources, resolvePage } from '@/lib/figma/sources';
import { readTemplate } from '@/lib/figma/template';
import { scanFigmaPage } from '@/lib/figma/scan';
import { templateChapterId } from '@/lib/portal/templateBuild';
import { normaliseGuide, type Guide } from '@/lib/portal/guide';

export type FoundChapter = { id: string; title: string; number?: string; frames: number; status: 'new' | 'imported'; importedAt?: string; edited?: boolean };

/** Looks through the guidelines page for the chapters it can recognise (not the layout library), and says which are already in */
export async function scanChapters(projectId: string) {
  const sb = adminClient();
  const { data: p, error } = await sb.from('projects').select('figma_key, figma_page_id, content').eq('id', projectId).single();
  if (error) throw error;
  const src = readSources(p.content, p).guidelines;
  if (!src) throw new Error('Add the Figma link for the guidelines first.');
  const where = await resolvePage(src.key, src.page, 'guidelines');
  const prev = normaliseGuide((p.content as { guide?: Guide } | null)?.guide);
  const had = new Map((prev?.chapters || []).map((c) => [c.id, c]));
  const status = (id: string) => { const c = had.get(id); return c ? { status: 'imported' as const, importedAt: c.importedAt || prev?.generatedAt, edited: !!c.edited } : { status: 'new' as const }; };
  let found: FoundChapter[]; let showcase = 0;
  if (where.template && where.page) {
    const t = await readTemplate(src.key, { assets: '', guidelines: where.page });
    found = t.chapters.map((c) => { const id = templateChapterId(c.title); return { id, title: c.title, number: c.number, frames: c.frames.length, ...status(id) }; });
    showcase = t.showcase.length;
  } else {
    const scan = await scanFigmaPage(src.key, where.page);
    found = scan.chapters.map((c) => ({ id: c.id, title: c.title.replace(/^\d+[\s.·-]*/, '').trim() || 'Untitled', frames: c.frames.length, ...status(c.id) }));
  }
  return { file: where.file, page: where.pageName, template: where.template, chapters: found, showcase, showcaseImported: !!(p.content as { showcase?: unknown[] } | null)?.showcase?.length };
}
