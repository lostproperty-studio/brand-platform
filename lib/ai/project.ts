import Anthropic from '@anthropic-ai/sdk';
import { adminClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/crypto';

// Route 1: chat and Canvas run on the client's own Anthropic key, stored encrypted on the project.
// The studio's key is never used for client features, so usage is billed to the client by Anthropic.

export class NoClientKey extends Error { constructor() { super('AI is not connected for this project. A client admin can add an Anthropic API key in portal settings.'); } }

export async function clientAnthropic(projectId: string) {
  const { data, error } = await adminClient().from('projects').select('ai_provider, ai_key_cipher').eq('id', projectId).single();
  if (error) throw error;
  if (!data?.ai_key_cipher || data.ai_provider !== 'anthropic') throw new NoClientKey();
  return new Anthropic({ apiKey: decryptSecret(data.ai_key_cipher) });
}

/** Checks a key works before saving it (cheapest possible call). */
export async function verifyAnthropicKey(apiKey: string) {
  const a = new Anthropic({ apiKey });
  await a.models.list({ limit: 1 });
}

export type Snapshot = { client: string; line: string; chapters: { id: string; title: string; rules: { title: string; text: string }[] }[]; colours: { name: string; hex: string; role: string }[]; fonts: { role: string; name: string; usage: string }[]; deliverables: { title: string; status: string }[] };

export function brandSystemPrompt(s: Snapshot) {
  return `You are the brand assistant for ${s.client}, inside their brand portal. ${s.line}
Answer only from the guidelines below. Quote exact values (hex, sizes, ratios). If the guidelines don't cover something, say so plainly and suggest asking Lost Property. Cite the chapter you used as [chapter: <title>].

COLOURS: ${s.colours.map((c) => `${c.name} ${c.hex} (${c.role})`).join('; ')}
TYPE: ${s.fonts.map((f) => `${f.role}: ${f.name}, ${f.usage}`).join('; ')}
${s.chapters.map((c) => `\n## ${c.title}\n${c.rules.map((r) => `- ${r.title}: ${r.text}`).join('\n')}`).join('\n')}
\nDELIVERABLES: ${s.deliverables.map((d) => `${d.title} (${d.status})`).join('; ')}`;
}

export async function logUsage(projectId: string, userId: string | null, feature: 'chat' | 'canvas', usage?: { input_tokens?: number; output_tokens?: number }) {
  await adminClient().from('ai_usage').insert({ project_id: projectId, user_id: userId, feature, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null });
}
