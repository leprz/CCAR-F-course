import type { BuiltinTool, TaskId } from '../tool-tasks.ts';
import type { Workspace } from '../workspace.ts';

/**
 * Glob finds files by NAME, Grep finds lines by CONTENT (files / content / count modes), Read opens a KNOWN file
 * (or a window of it with offset/limit), Bash runs COMMANDS (git, tests, builds).
 */
export const TOOL_FOR_TASK: Record<TaskId, BuiltinTool> = {
  K1: 'Glob',
  K2: 'Grep',
  K3: 'Read',
  K4: 'Bash',
  K5: 'Bash',
  K6: 'Grep',
  K7: 'Read',
  K8: 'Grep',
  K9: 'Glob',
  K10: 'Bash',
};

export interface RouteFinding {
  method: string;
  path: string;
  file: string;
  line: number;
}

/**
 * "Which routes reach customer data without an authorization check?" answered incrementally:
 * narrow by name (Glob), locate by content (Grep), then read only a small window around each hit.
 * A handler counts as checked if it calls authorize( itself or hands req.principal to the service.
 */
export async function findUnauthorizedRoutes(ws: Workspace): Promise<RouteFinding[]> {
  const findings: RouteFinding[] = [];
  const routeFiles = ws.glob('src/routes/**/*.ts');
  for (const file of routeFiles) {
    const routeStarts = ws.grep(/method: '/, { glob: file, mode: 'content' });
    for (let i = 0; i < routeStarts.length; i++) {
      const start = routeStarts[i]!;
      const next = routeStarts[i + 1]?.line;
      const window = ws.read(file, { offset: start.line, limit: Math.min((next ?? start.line + 16) - start.line, 16) });
      const body = window.join('\n');
      const method = /method: '(\w+)'/.exec(body)?.[1] ?? '?';
      const path = /path: '([^']+)'/.exec(body)?.[1] ?? '?';
      if (!/authorize\(|req\.principal/.test(body)) findings.push({ method, path, file, line: start.line + 1 });
    }
  }
  return findings;
}

/**
 * A test-generation prompt that produces behavioural tests: the code under test and what it depends on,
 * existing tests to copy style and factories from, the project's test conventions, and explicit criteria
 * for what counts as a meaningful test.
 */
export function buildTestGenPrompt(codebase: Record<string, string>): { system: string; user: string } {
  const testsSection = /## Tests[\s\S]*?(?=\n## |$)/.exec(codebase['CONVENTIONS.md'] ?? '')?.[0] ?? '';
  const file = (rel: string) => `<file path="${rel}">\n${codebase[rel] ?? ''}\n</file>`;
  const system = [
    'You write Vitest tests for the Ledgerly codebase.',
    testsSection,
    'A test is meaningful only if it would fail when the behaviour is wrong. Every test must assert concrete',
    'expected values (exact cents) computed by hand from the business rules.',
    'Do NOT write tests whose only assertions are toBeDefined, toBeTruthy, typeof checks, not.toThrow, or mock',
    'call counts, and do not snapshot whole objects without stating the expected numbers.',
    'Reuse the makeOrder()/makeLine() factories from the existing tests instead of writing literals.',
    'Return one complete test file and nothing else.',
  ].join('\n');
  const user = [
    'Write tests for computeTotals. Cover: tax applied after the discount; rounding once at the end (half to even);',
    'discount larger than the subtotal; an order with several lines; a zero tax rate.',
    '',
    'Code under test and its dependency:',
    file('src/services/billingService.ts'),
    file('src/utils/money.ts'),
    '',
    'Existing tests (match their style and reuse their factories):',
    file('tests/orderRepository.spec.ts.txt'),
    file('tests/billingService.spec.ts.txt'),
  ].join('\n');
  return { system, user };
}

const TRIVIAL_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeInstanceOf', 'toHaveBeenCalled', 'toHaveBeenCalledTimes', 'toThrow']);

/** True when a test file has no assertion that pins down a concrete behaviour. */
export function isTrivialTest(source: string): boolean {
  const assertions = [...source.matchAll(/expect\(([\s\S]*?)\)\s*\.(not\.)?(\w+)\(/g)];
  if (assertions.length === 0) return true;
  return assertions.every(([, subject, , matcher]) => {
    if (TRIVIAL_MATCHERS.has(matcher!)) return true;
    return /^\s*typeof\b/.test(subject!);
  });
}
