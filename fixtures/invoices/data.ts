/**
 * Document-extraction scenario: accounts-payable inbox of Northwind Traders LLC.
 * Each document is plain text as it arrives after OCR, in deliberately different formats. The text lives in
 * `documents/<id>.txt`, so it can be read (and linked from the lectures) as a file.
 * `expected` is the ground truth. `null` means the document does NOT contain the value, so a
 * correct extractor must return null rather than guess.
 */

import { readFileSync } from 'node:fs';

/** The OCR text of one document, from `documents/<id>.txt` (without the file's final newline). */
function readDocument(id: string): string {
  return readFileSync(new URL(`./documents/${id}.txt`, import.meta.url), 'utf8').replace(/\n$/, '');
}

export const DOCUMENT_TYPES = ['invoice', 'credit_note', 'contract', 'other'] as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'other'] as const;
export const AMBIGUOUS_FIELD_NAMES = ['issue_date', 'due_date', 'currency', 'total_amount', 'vendor_name'] as const;

export interface LineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
}

export interface InvoiceExtraction {
  document_type: (typeof DOCUMENT_TYPES)[number];
  vendor_name: string | null;
  invoice_number: string | null;
  po_number: string | null;
  /** ISO 8601 date, YYYY-MM-DD. */
  issue_date: string | null;
  due_date: string | null;
  currency: (typeof CURRENCIES)[number] | null;
  /** Plain number, '.' decimal separator. Credit notes are negative. */
  total_amount: number | null;
  line_items: LineItem[];
  payment_terms: string | null;
  /** Fields whose value the document states in a way that supports more than one reading. */
  ambiguous_fields: (typeof AMBIGUOUS_FIELD_NAMES)[number][];
}

export interface InvoiceDoc {
  id: string;
  /** What makes this document interesting; used to pick diverse few-shot examples. */
  traits: string[];
  text: string;
  expected: InvoiceExtraction;
}

const acme: InvoiceDoc = {
  id: 'INV-1',
  traits: ['us-date', 'usd', 'clean'],
  text: readDocument('INV-1'),
  expected: {
    document_type: 'invoice',
    vendor_name: 'Acme Office Supply Inc.',
    invoice_number: '10234',
    po_number: '4500-1182',
    issue_date: '2026-03-04',
    due_date: '2026-04-03',
    currency: 'USD',
    total_amount: 1245.5,
    line_items: [
      { description: 'Printer paper, A4 (box)', quantity: 10, unit_price: 24.5, amount: 245 },
      { description: 'Toner cartridge HP 58A', quantity: 4, unit_price: 189, amount: 756 },
      { description: 'Ergonomic chair mat', quantity: 2, unit_price: 122.25, amount: 244.5 },
    ],
    payment_terms: 'Net 30',
    ambiguous_fields: [],
  },
};

const mueller: InvoiceDoc = {
  id: 'INV-2',
  traits: ['eu-date', 'eu-decimal', 'eur', 'no-po', 'bank-details'],
  text: readDocument('INV-2'),
  expected: {
    document_type: 'invoice',
    vendor_name: 'Müller Industrietechnik GmbH',
    invoice_number: 'RE-2026-0457',
    po_number: null,
    issue_date: '2026-03-04',
    due_date: '2026-03-18',
    currency: 'EUR',
    total_amount: 1234.56,
    line_items: [
      { description: 'Hydraulikschlauch 2m', quantity: 5, unit_price: 45, amount: 225 },
      { description: 'Dichtungssatz', quantity: 12, unit_price: 84.13, amount: 1009.56 },
    ],
    payment_terms: '14 Tage netto',
    ambiguous_fields: [],
  },
};

const creditNote: InvoiceDoc = {
  id: 'INV-3',
  traits: ['credit-note', 'negative-total', 'usd'],
  text: readDocument('INV-3'),
  expected: {
    document_type: 'credit_note',
    vendor_name: 'Acme Office Supply Inc.',
    invoice_number: 'CN-889',
    po_number: '4500-1182',
    issue_date: '2026-03-20',
    due_date: null,
    currency: 'USD',
    total_amount: -189,
    line_items: [{ description: 'Toner cartridge HP 58A (returned)', quantity: 1, unit_price: -189, amount: -189 }],
    payment_terms: null,
    ambiguous_fields: [],
  },
};

const handwritten: InvoiceDoc = {
  id: 'INV-4',
  traits: ['handwritten', 'gbp', 'no-po', 'informal-date'],
  text: readDocument('INV-4'),
  expected: {
    document_type: 'invoice',
    vendor_name: 'J. Barker & Sons',
    invoice_number: '77-B',
    po_number: null,
    issue_date: '2026-03-05',
    due_date: null,
    currency: 'GBP',
    total_amount: 340,
    line_items: [
      { description: 'labour', quantity: null, unit_price: null, amount: 220 },
      { description: 'materials', quantity: null, unit_price: null, amount: 120 },
    ],
    payment_terms: null,
    ambiguous_fields: [],
  },
};

const ambiguous: InvoiceDoc = {
  id: 'INV-5',
  traits: ['ambiguous-date', 'no-currency', 'relative-due-date'],
  text: readDocument('INV-5'),
  expected: {
    document_type: 'invoice',
    vendor_name: 'Brightline Consulting',
    invoice_number: '2026-031',
    po_number: null,
    issue_date: null,
    due_date: null,
    currency: null,
    total_amount: 1500,
    line_items: [{ description: 'Professional services – workshop facilitation (2 days)', quantity: null, unit_price: null, amount: 1500 }],
    payment_terms: 'within 15 days',
    ambiguous_fields: ['issue_date', 'currency'],
  },
};

const contract: InvoiceDoc = {
  id: 'INV-6',
  traits: ['contract', 'not-an-invoice', 'recurring-fee'],
  text: readDocument('INV-6'),
  expected: {
    document_type: 'contract',
    vendor_name: 'Cloudway Hosting Ltd',
    invoice_number: null,
    po_number: null,
    issue_date: null,
    due_date: null,
    currency: 'GBP',
    total_amount: null,
    line_items: [],
    payment_terms: '30 days from invoice date',
    ambiguous_fields: [],
  },
};

const polish: InvoiceDoc = {
  id: 'INV-8',
  traits: ['pl-decimal', 'space-thousands', 'pln', 'eu-date'],
  text: readDocument('INV-8'),
  expected: {
    document_type: 'invoice',
    vendor_name: 'Kowalski i Wspólnicy Sp. z o.o.',
    invoice_number: 'FV/2026/03/112',
    po_number: null,
    issue_date: '2026-03-12',
    due_date: '2026-03-26',
    currency: 'PLN',
    total_amount: 2460,
    line_items: [{ description: 'Usługa wdrożeniowa', quantity: 1, unit_price: 2000, amount: 2460 }],
    payment_terms: 'przelew 14 dni',
    ambiguous_fields: [],
  },
};

/** A 60-line invoice: too large to extract line by line in one modest response. */
function buildLargeInvoice(): InvoiceDoc {
  // documents/INV-7.txt lists exactly these 60 items and their total; keep the two in sync.
  const items: LineItem[] = Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    const quantity = (n % 5) + 1;
    const unit_price = Math.round((3.75 * n + 0.4) * 100) / 100;
    return { description: `Fastener kit SKU-${String(1000 + n)}`, quantity, unit_price, amount: Math.round(quantity * unit_price * 100) / 100 };
  });
  const total = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
  return {
    id: 'INV-7',
    traits: ['large', 'usd', 'iso-date'],
    text: readDocument('INV-7'),
    expected: {
      document_type: 'invoice',
      vendor_name: 'Globex Industrial Supply',
      invoice_number: 'GX-55120',
      po_number: '4500-1300',
      issue_date: '2026-03-10',
      due_date: '2026-04-09',
      currency: 'USD',
      total_amount: total,
      line_items: items,
      payment_terms: 'Net 30',
      ambiguous_fields: [],
    },
  };
}

export const largeInvoice: InvoiceDoc = buildLargeInvoice();

/** Everyday documents (excludes the large one, which has its own lesson). */
export const invoiceDocs: InvoiceDoc[] = [acme, mueller, creditNote, handwritten, ambiguous, contract, polish];

export function invoiceDoc(id: string): InvoiceDoc {
  const doc = [...invoiceDocs, largeInvoice].find((d) => d.id === id);
  if (!doc) throw new Error(`No invoice fixture ${id}`);
  return doc;
}

/** Fields compared when scoring an extraction (free-text fields are too fuzzy to compare exactly). */
export const KEY_FIELDS = [
  'document_type',
  'invoice_number',
  'po_number',
  'issue_date',
  'due_date',
  'currency',
  'total_amount',
] as const satisfies readonly (keyof InvoiceExtraction)[];
