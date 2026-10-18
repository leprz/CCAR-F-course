import { KEY_FIELDS, type InvoiceExtraction } from '../../../fixtures/invoices/index.ts';
import type { KeyField, ReviewCandidate } from '../scenario.ts';

export interface RoutingPolicy {
  /** Fields the model reports below this confidence get a human check. */
  minFieldConfidence: number;
  /** Absolute totals at or above this get a human check whatever the confidence. */
  highValueAmount: number;
  /** Intake traits that historically produce errors. */
  riskyTraits: string[];
}

export const DEFAULT_POLICY: RoutingPolicy = {
  minFieldConfidence: 0.85,
  highValueAmount: 10_000,
  riskyTraits: ['handwritten', 'credit-note'],
};

export type IssueCode =
  | 'sum_mismatch'
  | 'sign_mismatch'
  | 'date_order'
  | 'missing_required'
  | 'low_confidence'
  | 'ambiguous'
  | 'risky_document'
  | 'high_value'
  | 'not_invoice';

export interface Issue {
  /** The field a reviewer should look at, or "document" for whole-document reasons. */
  field: KeyField | 'vendor_name' | 'document';
  code: IssueCode;
  detail: string;
}

const PAYABLE_TYPES = ['invoice', 'credit_note'];
const REQUIRED_FOR_PAYMENT = ['vendor_name', 'invoice_number', 'issue_date', 'currency', 'total_amount'] as const;

/** Deterministic checks: they catch confident mistakes that self-reported confidence never will. */
export function validateExtraction(e: InvoiceExtraction): Issue[] {
  const issues: Issue[] = [];
  if (e.total_amount !== null && e.line_items.length > 0) {
    const sum = e.line_items.reduce((acc, l) => acc + l.amount, 0);
    if (Math.abs(sum - e.total_amount) > 0.01) {
      issues.push({ field: 'total_amount', code: 'sum_mismatch', detail: `line items sum to ${sum.toFixed(2)}, total is ${e.total_amount}` });
    }
  }
  if (e.total_amount !== null) {
    if (e.document_type === 'credit_note' && e.total_amount > 0) {
      issues.push({ field: 'total_amount', code: 'sign_mismatch', detail: 'credit note with a positive total' });
    }
    if (e.document_type === 'invoice' && e.total_amount < 0) {
      issues.push({ field: 'total_amount', code: 'sign_mismatch', detail: 'invoice with a negative total' });
    }
  }
  if (e.issue_date && e.due_date && e.due_date < e.issue_date) {
    issues.push({ field: 'due_date', code: 'date_order', detail: `due ${e.due_date} before issue ${e.issue_date}` });
  }
  if (PAYABLE_TYPES.includes(e.document_type)) {
    for (const field of REQUIRED_FOR_PAYMENT) {
      if (e[field] === null) issues.push({ field, code: 'missing_required', detail: `${field} is needed to pay` });
    }
  }
  return issues;
}

/** Field-level signals: low self-reported confidence, and fields the model itself marked ambiguous. */
export function fieldSignals(c: ReviewCandidate, policy: RoutingPolicy = DEFAULT_POLICY): Issue[] {
  const issues: Issue[] = [];
  for (const field of KEY_FIELDS) {
    const value = c.fieldConfidence[field];
    if (value !== undefined && value < policy.minFieldConfidence) {
      issues.push({ field, code: 'low_confidence', detail: `confidence ${value}` });
    }
  }
  for (const field of c.extraction.ambiguous_fields) {
    issues.push({ field, code: 'ambiguous', detail: 'the document supports more than one reading' });
  }
  return issues;
}

/** Document-level signals: risky intake traits, high value, and documents that aren't payable at all. */
export function documentSignals(c: ReviewCandidate, policy: RoutingPolicy = DEFAULT_POLICY): Issue[] {
  const issues: Issue[] = [];
  for (const trait of c.traits) {
    if (policy.riskyTraits.includes(trait)) issues.push({ field: 'document', code: 'risky_document', detail: trait });
  }
  const total = c.extraction.total_amount;
  if (total !== null && Math.abs(total) >= policy.highValueAmount) {
    issues.push({ field: 'total_amount', code: 'high_value', detail: `|total| ≥ ${policy.highValueAmount}` });
  }
  if (!PAYABLE_TYPES.includes(c.extraction.document_type)) {
    issues.push({ field: 'document', code: 'not_invoice', detail: `document_type is ${c.extraction.document_type}` });
  }
  return issues;
}

export interface RoutingDecision {
  docId: string;
  route: 'auto_approve' | 'human_review';
  priority: 'high' | 'normal';
  issues: Issue[];
  /** What the reviewer should check: specific fields, not "the whole document". */
  fieldsToCheck: string[];
}

const HIGH_PRIORITY: IssueCode[] = ['sum_mismatch', 'sign_mismatch', 'high_value'];

/** Route on evidence about THIS extraction. Random sampling would review clean documents and wave errors through. */
export function routeExtraction(c: ReviewCandidate, policy: RoutingPolicy = DEFAULT_POLICY): RoutingDecision {
  const issues = [...validateExtraction(c.extraction), ...fieldSignals(c, policy), ...documentSignals(c, policy)];
  return {
    docId: c.docId,
    route: issues.length > 0 ? 'human_review' : 'auto_approve',
    priority: issues.some((i) => HIGH_PRIORITY.includes(i.code)) ? 'high' : 'normal',
    issues,
    fieldsToCheck: [...new Set(issues.filter((i) => i.field !== 'document').map((i) => i.field))],
  };
}

/** Reviewers see high-priority items first, then the ones with the most problems. */
export function buildReviewQueue(decisions: RoutingDecision[]): RoutingDecision[] {
  return decisions
    .filter((d) => d.route === 'human_review')
    .sort(
      (a, b) =>
        (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1) ||
        b.issues.length - a.issues.length ||
        a.docId.localeCompare(b.docId),
    );
}

export function hasError(extraction: InvoiceExtraction, expected: InvoiceExtraction): boolean {
  return KEY_FIELDS.some((f) => extraction[f] !== expected[f]);
}

/** Measure the router: of the extractions that were wrong, how many did it send to a human (recall), and how much review time did it spend on correct ones (precision)? */
export function evaluateRouting(
  decisions: RoutingDecision[],
  extractions: Map<string, InvoiceExtraction>,
  truth: Map<string, InvoiceExtraction>,
): { reviewRate: number; precision: number; recall: number; missed: string[] } {
  const wrong = new Set(decisions.filter((d) => hasError(extractions.get(d.docId)!, truth.get(d.docId)!)).map((d) => d.docId));
  const reviewed = decisions.filter((d) => d.route === 'human_review');
  const caught = reviewed.filter((d) => wrong.has(d.docId)).length;
  return {
    reviewRate: reviewed.length / decisions.length,
    precision: reviewed.length ? caught / reviewed.length : 1,
    recall: wrong.size ? caught / wrong.size : 1,
    missed: decisions.filter((d) => d.route === 'auto_approve' && wrong.has(d.docId)).map((d) => d.docId),
  };
}

/**
 * Random sampling has one legitimate job: estimating how many errors the router lets through. So sample
 * only from the auto-approved items, and use the result to tune the policy.
 */
export function auditSample(decisions: RoutingDecision[], rate: number, rng: () => number): RoutingDecision[] {
  const pool = decisions.filter((d) => d.route === 'auto_approve');
  if (pool.length === 0) return [];
  const count = Math.max(1, Math.ceil(pool.length * rate));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, count);
}
