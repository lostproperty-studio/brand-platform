import { adminClient } from '@/lib/supabase/server';
import type { Snapshot } from '@/lib/ai/project';
import { chapterText } from '@/lib/portal/guide';
import { chapterSlug } from '@/lib/portal/context';

/** Describes what the person is looking at, so Ask can answer about "this". */
export async function pageContext(projectId: string, slug: string, snap: Snapshot, path: string) {
  const rest = path.replace(new RegExp(`^/p/${slug}`), '') || '/';
  const ch = rest.match(/^\/guidelines\/([^/?#]+)/);
  if (ch) {
    const c = snap.guide?.chapters.find((x) => chapterSlug(x.id) === ch[1]);
    if (c) return { label: c.title, text: `The person is reading the chapter "${c.title}". Its full content:\n${chapterText(c).join('\n')}\n${c.rules.map((r) => `Rule: ${r.title}: ${r.text}`).join('\n')}` };
  }
  const tool = rest.match(/^\/tools\/([^/?#]+)/);
  if (tool) {
    const { data: t } = await adminClient().from('tools').select('name, description').eq('project_id', projectId).eq('id', tool[1]).maybeSingle();
    if (t) return { label: t.name, text: `The person is using the tool "${t.name}". ${t.description}` };
  }
  if (rest.startsWith('/downloads') || rest.startsWith('/resources')) return { label: 'Resources', text: `The person is on the Resources page (apps, asset packages for logos, colours, fonts and more, a design system and Claude skills to download). Kit parts: ${snap.deliverables.map((d) => `${d.title} (${d.status})`).join('; ')}.` };
  if (rest.startsWith('/tools')) return { label: 'Tools', text: 'The person is browsing the tools.' };
  return { label: 'Home', text: 'The person is on the portal home page.' };
}
