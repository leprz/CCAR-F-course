import { expect, it } from 'vitest';
import { createClient, modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L22 live: test generation with context and criteria', () => {
  it('produces behavioural tests that reuse the factories', async () => {
    const codebase = loadCodebase({ include: (p) => p.startsWith('src/') || p.startsWith('tests/') || p === 'CONVENTIONS.md' });
    const { system, user } = lesson.buildTestGenPrompt(codebase);
    const res = await createClient().messages.create({
      model: modelFromEnv(),
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    console.log(text);
    expect(text).toMatch(/makeOrder\(/);
    expect(lesson.isTrivialTest(text)).toBe(false);
  });
});
