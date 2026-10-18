/** Change requests the Ledgerly team hands to Claude Code. */

export type Approach = 'direct' | 'plan-mode' | 'multi-phase';

export interface ChangeTask {
  id: string;
  text: string;
  /** Files expected to change; 'unknown' when nobody knows yet. */
  filesTouched: number | 'unknown';
  risk: 'low' | 'medium' | 'high';
  /** Is the way to do it already clear? */
  approachKnown: boolean;
  /** Must a human approve the plan before any file is edited? */
  approvalBeforeEdits: boolean;
  /** Independent repeated work items (e.g. files to migrate). */
  units: number;
  /** Distinct stages that each need sign-off before the next starts. */
  stagesNeedingSignOff: number;
}

export const TASKS: ChangeTask[] = [
  { id: 'T1', text: 'Fix a typo in README.md', filesTouched: 1, risk: 'low', approachKnown: true, approvalBeforeEdits: false, units: 1, stagesNeedingSignOff: 0 },
  { id: 'T2', text: 'Add a debug log line in OrderService.getOrder', filesTouched: 1, risk: 'low', approachKnown: true, approvalBeforeEdits: false, units: 1, stagesNeedingSignOff: 0 },
  { id: 'T3', text: 'Add Google OAuth login', filesTouched: 'unknown', risk: 'medium', approachKnown: false, approvalBeforeEdits: false, units: 1, stagesNeedingSignOff: 0 },
  { id: 'T4', text: 'Change how invoice totals are rounded; the billing lead must approve the approach first', filesTouched: 2, risk: 'high', approachKnown: true, approvalBeforeEdits: true, units: 1, stagesNeedingSignOff: 0 },
  { id: 'T5', text: 'Migrate 400 test files from Jest to Vitest', filesTouched: 400, risk: 'medium', approachKnown: true, approvalBeforeEdits: false, units: 400, stagesNeedingSignOff: 0 },
  { id: 'T6', text: 'Find out why the pagination test is flaky and fix it', filesTouched: 'unknown', risk: 'low', approachKnown: false, approvalBeforeEdits: false, units: 1, stagesNeedingSignOff: 0 },
  { id: 'T7', text: 'Extract billing into its own service: schema change, API change, then data backfill, each signed off', filesTouched: 'unknown', risk: 'high', approachKnown: false, approvalBeforeEdits: true, units: 1, stagesNeedingSignOff: 3 },
  { id: 'T8', text: 'Rename the local variable `tmp` to `subtotalCents` in computeTotals', filesTouched: 1, risk: 'low', approachKnown: true, approvalBeforeEdits: false, units: 1, stagesNeedingSignOff: 0 },
];
