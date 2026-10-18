import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { RESEARCH_QUESTION, sources } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L16 live: a real synthesis keeps the conflict visible', () => {
  it('reports output as contested, cites both sides, and passes validation', async () => {
    const { synthesis, issues } = await lesson.synthesize(createClient(), RESEARCH_QUESTION, sources, { maxRepairs: 2 });
    console.log(lesson.renderReport(synthesis));
    console.log('remaining issues', issues);

    const output = synthesis.claims.find((c) => c.claim === 'output');
    expect(output?.status).toBe('contested');
    expect(output?.conflicting_sources).toContain('S9');
    expect(output?.supporting_sources).not.toContain('S6');
    expect(issues).toEqual([]);
  });
});
