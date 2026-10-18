import type {
  ContentBlockParam,
  MessageCountTokensParams,
  MessageParam,
  MessageTokensCount,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';

/** Facts that must survive any amount of compression, kept outside the prose summary. */
export interface CaseState {
  customer_id: string | null;
  order_ids: string[];
  /** Exact values keyed by name, e.g. { refund_amount: "$899.99" }. Never paraphrased. */
  facts: Record<string, string>;
  /** Promises made to the customer, verbatim. */
  commitments: string[];
  open_issues: string[];
}

export const EMPTY_STATE: CaseState = { customer_id: null, order_ids: [], facts: {}, commitments: [], open_issues: [] };

export const BASE_SYSTEM = 'You are a support agent for an online shop. Be precise about orders, amounts and promises.';

export type TokenCounter = (system: string, messages: MessageParam[]) => Promise<number>;

export interface TokenCountingClient {
  messages: { countTokens(params: MessageCountTokensParams): PromiseLike<MessageTokensCount> };
}

/**
 * TODO(1): characters / 4 is a rough guess, and tokenizers differ between models (newer models produce ~30% more
 * tokens for the same text). Use the token counting endpoint for the target model instead.
 */
export function apiTokenCounter(_client: TokenCountingClient, _model = modelFromEnv()): TokenCounter {
  return async (system, messages) => Math.ceil((system.length + JSON.stringify(messages).length) / 4);
}

/**
 * TODO(2): keep the last `keepTurns` *human* turns verbatim and return everything before them as `older`.
 * A human turn starts with a user message that is NOT just tool_result blocks. Never cut between a tool_use and its
 * tool_result, and make sure `recent` starts with a user message.
 */
export function slidingWindow(
  messages: MessageParam[],
  keepTurns: number,
): { older: MessageParam[]; recent: MessageParam[] } {
  const cut = Math.max(0, messages.length - keepTurns * 2);
  return { older: messages.slice(0, cut), recent: messages.slice(cut) };
}

/**
 * TODO(3): selective retention. Ids and commitments accumulate (no duplicates), newer exact facts override older
 * ones with the same key, open_issues reflects the latest extraction, and customer_id is kept if the new
 * extraction doesn't know it.
 */
export function mergeState(_state: CaseState, extracted: CaseState): CaseState {
  return extracted;
}

export const RECORD_FACTS_TOOL: Tool = {
  name: 'record_case_facts',
  description:
    'Record the facts from the conversation that must never be lost: identifiers, exact amounts and dates, ' +
    'and every promise made to the customer. Copy values exactly as written; never round or paraphrase.',
  input_schema: {
    type: 'object',
    properties: {
      customer_id: { type: ['string', 'null'], description: 'Customer id such as "cus_002", or null if unknown.' },
      order_ids: { type: 'array', items: { type: 'string' } },
      facts: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Exact values by name, e.g. {"refund_amount": "$899.99", "charge_date": "2026-09-21"}.',
      },
      commitments: { type: 'array', items: { type: 'string' }, description: 'Promises made to the customer, verbatim.' },
      open_issues: { type: 'array', items: { type: 'string' }, description: 'Problems not yet resolved.' },
    },
    required: ['customer_id', 'order_ids', 'facts', 'commitments', 'open_issues'],
  },
};

/**
 * TODO(4a): a generic "summarize briefly" loses exactly what the next turn needs. Tell the summarizer to keep
 * order/customer ids, amounts, dates and commitments exactly, never paraphrased or rounded.
 */
export const SUMMARY_SYSTEM = 'Summarize the conversation briefly.';

function transcript(messages: MessageParam[]): string {
  return messages
    .map((m) => {
      const text =
        typeof m.content === 'string'
          ? m.content
          : m.content
              .map((b) =>
                b.type === 'text' ? b.text : b.type === 'tool_use' ? `[tool ${b.name} ${JSON.stringify(b.input)}]` : b.type === 'tool_result' ? `[result ${JSON.stringify(b.content)}]` : '',
              )
              .join(' ');
      return `${m.role.toUpperCase()}: ${text}`;
    })
    .join('\n');
}

/** TODO(4b): the facts must come back structured every time. Make the model call record_case_facts. */
export async function extractFacts(client: MessageCreator, older: MessageParam[], model = modelFromEnv()): Promise<CaseState> {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [RECORD_FACTS_TOOL],
    messages: [{ role: 'user', content: `<conversation>\n${transcript(older)}\n</conversation>` }],
  });
  const call = response.content.find((b) => b.type === 'tool_use');
  if (call?.type !== 'tool_use') throw new Error('record_case_facts was not called');
  return call.input as CaseState;
}

export async function summarize(client: MessageCreator, older: MessageParam[], model = modelFromEnv()): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: `<conversation>\n${transcript(older)}\n</conversation>` }],
  });
  return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
}

/**
 * TODO(5): assemble the compact context.
 *  - system = BASE_SYSTEM + the state as JSON inside <case_state>...</case_state>
 *  - the summary (if any) goes inside <earlier_conversation_summary> as the first text block of the first recent
 *    user message, so roles still alternate
 *  - the recent turns stay verbatim
 */
export function buildContext(
  _state: CaseState,
  summary: string,
  recent: MessageParam[],
): { system: string; messages: MessageParam[] } {
  const system = summary ? `${BASE_SYSTEM}\n\nSummary: ${summary}` : BASE_SYSTEM;
  const messages: MessageParam[] = recent.map((m) => ({ ...m, content: m.content as string | ContentBlockParam[] }));
  return { system, messages };
}

/**
 * TODO(6): under budget → send everything (still with the state in the system prompt), compacted: false.
 * Over budget → window, extract facts from `older` and merge them into the state, summarize `older`, build the compact
 * context, and throw if it still doesn't fit.
 */
export async function manageContext(
  _client: MessageCreator,
  _countTokens: TokenCounter,
  history: MessageParam[],
  state: CaseState,
  opts: { budget: number; keepTurns: number; model?: string },
): Promise<{ system: string; messages: MessageParam[]; state: CaseState; compacted: boolean }> {
  const { recent } = slidingWindow(history, opts.keepTurns);
  return { ...buildContext(state, '', recent), state, compacted: true };
}
