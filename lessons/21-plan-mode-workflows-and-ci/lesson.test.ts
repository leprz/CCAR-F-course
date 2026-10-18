import { describe, expect, it } from 'vitest';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadLesson } from '../../lib/lesson.ts';
import { Sandbox } from '../19-config-mechanisms-and-context-fork/support/config-files.ts';
import { TASKS, type Approach } from './tasks.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);
const box = Sandbox.forLesson(import.meta.url);

const EXPECTED: Record<string, Approach> = {
  T1: 'direct',
  T2: 'direct',
  T3: 'plan-mode',
  T4: 'plan-mode',
  T5: 'multi-phase',
  T6: 'plan-mode',
  T7: 'multi-phase',
  T8: 'direct',
};

describe('TODO(1) chooseApproach', () => {
  for (const t of TASKS) {
    it(`${t.id}: ${t.text}`, () => {
      expect(lesson.chooseApproach(t)).toBe(EXPECTED[t.id]);
    });
  }
});

describe('TODO(2) buildCiArgs', () => {
  const job = {
    prompt: 'Review the diff for convention violations',
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash(git diff *)'],
    maxTurns: 12,
    maxBudgetUsd: 2.5,
    jsonSchema: { type: 'object', properties: { findings: { type: 'array' } }, required: ['findings'] },
    model: 'haiku',
  };
  const args = () => lesson.buildCiArgs(job);
  const flag = (name: string) => {
    const a = args();
    const i = a.indexOf(name);
    return i >= 0 ? a[i + 1] : undefined;
  };

  it('runs non-interactively with the prompt', () => {
    expect(flag('-p') ?? flag('--print')).toBe(job.prompt);
  });
  it('emits machine-readable JSON', () => {
    expect(flag('--output-format')).toBe('json');
  });
  it('locks permissions down instead of skipping them', () => {
    expect(args()).not.toContain('--dangerously-skip-permissions');
    expect(flag('--permission-mode')).toBe('dontAsk');
  });
  it("pre-approves exactly the job's tools", () => {
    expect(flag('--allowedTools')?.split(',')).toEqual(job.allowedTools);
  });
  it('caps turns and spend', () => {
    expect(flag('--max-turns')).toBe('12');
    expect(Number(flag('--max-budget-usd'))).toBe(2.5);
  });
  it('does not save a resumable session on the runner', () => {
    expect(args()).toContain('--no-session-persistence');
  });
  it('passes the JSON schema and model', () => {
    expect(JSON.parse(flag('--json-schema') ?? 'null')).toEqual(job.jsonSchema);
    expect(flag('--model')).toBe('haiku');
  });
});

describe('TODO(3) interpretResult', () => {
  const base = { type: 'result', duration_ms: 1, duration_api_ms: 1, num_turns: 3, total_cost_usd: 0.01, session_id: 's', uuid: 'u' };
  const success = { ...base, subtype: 'success', is_error: false, result: 'ok', structured_output: { findings: [] } } as unknown as SDKResultMessage;
  const maxTurns = { ...base, subtype: 'error_max_turns', is_error: true } as unknown as SDKResultMessage;
  const budget = { ...base, subtype: 'error_max_budget_usd', is_error: true } as unknown as SDKResultMessage;
  const failed = { ...base, subtype: 'error_during_execution', is_error: true } as unknown as SDKResultMessage;

  it('passes a successful run and prefers structured_output', () => {
    expect(lesson.interpretResult(success)).toEqual({ ok: true, reason: 'success', output: { findings: [] } });
  });
  it('fails a run that hit --max-turns', () => {
    expect(lesson.interpretResult(maxTurns)).toMatchObject({ ok: false, reason: 'max-turns' });
  });
  it('fails a run that hit --max-budget-usd', () => {
    expect(lesson.interpretResult(budget)).toMatchObject({ ok: false, reason: 'budget' });
  });
  it('fails a run that errored', () => {
    expect(lesson.interpretResult(failed)).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('TODO(4) CI workflow (sandbox)', () => {
  const run = () => {
    const wf = box.text('.github/workflows/claude-review.yml');
    const start = wf.indexOf('claude ');
    return wf.slice(start, wf.indexOf('\n      -', start) === -1 ? undefined : wf.indexOf('\n      -', start));
  };
  it('the claude step is non-interactive, JSON, locked down and capped', () => {
    expect(run()).toMatch(/claude -p /);
    expect(run()).toMatch(/--output-format json/);
    expect(run()).toMatch(/--permission-mode dontAsk/);
    expect(run()).not.toMatch(/--dangerously-skip-permissions/);
    expect(run()).toMatch(/--max-turns \d+/);
    expect(run()).toMatch(/--max-budget-usd [\d.]+/);
  });
  it('allows only read tools and scoped Bash', () => {
    const allowed = /--allowedTools "([^"]+)"/.exec(run())?.[1] ?? '';
    expect(allowed.split(',')).not.toContain('Bash');
    expect(allowed.split(',').some((t) => /^(Edit|Write)/.test(t))).toBe(false);
  });
  it('asks for review only (no fixing in CI)', () => {
    expect(run()).not.toMatch(/fix any problems/i);
  });
  it('gates the job on the JSON result', () => {
    expect(box.text('.github/workflows/claude-review.yml')).toMatch(/jq -e .*subtype == "success"/);
  });
});

describe('TODO(5) plan mode and multi-phase config (sandbox)', () => {
  it('billing repo starts every session in plan mode', () => {
    expect(box.json<{ permissions?: { defaultMode?: string } }>('.claude/settings.json').permissions?.defaultMode).toBe('plan');
  });
  it('the migration skill runs in phases with approval checkpoints and resumable progress', () => {
    const skill = box.markdown('.claude/skills/migrate-tests/SKILL.md');
    expect(skill.body.match(/^## Phase/gm)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(skill.body).toMatch(/wait for approval/i);
    expect(skill.body).toMatch(/progress/i);
    expect(skill.frontmatter['disable-model-invocation']).toBe(true);
  });
});
