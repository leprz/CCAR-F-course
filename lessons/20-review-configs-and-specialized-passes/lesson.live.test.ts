import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';
import { scoreReview } from './answer-key.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L20 live: three focused passes over Ledgerly', () => {
  it('finds most seeded issues and flags few accepted patterns', async () => {
    const findings = await lesson.runReview(createClient(), loadCodebase());
    const score = scoreReview(findings);
    console.log(JSON.stringify(score, null, 2));
    expect(score.recall).toBeGreaterThanOrEqual(0.5);
    expect(score.falsePositives.length).toBeLessThanOrEqual(1);
  });
});
