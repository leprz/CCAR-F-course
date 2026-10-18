import { describe, expect, it } from 'vitest';
import type { ToolChoiceAuto, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text, toolUse } from '../../lib/testing/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const threeCalls = () => [
  text('Checking all three orders.'),
  toolUse('get_order', { order_id: 'A1001' }, 'toolu_1'),
  toolUse('get_order', { order_id: 'A1002' }, 'toolu_2'),
  toolUse('get_order', { order_id: 'A1003' }, 'toolu_3'),
];

describe('TODO(1) system prompt invites parallel calls', () => {
  it('asks for independent operations to be invoked simultaneously / in parallel', () => {
    expect(lesson.SYSTEM_PROMPT).toMatch(/simultaneous|in parallel/i);
    expect(lesson.SYSTEM_PROMPT).toMatch(/independent/i);
  });
});

describe('TODO(2) request allows parallel tool use', () => {
  it('does not set disable_parallel_tool_use', () => {
    const req = lesson.buildRequest([{ role: 'user', content: 'hi' }]);
    expect((req.tool_choice as ToolChoiceAuto | undefined)?.disable_parallel_tool_use ?? false).toBe(false);
  });
});

describe('TODO(3) executeTurn', () => {
  it('runs the calls of one turn concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { ok: true };
    };
    await lesson.executeTurn(threeCalls(), { get_order: slow });
    expect(maxInFlight).toBe(3);
  });

  it('keeps results in tool_use order, matched by id', async () => {
    const results = await lesson.executeTurn(threeCalls(), lesson.HANDLERS);
    expect(results.map((r) => r.tool_use_id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3']);
  });

  it('returns the other results when one call fails', async () => {
    const content = [
      toolUse('get_order', { order_id: 'A1001' }, 'toolu_ok'),
      toolUse('get_order', { order_id: 'ZZZ' }, 'toolu_bad'),
    ];
    const results = await lesson.executeTurn(content, lesson.HANDLERS);
    expect(results).toHaveLength(2);
    expect(results[0]?.is_error).toBeFalsy();
    expect(results[1]).toMatchObject({ tool_use_id: 'toolu_bad', is_error: true });
  });
});

describe('TODO(4) appendToolResults', () => {
  it('adds the assistant turn plus ONE user message holding every result, results first', () => {
    const results: ToolResultBlockParam[] = ['toolu_1', 'toolu_2', 'toolu_3'].map((id) => ({
      type: 'tool_result',
      tool_use_id: id,
      content: '{}',
    }));
    const history = lesson.appendToolResults([{ role: 'user', content: 'q' }], threeCalls(), results);
    expect(history).toHaveLength(3);
    expect(history[1]?.role).toBe('assistant');
    expect(history[2]?.role).toBe('user');
    const blocks = history[2]!.content as ToolResultBlockParam[];
    expect(blocks.map((b) => b.type)).toEqual(['tool_result', 'tool_result', 'tool_result']);
  });
});

describe('TODO(5) parallelismStats', () => {
  it('averages tool calls over the responses that called tools', () => {
    const stats = lesson.parallelismStats([
      reply(threeCalls()),
      reply([toolUse('get_order', { order_id: 'B2001' })]),
      reply([text('Done.')]),
    ]);
    expect(stats).toEqual({ toolMessages: 2, toolCalls: 4, avgPerMessage: 2 });
  });
});

describe('end to end with a scripted model', () => {
  it('answers after one parallel round trip', async () => {
    const client = new FakeClient([reply(threeCalls()), reply([text('A1001 delivered, A1002 shipped, A1003 processing.')])]);
    const { answer } = await lesson.answerOrderQuestion(client, 'Status of A1001, A1002, A1003?');
    expect(answer).toMatch(/A1003 processing/);
    expect(client.calls).toHaveLength(2);
    const lastUser = client.calls[1]!.messages.at(-1)!;
    expect((lastUser.content as ToolResultBlockParam[]).map((b) => b.tool_use_id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3']);
  });
});
