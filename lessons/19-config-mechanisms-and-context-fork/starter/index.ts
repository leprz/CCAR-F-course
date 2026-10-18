import type { Guidance, Mechanism } from '../scenarios.ts';

/**
 * TODO(1): pick the Claude Code mechanism for a piece of guidance, using its properties.
 * Ask, in this order: is it about which tools/files may be used? Must it happen every time with zero
 * exceptions? Is it a self-contained task? A procedure or rarely needed knowledge? Does it apply to only
 * part of the codebase? Otherwise it belongs in every session.
 */
export function chooseMechanism(_g: Guidance): Mechanism {
  return 'claude-md';
}
