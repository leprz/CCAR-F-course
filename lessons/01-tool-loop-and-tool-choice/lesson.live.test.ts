import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive, RecordingClient } from '../../lib/testing/index.ts';
import { tickets } from '../../fixtures/support/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L01 live: triage a real ticket', () => {
  it('returns a schema-valid triage and starts with the prerequisite tool', async () => {
    const client = new RecordingClient(createClient());
    const result = await lesson.triageTicket(client, tickets.find((t) => t.id === 'T-100')!);

    expect(lesson.CATEGORIES).toContain(result.category);
    expect(lesson.PRIORITIES).toContain(result.priority);
    expect(typeof result.summary).toBe('string');
    expect(typeof result.needs_human).toBe('boolean');

    const firstCall = client.responses[0]!.content.find((b) => b.type === 'tool_use');
    expect(firstCall?.type === 'tool_use' && firstCall.name).toBe('lookup_customer');
  });

  it('recovers from an unknown customer via the is_error result', async () => {
    const client = new RecordingClient(createClient());
    const result = await lesson.triageTicket(client, tickets.find((t) => t.id === 'T-103')!);
    expect(result.needs_human).toBe(true);
  });
});
