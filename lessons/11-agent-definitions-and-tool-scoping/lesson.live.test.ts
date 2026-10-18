import { expect, it } from 'vitest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { materializeSources } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L11 live: scoped coordinator delegates to the source analyst', () => {
  it('delegates instead of reading sources itself, and never uses tools outside its role', async () => {
    const cwd = await materializeSources();
    const messages: unknown[] = [];
    for await (const m of query({
      prompt:
        'Using only the files in sources/, which claims about the four-day week are well established? ' +
        'Delegate the reading to the source-analyst agent. Reply in under 150 words. Do not write a report file.',
      options: { ...lesson.buildOptions(cwd), maxTurns: 8, maxBudgetUsd: 0.5 },
    })) {
      messages.push(m);
    }

    expect(lesson.listDelegations(messages)).toContain('source-analyst');

    const coordinatorTools = messages.flatMap((raw) => {
      const m = raw as { type?: string; parent_tool_use_id?: string | null; message?: { content?: Array<{ type: string; name?: string }> } };
      return m.type === 'assistant' && !m.parent_tool_use_id
        ? (m.message?.content ?? []).filter((b) => b.type === 'tool_use').map((b) => b.name)
        : [];
    });
    for (const name of coordinatorTools) expect(['Agent', 'Task', 'Read', 'Glob']).toContain(name);

    const result = messages.at(-1) as { type?: string; subtype?: string };
    expect(result.type).toBe('result');
  });
});
