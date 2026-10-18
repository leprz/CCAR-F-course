import type { MessageCreateParamsNonStreaming, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import {
  CURRENCIES,
  INVOICE_JSON_SCHEMA,
  type InvoiceDoc,
  type InvoiceExtraction,
} from '../../../fixtures/invoices/index.ts';

/** Format normalisation: one canonical form per value type, whatever the document's locale. */
export const NORMALIZATION_RULES: string[] = [
  'Dates: output YYYY-MM-DD. Read US documents (MM/DD/YYYY) and European documents (DD.MM.YYYY) by their own convention.',
  "Amounts: output a plain number with '.' as decimal separator and no thousands separator: '1.234,56 €' → 1234.56, '2 460,00 zł' → 2460, '$1,245.50' → 1245.5.",
  'Credit notes: total_amount and line amounts are negative.',
  'Currency: ISO 4217 code from an explicit symbol or code (€ → EUR, £ → GBP, zł → PLN, $ with a US address → USD).',
];

export interface Scope {
  include: string[];
  exclude: { what: string; reason: string }[];
}

/**
 * Inclusion/exclusion boundaries. Each exclusion names a category where extraction is unreliable or out of scope,
 * and says what to output instead, so the model has a safe action rather than a guess.
 */
export const SCOPE: Scope = {
  include: [
    'Values printed on the document by the issuer: numbers, dates, amounts, terms, line items.',
    'For contracts: parties, currency and payment terms only.',
  ],
  exclude: [
    { what: 'Bank details (IBAN, BIC, account numbers).', reason: 'Not part of the record and sensitive; never copy them into any field.' },
    {
      what: 'Handwritten margin notes or annotations added after the document was issued (e.g. "PAID?").',
      reason: 'Unreliable OCR and not issued by the vendor; ignore them entirely.',
    },
    {
      what: 'Due dates calculated from relative terms such as "within 15 days" or "Net 30".',
      reason: 'Date arithmetic from an uncertain issue date produces confident wrong dates; output null and keep the terms in payment_terms.',
    },
    {
      what: 'Currency inferred from the vendor country or language when no symbol or code is printed.',
      reason: 'Country is not currency; output null and list currency in ambiguous_fields.',
    },
    {
      what: 'Totals or line items for contracts and recurring fees.',
      reason: 'A monthly fee is not a document total; output null total_amount and an empty line_items list.',
    },
  ],
};

export function buildSystemPrompt(scope: Scope, examples: InvoiceDoc[]): string {
  return [
    'You extract data from accounts-payable documents into the provided schema.',
    `<normalization>\n${NORMALIZATION_RULES.map((r) => `- ${r}`).join('\n')}\n</normalization>`,
    `<include>\n${scope.include.map((i) => `- ${i}`).join('\n')}\n</include>`,
    `<exclude>\nDo NOT extract the following, even if present:\n${scope.exclude.map((e) => `- ${e.what} ${e.reason}`).join('\n')}\n</exclude>`,
    'If a value is absent, output null. Never guess.',
    examples.length ? formatExamples(examples) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Pick n examples that together cover as many distinct traits as possible (greedy), never the target itself.
 * Diverse examples teach the format rules; n copies of the easy case teach nothing.
 */
export function selectFewShotExamples(pool: InvoiceDoc[], target: InvoiceDoc, n: number): InvoiceDoc[] {
  const candidates = pool.filter((d) => d.id !== target.id);
  const chosen: InvoiceDoc[] = [];
  const covered = new Set<string>();
  while (chosen.length < n && candidates.length) {
    let bestIndex = 0;
    let bestGain = -1;
    candidates.forEach((d, i) => {
      const gain = d.traits.filter((t) => !covered.has(t)).length;
      if (gain > bestGain) [bestIndex, bestGain] = [i, gain];
    });
    const [pick] = candidates.splice(bestIndex, 1);
    chosen.push(pick!);
    pick!.traits.forEach((t) => covered.add(t));
  }
  return chosen;
}

export function formatExamples(examples: InvoiceDoc[]): string {
  const body = examples
    .map((e) => `<example>\n<document>\n${e.text}\n</document>\n<output>\n${JSON.stringify(e.expected)}\n</output>\n</example>`)
    .join('\n');
  return `<examples>\n${body}\n</examples>`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Deterministic checks the schema cannot express. Each issue names the field and the evidence. */
export function validateExtraction(x: InvoiceExtraction): string[] {
  const issues: string[] = [];
  for (const field of ['issue_date', 'due_date'] as const) {
    const v = x[field];
    if (v !== null && !ISO_DATE.test(v)) issues.push(`${field} "${v}" is not YYYY-MM-DD`);
  }
  if (x.currency !== null && !(CURRENCIES as readonly string[]).includes(x.currency)) {
    issues.push(`currency "${x.currency}" is not one of ${CURRENCIES.join(', ')}`);
  }
  if (x.total_amount !== null && x.line_items.length > 0) {
    const sum = Math.round(x.line_items.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    if (Math.abs(sum - x.total_amount) > 0.01) {
      issues.push(`total_amount ${x.total_amount} does not equal the sum of line item amounts ${sum}`);
    }
  }
  if (x.document_type === 'credit_note' && x.total_amount !== null && x.total_amount > 0) {
    issues.push(`total_amount ${x.total_amount} is positive on a credit_note; credit notes are negative`);
  }
  return issues;
}

export function buildRequest(doc: InvoiceDoc, examples: InvoiceDoc[], model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(SCOPE, examples),
    output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` }],
  };
}

export interface ValidatedExtraction {
  extraction: InvoiceExtraction;
  attempts: number;
  /** Issues still present after the last attempt. Non-empty means route to a human, not discard. */
  issues: string[];
}

/** Extract, validate, and on failure retry with the specific validation errors as feedback. */
export async function extractWithValidation(
  client: MessageCreator,
  doc: InvoiceDoc,
  opts: { examples?: InvoiceDoc[]; maxAttempts?: number; model?: string } = {},
): Promise<ValidatedExtraction> {
  const request = buildRequest(doc, opts.examples ?? [], opts.model);
  const messages: MessageParam[] = [...request.messages];
  const maxAttempts = opts.maxAttempts ?? 2;
  let extraction: InvoiceExtraction | undefined;
  let issues: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.messages.create({ ...request, messages });
    const block = response.content.find((b) => b.type === 'text');
    const raw = block?.type === 'text' ? block.text : '{}';
    extraction = JSON.parse(raw) as InvoiceExtraction;
    issues = validateExtraction(extraction);
    if (issues.length === 0 || attempt === maxAttempts) return { extraction, attempts: attempt, issues };

    messages.push(
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          'Your extraction failed these checks:\n' +
          issues.map((i) => `- ${i}`).join('\n') +
          '\nRe-read the document and return the corrected extraction. Change only what the evidence supports.',
      },
    );
  }
  throw new Error('unreachable');
}
