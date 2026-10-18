import type { BuiltinTool, TaskId } from '../tool-tasks.ts';
import type { Workspace } from '../workspace.ts';

/**
 * TODO(1): pick the built-in tool for each task in tool-tasks.ts.
 * Hint: what are you searching by (a file's NAME, a file's CONTENT), do you already know the file, or do you
 * need to RUN something?
 */
export const TOOL_FOR_TASK: Record<TaskId, BuiltinTool> = {
  K1: 'Bash',
  K2: 'Bash',
  K3: 'Bash',
  K4: 'Bash',
  K5: 'Bash',
  K6: 'Bash',
  K7: 'Bash',
  K8: 'Bash',
  K9: 'Bash',
  K10: 'Bash',
};

export interface RouteFinding {
  method: string;
  path: string;
  file: string;
  line: number;
}

/**
 * TODO(2): "Which routes reach customer data without an authorization check?"
 * This version reads every source file in full, which floods the context window, and then flags any route
 * whose own text lacks `authorize(`, even when the handler passes `req.principal` to a service that checks it.
 * Rewrite it to explore incrementally: find route files by name, locate each route definition by content, and
 * read only a small window (≤ 16 lines) around it. A handler counts as checked if it calls `authorize(` or
 * passes `req.principal` on. Report the line of each flagged route's `path:`.
 */
export async function findUnauthorizedRoutes(ws: Workspace): Promise<RouteFinding[]> {
  const findings: RouteFinding[] = [];
  for (const file of ws.glob('src/**/*.ts')) {
    const lines = ws.read(file);
    if (!file.startsWith('src/routes/')) continue;
    lines.forEach((text, i) => {
      const path = /path: '([^']+)'/.exec(text)?.[1];
      if (path && !lines.join('\n').includes('authorize(')) findings.push({ method: '?', path, file, line: i + 1 });
    });
  }
  return findings;
}

/**
 * TODO(3): a prompt that produces behavioural tests for computeTotals. Give the model: the code under test and the
 * module it depends on, the existing test files (style and the makeOrder/makeLine factories), the "## Tests"
 * section of CONVENTIONS.md, and explicit criteria: concrete expected values, no toBeDefined/typeof/not.toThrow/mock
 * call-count-only tests, and the edge cases to cover (tax after discount, rounding once, discount > subtotal).
 */
export function buildTestGenPrompt(codebase: Record<string, string>): { system: string; user: string } {
  return {
    system: 'You write tests.',
    user: `Write tests for computeTotals.\n\n${codebase['src/services/billingService.ts'] ?? ''}`,
  };
}

/**
 * TODO(4): flag a generated test as trivial when none of its assertions pins down a concrete behaviour: no
 * expect() at all, or only toBeDefined / toBeTruthy / toBeFalsy / toBeInstanceOf / toThrow (incl. not.toThrow) /
 * toHaveBeenCalled(Times), or `typeof x` checks.
 */
export function isTrivialTest(_source: string): boolean {
  return false;
}
