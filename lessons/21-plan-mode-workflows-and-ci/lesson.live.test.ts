import { describe, expect, it } from 'vitest';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadLesson } from '../../lib/lesson.ts';
import { hasClaudeCli, materializeProject, runClaude, Sandbox } from '../19-config-mechanisms-and-context-fork/support/config-files.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);
const describeCli = process.env.ANTHROPIC_API_KEY && hasClaudeCli() ? describe : describe.skip;

describeCli('L21 live: a CI-style run', () => {
  it('returns schema-valid structured output within its caps', () => {
    const dir = materializeProject(Sandbox.forLesson(import.meta.url).root);
    const args = lesson.buildCiArgs({
      prompt: 'List every route defined in src/routes/orders.ts as METHOD path.',
      allowedTools: ['Read', 'Grep', 'Glob'],
      maxTurns: 6,
      maxBudgetUsd: 0.5,
      jsonSchema: { type: 'object', properties: { routes: { type: 'array', items: { type: 'string' } } }, required: ['routes'] },
      model: 'haiku',
    });
    const outcome = lesson.interpretResult(runClaude(args, dir) as unknown as SDKResultMessage);
    console.log(outcome);
    expect(outcome.ok).toBe(true);
    expect((outcome.output as { routes: string[] }).routes.join(' ')).toMatch(/orders/);
  });
});
