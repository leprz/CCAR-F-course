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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Content hash of a task's input: same content → same hash, regardless of key order or when it runs. */
export function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
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

  /** Write a temp file, then rename over the checkpoint. A crash mid-write leaves the previous checkpoint intact. */
  async save(state: PipelineState): Promise<void> {
    const tmp = path.join(path.dirname(this.file), `.${path.basename(this.file)}.${process.pid}.tmp`);
    await this.io.writeFile(tmp, JSON.stringify(state, null, 2));
    await this.io.rename(tmp, this.file);
  }
}

// ---------- recovery ----------

/**
 * A task found `running` at load time was interrupted, so its output (if any) can't be trusted: run it again.
 * Failed tasks get another try until they reach maxAttempts. Done tasks are kept exactly as they are.
 */
export function recoverState(state: PipelineState, maxAttempts = 3): PipelineState {
  const tasks: Record<string, TaskRecord> = {};
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.status === 'running') tasks[id] = { ...t, status: 'pending' };
    else if (t.status === 'failed' && t.attempts < maxAttempts) tasks[id] = { ...t, status: 'pending' };
    else tasks[id] = t;
  }
  return { ...state, tasks };
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
   * Skip a task whose input is unchanged and whose output is done. Otherwise checkpoint `running`, do the work,
   * and checkpoint the result. An ordinary failure is recorded and the run continues; a crash propagates.
   */
  async function step<T>(id: string, input: unknown, work: () => Promise<T>): Promise<T | undefined> {
    const inputHash = hashInput(input);
    const prev = state.tasks[id];
    if (prev?.status === 'done' && prev.inputHash === inputHash) {
      summary.skipped.push(id);
      return prev.output as T;
    }
    if (prev?.status === 'failed' && prev.inputHash === inputHash && prev.attempts >= (opts.maxAttempts ?? 3)) {
      summary.failed.push(id);
      return undefined;
    }
    const attempts = prev?.inputHash === inputHash ? prev.attempts : 0;
    state.tasks[id] = { id, inputHash, status: 'running', attempts: attempts + 1 };
    await store.save(state);
    try {
      const output = await work();
      state.tasks[id] = { id, inputHash, status: 'done', attempts: attempts + 1, output };
      summary.executed.push(id);
      await store.save(state);
      return output;
    } catch (err) {
      if (err instanceof CrashError) throw err;
      state.tasks[id] = { id, inputHash, status: 'failed', attempts: attempts + 1, error: err instanceof Error ? err.message : String(err) };
      summary.failed.push(id);
      await store.save(state);
      return undefined;
    }
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
  return summary;
}
