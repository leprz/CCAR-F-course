/** Everyday codebase tasks. Which built-in Claude Code tool fits each one? */

export type BuiltinTool = 'Grep' | 'Glob' | 'Read' | 'Bash';

export const TOOL_TASKS = {
  K1: 'Find every test file in the repo (they end in .spec.ts.txt).',
  K2: 'Find every place that calls authorize(.',
  K3: 'See the body of computeTotals; you already know it is in src/services/billingService.ts.',
  K4: 'List the files changed on this branch compared with main.',
  K5: 'Run the test suite to check a fix.',
  K6: 'Find which file defines class OrderRepository.',
  K7: 'Look at lines 4,000–4,080 of a 20,000-line log file.',
  K8: 'Count how many TODO comments each file has.',
  K9: 'Find all config files named *.config.ts at any depth.',
  K10: 'See who last changed computeTotals and why (commit history).',
} as const;

export type TaskId = keyof typeof TOOL_TASKS;
