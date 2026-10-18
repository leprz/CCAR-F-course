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
    description:
      'Find a customer by the email address a ticket was sent from. Returns the customer id, name and tier. ' +
      'Always call this first: every other customer tool needs the id it returns. ' +
      'Fails with an error if no customer has that email; do not invent an id in that case.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Sender email address exactly as it appears on the ticket.' },
      },
      required: ['email'],
    },
  },
  {
    name: 'list_orders',
    description:
      "List a customer's orders with status, total and dates. " +
      'Requires a customer_id returned by lookup_customer; call lookup_customer first. ' +
      'Use it when the ticket concerns payments, deliveries or refunds.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Id returned by lookup_customer, e.g. "cus_001".' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'record_triage',
    description:
      'Record the final triage decision for the ticket. Call exactly once, after investigating. ' +
      'This is the only output the ticketing system reads; text replies are ignored.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...CATEGORIES], description: 'Primary topic of the ticket.' },
        priority: {
          type: 'string',
          enum: [...PRIORITIES],
          description: 'urgent = money lost or account locked; high = premium customer or time-bound; low = cosmetic.',
        },
        summary: { type: 'string', description: 'One sentence a support agent can act on.' },
        needs_human: { type: 'boolean', description: 'True when the request cannot be resolved automatically.' },
      },
      required: ['category', 'priority', 'summary', 'needs_human'],
    },
  },
];

export type Phase = 'investigate' | 'finalize';

/**
 * Turn 0 forces the prerequisite tool so every later call has a customer id to work with.
 * Middle turns let the model decide. The finalize turn forces the structured-output tool so the
 * pipeline never receives free text it cannot parse.
 */
export function toolChoiceFor(step: { turn: number; phase: Phase }): ToolChoice {
  if (step.phase === 'finalize') return { type: 'tool', name: 'record_triage' };
  if (step.turn === 0) return { type: 'tool', name: 'lookup_customer' };
  return { type: 'auto' };
}

export type Handlers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

export const HANDLERS: Handlers = {
  lookup_customer: (input) => lookupCustomer(String(input.email)),
  list_orders: (input) => listOrders(String(input.customer_id)),
};

/** Execute every client tool call in an assistant turn. Failures become `is_error` results, never exceptions. */
export async function runToolCalls(content: ContentBlock[], handlers: Handlers): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const handler = handlers[block.name];
    if (!handler) {
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        is_error: true,
        content: `Unknown tool "${block.name}". Available tools: ${Object.keys(handlers).join(', ')}.`,
      });
      continue;
    }
    try {
      const output = await handler(block.input as Record<string, unknown>);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
    } catch (err) {
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        is_error: true,
        content: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

const SYSTEM =
  'You triage customer support tickets for an online shop. Investigate with the tools, then call record_triage.';

export async function triageTicket(
  client: MessageCreator,
  ticket: Ticket,
  opts: { model?: string; maxTurns?: number } = {},
): Promise<Triage> {
  const model = opts.model ?? modelFromEnv();
  const maxTurns = opts.maxTurns ?? 6;
  const messages: MessageParam[] = [
    {
      role: 'user',
      content: `Ticket ${ticket.id} from ${ticket.fromEmail}\nSubject: ${ticket.subject}\n\n${ticket.body}`,
    },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: toolChoiceFor({ turn, phase: 'investigate' }),
      messages,
    });

    const recorded = response.content.find((b) => b.type === 'tool_use' && b.name === 'record_triage');
    if (recorded?.type === 'tool_use') return recorded.input as Triage;

    // Keep the assistant turn verbatim: tool_result ids must match its tool_use blocks.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      // The model answered in prose. Prose would break the ticketing system, so force the tool.
      const final = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM,
        tools: TOOLS,
        tool_choice: toolChoiceFor({ turn: turn + 1, phase: 'finalize' }),
        messages: [...messages, { role: 'user', content: 'Record your triage decision now.' }],
      });
      const forced = final.content.find((b) => b.type === 'tool_use' && b.name === 'record_triage');
      if (forced?.type !== 'tool_use') throw new Error('record_triage was forced but not called');
      return forced.input as Triage;
    }

    messages.push({ role: 'user', content: await runToolCalls(response.content, HANDLERS) });
  }

  throw new Error(`Triage did not finish within ${maxTurns} turns`);
}
