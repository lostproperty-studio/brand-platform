// The Writer's knowledge: lines and pieces the client's team say have worked well, or that they love, or that
// missed. Added from the portal (text, or a picture the platform reads the words from), seen and pruned by the
// studio in the Voice tab. It's examples, never rules: the voice Lost Property set still decides how to write.

export type KnowledgeEntry = {
  id: string; kind: 'worked' | 'liked' | 'missed';
  text: string; note?: string; where?: string;
  by?: string; byId?: string; at: string; fromImage?: boolean;
};
export const KIND_LABEL: Record<KnowledgeEntry['kind'], string> = { worked: 'Performed well', liked: 'We love this', missed: 'Didn’t land' };
export const readKnowledge = (content: unknown): KnowledgeEntry[] => ((content as { voiceKnowledge?: KnowledgeEntry[] } | null)?.voiceKnowledge) || [];

/** For the AI: the client's own evidence of what works, newest first */
export function knowledgeMd(client: string, list: KnowledgeEntry[]) {
  if (!list.length) return '';
  const line = (e: KnowledgeEntry) => `- ${e.text.replace(/\s+/g, ' ').trim().slice(0, 600)}${e.where ? ` (${e.where})` : ''}${e.note ? ` — ${e.note.replace(/\s+/g, ' ').trim().slice(0, 240)}` : ''}`;
  const group = (k: KnowledgeEntry['kind']) => list.filter((e) => e.kind === k).slice(0, 40).map(line).join('\n');
  const worked = group('worked'), liked = group('liked'), missed = group('missed');
  return `### What's worked for ${client}
Examples the ${client} team added. Learn from them: what they have in common, how they open, their rhythm, their words. They're examples, not rules: where one goes against the voice above, the voice wins.
${worked ? `\nPerformed well:\n${worked}\n` : ''}${liked ? `\nThe team loves:\n${liked}\n` : ''}${missed ? `\nDidn't land (avoid what made these miss):\n${missed}\n` : ''}`;
}
