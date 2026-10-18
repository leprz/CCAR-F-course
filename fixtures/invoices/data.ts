/**
 * Document-extraction scenario: accounts-payable inbox of Northwind Traders LLC.
 * Each document is plain text as it arrives after OCR, in deliberately different formats.
 * `expected` is the ground truth. `null` means the document does NOT contain the value, so a
 * correct extractor must return null rather than guess.
 */

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
  text: `ACME OFFICE SUPPLY INC.
1200 Market St, Philadelphia, PA 19107
INVOICE
Invoice #: 10234
Invoice Date: 03/04/2026
Due Date: 04/03/2026
PO Number: 4500-1182
Bill To: Northwind Traders LLC

Qty  Description                 Unit Price   Amount
10   Printer paper, A4 (box)     $24.50       $245.00
4    Toner cartridge HP 58A      $189.00      $756.00
2    Ergonomic chair mat         $122.25      $244.50
                                 TOTAL USD    $1,245.50
Terms: Net 30`,
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
  text: `Müller Industrietechnik GmbH
Hafenstraße 12, 20457 Hamburg
RECHNUNG
Rechnungsnummer: RE-2026-0457
Rechnungsdatum: 04.03.2026
Zahlbar bis: 18.03.2026
Kunde: Northwind Traders LLC

Pos  Bezeichnung              Menge  Einzelpreis   Betrag
1    Hydraulikschlauch 2m     5      45,00 €       225,00 €
2    Dichtungssatz            12     84,13 €       1.009,56 €
Gesamtbetrag                                       1.234,56 €
Zahlungsbedingungen: 14 Tage netto
Bankverbindung: IBAN DE89 3704 0044 0532 0130 00, BIC COBADEFFXXX`,
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
  text: `ACME OFFICE SUPPLY INC.
CREDIT NOTE
Credit Note No: CN-889
Date: 03/20/2026
Reference: Invoice #10234, PO 4500-1182
Reason: 1 toner cartridge returned damaged

1  Toner cartridge HP 58A (returned)   -$189.00
CREDIT TOTAL                            -$189.00
This amount will be applied to your next invoice.`,
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
  text: `[scanned image, handwritten]
J. Barker & Sons - joinery
inv no 77-B
date: 5th march '26
for: fitting 2 oak doors + materials
labour ...... 220
materials ... 120
   tot: £340 - cash or bank pls
[margin, different pen: "PAID?? check w/ Tom"]`,
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
  text: `Brightline Consulting
Invoice 2026-031
Date: 02/03/2026
Professional services – workshop facilitation (2 days)
Amount due: 1,500.00
Please pay within 15 days.`,
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
  text: `MASTER SERVICES AGREEMENT
between Cloudway Hosting Ltd ("Provider") and Northwind Traders LLC ("Client")
Effective date: 1 April 2026
Term: 12 months, renewing automatically.
Fees: GBP 2,000.00 per month, invoiced monthly in advance.
Payment terms: 30 days from invoice date.
Signed for the Provider: A. Patel, Director`,
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
  text: `Faktura VAT nr FV/2026/03/112
Data wystawienia: 12.03.2026
Termin płatności: 26.03.2026
Sprzedawca: Kowalski i Wspólnicy Sp. z o.o.
Nabywca: Northwind Traders LLC

Lp. Nazwa                  Ilość  Cena netto  Wartość brutto
1   Usługa wdrożeniowa     1      2 000,00    2 460,00
Razem do zapłaty: 2 460,00 zł
Sposób płatności: przelew 14 dni`,
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
  const items: LineItem[] = Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    const quantity = (n % 5) + 1;
    const unit_price = Math.round((3.75 * n + 0.4) * 100) / 100;
    return { description: `Fastener kit SKU-${String(1000 + n)}`, quantity, unit_price, amount: Math.round(quantity * unit_price * 100) / 100 };
  });
  const total = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
  const lines = items.map(
    (it, i) => `${String(i + 1).padStart(3, ' ')}  ${it.description.padEnd(26)} ${String(it.quantity).padStart(3)}  ${(it.unit_price ?? 0).toFixed(2).padStart(8)}  ${it.amount.toFixed(2).padStart(9)}`,
  );
  return {
    id: 'INV-7',
    traits: ['large', 'usd', 'iso-date'],
    text: [
      'GLOBEX INDUSTRIAL SUPPLY',
      'INVOICE GX-55120',
      'Issued: 2026-03-10   Due: 2026-04-09',
      'Customer PO: 4500-1300',
      'Currency: USD',
      'LINE ITEMS',
      'No.  Description                Qty  Unit       Amount',
      ...lines,
      'END LINE ITEMS',
      `TOTAL DUE: ${total.toFixed(2)} USD`,
      'Terms: Net 30',
    ].join('\n'),
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
