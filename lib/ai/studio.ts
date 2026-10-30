import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

// The studio's own key: used for scanning Figma files only, never for client features.
export function studioAnthropic() {
  const ws = env.anthropicWorkspace();
  return new Anthropic({ apiKey: env.anthropicStudioKey(), ...(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {}) });
}
