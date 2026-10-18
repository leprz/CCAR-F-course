import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { MessageCreator } from '../claude.ts';

/** Wraps a real client and keeps every request/response pair, for assertions in live tests. */
export class RecordingClient implements MessageCreator {
  readonly calls: MessageCreateParamsNonStreaming[] = [];
  readonly responses: Message[] = [];

  constructor(private readonly inner: MessageCreator) {}

  messages = {
    create: async (params: MessageCreateParamsNonStreaming): Promise<Message> => {
      this.calls.push(structuredClone(params));
      const response = await this.inner.messages.create(params);
      this.responses.push(response);
      return response;
    },
  };
}
