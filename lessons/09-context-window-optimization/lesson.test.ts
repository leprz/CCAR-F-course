import { describe, expect, it } from 'vitest';
import type { MessageCountTokensParams, MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text, toolUse } from '../../lib/testing/index.ts';
import { charCounter, longConversation } from './conversation.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const extracted = {
  customer_id: 'cus_002',
  order_ids: ['B2001'],
  facts: { duplicate_charge: '$899.99', charge_date: '2026-08-22', refund_case: 'RF-7731' },
  commitments: ['Refund issued within 5 business days'],
  open_issues: ['Refund pending'],
};

const isToolResultMsg = (m: MessageParam | undefined) =>
  !!m && m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');

describe('TODO(1) apiTokenCounter', () => {
  it('uses the token counting endpoint for the target model', async () => {
    const seen: MessageCountTokensParams[] = [];
    const client = {
      messages: {
        countTokens: async (p: MessageCountTokensParams) => {
          seen.push(p);
          return { input_tokens: 4242 };
        },
      },
    };
    const count = lesson.apiTokenCounter(client, 'claude-haiku-5-5');
    await expect(count('sys', [{ role: 'user', content: 'hi' }])).resolves.toBe(4242);
    expect(seen[0]).toMatchObject({ model: 'claude-haiku-5-5', system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
  });
});

describe('TODO(2) slidingWindow', () => {
  it('keeps the last N human turns and never starts with a tool_result message', () => {
    const history = longConversation(0); // 7 messages, human turns at index 0, 4 and 6
    const { older, recent } = lesson.slidingWindow(history, 3);
    expect(older).toEqual([]);
    expect(recent).toEqual(history);

    const two = lesson.slidingWindow(history, 2);
    expect(two.recent[0]).toEqual(history[4]);
    expect(two.older).toEqual(history.slice(0, 4));
    expect(isToolResultMsg(two.recent[0])).toBe(false);
  });

  it('never separates a tool_use from its tool_result', () => {
    const history = longConversation(0);
    for (let keep = 1; keep <= 3; keep++) {
      const { older, recent } = lesson.slidingWindow(history, keep);
      expect(recent[0]?.role).toBe('user');
      expect(isToolResultMsg(recent[0])).toBe(false);
      expect([...older, ...recent]).toEqual(history);
    }
  });
});

describe('TODO(3) mergeState', () => {
  it('accumulates ids and commitments, lets newer facts win, keeps the latest open issues', () => {
    const before = {
      customer_id: 'cus_002',
      order_ids: ['B2001'],
      facts: { refund_case: 'RF-7731', duplicate_charge: '$899.99' },
      commitments: ['Refund issued within 5 business days'],
      open_issues: ['Refund pending'],
    };
    const merged = lesson.mergeState(before, {
      customer_id: null,
      order_ids: ['B2001', 'B2002'],
      facts: { duplicate_charge: '$899.99', refund_status: 'approved' },
      commitments: ['Email confirmation once refunded'],
      open_issues: [],
    });
    expect(merged.customer_id).toBe('cus_002');
    expect(merged.order_ids).toEqual(['B2001', 'B2002']);
    expect(merged.facts).toEqual({ refund_case: 'RF-7731', duplicate_charge: '$899.99', refund_status: 'approved' });
    expect(merged.commitments).toEqual(['Refund issued within 5 business days', 'Email confirmation once refunded']);
    expect(merged.open_issues).toEqual([]);
  });
});

describe('TODO(4) summarizer and fact extraction', () => {
  it('summary prompt demands exact ids, amounts, dates and commitments', () => {
    expect(lesson.SUMMARY_SYSTEM).toMatch(/exact/i);
    expect(lesson.SUMMARY_SYSTEM).toMatch(/amount/i);
    expect(lesson.SUMMARY_SYSTEM).toMatch(/commitment|promise/i);
    expect(lesson.SUMMARY_SYSTEM).toMatch(/id/i);
  });
  it('fact extraction forces record_case_facts', async () => {
    const client = new FakeClient([reply([toolUse('record_case_facts', extracted)])]);
    await expect(lesson.extractFacts(client, longConversation(0))).resolves.toEqual(extracted);
    expect(client.calls[0]?.tool_choice).toEqual({ type: 'tool', name: 'record_case_facts' });
  });
});

describe('TODO(5) buildContext', () => {
  it('puts the state in the system prompt and the summary before the verbatim recent turns', () => {
    const recent: MessageParam[] = [
      { role: 'user', content: 'When will I get my money back?' },
    ];
    const ctx = lesson.buildContext(extracted, 'Ben was double charged.', recent);
    expect(ctx.system).toContain('<case_state>');
    expect(ctx.system).toContain('RF-7731');
    expect(ctx.messages).toHaveLength(1);
    const blocks = ctx.messages[0]!.content as TextBlockParam[];
    expect(blocks[0]?.text).toContain('<earlier_conversation_summary>');
    expect(blocks[0]?.text).toContain('Ben was double charged.');
    expect(blocks.at(-1)?.text).toBe('When will I get my money back?');
  });
});

describe('TODO(6) manageContext', () => {
  it('leaves a short conversation alone', async () => {
    const client = new FakeClient([]);
    const history = longConversation(0);
    const out = await lesson.manageContext(client, charCounter, history, lesson.EMPTY_STATE, { budget: 100_000, keepTurns: 2 });
    expect(out.compacted).toBe(false);
    expect(out.messages).toEqual(history);
    expect(client.calls).toHaveLength(0);
  });

  it('compacts a long conversation under budget without losing the early facts', async () => {
    const client = new FakeClient([
      reply([toolUse('record_case_facts', extracted)]),
      reply([text('Ben (cus_002) was double charged $899.99 on order B2001; refund case RF-7731 promised within 5 business days.')]),
    ]);
    const history = longConversation(12);
    const budget = 900;
    expect(await charCounter(lesson.BASE_SYSTEM, history)).toBeGreaterThan(budget);

    const out = await lesson.manageContext(client, charCounter, history, lesson.EMPTY_STATE, { budget, keepTurns: 2 });
    expect(out.compacted).toBe(true);
    expect(await charCounter(out.system, out.messages)).toBeLessThanOrEqual(budget);
    expect(out.state.facts.refund_case).toBe('RF-7731');
    expect(out.system).toContain('$899.99');
    expect(JSON.stringify(out.messages)).toContain('RF-7731');
    expect(out.messages.at(-1)).toEqual(history.at(-1));
  });
});
