import type { Guidance, Mechanism } from '../scenarios.ts';

/**
 * Pick the Claude Code mechanism for a piece of guidance. Order matters: the first rule that matches wins.
 *
 *  1. Which tools/files may be used        → settings permissions (deny rules block in every mode)
 *  2. Must happen every time, no exceptions → hook (deterministic; CLAUDE.md is only advisory)
 *  3. Self-contained task needing isolation → subagent (or a skill with `context: fork`)
 *  4. Procedure, or knowledge needed rarely → skill (body loads only when invoked)
 *  5. Convention for part of the codebase   → `.claude/rules/*.md` with `paths:` globs
 *  6. Convention for every session          → CLAUDE.md
 */
export function chooseMechanism(g: Guidance): Mechanism {
  if (g.kind === 'access') return 'permissions';
  if (g.enforcement === 'deterministic') return 'hook';
  if (g.kind === 'isolated-task') return 'subagent';
  if (g.kind === 'procedure' || g.frequency === 'occasional') return 'skill';
  if (g.scope === 'some-paths') return 'path-rule';
  return 'claude-md';
}
