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

/**
 * TODO(1): deterministic checks that catch confident mistakes. Return one Issue per problem:
 *  - sum_mismatch (field total_amount): line items don't add up to the total (±0.01). Skip if total is null or there are no lines
 *  - sign_mismatch (total_amount): credit_note with a positive total, or invoice with a negative one
 *  - date_order (due_date): due_date earlier than issue_date
 *  - missing_required (that field): for payable documents (invoice, credit_note), any of
 *    vendor_name, invoice_number, issue_date, currency, total_amount is null
 */
export function validateExtraction(_e: InvoiceExtraction): Issue[] {
  return [];
}

/**
 * TODO(2): field-level signals.
 *  - low_confidence for every KEY_FIELDS field whose reported confidence is below policy.minFieldConfidence
 *  - ambiguous for every field the model listed in extraction.ambiguous_fields
 */
export function fieldSignals(_c: ReviewCandidate, _policy: RoutingPolicy = DEFAULT_POLICY): Issue[] {
  return [];
}

/**
 * TODO(3): document-level signals.
 *  - risky_document (field "document") for each trait in policy.riskyTraits
 *  - high_value (total_amount) when |total| ≥ policy.highValueAmount
 *  - not_invoice (document) when document_type is neither invoice nor credit_note
 */
export function documentSignals(_c: ReviewCandidate, _policy: RoutingPolicy = DEFAULT_POLICY): Issue[] {
  return [];
}

export interface RoutingDecision {
  docId: string;
  route: 'auto_approve' | 'human_review';
  priority: 'high' | 'normal';
  issues: Issue[];
  /** What the reviewer should check: specific fields, not "the whole document". */
  fieldsToCheck: string[];
}

/**
 * TODO(4): this reviews a random 20%. Route on evidence instead: collect the issues from TODO(1)–(3);
 * any issue → human_review. Priority is "high" when there's a sum_mismatch, sign_mismatch or high_value issue.
 * fieldsToCheck = the distinct fields named by the issues (not "document").
 */
export function routeExtraction(c: ReviewCandidate, _policy: RoutingPolicy = DEFAULT_POLICY): RoutingDecision {
  const review = Math.random() < 0.2;
  return {
    docId: c.docId,
    route: review ? 'human_review' : 'auto_approve',
    priority: 'normal',
    issues: [],
    fieldsToCheck: review ? [...KEY_FIELDS] : [],
  };
}

/** TODO(5): only human_review items, high priority first, then most issues first, then by docId. */
export function buildReviewQueue(decisions: RoutingDecision[]): RoutingDecision[] {
  return decisions;
}

export function hasError(extraction: InvoiceExtraction, expected: InvoiceExtraction): boolean {
  return KEY_FIELDS.some((f) => extraction[f] !== expected[f]);
}

/**
 * TODO(6): measure the router against ground truth (an extraction is wrong if hasError):
 *  - reviewRate = reviewed / all
 *  - precision = wrong among reviewed / reviewed   (1 if nothing reviewed)
 *  - recall = wrong that were reviewed / all wrong  (1 if nothing wrong)
 *  - missed = ids of wrong extractions that were auto-approved
 */
export function evaluateRouting(
  _decisions: RoutingDecision[],
  _extractions: Map<string, InvoiceExtraction>,
  _truth: Map<string, InvoiceExtraction>,
): { reviewRate: number; precision: number; recall: number; missed: string[] } {
  return { reviewRate: 0, precision: 0, recall: 0, missed: [] };
}

/**
 * TODO(7): this samples from everything. A random audit's job is to estimate the errors the router lets
 * THROUGH, so sample only from auto-approved items: ceil(pool × rate) of them (at least 1 if the pool isn't
 * empty), chosen with the injected rng.
 */
export function auditSample(decisions: RoutingDecision[], rate: number, rng: () => number): RoutingDecision[] {
  return decisions.filter(() => rng() < rate);
}
