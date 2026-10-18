import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { invoiceDoc } from '../../fixtures/invoices/index.ts';
import { nightlyRun, truth, type ReviewCandidate } from './scenario.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const byId = (id: string) => nightlyRun.find((c) => c.docId === id)!;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();
const decide = (id: string) => lesson.routeExtraction(byId(id));

describe('TODO(1) validateExtraction', () => {
  it('passes a correct invoice', () => {
    expect(lesson.validateExtraction(invoiceDoc('INV-1').expected)).toEqual([]);
  });
  it('catches a total that does not match its line items (EU decimal misread)', () => {
    const issues = lesson.validateExtraction(byId('INV-2').extraction);
    expect(issues).toEqual([expect.objectContaining({ field: 'total_amount', code: 'sum_mismatch' })]);
  });
  it('catches sign and date-order problems', () => {
    const credit = { ...invoiceDoc('INV-3').expected, total_amount: 189, line_items: [] };
    expect(codes(lesson.validateExtraction(credit))).toEqual(['sign_mismatch']);
    const late = { ...invoiceDoc('INV-1').expected, due_date: '2026-01-01' };
    expect(lesson.validateExtraction(late)).toEqual([expect.objectContaining({ field: 'due_date', code: 'date_order' })]);
  });
  it('flags fields a payable document cannot be paid without, but not on a contract', () => {
    const missing = lesson.validateExtraction(invoiceDoc('INV-5').expected);
    expect(missing.filter((i) => i.code === 'missing_required').map((i) => i.field).sort()).toEqual(['currency', 'issue_date']);
    expect(lesson.validateExtraction(invoiceDoc('INV-6').expected)).toEqual([]);
  });
});

describe('TODO(2) fieldSignals', () => {
  it('reports low-confidence and ambiguous fields', () => {
    const issues = lesson.fieldSignals(byId('INV-5'));
    expect(issues.filter((i) => i.code === 'low_confidence').map((i) => i.field).sort()).toEqual(['currency', 'issue_date']);
    expect(issues.filter((i) => i.code === 'ambiguous').map((i) => i.field).sort()).toEqual(['currency', 'issue_date']);
  });
  it('respects the policy threshold', () => {
    const strict = { ...lesson.DEFAULT_POLICY, minFieldConfidence: 0.96 };
    expect(lesson.fieldSignals(byId('INV-2'), strict).length).toBeGreaterThan(0);
    expect(lesson.fieldSignals(byId('INV-2'))).toEqual([]);
  });
});

describe('TODO(3) documentSignals', () => {
  it('flags risky intake traits and non-payable documents', () => {
    expect(codes(lesson.documentSignals(byId('INV-4')))).toEqual(['risky_document']);
    expect(codes(lesson.documentSignals(byId('INV-3')))).toEqual(['risky_document']);
    expect(codes(lesson.documentSignals(byId('INV-6')))).toEqual(['not_invoice']);
    expect(lesson.documentSignals(byId('INV-1'))).toEqual([]);
  });
  it('flags high-value documents', () => {
    const big: ReviewCandidate = { ...byId('INV-1'), extraction: { ...byId('INV-1').extraction, total_amount: 25_000 } };
    expect(codes(lesson.documentSignals(big))).toEqual(['high_value']);
  });
});

describe('TODO(4) routeExtraction', () => {
  it('routes on evidence, deterministically', () => {
    const routes = Object.fromEntries(nightlyRun.map((c) => [c.docId, lesson.routeExtraction(c).route]));
    expect(routes).toEqual({
      'INV-1': 'auto_approve',
      'INV-2': 'human_review',
      'INV-3': 'human_review',
      'INV-4': 'human_review',
      'INV-5': 'human_review',
      'INV-6': 'human_review',
      'INV-8': 'auto_approve',
    });
  });
  it('a confident model is still overruled by a failed validation, at high priority', () => {
    const d = decide('INV-2');
    expect(d.priority).toBe('high');
    expect(d.fieldsToCheck).toEqual(['total_amount']);
  });
  it('tells the reviewer which fields to check', () => {
    expect(decide('INV-4').fieldsToCheck).toEqual(['issue_date']);
    expect([...decide('INV-5').fieldsToCheck].sort()).toEqual(['currency', 'issue_date']);
    expect(decide('INV-3').fieldsToCheck).toEqual([]);
    expect(decide('INV-3').priority).toBe('normal');
  });
});

describe('TODO(5) buildReviewQueue', () => {
  it('orders review items by priority, then number of issues, then id', () => {
    const queue = lesson.buildReviewQueue(nightlyRun.map((c) => lesson.routeExtraction(c)));
    expect(queue.map((d) => d.docId)).toEqual(['INV-2', 'INV-5', 'INV-4', 'INV-3', 'INV-6']);
  });
});

describe('TODO(6) evaluateRouting', () => {
  it('reports precision, recall and the errors that slipped through', () => {
    const decisions = nightlyRun.map((c) => lesson.routeExtraction(c));
    const extractions = new Map(nightlyRun.map((c) => [c.docId, c.extraction]));
    const result = lesson.evaluateRouting(decisions, extractions, truth);
    expect(result.reviewRate).toBeCloseTo(5 / 7);
    expect(result.precision).toBeCloseTo(2 / 5);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.missed).toEqual(['INV-8']);
  });
});

describe('TODO(7) auditSample', () => {
  it('samples only auto-approved items, at least one', () => {
    const decisions = nightlyRun.map((c) => lesson.routeExtraction(c));
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const sample = lesson.auditSample(decisions, 0.1, rng);
    expect(sample).toHaveLength(1);
    expect(sample.every((d) => d.route === 'auto_approve')).toBe(true);
    expect(lesson.auditSample(decisions, 1, rng).map((d) => d.docId).sort()).toEqual(['INV-1', 'INV-8']);
  });
});
