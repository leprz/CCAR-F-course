import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  StopReason,
  TextBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import type { MessageCreator } from '../claude.ts';

type Scripted = Message | ((params: MessageCreateParamsNonStreaming) => Message);

/**
 * Offline stand-in for the SDK client. Returns scripted responses in order and records a deep copy
 * of every request, so tests can assert on exactly what the lesson code sent.
 */
export class FakeClient implements MessageCreator {
  readonly calls: MessageCreateParamsNonStreaming[] = [];
  private readonly script: Scripted[];

  constructor(script: Scripted[]) {
    this.script = [...script];
  }

  messages = {
    create: async (params: MessageCreateParamsNonStreaming): Promise<Message> => {
      this.calls.push(structuredClone(params));
      const next = this.script.shift();
      if (!next) throw new Error(`FakeClient: no scripted response left for call #${this.calls.length}`);
      return typeof next === 'function' ? next(params) : next;
    },
  };
}

let idCounter = 0;

export function text(value: string): TextBlock {
  return { type: 'text', text: value, citations: null } as TextBlock;
}

export function toolUse(name: string, input: Record<string, unknown>, id = `toolu_fake_${++idCounter}`): ToolUseBlock {
  return { type: 'tool_use', id, name, input } as ToolUseBlock;
}

/** Build an assistant `Message`. `stop_reason` defaults to `tool_use` if any block is a tool call. */
export function reply(content: ContentBlock[], stopReason?: StopReason): Message {
  return {
    id: `msg_fake_${++idCounter}`,
    type: 'message',
    role: 'assistant',
    model: 'fake-model',
    content,
    stop_reason: stopReason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Message;
}
