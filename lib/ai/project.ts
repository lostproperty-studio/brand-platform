import type { Showcase } from '@/lib/showcase';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/crypto';
import type { Guide } from '@/lib/portal/guide';
import { aboutMd, type BrandForm } from '@/lib/brandForm';

// Route 1: chat and Canvas run on the client's own Anthropic key, stored encrypted on the project.
// The studio's key is never used for client features, so usage is billed to the client by Anthropic.

export class NoClientKey extends Error { constructor() { super('AI is not connected for this project. A client admin can add an Anthropic API key in portal settings.'); } }

export async function clientAnthropic(projectId: string) {
  const { data, error } = await adminClient().from('projects').select('ai_provider, ai_key_cipher').eq('id', projectId).single();
  if (error) throw error;
  if (!data?.ai_key_cipher || data.ai_provider !== 'anthropic') throw new NoClientKey();
  return new Anthropic({ apiKey: decryptSecret(data.ai_key_cipher) });
}

/** The AI for a portal request. The studio previewing a portal (building and testing it before delivery) runs
 *  on Lost Property's own key, so Ask and the AI tools work before the client has connected theirs, and the
 *  studio's testing never lands on the client's bill. Clients always run on their own key. */
export async function portalAnthropic(projectId: string, staff: boolean): Promise<{ ai: Anthropic; studio: boolean }> {
  if (staff) { const { studioAnthropic } = await import('@/lib/ai/studio'); return { ai: studioAnthropic(), studio: true }; }
  return { ai: await clientAnthropic(projectId), studio: false };
}

/** Checks a key works before saving it (cheapest possible call). */
export async function verifyAnthropicKey(apiKey: string) {
  const a = new Anthropic({ apiKey });
  try { await a.models.list({ limit: 1 }); }
  catch (e) {
    if (/not scoped to a workspace/i.test(String((e as Error).message))) throw new Error('This key isn’t tied to a workspace. In the Anthropic console, create a key and choose one workspace for it, then paste that key here.');
    throw e;
  }
}

export type Snapshot = { client: string; line: string; chapters: { id: string; title: string; rules: { title: string; text: string }[] }[]; colours: { name: string; hex: string; role: string }[]; fonts: { role: string; name: string; usage: string }[]; deliverables: { title: string; status: string }[]; guide?: Guide; showcase?: Showcase; form?: BrandForm; /** The design qualities read from the guidelines, one line each */ design?: string[] ; /** How the brand writes, set by Lost Property */ voice?: import('@/lib/voice').VoiceProfile; /** What's worked, added by the client's team */ knowledge?: import('@/lib/voiceKnowledge').KnowledgeEntry[] };

import { voiceHas, voiceMd, VOICE_GUARD } from '@/lib/voice';
import { knowledgeMd } from '@/lib/voiceKnowledge';

export function brandSystemPrompt(s: Snapshot) {
  return `You are the brand assistant for ${s.client}, inside their brand portal. ${s.line}
Answer only from the guidelines below. Quote exact values (hex, sizes, ratios). If the guidelines don't cover something, say so plainly and suggest asking Lost Property. Cite the chapter you used as [chapter: <title>].

COLOURS: ${s.colours.map((c) => `${c.name} ${c.hex} (${c.role})`).join('; ')}
TYPE: ${s.fonts.map((f) => `${f.role}: ${f.name}, ${f.usage}`).join('; ')}
${s.form ? '\n' + aboutMd(s.form) : ''}${s.design?.length ? `\nDESIGN QUALITIES (from the guidelines; follow them in anything visual):\n${s.design.map((d) => `- ${d}`).join('\n')}\n` : ''}${s.chapters.map((c) => `\n## ${c.title}\n${c.rules.map((r) => `- ${r.title}: ${r.text}`).join('\n')}`).join('\n')}${s.voice && voiceHas(s.voice) ? `\n\n${voiceMd(s.client, s.voice)}\n\n${knowledgeMd(s.client, s.knowledge || [])}\n\n${VOICE_GUARD(s.client)}\n\nWRITING HELP: when asked to write, choose between or review headlines and copy, work in the voice above. Give options as a short list, say which principle each follows, and keep to any length asked. When reviewing someone's copy or an image they've made, say what's on brand, what isn't (name the rule), and give a concrete fix.` : ''}
\nDELIVERABLES: ${s.deliverables.map((d) => `${d.title} (${d.status})`).join('; ')}

WHEN YOU MAKE OR ADVISE ON ANYTHING VISUAL
- Logo in use, not clear space: say which logo file for the background, and use only the positions and sizes the logo guidance names.
- Use only the listed colours and type styles. Where the guidelines give modes (colourways, type modes, image styles), pick one and name it.
- Never redraw or recolour the logo, invent colours or effects, substitute fonts, or make new versions of the brand's artwork.`;
}

export async function logUsage(projectId: string, userId: string | null, feature: 'chat' | 'canvas' | 'writer', usage?: { input_tokens?: number; output_tokens?: number }) {
  await adminClient().from('ai_usage').insert({ project_id: projectId, user_id: userId, feature, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null });
}
