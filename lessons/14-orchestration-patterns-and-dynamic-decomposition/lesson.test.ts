import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { sources, type ClaimId } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
type Subtask = import('./solution/index.ts').Subtask;
type WorkerResult = import('./solution/index.ts').WorkerResult;
const lesson = await loadLesson<Lesson>(import.meta.url);

/**
 * Deterministic stand-in for a research worker, built from the fixture corpus.
 * A survey returns every finding on its claim, plus leads to the other claims those same sources mention.
 * A follow-up returns a resolution and nothing new.
 */
function fixtureWorker(log: Subtask[] = []) {
  return async (task: Subtask): Promise<WorkerResult> => {
    log.push(task);
    await new Promise((r) => setTimeout(r, 5));
    if (task.kind === 'follow-up') {
      return { taskId: task.id, findings: [], leads: [], resolution: `Compared ${task.sourceIds.join(', ')}.` };
    }
    const relevant = sources.filter((s) => s.findings.some((f) => f.claim === task.claim));
    const findings = relevant.flatMap((s) =>
      s.findings.filter((f) => f.claim === task.claim).map((f) => ({ claim: f.claim, sourceId: s.id, direction: f.direction, statement: f.statement })),
    );
    const leads = [...new Set(relevant.flatMap((s) => s.findings.map((f) => f.claim)))]
      .filter((c) => c !== task.claim)
      .map((claim) => ({ claim, reason: `mentioned alongside ${task.claim}` }));
    return { taskId: task.id, findings, leads };
  };
}

const ids = (tasks: Subtask[]) => tasks.map((t) => t.id);

describe('TODO(1) choosePattern', () => {
  const base = { complexity: 'broad', subtasksKnownUpfront: false, stepsDependOnPreviousOutput: false, heavySharedContext: false } as const;

  it('keeps a one-fact lookup in a single agent', () => {
    expect(lesson.choosePattern({ ...base, complexity: 'simple' })).toBe('single-agent');
  });
  it('keeps tightly coupled work (shared context, same files) in a single agent', () => {
    expect(lesson.choosePattern({ ...base, heavySharedContext: true })).toBe('single-agent');
  });
  it('chains steps that consume each other\'s output', () => {
    expect(lesson.choosePattern({ ...base, complexity: 'comparison', stepsDependOnPreviousOutput: true })).toBe('sequential-pipeline');
  });
  it('fans out known, independent subtasks in parallel', () => {
    expect(lesson.choosePattern({ ...base, complexity: 'comparison', subtasksKnownUpfront: true })).toBe('parallel-fanout');
  });
  it('uses a coordinator when the subtasks cannot be predicted up front', () => {
    expect(lesson.choosePattern(base)).toBe('coordinator-worker');
  });
});

describe('TODO(2) effortFor', () => {
  it('matches the effort-scaling rules', () => {
    expect(lesson.effortFor('simple')).toEqual({ minSubagents: 1, maxSubagents: 1, toolCallsPerAgent: [3, 10] });
    expect(lesson.effortFor('comparison')).toEqual({ minSubagents: 2, maxSubagents: 4, toolCallsPerAgent: [10, 15] });
    expect(lesson.effortFor('broad').minSubagents).toBeGreaterThanOrEqual(10);
  });
});

describe('TODO(3) a round runs in parallel', () => {
  it('starts every task of the first round before any finishes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const worker = fixtureWorker();
    await lesson.runResearch(
      async (t) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const r = await worker(t);
        inFlight--;
        return r;
      },
      { maxRounds: 1 },
    );
    expect(maxInFlight).toBe(3);
  });
});

describe('TODO(4) findConflicts', () => {
  const f = (claim: ClaimId, sourceId: string, direction: 'improves' | 'worsens' | 'no-change' | 'mixed') => ({ claim, sourceId, direction, statement: '' });

  it('flags claims whose sources disagree, in CLAIM_ORDER', () => {
    expect(
      lesson.findConflicts([
        f('output', 'S1', 'no-change'),
        f('output', 'S9', 'worsens'),
        f('retention', 'S1', 'improves'),
        f('retention', 'S3', 'improves'),
        f('wellbeing', 'S1', 'improves'),
        f('wellbeing', 'S7', 'mixed'),
      ]),
    ).toEqual(['wellbeing', 'output']);
  });
  it('does not flag agreement', () => {
    expect(lesson.findConflicts([f('retention', 'S1', 'improves'), f('retention', 'S9', 'improves')])).toEqual([]);
  });
});

describe('TODO(5) nextTasks adapts to findings', () => {
  it('turns leads into surveys and conflicts into targeted follow-ups', async () => {
    const worker = fixtureWorker();
    const first = await Promise.all(lesson.initialPlan().map((t) => worker(t)));
    const planned = new Set(ids(lesson.initialPlan()));
    const next = lesson.nextTasks(first, planned);

    expect(ids(next)).toEqual(['survey:on-call', 'survey:collaboration', 'follow-up:wellbeing', 'follow-up:output']);
    const output = next.find((t) => t.id === 'follow-up:output')!;
    expect(output.kind).toBe('follow-up');
    expect(output.sourceIds).toEqual(['S1', 'S2', 'S3', 'S5', 'S6', 'S7', 'S9', 'S10']);
  });

  it('never re-plans a task that was already planned', async () => {
    const worker = fixtureWorker();
    const first = await Promise.all(lesson.initialPlan().map((t) => worker(t)));
    const planned = new Set([...ids(lesson.initialPlan()), 'survey:on-call', 'follow-up:output']);
    expect(ids(lesson.nextTasks(first, planned))).toEqual(['survey:collaboration', 'follow-up:wellbeing']);
  });
});

describe('TODO(6) runResearch loops until nothing new, within budgets', () => {
  it('discovers new claims and resolves conflicts over several rounds', async () => {
    const run = await lesson.runResearch(fixtureWorker());
    expect(run.rounds.map(ids)).toEqual([
      ['survey:wellbeing', 'survey:output', 'survey:retention'],
      ['survey:on-call', 'survey:collaboration', 'follow-up:wellbeing', 'follow-up:output'],
      ['follow-up:on-call', 'follow-up:collaboration'],
    ]);
    expect(run.stoppedBy).toBe('no-new-tasks');
    expect(run.unexplored).toEqual([]);
    expect(run.results).toHaveLength(9);
  });

  it('stops at maxRounds and reports what it did not explore', async () => {
    const run = await lesson.runResearch(fixtureWorker(), { maxRounds: 2 });
    expect(run.rounds).toHaveLength(2);
    expect(run.stoppedBy).toBe('max-rounds');
    expect(ids(run.unexplored)).toEqual(['follow-up:on-call', 'follow-up:collaboration']);
  });

  it('never runs more than maxTasks tasks in total', async () => {
    const log: Subtask[] = [];
    const run = await lesson.runResearch(fixtureWorker(log), { maxTasks: 5 });
    expect(log).toHaveLength(5);
    expect(run.stoppedBy).toBe('max-tasks');
    expect(ids(run.unexplored)).toEqual(['follow-up:wellbeing', 'follow-up:output']);
  });
});
