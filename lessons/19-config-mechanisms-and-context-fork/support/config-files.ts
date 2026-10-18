/**
 * Helpers shared by the Part 8 (Claude Code configuration) lessons: read the files of a lesson's
 * `sandbox/` folder, parse Markdown frontmatter, and materialize a runnable project for live tests.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonTarget } from '../../../lib/lesson.ts';
import { CODEBASE_DIR } from '../../../fixtures/codebase/files.ts';

export type FrontmatterValue = string | boolean | number | string[];

export interface MarkdownFile {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

const scalar = (raw: string): string | boolean | number => {
  const v = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

/** Parse the small YAML subset Claude Code frontmatter uses: scalars, `[a, b]` lists and `- item` lists. */
export function parseMarkdown(source: string): MarkdownFile {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return { frontmatter: {}, body: source };
  const frontmatter: Record<string, FrontmatterValue> = {};
  let listKey: string | null = null;
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (frontmatter[listKey] as string[]).push(String(scalar(item[1]!)));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv as unknown as [string, string, string];
    if (rest === '') {
      frontmatter[key] = [];
      listKey = key;
    } else if (/^\[.*\]$/.test(rest.trim())) {
      frontmatter[key] = rest.trim().slice(1, -1).split(',').map((s) => String(scalar(s))).filter(Boolean);
      listKey = null;
    } else {
      frontmatter[key] = scalar(rest);
      listKey = null;
    }
  }
  return { frontmatter, body: match[2]! };
}

/** A frontmatter value as a list: YAML lists stay lists, comma-separated strings (`Read, Grep`) are split. */
export function asList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Read-only view of `<lesson>/<starter|solution>/sandbox/`. */
export class Sandbox {
  constructor(readonly root: string) {}

  static forLesson(testFileUrl: string): Sandbox {
    return new Sandbox(path.join(path.dirname(fileURLToPath(testFileUrl)), lessonTarget(), 'sandbox'));
  }

  exists(rel: string): boolean {
    return existsSync(path.join(this.root, rel));
  }

  text(rel: string): string {
    return readFileSync(path.join(this.root, rel), 'utf8');
  }

  json<T = Record<string, unknown>>(rel: string): T {
    return JSON.parse(this.text(rel)) as T;
  }

  markdown(rel: string): MarkdownFile {
    return parseMarkdown(this.text(rel));
  }

  /** Relative paths of every file under `rel` (recursive, sorted). */
  list(rel = '.'): string[] {
    const base = path.join(this.root, rel);
    if (!existsSync(base)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs);
        else out.push(path.relative(this.root, abs).split(path.sep).join('/'));
      }
    };
    walk(base);
    return out.sort();
  }
}

/** `path.matchesGlob` (Node 22+) with a POSIX-style relative path. */
export function matchesGlob(relPath: string, pattern: string): boolean {
  return path.matchesGlob(relPath, pattern);
}

/**
 * Copy the Ledgerly fixture (minus its answer key) plus a lesson sandbox's config into a fresh temp dir,
 * so a live test can run `claude -p` against a realistic project without touching the repo.
 */
export function materializeProject(sandboxRoot: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ccaf-sandbox-'));
  cpSync(CODEBASE_DIR, dir, {
    recursive: true,
    filter: (src) => !/(ISSUES\.md|files\.ts)$/.test(src),
  });
  cpSync(sandboxRoot, dir, { recursive: true });
  return dir;
}

export function hasClaudeCli(): boolean {
  return spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;
}

/** Run `claude` with the given args in `cwd`; returns parsed JSON stdout (expects `--output-format json`). */
export function runClaude(args: string[], cwd: string, timeoutMs = 180_000): Record<string, unknown> {
  const res = spawnSync('claude', args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  if (!res.stdout) throw new Error(`claude produced no stdout (status ${res.status}): ${res.stderr}`);
  return JSON.parse(res.stdout) as Record<string, unknown>;
}
