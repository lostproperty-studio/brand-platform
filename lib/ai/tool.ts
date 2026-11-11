import type Anthropic from '@anthropic-ai/sdk';

// Getting a structured answer from Claude: offer one tool and ask for it. Some models don't take a forced
// tool_choice, so the tool is offered (auto) and the instructions ask for it; if the answer comes back as text,
// it's asked once more.
type Params = Anthropic.MessageCreateParamsNonStreaming;

export async function callTool<T>(ai: Anthropic, params: Omit<Params, 'tool_choice' | 'tools'> & { tool: Anthropic.Tool }): Promise<{ input: T | null; usage: Anthropic.Usage }> {
  const { tool, ...rest } = params;
  const ask = `\n\nAnswer only by calling the ${tool.name} tool, once, with everything filled in.`;
  const system = typeof rest.system === 'string' || !rest.system ? (rest.system || '') + ask : [...rest.system, { type: 'text' as const, text: ask }];
  const first = await ai.messages.create({ ...rest, system, tools: [tool], tool_choice: { type: 'auto' } });
  const got = first.content.find((c) => c.type === 'tool_use');
  if (got && got.type === 'tool_use') return { input: got.input as T, usage: first.usage };
  // Asked again, with its own answer in view
  const again = await ai.messages.create({ ...rest, system, tools: [tool], tool_choice: { type: 'auto' },
    messages: [...rest.messages, { role: 'assistant', content: first.content }, { role: 'user', content: `Please give that by calling the ${tool.name} tool.` }] });
  const g2 = again.content.find((c) => c.type === 'tool_use');
  return { input: g2 && g2.type === 'tool_use' ? (g2.input as T) : null, usage: { ...again.usage, input_tokens: again.usage.input_tokens + first.usage.input_tokens, output_tokens: again.usage.output_tokens + first.usage.output_tokens } };
}
