import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the Ledgerly fixture codebase. */
export const CODEBASE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read the fixture's source files as `{ "src/...": contents }`. `ISSUES.md` (the answer key) is never included,
 * and neither is this loader.
 */
export function loadCodebase(opts: { include?: (relPath: string) => boolean } = {}): Record<string, string> {
  const include = opts.include ?? ((p: string) => p.startsWith('src/') || p === 'CONVENTIONS.md');
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(CODEBASE_DIR, abs).split(path.sep).join('/');
      if (entry.isDirectory()) walk(abs);
      else if (rel !== 'ISSUES.md' && rel !== 'files.ts' && include(rel)) out[rel] = readFileSync(abs, 'utf8');
    }
  };
  walk(CODEBASE_DIR);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
