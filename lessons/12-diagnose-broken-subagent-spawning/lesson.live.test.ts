import { expect, it } from 'vitest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { materializeSources } from '../../fixtures/research/index.ts';
import { modelFromEnv } from '../../lib/claude.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L12 live: the fixed setup actually delegates', () => {
  it('spawns source-analyst with FIXED_SETUP', async () => {
    expect(lesson.diagnose(lesson.FIXED_SETUP)).toEqual([]);
    const cwd = await materializeSources();
    const names: string[] = [];
    for await (const m of query({
      prompt: 'Use the source-analyst agent to list the ids of the peer-reviewed sources in sources/. Answer with the ids only.',
      options: { ...(lesson.FIXED_SETUP.options as object), cwd, model: modelFromEnv(), settingSources: [], maxTurns: 6, maxBudgetUsd: 0.3 },
    })) {
      const msg = m as { type?: string; message?: { content?: Array<{ type: string; name?: string; input?: { subagent_type?: string } }> } };
      if (msg.type !== 'assistant') continue;
      for (const b of msg.message?.content ?? []) {
        if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) names.push(b.input?.subagent_type ?? '');
      }
    }
    expect(names).toContain('source-analyst');
  });
});
