import type { MessageCreateParamsNonStreaming, Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import type { Category, Finding } from '../answer-key.ts';

export const CATEGORIES: Category[] = ['security', 'business-logic', 'api-design'];

/** Structured output for downstream automation: a CI step parses this, so the schema is the contract. */
export const FINDINGS_TOOL: Tool = {
  name: 'report_findings',
  description:
    'Report every finding from this review pass. Call exactly once. Report an empty list when nothing in your ' +
    'category violates the project conventions.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: CATEGORIES },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            file: { type: 'string', description: 'Repo-relative path, e.g. "src/routes/orders.ts".' },
            line: { type: ['integer', 'null'], description: 'Line of the problem, or null if it spans the file.' },
            summary: { type: 'string', description: 'One sentence: what is wrong and why it matters.' },
            rule: { type: 'string', description: 'The CONVENTIONS.md rule this violates.' },
          },
          required: ['category', 'severity', 'file', 'line', 'summary', 'rule'],
        },
      },
    },
    required: ['findings'],
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

/** One focused pass per concern, each with its own few-shot examples, including a "looks bad, is fine" one. */
export const PASSES: ReviewPass[] = [
  {
    category: 'security',
    focus:
      'You are a security reviewer. Report only security issues: injection, missing authorization, exposed secrets, ' +
      'unsafe input handling. Ignore business logic, naming, style and API design; other passes cover those.',
    examples: [
      {
        code: "db.query(`SELECT * FROM invoices WHERE id = '${req.params.id}'`)",
        finding: { category: 'security', severity: 'critical', summary: 'SQL built by string interpolation from request input (SQL injection).', rule: 'Data access: use $1 placeholders' },
      },
      {
        code: "router.get('/invoices/:id', (req) => invoices.get(req.params.id))",
        finding: { category: 'security', severity: 'high', summary: 'Reads customer data without calling authorize first (IDOR).', rule: 'HTTP API: authorize first' },
      },
      { code: "const id = Math.random().toString(36) // correlation id for logs", finding: null },
    ],
  },
  {
    category: 'business-logic',
    focus:
      'You are a business-logic reviewer for a billing system. Report only incorrect behaviour: wrong money maths, ' +
      'rounding, ordering of tax and discounts, pagination and boundary errors. Ignore security and API design.',
    examples: [
      {
        code: 'const tax = Math.round(subtotal * rate); const total = subtotal + tax - discount;',
        finding: { category: 'business-logic', severity: 'high', summary: 'Tax computed on the pre-discount subtotal; tax must apply after discounts.', rule: 'Money: tax after discounts' },
      },
      {
        code: 'const offset = page * pageSize; // page is 1-based',
        finding: { category: 'business-logic', severity: 'medium', summary: 'Off-by-one: 1-based page skips the first page; use (page - 1) * pageSize.', rule: 'Data access: pagination' },
      },
      { code: 'parts[parts.length - 1] += total - base * parts.length // remainder on last instalment', finding: null },
    ],
  },
  {
    category: 'api-design',
    focus:
      'You are an API design reviewer. Report only HTTP API design problems: verbs in paths, non-standard error ' +
      'shapes, wrong status codes, inconsistent resources. Ignore security and business logic.',
    examples: [
      {
        code: "router.post('/invoices/:id/cancel', ...)",
        finding: { category: 'api-design', severity: 'medium', summary: 'Verb in path; model cancellation as a resource state change (PATCH /invoices/:id).', rule: 'HTTP API: resource-oriented routes' },
      },
      {
        code: "res.status(404).json({ message: 'not found' })",
        finding: { category: 'api-design', severity: 'medium', summary: 'Error body is { message } instead of the standard httpError shape.', rule: 'HTTP API: error shape' },
      },
      { code: "throw httpError(404, 'invoice_not_found', 'Invoice not found')", finding: null },
    ],
  },
];

/**
 * Persistent context sent on EVERY pass: the project's conventions, including the accepted patterns that
 * must not be flagged, plus explicit exclusion criteria. This is what keeps false positives down.
 */
export function persistentContext(conventionsMd: string): string {
  return [
    '<project_conventions>',
    conventionsMd.trim(),
    '</project_conventions>',
    '',
    'Exclusions: never report anything listed under "Accepted patterns (do NOT flag)". Do not report style, ' +
      'naming or missing comments. Report a finding only when you can name the convention it violates.',
  ].join('\n');
}

function examplesBlock(pass: ReviewPass): string {
  return pass.examples
    .map((e) =>
      e.finding
        ? `<example>\n<code>${e.code}</code>\n<finding>${JSON.stringify(e.finding)}</finding>\n</example>`
        : `<example>\n<code>${e.code}</code>\n<finding>none: accepted pattern, do not report</finding>\n</example>`,
    )
    .join('\n');
}

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
    system: `${pass.focus}\n\n${persistentContext(codebase['CONVENTIONS.md'] ?? '')}\n\n<examples>\n${examplesBlock(pass)}\n</examples>`,
    tools: [FINDINGS_TOOL],
    tool_choice: { type: 'tool', name: FINDINGS_TOOL.name },
    messages: [{ role: 'user', content: `Review these files for ${pass.category} issues.\n\n${files}` }],
  };
}

/** Run the passes concurrently, keep each pass in its lane, then merge and de-duplicate. */
export async function runReview(client: MessageCreator, codebase: Record<string, string>, model?: string): Promise<Finding[]> {
  const perPass = await Promise.all(
    PASSES.map(async (pass) => {
      const res = await client.messages.create(buildPassRequest(pass, codebase, model));
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === FINDINGS_TOOL.name);
      const findings = call?.type === 'tool_use' ? ((call.input as { findings?: Finding[] }).findings ?? []) : [];
      return findings.filter((f) => f.category === pass.category);
    }),
  );
  const seen = new Set<string>();
  return perPass.flat().filter((f) => {
    const key = `${f.category}|${f.file}|${f.line ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
