import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createClient, modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { sourceToMarkdown, sources, type ClaimId } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
type Workers = import('./solution/index.ts').Workers;
const lesson = await loadLesson<Lesson>(import.meta.url);

const CLAIMS: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];

describeLive('L15 live: a real extraction stage survives a crash', () => {
  it('resumes without re-calling the model for sources it already processed', async () => {
    const client = createClient();
    let modelCalls = 0;
    let crashAt: string | null = 'S4';

    const w: Workers = {
      async collect(source) {
        if (source.id === crashAt) throw new lesson.CrashError('simulated kill');
        modelCalls++;
        const res = await client.messages.create({
          model: modelFromEnv(),
          max_tokens: 1024,
          tools: [
            {
              name: 'record_findings',
              description: 'Record each finding the source reports, one per claim.',
              input_schema: {
                type: 'object',
                properties: {
                  findings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        claim: { type: 'string', enum: CLAIMS },
                        direction: { type: 'string', enum: ['improves', 'worsens', 'no-change', 'mixed'] },
                        statement: { type: 'string' },
                      },
                      required: ['claim', 'direction', 'statement'],
                    },
                  },
                },
                required: ['findings'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'record_findings' },
          messages: [{ role: 'user', content: sourceToMarkdown(source) }],
        });
        const call = res.content.find((b) => b.type === 'tool_use');
        const findings = call?.type === 'tool_use' ? ((call.input as { findings: [] }).findings ?? []) : [];
        return findings.map((f: { claim: ClaimId; direction: 'improves'; statement: string }) => ({ ...f, sourceId: source.id }));
      },
      async analyze(claim, findings) {
        return { claim, verdict: [...new Set(findings.map((f) => f.direction))].join('/'), sourceIds: findings.map((f) => f.sourceId) };
      },
      async report(analyses) {
        return analyses.map((a) => `${a.claim}: ${a.verdict}`).join('\n');
      },
    };

    const file = path.join(await mkdtemp(path.join(tmpdir(), 'pipeline-live-')), 'state.json');
    const first = sources.slice(0, 6);
    await expect(lesson.runPipeline({ store: new lesson.StateStore(file), sources: first, workers: w })).rejects.toThrow();
    expect(modelCalls).toBe(3);

    crashAt = null;
    const summary = await lesson.runPipeline({ store: new lesson.StateStore(file), sources: first, workers: w });
    expect(modelCalls).toBe(6);
    expect(summary.skipped).toEqual(['collect:S1', 'collect:S2', 'collect:S3']);
    console.log(summary.report);
  });
});
