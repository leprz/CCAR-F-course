import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolChoice,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import { listOrders, lookupCustomer, type Ticket } from '../../../fixtures/support/index.ts';

export const CATEGORIES = ['billing', 'shipping', 'refund', 'account', 'technical', 'other'] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export interface Triage {
  category: (typeof CATEGORIES)[number];
  priority: (typeof PRIORITIES)[number];
  summary: string;
  needs_human: boolean;
}

export const TOOLS: Tool[] = [
  {
    name: 'lookup_customer',
    description: 'Look up a customer.',
    input_schema: {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    },
  },
  {
    // TODO(1): this tool only works with an id returned by lookup_customer. Say so in the description,
    // and describe what the customer_id parameter is.
    name: 'list_orders',
    description: 'List orders.',
    input_schema: {
      type: 'object',
      properties: { customer_id: { type: 'string' } },
      required: ['customer_id'],
    },
  },
  {
    // TODO(2): the ticketing system can only handle the values in CATEGORIES and PRIORITIES, and it needs
    // every field. Make the schema enforce that.
    name: 'record_triage',
    description: 'Record the triage decision.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        priority: { type: 'string' },
        summary: { type: 'string' },
        needs_human: { type: 'boolean' },
      },
    },
  },
];

export type Phase = 'investigate' | 'finalize';

/**
 * TODO(3): pick tool_choice per step.
 *  - turn 0 of the investigate phase: the model must start with the prerequisite tool (lookup_customer)
 *  - finalize phase: the model must call record_triage, prose is not acceptable
 *  - otherwise: let the model decide
 */
export function toolChoiceFor(_step: { turn: number; phase: Phase }): ToolChoice {
  return { type: 'auto' };
}

export type Handlers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

export const HANDLERS: Handlers = {
  lookup_customer: (input) => lookupCustomer(String(input.email)),
  list_orders: (input) => listOrders(String(input.customer_id)),
};

/**
 * TODO(4): execute every tool_use block and return one tool_result per call.
 * A failing or unknown tool must not throw: return the error message to the model with is_error: true,
 * so it can recover.
 */
export async function runToolCalls(content: ContentBlock[], handlers: Handlers): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const output = await handlers[block.name]!(block.input as Record<string, unknown>);
    results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
  }
  return results;
}

const SYSTEM =
  'You triage customer support tickets for an online shop. Investigate with the tools, then reply with JSON.';

/**
 * TODO(5): replace this single call + JSON.parse with a real agentic loop:
 *  - call the API with TOOLS and toolChoiceFor(...) each turn
 *  - if the response contains a record_triage tool_use, return its input
 *  - on stop_reason "tool_use": append the assistant turn verbatim, run the tools, append the results
 *  - if the model ends its turn without record_triage: make one more call in the finalize phase
 *  - give up with an error after maxTurns
 */
export async function triageTicket(
  client: MessageCreator,
  ticket: Ticket,
  opts: { model?: string; maxTurns?: number } = {},
): Promise<Triage> {
  const messages: MessageParam[] = [
    {
      role: 'user',
      content: `Ticket ${ticket.id} from ${ticket.fromEmail}\nSubject: ${ticket.subject}\n\n${ticket.body}`,
    },
  ];
  const response = await client.messages.create({
    model: opts.model ?? modelFromEnv(),
    max_tokens: 1024,
    system: SYSTEM,
    messages,
  });
  const first = response.content[0];
  return JSON.parse(first?.type === 'text' ? first.text : '{}') as Triage;
}
