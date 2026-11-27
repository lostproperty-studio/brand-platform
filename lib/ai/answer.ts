// Settings for chat answers from Claude Sonnet 5.5, which thinks before it answers. The thinking counts towards
// max_tokens, so a tight limit could be spent before any words were written and the answer came back empty (seen
// when someone asked Ask to review a picture). Room to think and answer, at medium effort so replies stay quick.
// output_config isn't in this SDK version's types yet, so it's added as an extra body field.
export const CHAT = { max_tokens: 16000, output_config: { effort: 'medium' } } as const as { max_tokens: number };

/** Plain words for an answer that ended without any text */
export function noAnswer(stop: string | null | undefined) {
  if (stop === 'refusal') return 'I can’t help with that one. Try asking another way, or switch the Ask bar to Lost Property to ask the team.';
  if (stop === 'max_tokens') return 'That took more working out than I had room for. Try asking about one part at a time.';
  return 'I didn’t manage an answer that time. Try again.';
}
