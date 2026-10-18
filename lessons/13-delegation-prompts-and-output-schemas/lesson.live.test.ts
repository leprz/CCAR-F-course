import { expect, it } from 'vitest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { modelFromEnv } from '../../lib/claude.ts';
import { materializeSources, RESEARCH_QUESTION, sources } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L13 live: a delegation prompt yields a parseable, cited report', () => {
  it('runs the prompt as a read-only subagent would and parses its report', async () => {
    const cwd = await materializeSources();
    const picked = sources.filter((s) => ['S2', 'S6', 'S9'].includes(s.id));
    const prompt = lesson.buildDelegationPrompt({
      subagent: 'source-analyst',
      question: RESEARCH_QUESTION,
      objective: 'Determine what sources/S2.md, sources/S6.md and sources/S9.md say about delivered output.',
      successCriteria: ['Each of the three sources is accounted for in sources_consulted'],
      inScope: ['The three listed files'],
      outOfScope: ['Any other claim than output', 'Web search'],
      priorFindings: [],
      sources: picked.map(({ id, title, org, date, type, url }) => ({ id, title, org, date, type, url })),
      constraints: ['Read-only'],
    });

    let result = '';
    for await (const m of query({
      prompt,
      options: {
        cwd,
        model: modelFromEnv(),
        tools: ['Read', 'Grep', 'Glob'],
        allowedTools: ['Read', 'Grep', 'Glob'],
        permissionMode: 'dontAsk',
        settingSources: [],
        maxTurns: 10,
        maxBudgetUsd: 0.3,
      },
    })) {
      if (m.type === 'result' && m.subtype === 'success') result = m.result;
    }

    const parsed = lesson.parseSubagentReport(result, sources.map((s) => s.id));
    if (!parsed.ok) console.log(parsed.errors, result);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.report.findings.length).toBeGreaterThan(0);
      expect(parsed.report.sources_consulted.find((s) => s.source_id === 'S6')?.used).toBe(false);
    }
  });
});
