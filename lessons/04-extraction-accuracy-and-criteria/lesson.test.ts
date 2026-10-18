import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text } from '../../lib/testing/index.ts';
import { invoiceDoc, invoiceDocs, type InvoiceExtraction } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const section = (prompt: string, tag: string) => prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
const prompt = lesson.buildSystemPrompt(lesson.SCOPE, []);

describe('TODO(1) normalisation rules', () => {
  const rules = lesson.NORMALIZATION_RULES.join('\n');
  it('defines a canonical date format', () => expect(rules).toMatch(/YYYY-MM-DD/));
  it('shows how European decimal amounts normalise', () => expect(rules).toMatch(/1\.234,56/));
  it('covers credit notes and currency codes', () => {
    expect(rules).toMatch(/credit note/i);
    expect(rules).toMatch(/ISO 4217|EUR/);
  });
  it('appears in the system prompt', () => expect(prompt).toContain(lesson.NORMALIZATION_RULES[0]!));
});

describe('TODO(2) explicit inclusion / exclusion boundaries', () => {
  it('renders <include> and <exclude> sections', () => {
    expect(section(prompt, 'include').trim()).not.toBe('');
    expect(section(prompt, 'exclude').trim()).not.toBe('');
  });
  it('every exclusion carries a reason', () => {
    expect(lesson.SCOPE.exclude.length).toBeGreaterThanOrEqual(4);
    for (const e of lesson.SCOPE.exclude) expect(e.reason.length).toBeGreaterThan(10);
  });
  it.each([
    ['bank details', /IBAN|bank/i],
    ['handwritten annotations', /handwritten|annotation/i],
    ['computed relative due dates', /relative|calculat|comput/i],
    ['currency inferred from country', /countr|infer/i],
    ['contract totals', /contract|recurring/i],
  ])('excludes %s', (_label, pattern) => {
    expect(section(prompt, 'exclude')).toMatch(pattern);
  });
});

describe('TODO(3) few-shot examples', () => {
  const target = invoiceDoc('INV-2');
  const picked = lesson.selectFewShotExamples(invoiceDocs, target, 3);
  it('never uses the target document as its own example', () => {
    expect(picked.map((d) => d.id)).not.toContain(target.id);
    expect(picked).toHaveLength(3);
  });
  it('maximises trait coverage', () => {
    expect(new Set(picked.flatMap((d) => d.traits)).size).toBeGreaterThanOrEqual(11);
  });
  it('wraps examples in <examples>/<example> tags with parseable expected output', () => {
    const rendered = lesson.formatExamples(picked);
    expect(rendered).toMatch(/^<examples>/);
    expect(rendered.match(/<example>/g)).toHaveLength(3);
    const outputs = [...rendered.matchAll(/<output>\s*([\s\S]*?)\s*<\/output>/g)].map((m) => JSON.parse(m[1]!));
    expect(outputs).toEqual(picked.map((d) => d.expected));
  });
});

describe('TODO(4) validateExtraction', () => {
  it.each(invoiceDocs.map((d) => d.id))('accepts ground truth %s', (id) => {
    expect(lesson.validateExtraction(invoiceDoc(id).expected)).toEqual([]);
  });
  const base = invoiceDoc('INV-2').expected;
  it('flags a total that does not match the line items, naming the field and numbers', () => {
    const issues = lesson.validateExtraction({ ...base, total_amount: 1009.56 });
    expect(issues.join('\n')).toMatch(/total_amount/);
    expect(issues.join('\n')).toMatch(/1234\.56/);
  });
  it('flags a non-ISO date', () => {
    expect(lesson.validateExtraction({ ...base, issue_date: '04.03.2026' }).join('\n')).toMatch(/issue_date/);
  });
  it('flags a positive credit note', () => {
    const cn = invoiceDoc('INV-3').expected;
    const flipped: InvoiceExtraction = { ...cn, total_amount: 189, line_items: cn.line_items.map((l) => ({ ...l, amount: 189 })) };
    expect(lesson.validateExtraction(flipped).join('\n')).toMatch(/credit/i);
  });
});

describe('TODO(5) extractWithValidation', () => {
  const doc = invoiceDoc('INV-2');
  const wrong = { ...doc.expected, total_amount: 1009.56 };

  it('retries with the specific issues and returns the corrected extraction', async () => {
    const client = new FakeClient([reply([text(JSON.stringify(wrong))]), reply([text(JSON.stringify(doc.expected))])]);
    const result = await lesson.extractWithValidation(client, doc);
    expect(result).toEqual({ extraction: doc.expected, attempts: 2, issues: [] });

    const feedback = client.calls[1]!.messages.at(-1)!;
    expect(feedback.role).toBe('user');
    expect(String(feedback.content)).toMatch(/total_amount/);
    expect(client.calls[1]!.messages.at(-2)?.role).toBe('assistant');
  });

  it('returns remaining issues after maxAttempts instead of throwing', async () => {
    const client = new FakeClient([reply([text(JSON.stringify(wrong))]), reply([text(JSON.stringify(wrong))])]);
    const result = await lesson.extractWithValidation(client, doc, { maxAttempts: 2 });
    expect(result.attempts).toBe(2);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(client.calls).toHaveLength(2);
  });

  it('does not retry a valid extraction', async () => {
    const client = new FakeClient([reply([text(JSON.stringify(doc.expected))])]);
    await lesson.extractWithValidation(client, doc);
    expect(client.calls).toHaveLength(1);
  });
});
