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

// TODO(1): ask the model to issue independent tool calls in the same turn, and to batch only
// calls that are independent of each other.
export const SYSTEM_PROMPT = 'You answer order-status questions for an online shop.';

// TODO(2): something in this request prevents more than one tool call per turn. Find it and fix it.
export function buildRequest(messages: MessageParam[], model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages,
  };
}

export type Handlers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

export const HANDLERS: Handlers = {
  get_order: (input) => getOrder(String(input.order_id)),
};

/**
 * TODO(3): the calls in one turn are independent and read-only, so run them concurrently.
 * Keep results in the order of the tool_use blocks. If one call fails, the others must still return,
 * and the failed one becomes an is_error result.
 */
export async function executeTurn(content: ContentBlock[], handlers: Handlers): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const output = await handlers[block.name]!(block.input as Record<string, unknown>);
    results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
  }
  return results;
}

/**
 * TODO(4): one user message per tool_result is the formatting mistake the parallel tool use docs call
 * out: it teaches the model to stop calling tools in parallel. Return the assistant turn followed by
 * exactly one user message carrying every tool_result.
 */
export function appendToolResults(
  messages: MessageParam[],
  assistant: ContentBlock[],
  results: ToolResultBlockParam[],
): MessageParam[] {
  return [
    ...messages,
    { role: 'assistant', content: assistant },
    ...results.map((r): MessageParam => ({ role: 'user', content: [r] })),
  ];
}

/** TODO(5): average number of tool_use blocks per response that contains at least one. */
export function parallelismStats(_responses: Message[]): { toolMessages: number; toolCalls: number; avgPerMessage: number } {
  return { toolMessages: 0, toolCalls: 0, avgPerMessage: 0 };
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
