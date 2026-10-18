import type { MessageCreateParamsNonStreaming, Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import type { Category, Finding } from '../answer-key.ts';

export const CATEGORIES: Category[] = ['security', 'business-logic', 'api-design'];

/**
 * TODO(1): a CI step parses this output, so make the schema the contract: a `findings` array whose items have
 * category (enum CATEGORIES), severity (enum critical|high|medium|low), file, line (integer or null), summary
 * and rule (the convention violated), all required.
 */
export const FINDINGS_TOOL: Tool = {
  name: 'report_findings',
  description: 'Report the review.',
  input_schema: {
    type: 'object',
    properties: {
      review: { type: 'string', description: 'Your review comments.' },
    },
  },
};

export interface Example {
  code: string;
  /** The finding a reviewer should report, or null when the code looks suspicious but is fine. */
  finding: Omit<Finding, 'file' | 'line'> | null;
}

export interface ReviewPass {
  category: Category | 'all';
  focus: string;
  examples: Example[];
}

/**
 * TODO(2): one prompt asked to find everything trades recall between concerns. Split it into three focused
 * passes (security, business-logic, api-design). Each pass: a focus that names its own concern and says what
 * to ignore, and at least 2 few-shot examples of its own category plus one "looks suspicious but is fine"
 * example (finding: null).
 */
export const PASSES: ReviewPass[] = [
  {
    category: 'all',
    focus: 'You are a code reviewer. Find all bugs, security issues, API problems and anything else you notice.',
    examples: [],
  },
];

/**
 * TODO(3): every pass must carry the project's conventions, including the accepted patterns that must not be
 * flagged, plus explicit exclusion criteria (no style nits; only report what violates a named convention).
 */
export function persistentContext(_conventionsMd: string): string {
  return '';
}

function examplesBlock(pass: ReviewPass): string {
  return pass.examples.map((e) => `<example>\n<code>${e.code}</code>\n<finding>${JSON.stringify(e.finding)}</finding>\n</example>`).join('\n');
}

/**
 * TODO(4): build one pass's request. System prompt = the pass focus + persistentContext(CONVENTIONS.md) + the
 * pass's examples. Force the report_findings tool so the output is always structured. Send the src/ files.
 */
export function buildPassRequest(
  pass: ReviewPass,
  codebase: Record<string, string>,
  model = modelFromEnv(),
): MessageCreateParamsNonStreaming {
  const files = Object.entries(codebase)
    .filter(([rel]) => rel.startsWith('src/'))
    .map(([rel, src]) => `<file path="${rel}">\n${src}\n</file>`)
    .join('\n');
  return {
    model,
    max_tokens: 4096,
    system: `${pass.focus}\n\n${examplesBlock(pass)}`,
    tools: [FINDINGS_TOOL],
    messages: [{ role: 'user', content: `Review these files.\n\n${files}` }],
  };
}

/**
 * TODO(5): run every pass concurrently, read findings from the report_findings tool call, drop findings outside
 * the pass's own category (out-of-lane), then merge and de-duplicate by category + file + line.
 */
export async function runReview(client: MessageCreator, codebase: Record<string, string>, model?: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const pass of PASSES) {
    const res = await client.messages.create(buildPassRequest(pass, codebase, model));
    const call = res.content.find((b) => b.type === 'tool_use');
    if (call?.type === 'tool_use') findings.push(...((call.input as { findings?: Finding[] }).findings ?? []));
  }
  return findings;
}
