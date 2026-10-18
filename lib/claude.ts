import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

/**
 * The narrow slice of the SDK client the lessons depend on. The real `Anthropic` client satisfies it,
 * and so does `FakeClient` from `lib/testing`, which is what lets structural tests run offline.
 */
export interface MessageCreator {
  messages: {
    create(params: MessageCreateParamsNonStreaming): PromiseLike<Message>;
  };
}

export const DEFAULT_MODEL = 'claude-haiku-5-5';

export function modelFromEnv(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

export function createClient(): MessageCreator {
  return new Anthropic();
}
