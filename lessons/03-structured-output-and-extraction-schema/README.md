# L03 — Choosing the output method and designing an extraction schema

**Objectives:** O25 (choose structured output method: JSON outputs / tool schema / prompt / prefill), O26 (extraction schemas with optional, nullable and enum fields that don't force fabrication)
**Scenario:** accounts-payable inbox (`fixtures/invoices/`)
**Read first:** [Part 2 lecture](../../teach-me/lectures/02-structured-output-and-extraction/lecture.md), sections 1–2 (*How do you get JSON you can trust?* and *What should the model say when the document doesn't say?*)

## Situation

Northwind's accounts-payable team (the people who pay supplier bills) wants every incoming document turned into an `InvoiceExtraction` record. The current integration
asks for "JSON", prefills `{`, and parses the text. On current models the prefill alone returns a 400 error. Even on models that
accept it, the schema forces values the documents don't contain: a contract has no invoice number, a German invoice has no
PO (purchase order number), and one invoice states no currency. The model fills those gaps with plausible inventions.

## Your task

Edit `starter/index.ts`:

1. `INVOICE_SCHEMA`: make every field required **and** nullable where the value can be absent, give the enums escape values
   (`"other"`, `null`), add `ambiguous_fields`, and keep it within what structured outputs accepts (no `minimum`,
   `maxLength`, `maxItems`, `minItems` above 1; every object `additionalProperties: false`; put such rules in `description`).
2. `SYSTEM_PROMPT` + `buildExtractionRequest`: no prefill, use `output_config.format`, and tell the model to return null and flag ambiguity.
3. `parseExtraction`: don't trust a response whose `stop_reason` is `refusal` or `max_tokens`.

```bash
npx vitest lessons/03
SOLUTION=1 npx vitest run lessons/03
npm run test:live -- lessons/03
```

`fixtures/invoices/schema.ts` contains a finished reference schema used by later lessons. Solve this lesson before you open it.
