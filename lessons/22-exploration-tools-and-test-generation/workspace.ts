/**
 * A tiny model of Claude Code's search/read tools over the Ledgerly fixture, with a meter for how much text
 * reaches the context window. Lessons call these like an agent would, and tests read the meter.
 */
import { loadCodebase } from '../../fixtures/codebase/files.ts';
import { matchesGlob } from '../19-config-mechanisms-and-context-fork/support/config-files.ts';

export interface GrepHit {
  file: string;
  line: number;
  text: string;
}

export interface ToolCall {
  tool: 'Glob' | 'Grep' | 'Read';
  arg: string;
  chars: number;
}

export class Workspace {
  readonly calls: ToolCall[] = [];
  private readonly files: Record<string, string>;

  constructor(files: Record<string, string> = loadCodebase({ include: (p) => p.startsWith('src/') || p.startsWith('tests/') || p === 'CONVENTIONS.md' })) {
    this.files = files;
  }

  /** Characters that have entered "context" so far. */
  get charsInContext(): number {
    return this.calls.reduce((n, c) => n + c.chars, 0);
  }

  get totalChars(): number {
    return Object.values(this.files).reduce((n, s) => n + s.length, 0);
  }

  /** File paths matching a glob. Cheap: only names come back. */
  glob(pattern: string): string[] {
    const out = Object.keys(this.files).filter((p) => matchesGlob(p, pattern)).sort();
    this.calls.push({ tool: 'Glob', arg: pattern, chars: out.join('\n').length });
    return out;
  }

  /** Search contents. `files` returns paths only (the default, cheapest); `content` returns matching lines. */
  grep(pattern: RegExp, opts: { glob?: string; mode?: 'files' | 'content' } = {}): GrepHit[] {
    const hits: GrepHit[] = [];
    for (const [file, src] of Object.entries(this.files)) {
      if (opts.glob && !matchesGlob(file, opts.glob)) continue;
      src.split('\n').forEach((text, i) => {
        if (pattern.test(text)) hits.push({ file, line: i + 1, text });
      });
    }
    const mode = opts.mode ?? 'files';
    const result = mode === 'files' ? [...new Map(hits.map((h) => [h.file, { ...h, line: 0, text: '' }])).values()] : hits;
    const chars = mode === 'files' ? result.map((h) => h.file).join('\n').length : result.map((h) => `${h.file}:${h.line}:${h.text}`).join('\n').length;
    this.calls.push({ tool: 'Grep', arg: `${pattern}${opts.glob ? ` in ${opts.glob}` : ''} (${mode})`, chars });
    return result;
  }

  /** Read a file, optionally a window of it. `offset` is 1-based. Returns the lines read. */
  read(file: string, opts: { offset?: number; limit?: number } = {}): string[] {
    const src = this.files[file];
    if (src === undefined) throw new Error(`No such file: ${file}`);
    const all = src.split('\n');
    const start = Math.max(0, (opts.offset ?? 1) - 1);
    const lines = all.slice(start, opts.limit === undefined ? undefined : start + opts.limit);
    this.calls.push({ tool: 'Read', arg: `${file}${opts.limit ? `:${start + 1}+${opts.limit}` : ''}`, chars: lines.join('\n').length });
    return lines;
  }
}
