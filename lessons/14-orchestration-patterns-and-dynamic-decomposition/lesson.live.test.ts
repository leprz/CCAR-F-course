import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L14 live: coordinator with real workers', () => {
  it('plans follow-up work from what the first round found', async () => {
    // Small budget: one broad round plus one adaptive round, at most 7 worker calls.
    const run = await lesson.runResearch(lesson.makeClaudeWorker(createClient()), { maxRounds: 2, maxTasks: 7 });
    console.log(run.rounds.map((r) => r.map((t) => t.id)));

    expect(run.rounds[0]).toHaveLength(3);
    const second = run.rounds[1]?.map((t) => t.id) ?? [];
    // The output evidence conflicts (S9 vs the rest), so a real model's findings should trigger a follow-up on it.
    expect(second).toContain('follow-up:output');
  });
});
