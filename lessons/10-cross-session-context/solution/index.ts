import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
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

/** Compare content hashes, not just file names: an edited file keeps its path. */
export function diffSnapshots(prev: Record<string, string>, curr: Record<string, string>): SnapshotDiff {
  const diff: SnapshotDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const [file, hash] of Object.entries(curr)) {
    if (!(file in prev)) diff.added.push(file);
    else if (prev[file] !== hash) diff.changed.push(file);
    else diff.unchanged.push(file);
  }
  for (const file of Object.keys(prev)) if (!(file in curr)) diff.removed.push(file);
  for (const list of Object.values(diff)) list.sort();
  return diff;
}

export async function loadScratchpad(path: string): Promise<Scratchpad | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Scratchpad;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Write to a temp file, then rename: an interrupted save never leaves a half-written scratchpad behind. */
export async function saveScratchpad(path: string, pad: Scratchpad): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(pad, null, 2));
  await rename(tmp, path);
}

export interface ResumePlan {
  toAnalyze: string[];
  /** Findings on files whose content is unchanged: still valid, not re-analyzed. */
  carried: Finding[];
  /** Earlier findings on changed files: handed to the analyzer to re-verify. */
  reverify: Finding[];
  removed: string[];
}

export function planResume(pad: Scratchpad | null, files: Files): ResumePlan {
  const curr = snapshot(files);
  if (!pad) return { toAnalyze: Object.keys(curr).sort(), carried: [], reverify: [], removed: [] };
  const diff = diffSnapshots(pad.fileHashes, curr);
  const unchanged = new Set(diff.unchanged);
  const changed = new Set(diff.changed);
  return {
    toAnalyze: [...diff.changed, ...diff.added].sort(),
    carried: pad.findings.filter((f) => unchanged.has(f.file)),
    reverify: pad.findings.filter((f) => changed.has(f.file)),
    removed: diff.removed,
  };
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
 * Analyze one file in a fresh, isolated context: one user message with only this file, the conventions,
 * and (when resuming) the earlier findings for this file to re-verify. The caller never sees the file content,
 * only the structured findings.
 */
export async function analyzeFile(
  client: MessageCreator,
  file: string,
  content: string,
  opts: { conventions: string; prior?: Finding[]; model?: string },
): Promise<Finding[]> {
  const prior = opts.prior?.length
    ? `\n\n<previous_findings note="from an earlier version of this file; keep the ones that still apply, drop fixed ones">\n${opts.prior
        .map((f) => `- [${f.category}] ${f.summary}`)
        .join('\n')}\n</previous_findings>`
    : '';
  const response = await client.messages.create({
    model: opts.model ?? modelFromEnv(),
    max_tokens: 2048,
    system: `You review one file of a TypeScript service against the project conventions.\n\n<conventions>\n${opts.conventions}\n</conventions>`,
    tools: [REPORT_TOOL],
    tool_choice: { type: 'tool', name: REPORT_TOOL.name },
    messages: [{ role: 'user', content: `<file path="${file}">\n${content}\n</file>${prior}` }],
  });
  const call = response.content.find((b) => b.type === 'tool_use');
  if (call?.type !== 'tool_use') throw new Error('report_findings was not called');
  const { findings } = call.input as { findings: Omit<Finding, 'file'>[] };
  return findings.map((f) => ({ file, category: f.category, summary: f.summary }));
}

/** Resume a review: re-analyze only changed/added files (each isolated), keep the rest, persist the new state. */
export async function resumeReview(
  client: MessageCreator,
  padPath: string,
  files: Files,
  opts: { conventions: string; model?: string; now?: () => Date },
): Promise<{ pad: Scratchpad; analyzed: string[]; plan: ResumePlan }> {
  const plan = planResume(await loadScratchpad(padPath), files);
  const fresh = await Promise.all(
    plan.toAnalyze.map((file) =>
      analyzeFile(client, file, files[file]!, {
        conventions: opts.conventions,
        prior: plan.reverify.filter((f) => f.file === file),
        model: opts.model,
      }),
    ),
  );
  const pad: Scratchpad = {
    version: 1,
    updatedAt: (opts.now ?? (() => new Date()))().toISOString(),
    fileHashes: snapshot(files),
    findings: [...plan.carried, ...fresh.flat()].sort((a, b) => a.file.localeCompare(b.file)),
  };
  await saveScratchpad(padPath, pad);
  return { pad, analyzed: plan.toAnalyze, plan };
}

/**
 * Context injection for a resumed main session: a compact briefing of what is known and what changed,
 * instead of replaying the old transcript or re-reading every file.
 */
export function resumeBriefing(pad: Scratchpad, plan: ResumePlan): string {
  const lines = [
    `<review_state updated="${pad.updatedAt}">`,
    `Files re-analyzed this session: ${plan.toAnalyze.join(', ') || 'none'}`,
    `Files removed since last session: ${plan.removed.join(', ') || 'none'}`,
    'Current findings (already verified, do not re-report):',
    ...pad.findings.map((f) => `- ${f.file} [${f.category}] ${f.summary}`),
    '</review_state>',
    'Read a file only if you need detail beyond these findings.',
  ];
  return lines.join('\n');
}

/**
 * Agent SDK equivalent: resume a stored session by id. `forkSession: true` branches into a new session id and
 * leaves the original untouched (use it to explore an alternative without polluting the main line).
 */
export function agentSdkResumeOptions(sessionId: string, opts: { fork?: boolean } = {}): Pick<Options, 'resume' | 'forkSession'> {
  return opts.fork ? { resume: sessionId, forkSession: true } : { resume: sessionId };
}
