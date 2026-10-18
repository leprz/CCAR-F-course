import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import { getOrder } from '../../../fixtures/support/index.ts';

export const TOOLS: Tool[] = [
  {
    name: 'get_order',
    description:
      'Get one order by id: status, total, placed date and tracking details. ' +
      'Takes a single order id; to check several orders, call it once per order. ' +
      'Read-only and independent, so several calls can run at the same time.',
    input_schema: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'Order id such as "A1001".' } },
      required: ['order_id'],
    },
  },
];

// Wording from the "Maximizing parallel tool use" guidance in the tool-use docs.
export const SYSTEM_PROMPT =
  'You answer order-status questions for an online shop. ' +
  'For maximum efficiency, whenever you need to perform multiple independent operations, ' +
  'invoke all relevant tools simultaneously rather than sequentially. ' +
  'Only batch tool calls that are independent of each other.';

export function buildRequest(messages: MessageParam[], model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    // Parallel calls are on by default. disable_parallel_tool_use: true would cap the turn at one call.
    tool_choice: { type: 'auto' },
    messages,
  };
}

export type Handlers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

export const HANDLERS: Handlers = {
  get_order: (input) => getOrder(String(input.order_id)),
};

/**
 * Run every tool call of one assistant turn concurrently. Results keep the order of the tool_use blocks,
 * and one failing call does not prevent the others from returning.
 */
export async function executeTurn(content: ContentBlock[], handlers: Handlers): Promise<ToolResultBlockParam[]> {
  const calls = content.filter((b) => b.type === 'tool_use');
  const settled = await Promise.allSettled(
    calls.map(async (call) => {
      const handler = handlers[call.name];
      if (!handler) throw new Error(`Unknown tool "${call.name}".`);
      return handler(call.input as Record<string, unknown>);
    }),
  );
  return calls.map((call, i): ToolResultBlockParam => {
    const outcome = settled[i]!;
    return outcome.status === 'fulfilled'
      ? { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(outcome.value) }
      : {
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: true,
          content: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        };
  });
}

/**
 * All results go back in ONE user message, tool_result blocks first. Splitting them across messages
 * is valid-looking history that teaches the model to stop making parallel calls.
 */
export function appendToolResults(
  messages: MessageParam[],
  assistant: ContentBlock[],
  results: ToolResultBlockParam[],
): MessageParam[] {
  return [...messages, { role: 'assistant', content: assistant }, { role: 'user', content: results }];
}

/** Average tool calls per assistant message that called tools. Above 1.0 means parallel calls happen. */
export function parallelismStats(responses: Message[]): { toolMessages: number; toolCalls: number; avgPerMessage: number } {
  const counts = responses
    .map((r) => r.content.filter((b) => b.type === 'tool_use').length)
    .filter((n) => n > 0);
  const toolCalls = counts.reduce((a, b) => a + b, 0);
  return { toolMessages: counts.length, toolCalls, avgPerMessage: counts.length ? toolCalls / counts.length : 0 };
}

export async function answerOrderQuestion(
  client: MessageCreator,
  question: string,
  opts: { model?: string; maxTurns?: number } = {},
): Promise<{ answer: string; responses: Message[] }> {
  let messages: MessageParam[] = [{ role: 'user', content: question }];
  const responses: Message[] = [];
  for (let turn = 0; turn < (opts.maxTurns ?? 5); turn++) {
    const response = await client.messages.create(buildRequest(messages, opts.model));
    responses.push(response);
    if (response.stop_reason !== 'tool_use') {
      const answer = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      return { answer, responses };
    }
    messages = appendToolResults(messages, response.content, await executeTurn(response.content, HANDLERS));
  }
  throw new Error('Too many turns');
}
