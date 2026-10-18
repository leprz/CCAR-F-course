import { describe, expect, it } from 'vitest';
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text, toolUse } from '../../lib/testing/index.ts';
import { tickets } from '../../fixtures/support/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const tool = (name: string): Tool => {
  const found = lesson.TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} missing`);
  return found;
};
const props = (t: Tool) => t.input_schema.properties as Record<string, { enum?: string[]; description?: string }>;
const ticket = tickets.find((t) => t.id === 'T-100')!;

describe('TODO(1) prerequisite is stated in the dependent tool', () => {
  it('list_orders description tells the model to call lookup_customer first', () => {
    expect(tool('list_orders').description).toMatch(/lookup_customer/);
  });
  it('customer_id parameter is described', () => {
    expect(props(tool('list_orders')).customer_id?.description).toBeTruthy();
  });
});

describe('TODO(2) record_triage schema enforces the contract', () => {
  it('category and priority are enums matching the ticketing system', () => {
    expect(props(tool('record_triage')).category?.enum).toEqual([...lesson.CATEGORIES]);
    expect(props(tool('record_triage')).priority?.enum).toEqual([...lesson.PRIORITIES]);
  });
  it('every field is required', () => {
    expect([...(tool('record_triage').input_schema.required ?? [])].sort()).toEqual(
      ['category', 'needs_human', 'priority', 'summary'],
    );
  });
});

describe('TODO(3) toolChoiceFor', () => {
  it('forces the prerequisite tool on the first turn', () => {
    expect(lesson.toolChoiceFor({ turn: 0, phase: 'investigate' })).toEqual({ type: 'tool', name: 'lookup_customer' });
  });
  it('lets the model decide in the middle of the investigation', () => {
    expect(lesson.toolChoiceFor({ turn: 2, phase: 'investigate' })).toEqual({ type: 'auto' });
  });
  it('forces record_triage when finalizing', () => {
    expect(lesson.toolChoiceFor({ turn: 3, phase: 'finalize' })).toEqual({ type: 'tool', name: 'record_triage' });
  });
});

describe('TODO(4) runToolCalls', () => {
  it('returns one result per tool_use, matched by id', async () => {
    const results = await lesson.runToolCalls(
      [text('Looking up.'), toolUse('lookup_customer', { email: 'ben.kowalski@example.com' }, 'toolu_a')],
      lesson.HANDLERS,
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_a' });
    expect(results[0]?.is_error).toBeFalsy();
    expect(String(results[0]?.content)).toContain('cus_002');
  });
  it('turns a failing tool into an is_error result with an instructive message', async () => {
    const results = await lesson.runToolCalls(
      [toolUse('lookup_customer', { email: 'nobody@example.com' }, 'toolu_b')],
      lesson.HANDLERS,
    );
    expect(results[0]).toMatchObject({ tool_use_id: 'toolu_b', is_error: true });
    expect(String(results[0]?.content)).toMatch(/No customer/);
  });
  it('turns an unknown tool into an is_error result instead of throwing', async () => {
    const results = await lesson.runToolCalls([toolUse('delete_account', {}, 'toolu_c')], lesson.HANDLERS);
    expect(results[0]).toMatchObject({ tool_use_id: 'toolu_c', is_error: true });
  });
});

describe('TODO(5) triageTicket agentic loop', () => {
  const triage = { category: 'billing', priority: 'urgent', summary: 'Double charge on B2001.', needs_human: true };

  it('runs tools until record_triage and returns its input', async () => {
    const client = new FakeClient([
      reply([toolUse('lookup_customer', { email: ticket.fromEmail }, 'toolu_1')]),
      reply([text('Checking orders.'), toolUse('list_orders', { customer_id: 'cus_002' }, 'toolu_2')]),
      reply([toolUse('record_triage', triage, 'toolu_3')]),
    ]);

    await expect(lesson.triageTicket(client, ticket)).resolves.toEqual(triage);
    expect(client.calls).toHaveLength(3);
    expect(client.calls[0]?.tools?.map((t) => ('name' in t ? t.name : ''))).toEqual(
      expect.arrayContaining(['lookup_customer', 'list_orders', 'record_triage']),
    );
    expect(client.calls[0]?.tool_choice).toEqual({ type: 'tool', name: 'lookup_customer' });
    expect(client.calls[1]?.tool_choice).toEqual({ type: 'auto' });
  });

  it('appends the assistant turn verbatim, then the matching tool_result', async () => {
    const assistantContent = [text('Checking orders.'), toolUse('list_orders', { customer_id: 'cus_002' }, 'toolu_2')];
    const client = new FakeClient([
      reply([toolUse('lookup_customer', { email: ticket.fromEmail }, 'toolu_1')]),
      reply(assistantContent),
      reply([toolUse('record_triage', triage)]),
    ]);
    await lesson.triageTicket(client, ticket);

    const sent = client.calls[2]!.messages;
    const assistant = sent.at(-2) as MessageParam;
    const user = sent.at(-1) as MessageParam;
    expect(assistant).toEqual({ role: 'assistant', content: assistantContent });
    expect(user.role).toBe('user');
    expect((user.content as ToolResultBlockParam[])[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_2' });
  });

  it('forces record_triage when the model answers in prose instead', async () => {
    const client = new FakeClient([
      reply([toolUse('lookup_customer', { email: ticket.fromEmail })]),
      reply([text('This looks like a billing issue, a human should refund it.')], 'end_turn'),
      reply([toolUse('record_triage', triage)]),
    ]);
    await expect(lesson.triageTicket(client, ticket)).resolves.toEqual(triage);
    expect(client.calls[2]?.tool_choice).toEqual({ type: 'tool', name: 'record_triage' });
  });

  it('stops after maxTurns instead of looping forever', async () => {
    const looping = () => reply([toolUse('lookup_customer', { email: ticket.fromEmail })]);
    const client = new FakeClient(Array.from({ length: 10 }, () => looping));
    await expect(lesson.triageTicket(client, ticket, { maxTurns: 3 })).rejects.toThrow();
    expect(client.calls.length).toBeLessThanOrEqual(3);
  });
});
