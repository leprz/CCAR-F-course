import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Approach, ChangeTask } from '../tasks.ts';

/**
 * TODO(1): choose how Claude Code should take on a change:
 *  - 'direct'      for small, clear, low-risk changes
 *  - 'plan-mode'   when the approach or scope is unclear, risk is high, several files change, or a human must
 *                  approve before edits
 *  - 'multi-phase' when there are many repeated units of work or several stages that each need sign-off
 */
export function chooseApproach(_t: ChangeTask): Approach {
  return 'direct';
}

export interface CiJob {
  prompt: string;
  /** Exact tools the job needs; Bash only with a command pattern, e.g. "Bash(git diff *)". */
  allowedTools: string[];
  maxTurns: number;
  maxBudgetUsd: number;
  jsonSchema?: object;
  model?: string;
}

/**
 * TODO(2): this works on a laptop but hangs or runs away in CI. Make it a non-interactive run with JSON output,
 * a locked-down permission mode instead of skipping permissions, the job's tool allowlist, turn and budget caps,
 * no saved session, and the JSON schema (and model) when the job has one.
 */
export function buildCiArgs(job: CiJob): string[] {
  return ['--dangerously-skip-permissions', job.prompt];
}

export interface CiOutcome {
  ok: boolean;
  reason: 'success' | 'max-turns' | 'budget' | 'error';
  output: unknown;
}

/**
 * TODO(3): the run's JSON result says whether it succeeded. A run that hit its turn or budget cap is a failed CI
 * step, not a pass. Return the structured output when present, else the text result.
 */
export function interpretResult(result: SDKResultMessage): CiOutcome {
  return { ok: true, reason: 'success', output: 'result' in result ? result.result : null };
}
