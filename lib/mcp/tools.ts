import type { Snapshot } from '@/lib/ai/project';
import { voiceHas, voiceMd, VOICE_GUARD } from '@/lib/voice';
import { knowledgeMd } from '@/lib/voiceKnowledge';

// Route 3: each kit is offered as a connector the client adds to their own Claude.
// Tools are read-only views of the published kit.

export const TOOLS = [
  { name: 'get_brand_overview', description: 'Summary of the brand: line, chapters, colours, typefaces and deliverables. Call this first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_tokens', description: 'Design tokens (W3C format): colours, fonts, spacing as exact values.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_voice', description: 'How the brand writes: personality, verbal behaviours, words to use and avoid, house style, formats, key messages and on/off-brand examples, set by Lost Property. Call this before writing or reviewing any copy, and follow it strictly.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_guideline', description: 'The rules for one chapter, e.g. "Logo", "Colour", "Typography", "Tone of voice".', inputSchema: { type: 'object', properties: { chapter: { type: 'string' } }, required: ['chapter'] } },
  { name: 'list_assets', description: 'Logo, icon, pattern and image files with download links.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_template', description: 'HTML/CSS of a layout template. Only elements with data-slot may be changed.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'e.g. social-post-4x5' } }, required: ['id'] } }
] as const;

export type KitAccess = { snapshot: Snapshot; tokens: unknown; assets: { path: string; url: string }[]; template: (id: string) => Promise<string | null> };

export async function callTool(name: string, args: Record<string, unknown>, kit: KitAccess): Promise<string> {
  const s = kit.snapshot;
  switch (name) {
    case 'get_brand_overview':
      return JSON.stringify({ client: s.client, line: s.line, chapters: s.chapters.map((c) => c.title), voice: s.voice && voiceHas(s.voice) ? 'Call get_voice before writing any copy' : 'not set yet', colours: s.colours, fonts: s.fonts, deliverables: s.deliverables });
    case 'get_voice': return s.voice && voiceHas(s.voice) ? `${voiceMd(s.client, s.voice)}\n\n${knowledgeMd(s.client, s.knowledge || [])}\n\n${VOICE_GUARD(s.client)}` : 'The voice has not been written up yet. Use the tone of voice chapter (get_guideline) and say the full voice is still to come.';
    case 'get_tokens': return JSON.stringify(kit.tokens);
    case 'get_guideline': {
      const q = String(args.chapter || '').toLowerCase();
      const c = s.chapters.find((x) => x.title.toLowerCase().includes(q) || x.id === q);
      return c ? `# ${c.title}\n` + c.rules.map((r) => `- ${r.title}: ${r.text}`).join('\n') : `No chapter matches "${args.chapter}". Chapters: ${s.chapters.map((x) => x.title).join(', ')}`;
    }
    case 'list_assets': return JSON.stringify(kit.assets);
    case 'get_template': { const t = await kit.template(String(args.id || '')); return t ?? 'No template with that id.'; }
    default: throw new Error('Unknown tool ' + name);
  }
}
