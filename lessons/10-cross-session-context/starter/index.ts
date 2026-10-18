import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';

export type Category = 'security' | 'business-logic' | 'api-design';

export interface Finding {
  file: string;
  category: Category;
  summary: string;
}

/** The scratchpad file: what a later session needs to resume without redoing finished work. */
export interface Scratchpad {
  version: 1;
  updatedAt: string;
  fileHashes: Record<string, string>;
  findings: Finding[];
}

export type Files = Record<string, string>;

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function snapshot(files: Files): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([p, c]) => [p, hashContent(c)]));
}

export interface SnapshotDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
}

/** TODO(1): an edited file keeps its name. Detect changes by comparing hashes, and sort every list. */
export function diffSnapshots(prev: Record<string, string>, curr: Record<string, string>): SnapshotDiff {
  const diff: SnapshotDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const file of Object.keys(curr)) (file in prev ? diff.unchanged : diff.added).push(file);
  for (const file of Object.keys(prev)) if (!(file in curr)) diff.removed.push(file);
  return diff;
}

/**
 * TODO(2): scratchpad persistence.
 *  - loadScratchpad: a missing file means "no previous session" → return null (other errors still throw)
 *  - saveScratchpad: write atomically (temp file + rename) so an interrupted run can't corrupt the state
 */
export async function loadScratchpad(path: string): Promise<Scratchpad | null> {
  return JSON.parse(await readFile(path, 'utf8')) as Scratchpad;
}

export async function saveScratchpad(path: string, pad: Scratchpad): Promise<void> {
  await writeFile(path, JSON.stringify(pad, null, 2));
}

export interface ResumePlan {
  toAnalyze: string[];
  /** Findings on files whose content is unchanged: still valid, not re-analyzed. */
  carried: Finding[];
  /** Earlier findings on changed files: handed to the analyzer to re-verify. */
  reverify: Finding[];
  removed: string[];
}

/**
 * TODO(3): with no scratchpad, analyze everything. Otherwise analyze only changed + added files (sorted),
 * carry findings of unchanged files, mark findings of changed files for re-verification, and drop findings of
 * removed files.
 */
export function planResume(_pad: Scratchpad | null, files: Files): ResumePlan {
  return { toAnalyze: Object.keys(files).sort(), carried: [], reverify: [], removed: [] };
}

export const REPORT_TOOL: Tool = {
  name: 'report_findings',
  description:
    'Report every issue found in the file under review. Use an empty list when the file is clean. ' +
    'Only report security, business-logic or api-design issues that violate the conventions.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['security', 'business-logic', 'api-design'] },
            summary: { type: 'string', description: 'One sentence naming the function and the problem.' },
          },
          required: ['category', 'summary'],
        },
      },
    },
    required: ['findings'],
  },
};

/**
 * TODO(4): analyze ONE file in a fresh context.
 *  - exactly one user message containing only this file (plus, when given, its previous findings to re-verify)
 *  - the conventions go in the system prompt
 *  - force report_findings and return its findings with `file` set
 */
export async function analyzeFile(
  client: MessageCreator,
  file: string,
  content: string,
  opts: { conventions: string; prior?: Finding[]; model?: string },
): Promise<Finding[]> {
  const response = await client.messages.create({
    model: opts.model ?? modelFromEnv(),
    max_tokens: 2048,
    tools: [REPORT_TOOL],
    messages: [{ role: 'user', content: `${opts.conventions}\n\n${file}\n${content}` }],
  });
  const call = response.content.find((b) => b.type === 'tool_use');
  if (call?.type !== 'tool_use') return [];
  const { findings } = call.input as { findings: Omit<Finding, 'file'>[] };
  return findings.map((f) => ({ file, category: f.category, summary: f.summary }));
}

/**
 * TODO(5): resume instead of starting over. Load the scratchpad, plan, analyze only plan.toAnalyze (each in
 * isolation, with its re-verify findings), keep the carried findings, save the new hashes + findings, and return them.
 */
export async function resumeReview(
  client: MessageCreator,
  padPath: string,
  files: Files,
  opts: { conventions: string; model?: string; now?: () => Date },
): Promise<{ pad: Scratchpad; analyzed: string[]; plan: ResumePlan }> {
  const plan = planResume(null, files);
  const findings: Finding[] = [];
  for (const file of plan.toAnalyze) {
    findings.push(...(await analyzeFile(client, file, files[file]!, { conventions: opts.conventions, model: opts.model })));
  }
  const pad: Scratchpad = { version: 1, updatedAt: (opts.now ?? (() => new Date()))().toISOString(), fileHashes: {}, findings };
  await saveScratchpad(padPath, pad);
  return { pad, analyzed: plan.toAnalyze, plan };
}

/**
 * TODO(6): context injection for a resumed main session. Return a compact briefing listing the re-analyzed files,
 * the removed files and every current finding (marked as already verified). Do NOT paste file contents.
 */
export function resumeBriefing(_pad: Scratchpad, _plan: ResumePlan): string {
  return '';
}

/**
 * TODO(7): Agent SDK options to resume session `sessionId`. With `fork`, branch into a new session id instead of
 * appending to the original.
 */
export function agentSdkResumeOptions(_sessionId: string, _opts: { fork?: boolean } = {}): Pick<Options, 'resume' | 'forkSession'> {
  return {};
}
