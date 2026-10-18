import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { sources, type ClaimId, type ResearchSource } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

type Workers = import('./solution/index.ts').Workers;
type PipelineState = import('./solution/index.ts').PipelineState;

const tmpFile = async () => path.join(await mkdtemp(path.join(tmpdir(), 'pipeline-')), 'state.json');

/** Fake stage workers that record every call. `fail` decides per collect call: throw a crash, an error, or nothing. */
function workers(opts: { fail?: (s: ResearchSource) => Error | undefined } = {}) {
  const calls: string[] = [];
  const w: Workers = {
    async collect(source) {
      calls.push(`collect:${source.id}`);
      const err = opts.fail?.(source);
      if (err) throw err;
      return source.findings.map((f) => ({ ...f, sourceId: source.id }));
    },
    async analyze(claim: ClaimId, findings) {
      calls.push(`analyze:${claim}`);
      return { claim, verdict: [...new Set(findings.map((f) => f.direction))].join('/'), sourceIds: findings.map((f) => f.sourceId) };
    },
    async report(analyses, gaps) {
      calls.push('report');
      return [...analyses.map((a) => `${a.claim}: ${a.verdict}`), ...gaps.map((g) => `GAP ${g}`)].join('\n');
    },
  };
  return { w, calls };
}

const readState = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as PipelineState;

describe('TODO(1) hashInput', () => {
  it('is stable for the same content regardless of key order', () => {
    expect(lesson.hashInput({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(lesson.hashInput({ b: { d: [1, 2], c: 2 }, a: 1 }));
  });
  it('changes when content changes, including array order', () => {
    expect(lesson.hashInput({ a: 1 })).not.toBe(lesson.hashInput({ a: 2 }));
    expect(lesson.hashInput([1, 2])).not.toBe(lesson.hashInput([2, 1]));
  });
});

describe('TODO(2) atomic checkpoint writes', () => {
  it('writes a temp file in the same directory, then renames it over the checkpoint', async () => {
    const ops: string[] = [];
    const store = new lesson.StateStore('/data/run/state.json', {
      readFile: async () => '{}',
      writeFile: async (f) => void ops.push(`write ${f}`),
      rename: async (a, b) => void ops.push(`rename ${a} -> ${b}`),
    });
    await store.save({ version: 1, tasks: {} });

    expect(ops).toHaveLength(2);
    const tmp = ops[0]!.replace('write ', '');
    expect(tmp).not.toBe('/data/run/state.json');
    expect(path.dirname(tmp)).toBe('/data/run');
    expect(ops[1]).toBe(`rename ${tmp} -> /data/run/state.json`);
  });

  it('starts from an empty state when there is no checkpoint yet', async () => {
    const store = new lesson.StateStore(await tmpFile());
    await expect(store.load()).resolves.toEqual({ version: 1, tasks: {} });
  });
});

describe('TODO(3) recoverState', () => {
  const state: PipelineState = {
    version: 1,
    tasks: {
      a: { id: 'a', inputHash: 'h', status: 'done', attempts: 1, output: 42 },
      b: { id: 'b', inputHash: 'h', status: 'running', attempts: 1 },
      c: { id: 'c', inputHash: 'h', status: 'failed', attempts: 1, error: 'x' },
      d: { id: 'd', inputHash: 'h', status: 'failed', attempts: 3, error: 'x' },
    },
  };

  it('re-queues interrupted and retryable work, keeps finished work as is', () => {
    const r = lesson.recoverState(state, 3);
    expect(r.tasks.a).toEqual(state.tasks.a);
    expect(r.tasks.b?.status).toBe('pending');
    expect(r.tasks.c?.status).toBe('pending');
    expect(r.tasks.d?.status).toBe('failed');
  });
  it('does not mutate the loaded state', () => {
    lesson.recoverState(state, 3);
    expect(state.tasks.b?.status).toBe('running');
  });
});

describe('TODO(4) checkpoint per task and resume after a crash', () => {
  it('a crash keeps every finished task on disk', async () => {
    const file = await tmpFile();
    const { w } = workers({ fail: (s) => (s.id === 'S5' ? new lesson.CrashError('killed') : undefined) });
    await expect(lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: w })).rejects.toBeInstanceOf(lesson.CrashError);

    const saved = await readState(file);
    for (const id of ['S1', 'S2', 'S3', 'S4']) expect(saved.tasks[`collect:${id}`]?.status).toBe('done');
    expect(saved.tasks['collect:S5']?.status).toBe('running');
  });

  it('the next run picks up where the crash happened, without redoing finished work', async () => {
    const file = await tmpFile();
    const crashing = workers({ fail: (s) => (s.id === 'S5' ? new lesson.CrashError('killed') : undefined) });
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: crashing.w }).catch(() => {});

    const resumed = workers();
    const summary = await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: resumed.w });

    expect(resumed.calls.filter((c) => c.startsWith('collect'))).toEqual(
      ['S5', 'S6', 'S7', 'S8', 'S9', 'S10'].map((id) => `collect:${id}`),
    );
    expect(summary.skipped).toEqual(['S1', 'S2', 'S3', 'S4'].map((id) => `collect:${id}`));
    expect(summary.report).toMatch(/output: /);
  });

  it('a third run with nothing changed does no work at all', async () => {
    const file = await tmpFile();
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: workers().w });
    const again = workers();
    const summary = await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: again.w });
    expect(again.calls).toEqual([]);
    expect(summary.executed).toEqual([]);
    expect(summary.skipped).toHaveLength(10 + 5 + 1);
  });

  it('a changed input re-runs only that task and what depends on it', async () => {
    const file = await tmpFile();
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: workers().w });

    const edited = sources.map((s) =>
      s.id === 'S9' ? { ...s, findings: s.findings.map((f) => ({ ...f, statement: f.statement + ' (revised)' })) } : s,
    );
    const again = workers();
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources: edited, workers: again.w });
    // The report's input is the analyses. They came out identical, so the report is reused too.
    expect(again.calls).toEqual(['collect:S9', 'analyze:retention', 'analyze:output']);
  });
});

describe('TODO(5) one failing task does not sink the run', () => {
  it('records the failure, finishes everything else, and reports the gap', async () => {
    const file = await tmpFile();
    const { w } = workers({ fail: (s) => (s.id === 'S6' ? new Error('PDF parse failed') : undefined) });
    const summary = await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: w });

    expect(summary.failed).toEqual(['collect:S6']);
    expect(summary.report).toMatch(/GAP collect:S6/);
    const saved = await readState(file);
    expect(saved.tasks['collect:S6']).toMatchObject({ status: 'failed', attempts: 1, error: 'PDF parse failed' });
    expect(saved.tasks['collect:S7']?.status).toBe('done');
  });

  it('a later run retries only the failed task and what depends on it', async () => {
    const file = await tmpFile();
    const failing = workers({ fail: (s) => (s.id === 'S6' ? new Error('PDF parse failed') : undefined) });
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: failing.w });

    const fixed = workers();
    await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: fixed.w });
    expect(fixed.calls).toEqual(['collect:S6', 'analyze:output', 'report']);
  });

  it('gives up on a task after maxAttempts', async () => {
    const file = await tmpFile();
    const always = workers({ fail: (s) => (s.id === 'S6' ? new Error('still broken') : undefined) });
    for (let i = 0; i < 3; i++) {
      await lesson.runPipeline({ store: new lesson.StateStore(file), sources, workers: always.w, maxAttempts: 2 });
    }
    expect(always.calls.filter((c) => c === 'collect:S6')).toHaveLength(2);
  });
});
