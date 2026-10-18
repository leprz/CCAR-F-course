import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

/**
 * A long support conversation about ticket T-100 (Ben Kowalski, double charge on order B2001). Early turns hold
 * the facts that matter later: the exact amount, the order id and a promise made to the customer. Later turns are
 * mostly small talk and padding, which is what makes naive truncation dangerous.
 */
export function longConversation(paddingTurns = 12): MessageParam[] {
  const history: MessageParam[] = [
    { role: 'user', content: 'Hi, I was charged twice for my laptop order. I am ben.kowalski@example.com.' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me look you up.' },
        { type: 'tool_use', id: 'toolu_c1', name: 'lookup_customer', input: { email: 'ben.kowalski@example.com' } },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_c1', content: '{"id":"cus_002","name":"Ben Kowalski","tier":"standard"}' }],
    },
    {
      role: 'assistant',
      content: 'Thanks Ben. I can see order B2001 for $899.99 placed on 2026-08-21. Can you confirm the two charge dates?',
    },
    { role: 'user', content: 'Both charges were on 2026-08-22, each $899.99.' },
    {
      role: 'assistant',
      content:
        'Confirmed: one duplicate charge of $899.99. I have opened refund case RF-7731 and I promise the refund will be issued within 5 business days.',
    },
  ];
  for (let i = 0; i < paddingTurns; i++) {
    history.push(
      { role: 'user', content: `Follow-up ${i + 1}: also, how do I change my newsletter preferences? ${'blah '.repeat(40)}` },
      { role: 'assistant', content: `Newsletter answer ${i + 1}: go to Account > Preferences. ${'detail '.repeat(40)}` },
    );
  }
  history.push({ role: 'user', content: 'So when exactly will I get my money back, and how much?' });
  return history;
}

/** Deterministic offline token estimate for tests. Real code uses the token counting API. */
export async function charCounter(system: string, messages: MessageParam[]): Promise<number> {
  return Math.ceil((system.length + JSON.stringify(messages).length) / 4);
}
