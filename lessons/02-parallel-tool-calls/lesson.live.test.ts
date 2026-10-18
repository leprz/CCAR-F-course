import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { tickets } from '../../fixtures/support/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L02 live: parallel tool calls', () => {
  it('fetches three independent orders in one turn', async () => {
    const ticket = tickets.find((t) => t.id === 'T-101')!;
    const { answer, responses } = await lesson.answerOrderQuestion(createClient(), ticket.body);

    const stats = lesson.parallelismStats(responses);
    console.log('parallelism', stats);
    expect(stats.avgPerMessage).toBeGreaterThan(1);
    expect(answer).toMatch(/A1003/);
  });
});
