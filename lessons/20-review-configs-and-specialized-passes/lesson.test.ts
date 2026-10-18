import { describe, expect, it } from 'vitest';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, toolUse } from '../../lib/testing/index.ts';
import { loadCodebase } from '../../fixtures/codebase/files.ts';
import { asList, Sandbox } from '../19-config-mechanisms-and-context-fork/support/config-files.ts';
import type { Category, Finding } from './answer-key.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);
const box = Sandbox.forLesson(import.meta.url);
const codebase = loadCodebase();

type Schema = { properties?: Record<string, Schema>; items?: Schema; required?: string[]; enum?: string[]; type?: string | string[] };
const itemSchema = () => (lesson.FINDINGS_TOOL.input_schema as Schema).properties?.findings?.items;

describe('TODO(1) findings schema is a contract downstream code can rely on', () => {
  it('has a required findings array', () => {
    expect(lesson.FINDINGS_TOOL.input_schema.required).toContain('findings');
    expect(itemSchema()).toBeDefined();
  });
  it('constrains category and severity with enums', () => {
    expect(itemSchema()?.properties?.category?.enum).toEqual(['security', 'business-logic', 'api-design']);
    expect(itemSchema()?.properties?.severity?.enum).toEqual(['critical', 'high', 'medium', 'low']);
  });
  it('allows line to be null rather than forcing an invented number', () => {
    expect(itemSchema()?.properties?.line?.type).toEqual(expect.arrayContaining(['integer', 'null']));
  });
  it('requires every field, including the rule violated', () => {
    expect([...(itemSchema()?.required ?? [])].sort()).toEqual(['category', 'file', 'line', 'rule', 'severity', 'summary']);
  });
});

describe('TODO(2) specialised passes', () => {
  it('has exactly one pass per concern', () => {
    expect(lesson.PASSES.map((p) => p.category).sort()).toEqual(['api-design', 'business-logic', 'security']);
  });
  for (const category of ['security', 'business-logic', 'api-design'] as Category[]) {
    it(`${category}: focus names its concern and what to ignore`, () => {
      const pass = lesson.PASSES.find((p) => p.category === category)!;
      expect(pass.focus.toLowerCase()).toContain(category.split('-')[0]);
      expect(pass.focus).toMatch(/ignore/i);
    });
    it(`${category}: ≥2 few-shot findings of its own category plus a "fine as is" example`, () => {
      const pass = lesson.PASSES.find((p) => p.category === category)!;
      const positives = pass.examples.filter((e) => e.finding);
      expect(positives.length).toBeGreaterThanOrEqual(2);
      expect(positives.every((e) => e.finding!.category === category)).toBe(true);
      expect(pass.examples.some((e) => e.finding === null)).toBe(true);
    });
  }
});

describe('TODO(3) persistent conventions and exclusions', () => {
  const ctx = () => lesson.persistentContext(codebase['CONVENTIONS.md']!);
  it('includes the accepted patterns verbatim', () => {
    expect(ctx()).toContain('Accepted patterns (do NOT flag)');
    expect(ctx()).toContain('src/legacy/**');
  });
  it('states exclusion criteria', () => {
    expect(ctx()).toMatch(/never report|do not report/i);
  });
});

describe('TODO(4) buildPassRequest', () => {
  const security = () => lesson.PASSES.find((p) => p.category === 'security')!;
  const req = () => lesson.buildPassRequest(security(), codebase, 'test-model');
  it('carries focus, conventions and the pass examples in the system prompt', () => {
    const system = String(req().system);
    expect(system).toContain(security().focus);
    expect(system).toContain('Accepted patterns (do NOT flag)');
    expect(system).toContain(security().examples[0]!.code);
  });
  it('forces the structured-output tool', () => {
    expect(req().tool_choice).toEqual({ type: 'tool', name: 'report_findings' });
  });
  it('sends the source files', () => {
    expect(JSON.stringify(req().messages)).toContain('src/routes/orders.ts');
  });
});

describe('TODO(5) runReview', () => {
  const f = (category: Category, file: string, line: number | null, summary: string): Finding => ({
    category, severity: 'high', file, line, summary, rule: 'x',
  });
  const scripted = (params: MessageCreateParamsNonStreaming) => {
    const system = String(params.system);
    if (/security reviewer/i.test(system)) {
      return reply([toolUse('report_findings', { findings: [
        f('security', 'src/repositories/orderRepository.ts', 12, 'SQL injection'),
        f('business-logic', 'src/services/billingService.ts', 14, 'out of lane: rounding'),
      ] })]);
    }
    if (/business-logic reviewer/i.test(system)) {
      return reply([toolUse('report_findings', { findings: [
        f('business-logic', 'src/services/billingService.ts', 14, 'rounds per line'),
        f('business-logic', 'src/services/billingService.ts', 14, 'rounds per line (duplicate)'),
      ] })]);
    }
    return reply([toolUse('report_findings', { findings: [f('api-design', 'src/routes/orders.ts', 30, 'verb in path')] })]);
  };

  it('runs one request per pass', async () => {
    const client = new FakeClient([scripted, scripted, scripted]);
    await lesson.runReview(client, codebase);
    expect(client.calls).toHaveLength(3);
  });
  it('keeps each pass in its lane and de-duplicates', async () => {
    const client = new FakeClient([scripted, scripted, scripted]);
    const findings = await lesson.runReview(client, codebase);
    expect(findings.map((x) => `${x.category}:${x.line}`).sort()).toEqual(['api-design:30', 'business-logic:14', 'security:12']);
    expect(findings.some((x) => /out of lane/.test(x.summary))).toBe(false);
  });
});

describe('TODO(6) Claude Code review config (sandbox)', () => {
  const agents = () => box.list('.claude/agents').map((rel) => ({ rel, ...box.markdown(rel) }));

  it('defines one focused reviewer subagent per concern', () => {
    const focus = agents().map((a) => /You are an? ([\w -]+?) reviewer/i.exec(a.body)?.[1]?.toLowerCase() ?? '');
    expect(focus).toEqual(expect.arrayContaining(['security', 'business-logic', 'api design']));
  });
  it('every reviewer is read-only: an explicit tools allowlist without Edit, Write or Bash', () => {
    for (const a of agents()) {
      const tools = asList(a.frontmatter.tools);
      expect(tools.length, `${a.rel} must list tools (omitting them inherits everything)`).toBeGreaterThan(0);
      expect(tools.filter((t) => /^(Edit|Write|Bash|NotebookEdit)/.test(t)), a.rel).toEqual([]);
    }
  });
  it('every reviewer applies the conventions and their accepted patterns', () => {
    for (const a of agents()) expect(a.body, a.rel).toMatch(/Accepted patterns/);
  });
  it('every reviewer returns machine-readable JSON', () => {
    for (const a of agents()) expect(a.body, a.rel).toMatch(/"findings"/);
  });
  it('CLAUDE.md imports CONVENTIONS.md so the standards load in every session', () => {
    expect(box.text('CLAUDE.md')).toMatch(/^@CONVENTIONS\.md\s*$/m);
  });
  it('ships a JSON Schema for --json-schema in CI', () => {
    const schema = box.json<Schema>('.claude/review-schema.json');
    expect(schema.required).toContain('findings');
    expect(schema.properties?.findings?.items?.required).toContain('rule');
  });
});
