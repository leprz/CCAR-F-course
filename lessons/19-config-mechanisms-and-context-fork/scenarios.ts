/** Pieces of guidance the Ledgerly team wants Claude Code to follow, described by their properties. */

export type Mechanism = 'claude-md' | 'path-rule' | 'skill' | 'hook' | 'permissions' | 'subagent';

export interface Guidance {
  id: string;
  text: string;
  /** Must it happen every time with zero exceptions (deterministic), or is it advice Claude should follow? */
  enforcement: 'advisory' | 'deterministic';
  /** A fact/convention, a multi-step procedure, a rule about which tools/files may be touched, or a self-contained task. */
  kind: 'fact' | 'procedure' | 'access' | 'isolated-task';
  /** Applies to the whole repo, or only when working on some paths. */
  scope: 'all-files' | 'some-paths';
  /** Needed in every session, or only occasionally / on request. */
  frequency: 'every-session' | 'occasional';
}

export const GUIDANCE: Guidance[] = [
  { id: 'G1', text: 'Money is integer cents; round once at the end with roundHalfEven.', enforcement: 'advisory', kind: 'fact', scope: 'all-files', frequency: 'every-session' },
  { id: 'G2', text: 'Route handlers: resource-oriented paths, httpError shape, call authorize first.', enforcement: 'advisory', kind: 'fact', scope: 'some-paths', frequency: 'every-session' },
  { id: 'G3', text: 'Run prettier on every file Claude edits.', enforcement: 'deterministic', kind: 'procedure', scope: 'all-files', frequency: 'every-session' },
  { id: 'G4', text: 'Claude must never read .env files.', enforcement: 'deterministic', kind: 'access', scope: 'some-paths', frequency: 'every-session' },
  { id: 'G5', text: 'Release checklist: bump version, write release notes, tag, push.', enforcement: 'advisory', kind: 'procedure', scope: 'all-files', frequency: 'occasional' },
  { id: 'G6', text: 'Audit the whole codebase for floating-point money math and report findings.', enforcement: 'advisory', kind: 'isolated-task', scope: 'all-files', frequency: 'occasional' },
  { id: 'G7', text: 'Tests use the makeOrder()/makeLine() factories and one describe per exported function.', enforcement: 'advisory', kind: 'fact', scope: 'some-paths', frequency: 'every-session' },
  { id: 'G8', text: 'Nothing under migrations/ may be edited by Claude.', enforcement: 'deterministic', kind: 'access', scope: 'some-paths', frequency: 'every-session' },
  { id: 'G9', text: "Background on the payment provider's webhook quirks, needed only when working on webhooks.", enforcement: 'advisory', kind: 'fact', scope: 'all-files', frequency: 'occasional' },
  { id: 'G10', text: 'The test suite must pass before Claude is allowed to finish a turn.', enforcement: 'deterministic', kind: 'procedure', scope: 'all-files', frequency: 'every-session' },
];
