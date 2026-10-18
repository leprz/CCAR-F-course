import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive, RecordingClient } from '../../lib/testing/index.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L10 live: review across two sessions', () => {
  it('finds the SQL injection, then re-analyzes only the edited file', async () => {
    const conventions = loadCodebase()['CONVENTIONS.md']!;
    const files = loadCodebase({ include: (p) => p.startsWith('src/') });
    const padPath = path.join(await mkdtemp(path.join(tmpdir(), 'l10-live-')), 'review.json');

    const one = await lesson.resumeReview(createClient(), padPath, files, { conventions });
    const repoFindings = one.pad.findings.filter((f) => f.file === 'src/repositories/orderRepository.ts');
    expect(repoFindings.some((f) => f.category === 'security' && /sql|inject/i.test(f.summary))).toBe(true);

    const edited = { ...files, 'src/config.ts': files['src/config.ts']!.replace(/\?\? 'sk_live_FAKE_\w+'/, "?? ''") };
    const client = new RecordingClient(createClient());
    const two = await lesson.resumeReview(client, padPath, edited, { conventions });
    expect(client.calls).toHaveLength(1);
    console.log(lesson.resumeBriefing(two.pad, two.plan));
  });
});
