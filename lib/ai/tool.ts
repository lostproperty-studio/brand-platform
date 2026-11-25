import type Anthropic from '@anthropic-ai/sdk';

// Getting a structured answer from Claude: offer one tool and ask for it. Some models don't take a forced
// tool_choice, so the tool is offered (auto) and the instructions ask for it; if the answer comes back as text,
// it's asked once more.
type Params = Anthropic.MessageCreateParamsNonStreaming;

export async function callTool<T>(ai: Anthropic, params: Omit<Params, 'tool_choice' | 'tools'> & { tool: Anthropic.Tool }): Promise<{ input: T | null; usage: Anthropic.Usage; text?: string }> {
  const { tool, ...rest } = params;
  const ask = `\n\nAnswer only by calling the ${tool.name} tool, once, with everything filled in.`;
  const system = typeof rest.system === 'string' || !rest.system ? (rest.system || '') + ask : [...rest.system, { type: 'text' as const, text: ask }];
  let first = await ai.messages.create({ ...rest, system, tools: [tool], tool_choice: { type: 'auto' } });
  // Ran out of room part-way through the answer (it then arrives empty): once more with twice the room
  if (first.stop_reason === 'max_tokens' && rest.max_tokens < 32000) first = await ai.messages.create({ ...rest, max_tokens: Math.min(32000, rest.max_tokens * 2), system, tools: [tool], tool_choice: { type: 'auto' } });
  const got = first.content.find((c) => c.type === 'tool_use');
  if (got && got.type === 'tool_use') return { input: repair(got.input, tool.input_schema as Schema) as T, usage: first.usage };
  // Asked again, with its own answer in view
  const again = await ai.messages.create({ ...rest, system, tools: [tool], tool_choice: { type: 'auto' },
    messages: [...rest.messages, { role: 'assistant', content: first.content }, { role: 'user', content: `Please give that by calling the ${tool.name} tool.` }] });
  const g2 = again.content.find((c) => c.type === 'tool_use');
  const said = [...first.content, ...again.content].filter((c) => c.type === 'text').map((c) => (c as Anthropic.TextBlock).text).join(' ').slice(0, 600);
  return { text: said, input: g2 && g2.type === 'tool_use' ? (repair(g2.input, tool.input_schema as Schema) as T) : null, usage: { ...again.usage, input_tokens: again.usage.input_tokens + first.usage.input_tokens, output_tokens: again.usage.output_tokens + first.usage.output_tokens } };
}

/** Sometimes a list or an object inside the answer comes back written out as text (JSON in a string, or one item per
 *  line). Put it back into the shape the tool asked for, so nothing is lost. */
type Schema = { type?: string; items?: Schema; properties?: Record<string, Schema> };
function repair(v: unknown, sc: Schema | undefined): unknown {
  if (!sc) return v;
  if ((sc.type === 'array' || sc.type === 'object') && typeof v === 'string') {
    const t = v.trim();
    if (/^[[{]/.test(t)) { try { return repair(JSON.parse(t), sc); } catch { /* not JSON */ } }
    if (sc.type === 'array' && (!sc.items || sc.items.type === 'string')) return t.split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    return v;
  }
  if (sc.type === 'array' && Array.isArray(v)) return v.map((x) => repair(x, sc.items));
  if (sc.type === 'object' && v && typeof v === 'object' && sc.properties) {
    const o = { ...(v as Record<string, unknown>) };
    for (const [k, s2] of Object.entries(sc.properties)) if (k in o) o[k] = repair(o[k], s2);
    return o;
  }
  return v;
}
