import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Approach, ChangeTask } from '../tasks.ts';

/**
 * - multi-phase: many independent units (fan out in batches) or several stages that each need sign-off
 * - plan-mode:   approach unclear, scope unknown or multi-file, high risk, or a human must approve before edits
 * - direct:      clear, small, low-risk ("you could describe the diff in one sentence")
 */
export function chooseApproach(t: ChangeTask): Approach {
  if (t.units >= 20 || t.stagesNeedingSignOff >= 2) return 'multi-phase';
  const multiFile = t.filesTouched === 'unknown' || t.filesTouched > 1;
  if (!t.approachKnown || t.approvalBeforeEdits || t.risk === 'high' || multiFile) return 'plan-mode';
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

/** Arguments for an unattended `claude` run in CI. */
export function buildCiArgs(job: CiJob): string[] {
  const args = [
    '-p', job.prompt,
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--allowedTools', job.allowedTools.join(','),
    '--max-turns', String(job.maxTurns),
    '--max-budget-usd', job.maxBudgetUsd.toFixed(2),
    '--no-session-persistence',
  ];
  if (job.jsonSchema) args.push('--json-schema', JSON.stringify(job.jsonSchema));
  if (job.model) args.push('--model', job.model);
  return args;
}

export interface CiOutcome {
  ok: boolean;
  reason: 'success' | 'max-turns' | 'budget' | 'error';
  output: unknown;
}

/** Turn the `--output-format json` result into a pass/fail CI decision. Hitting a limit is a failure. */
export function interpretResult(result: SDKResultMessage): CiOutcome {
  if (result.subtype === 'success' && !result.is_error) {
    return { ok: true, reason: 'success', output: result.structured_output ?? result.result };
  }
  const reason = result.subtype === 'error_max_turns' ? 'max-turns' : result.subtype === 'error_max_budget_usd' ? 'budget' : 'error';
  return { ok: false, reason, output: null };
}
