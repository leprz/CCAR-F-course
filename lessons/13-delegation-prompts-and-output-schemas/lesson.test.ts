import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { sources } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
type Task = import('./solution/index.ts').DelegationTask;
type Report = import('./solution/index.ts').SubagentReport;
const lesson = await loadLesson<Lesson>(import.meta.url);

type Schema = { required?: readonly string[]; properties?: Record<string, Schema>; items?: Schema; enum?: readonly string[]; type?: unknown };
const schema = lesson.SUBAGENT_OUTPUT_SCHEMA as unknown as Schema;
const findingSchema = schema.properties?.findings?.items;
const ids = sources.map((s) => s.id);

const task: Task = {
  subagent: 'source-analyst',
  question: 'Does a four-day work week improve software team productivity?',
  objective: 'Establish what the corpus says about delivered output and on-call impact for software teams.',
  successCriteria: ['Every output-related source is accounted for', 'Conflicts between sources are made explicit'],
  inScope: ['sources S2, S5, S6, S9'],
  outOfScope: ['wellbeing and retention (covered by another analyst)', 'web search'],
  priorFindings: [{ claim: 'output', statement: 'Pilot participants self-reported maintained productivity.', sourceIds: ['S1'], confidence: 'medium' }],
  sources: sources
    .filter((s) => ['S2', 'S5', 'S6', 'S9'].includes(s.id))
    .map(({ id, title, org, date, type, url }) => ({ id, title, org, date, type, url })),
  constraints: ['Read-only', 'At most 15 tool calls'],
};

const finding = {
  claim: 'output',
  statement: 'Objective delivery metrics did not change.',
  evidence_quote: 'Merged pull requests per engineer per week did not change significantly.',
  source_id: 'S2',
  source_date: '2025-11-02',
  source_type: 'peer-reviewed',
  stance: 'mixed',
  confidence: 'high',
  metric: 'PRs/engineer −2%',
} as const;
const report: Report = {
  summary: 'Rigorous sources find output maintained; one RCT finds it fell.',
  findings: [finding],
  gaps: ['No data on product (vs services) companies in the RCT'],
  sources_consulted: [
    { source_id: 'S2', used: true, reason: 'telemetry study' },
    { source_id: 'S6', used: false, reason: 'vendor whitepaper, no methodology' },
  ],
};

describe('TODO(1) output schema carries citations for synthesis', () => {
  it('requires the four top-level sections', () => {
    expect([...(schema.required ?? [])].sort()).toEqual(['findings', 'gaps', 'sources_consulted', 'summary']);
  });
  it('each finding is an object that requires its citation metadata', () => {
    expect([...(findingSchema?.required ?? [])].sort()).toEqual(
      ['claim', 'confidence', 'evidence_quote', 'source_date', 'source_id', 'source_type', 'stance', 'statement'].sort(),
    );
  });
  it('uses enums for claim, source_type, stance and confidence', () => {
    expect(findingSchema?.properties?.claim?.enum).toEqual(lesson.CLAIM_IDS);
    expect(findingSchema?.properties?.source_type?.enum).toEqual(lesson.SOURCE_TYPES);
    expect([...(findingSchema?.properties?.stance?.enum ?? [])].sort()).toEqual(['contradicts', 'mixed', 'supports']);
    expect([...(findingSchema?.properties?.confidence?.enum ?? [])].sort()).toEqual(['high', 'low', 'medium']);
  });
  it('metric is optional and nullable', () => {
    expect(findingSchema?.required).not.toContain('metric');
    expect(findingSchema?.properties?.metric?.type).toEqual(['string', 'null']);
  });
  it('sources_consulted records whether and why each source was used', () => {
    expect(schema.properties?.sources_consulted?.items?.required).toEqual(expect.arrayContaining(['source_id', 'used', 'reason']));
  });
});

describe('TODO(2) chooseDelegationStyle', () => {
  it('goal-oriented when findings may change the plan', () => {
    expect(lesson.chooseDelegationStyle({ mandatedProcedure: false, intermediateFindingsChangePlan: true })).toBe('goal-oriented');
  });
  it('still goal-oriented when nothing mandates the steps', () => {
    expect(lesson.chooseDelegationStyle({ mandatedProcedure: false, intermediateFindingsChangePlan: false })).toBe('goal-oriented');
  });
  it('procedural only when a sequence is mandated', () => {
    expect(lesson.chooseDelegationStyle({ mandatedProcedure: true, intermediateFindingsChangePlan: false })).toBe('procedural');
  });
});

describe('TODO(3) buildDelegationPrompt is goal-oriented and self-contained', () => {
  const prompt = lesson.buildDelegationPrompt(task);

  it('states the objective, the question and the success criteria', () => {
    expect(prompt).toContain(task.objective);
    expect(prompt).toContain(task.question);
    for (const c of task.successCriteria) expect(prompt).toContain(c);
  });
  it('states scope boundaries, including what others cover', () => {
    for (const s of [...task.inScope, ...task.outOfScope]) expect(prompt).toContain(s);
  });
  it('carries every prior finding with its sources and confidence', () => {
    const f = task.priorFindings[0]!;
    expect(prompt).toContain(f.statement);
    expect(prompt).toMatch(/S1/);
    expect(prompt).toMatch(/medium/);
  });
  it('carries every source with its metadata', () => {
    for (const s of task.sources) for (const v of [s.id, s.title, s.org, s.date, s.type, s.url]) expect(prompt).toContain(v);
  });
  it('includes constraints and the report format with the JSON schema, gaps and discounted sources', () => {
    for (const c of task.constraints) expect(prompt).toContain(c);
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"evidence_quote"');
    expect(prompt).toMatch(/gaps/);
    expect(prompt).toMatch(/discount/i);
  });
  it('is not a numbered step-by-step procedure', () => {
    expect(prompt).not.toMatch(/^\s*\d+[.)]\s/m);
  });
});

describe('TODO(4) parseSubagentReport', () => {
  it('extracts JSON from prose and a fenced block', () => {
    const text = `Here is my report.\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n`;
    const parsed = lesson.parseSubagentReport(text, ids);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.report.findings[0]?.source_id).toBe('S2');
  });
  it('rejects findings without trustworthy citations, listing every problem', () => {
    const bad = { ...report, findings: [{ ...finding, source_id: 'S99', source_date: '' }] };
    const parsed = lesson.parseSubagentReport(JSON.stringify(bad), ids);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.join('\n')).toMatch(/S99/);
      expect(parsed.errors.join('\n')).toMatch(/source_date/);
    }
  });
  it('rejects missing sections and invalid JSON without throwing', () => {
    const { gaps: _gaps, ...noGaps } = report;
    expect(lesson.parseSubagentReport(JSON.stringify(noGaps), ids).ok).toBe(false);
    expect(lesson.parseSubagentReport('I could not finish.', ids).ok).toBe(false);
  });
});

describe('TODO(5) toSynthesisInput keeps citations', () => {
  const other: Report = {
    summary: 'RCT shows output fell.',
    findings: [{ ...finding, source_id: 'S9', source_date: '2026-04-30', stance: 'contradicts', statement: 'Weekly deliverables fell 9%.' }],
    gaps: ['No data on product (vs services) companies in the RCT', 'No long-run data'],
    sources_consulted: [{ source_id: 'S5', used: false, reason: 'anecdotal single team' }],
  };
  const merged = lesson.toSynthesisInput([report, other]);

  it('groups every finding by claim with its source metadata intact', () => {
    expect(merged.byClaim.output?.map((f) => f.source_id)).toEqual(['S2', 'S9']);
    expect(merged.byClaim.output?.[1]).toMatchObject({ source_date: '2026-04-30', stance: 'contradicts' });
  });
  it('de-duplicates gaps and keeps discounted sources with reasons', () => {
    expect(merged.gaps).toEqual(['No data on product (vs services) companies in the RCT', 'No long-run data']);
    expect(merged.discounted).toEqual([
      { source_id: 'S6', reason: 'vendor whitepaper, no methodology' },
      { source_id: 'S5', reason: 'anecdotal single team' },
    ]);
  });
});
