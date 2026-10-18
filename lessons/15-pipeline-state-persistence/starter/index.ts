import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import type { ClaimId, ResearchSource, SourceFinding } from '../../../fixtures/research/index.ts';

/**
 * A three-stage research pipeline that survives being killed at any point:
 *   collect:S<n>  (one per source)  → findings
 *   analyze:<claim> (one per claim)  → classification
 *   report          (one)            → markdown
 * State lives in a checkpoint file outside any model session: the session transcript is not the source of truth.
 */

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TaskRecord {
  id: string;
  inputHash: string;
  status: TaskStatus;
  attempts: number;
  output?: unknown;
  error?: string;
}

export interface PipelineState {
  version: 1;
  tasks: Record<string, TaskRecord>;
}

export interface CollectedFinding extends SourceFinding {
  sourceId: string;
}

export interface Analysis {
  claim: ClaimId;
  verdict: string;
  sourceIds: string[];
}

export interface Workers {
  collect(source: ResearchSource): Promise<CollectedFinding[]>;
  analyze(claim: ClaimId, findings: CollectedFinding[]): Promise<Analysis>;
  report(analyses: Analysis[], gaps: string[]): Promise<string>;
}

/** Thrown by tests to simulate the process dying mid-task. Never caught as an ordinary task failure. */
export class CrashError extends Error {}

// ---------- hashing ----------

/**
 * TODO(1): this hash decides whether a finished task can be reused. The same content must always produce the same
 * hash, even when object keys come in a different order (e.g. data re-read from another system). Arrays keep their order.
 */
export function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// ---------- the store ----------

export interface StoreIO {
  readFile(file: string): Promise<string>;
  writeFile(file: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

const nodeIO: StoreIO = {
  readFile: (f) => fsp.readFile(f, 'utf8'),
  writeFile: (f, d) => fsp.writeFile(f, d, 'utf8'),
  rename: (a, b) => fsp.rename(a, b),
};

export class StateStore {
  constructor(
    readonly file: string,
    private readonly io: StoreIO = nodeIO,
  ) {}

  async load(): Promise<PipelineState> {
    try {
      return JSON.parse(await this.io.readFile(this.file)) as PipelineState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, tasks: {} };
      throw err;
    }
  }

  /**
   * TODO(2): a crash in the middle of this write leaves a truncated checkpoint, and every finding is lost.
   * Make the save atomic: write a temp file in the same directory, then rename it over the checkpoint.
   */
  async save(state: PipelineState): Promise<void> {
    await this.io.writeFile(this.file, JSON.stringify(state, null, 2));
  }
}

// ---------- recovery ----------

/**
 * TODO(3): prepare a loaded checkpoint for a new run (return a new object, don't mutate the input):
 *  - `running` means the process died mid-task, so the task goes back to `pending`
 *  - `failed` goes back to `pending` while attempts < maxAttempts, and stays `failed` after that
 *  - `done` is kept exactly as it is
 */
export function recoverState(state: PipelineState, _maxAttempts = 3): PipelineState {
  return state;
}

// ---------- the pipeline ----------

export interface RunSummary {
  executed: string[];
  skipped: string[];
  failed: string[];
  report?: string;
}

const CLAIMS: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];

export async function runPipeline(opts: {
  store: StateStore;
  sources: ResearchSource[];
  workers: Workers;
  maxAttempts?: number;
}): Promise<RunSummary> {
  const { store, workers } = opts;
  const state = recoverState(await store.load(), opts.maxAttempts);
  const summary: RunSummary = { executed: [], skipped: [], failed: [] };

  /**
   * Runs one task. Today it redoes every task on every run, saves nothing until the very end, and a single failing
   * task throws away the whole run.
   *
   * TODO(4): reuse and checkpoint.
   *  - a task that is `done` with the same inputHash is skipped (push its id to summary.skipped) and its stored
   *    output is returned. A changed input hash means the task must run again.
   *  - before doing the work, record the task as `running` (attempts + 1) and save. After it succeeds, record
   *    `done` with its output, push to summary.executed, and save. Checkpoint per task, not per run.
   * TODO(5): failure isolation. An ordinary error marks the task `failed` with its error message, pushes it to
   *  summary.failed, saves, and returns undefined so the run continues. A CrashError (the process dying) must still
   *  propagate. A task that is already `failed` with maxAttempts attempts and the same input is not retried.
   */
  async function step<T>(id: string, input: unknown, work: () => Promise<T>): Promise<T | undefined> {
    const output = await work();
    state.tasks[id] = { id, inputHash: hashInput(input), status: 'done', attempts: 1, output };
    summary.executed.push(id);
    return output;
  }

  const collected: CollectedFinding[] = [];
  const gaps: string[] = [];
  for (const source of opts.sources) {
    const out = await step(`collect:${source.id}`, source, () => workers.collect(source));
    if (out) collected.push(...out);
    else gaps.push(`collect:${source.id} failed; its findings are missing`);
  }

  const analyses: Analysis[] = [];
  for (const claim of CLAIMS) {
    const findings = collected.filter((f) => f.claim === claim).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    if (findings.length === 0) continue;
    const out = await step(`analyze:${claim}`, { claim, findings }, () => workers.analyze(claim, findings));
    if (out) analyses.push(out);
    else gaps.push(`analyze:${claim} failed`);
  }

  summary.report = await step('report', { analyses, gaps }, () => workers.report(analyses, gaps));
  await store.save(state);
  return summary;
}
