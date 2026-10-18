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

/** Count with the API's token counting endpoint: it uses the target model's tokenizer and is free (rate-limited). */
export function apiTokenCounter(client: TokenCountingClient, model = modelFromEnv()): TokenCounter {
  return async (system, messages) => (await client.messages.countTokens({ model, system, messages })).input_tokens;
}

/** A human turn starts with a user message that is not just tool results. */
function isHumanTurn(message: MessageParam): boolean {
  if (message.role !== 'user') return false;
  if (typeof message.content === 'string') return true;
  return !message.content.some((b) => b.type === 'tool_result');
}

/**
 * Keep the last `keepTurns` human turns verbatim. Cuts only at human-turn boundaries, so a tool_use is never
 * separated from its tool_result and `recent` always starts with a user message.
 */
export function slidingWindow(
  messages: MessageParam[],
  keepTurns: number,
): { older: MessageParam[]; recent: MessageParam[] } {
  const starts = messages.flatMap((m, i) => (isHumanTurn(m) ? [i] : []));
  if (starts.length <= keepTurns) return { older: [], recent: messages };
  const cut = starts[starts.length - keepTurns]!;
  return { older: messages.slice(0, cut), recent: messages.slice(cut) };
}

/** Selective retention: accumulate identifiers and promises, let newer exact facts win, keep the latest open issues. */
export function mergeState(state: CaseState, extracted: CaseState): CaseState {
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  return {
    customer_id: extracted.customer_id ?? state.customer_id,
    order_ids: union(state.order_ids, extracted.order_ids),
    facts: { ...state.facts, ...extracted.facts },
    commitments: union(state.commitments, extracted.commitments),
    open_issues: extracted.open_issues,
  };
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

export const SUMMARY_SYSTEM =
  'Summarize the support conversation below for the agent who will continue it. ' +
  'Preserve exactly, never paraphrased or rounded: order ids, customer ids, amounts, dates, and every commitment made ' +
  'to the customer. Note what was tried and what is still open. Drop greetings and small talk.';

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

export async function extractFacts(client: MessageCreator, older: MessageParam[], model = modelFromEnv()): Promise<CaseState> {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [RECORD_FACTS_TOOL],
    tool_choice: { type: 'tool', name: RECORD_FACTS_TOOL.name },
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
 * Structured state goes in the system prompt (stable, at the top). The summary is prepended to the first kept
 * user message, so roles still alternate and the recent turns stay verbatim.
 */
export function buildContext(
  state: CaseState,
  summary: string,
  recent: MessageParam[],
): { system: string; messages: MessageParam[] } {
  const system = `${BASE_SYSTEM}\n\n<case_state>\n${JSON.stringify(state, null, 2)}\n</case_state>`;
  if (!summary) return { system, messages: recent };
  const [first, ...rest] = recent;
  if (!first) return { system, messages: [{ role: 'user', content: `<earlier_conversation_summary>\n${summary}\n</earlier_conversation_summary>` }] };
  const firstBlocks: ContentBlockParam[] = typeof first.content === 'string' ? [{ type: 'text', text: first.content }] : first.content;
  return {
    system,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `<earlier_conversation_summary>\n${summary}\n</earlier_conversation_summary>` }, ...firstBlocks],
      },
      ...rest,
    ],
  };
}

export async function manageContext(
  client: MessageCreator,
  countTokens: TokenCounter,
  history: MessageParam[],
  state: CaseState,
  opts: { budget: number; keepTurns: number; model?: string },
): Promise<{ system: string; messages: MessageParam[]; state: CaseState; compacted: boolean }> {
  const plain = buildContext(state, '', history);
  if ((await countTokens(plain.system, plain.messages)) <= opts.budget) return { ...plain, state, compacted: false };

  const { older, recent } = slidingWindow(history, opts.keepTurns);
  const merged = mergeState(state, await extractFacts(client, older, opts.model));
  const summary = await summarize(client, older, opts.model);
  const compact = buildContext(merged, summary, recent);
  const used = await countTokens(compact.system, compact.messages);
  if (used > opts.budget) throw new Error(`Compacted context still uses ${used} tokens (budget ${opts.budget})`);
  return { ...compact, state: merged, compacted: true };
}
