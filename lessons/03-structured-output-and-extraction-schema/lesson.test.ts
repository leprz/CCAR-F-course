import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text } from '../../lib/testing/index.ts';
import { invoiceDoc, invoiceDocs } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

type Node = Record<string, unknown>;
const schema = lesson.INVOICE_SCHEMA as Node;
const props = (schema.properties ?? {}) as Record<string, Node>;

const typesOf = (node: Node): string[] => {
  if (Array.isArray(node.type)) return node.type as string[];
  if (typeof node.type === 'string') return [node.type];
  if (Array.isArray(node.anyOf)) return (node.anyOf as Node[]).flatMap(typesOf);
  return [];
};
const allowsNull = (node: Node | undefined) => !!node && typesOf(node).includes('null');

/** Minimal JSON-schema check: type, enum, properties, required, additionalProperties:false, items. */
function conforms(value: unknown, node: Node, path = '$'): string[] {
  const types = typesOf(node);
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? 'number' : typeof value;
  const typeOk = types.length === 0 || types.includes(actual) || (actual === 'number' && types.includes('integer'));
  if (!typeOk) return [`${path}: ${actual} not in [${types.join(',')}]`];
  if (Array.isArray(node.enum) && !(node.enum as unknown[]).includes(value)) return [`${path}: ${String(value)} not in enum`];
  const errors: string[] = [];
  if (actual === 'object' && node.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of (node.required as string[] | undefined) ?? []) if (!(key in obj)) errors.push(`${path}.${key}: missing`);
    for (const [key, v] of Object.entries(obj)) {
      const child = (node.properties as Record<string, Node>)[key];
      if (!child) {
        if (node.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
        continue;
      }
      errors.push(...conforms(v, child, `${path}.${key}`));
    }
  }
  if (actual === 'array' && node.items) (value as unknown[]).forEach((v, i) => errors.push(...conforms(v, node.items as Node, `${path}[${i}]`)));
  return errors;
}

/** What structured outputs rejects with a 400: numeric/string/array constraints, and objects open to extra keys. */
const UNSUPPORTED_KEYWORDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems'];
function unsupported(node: unknown, path = '$'): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const n = node as Node;
  const problems = UNSUPPORTED_KEYWORDS.filter((k) => k in n).map((k) => `${path}: ${k}`);
  if (typeof n.minItems === 'number' && n.minItems > 1) problems.push(`${path}: minItems > 1`);
  if (typesOf(n).includes('object') && n.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
  for (const [key, child] of Object.entries((n.properties ?? {}) as Record<string, Node>)) problems.push(...unsupported(child, `${path}.${key}`));
  if (n.items) problems.push(...unsupported(n.items, `${path}[]`));
  return problems;
}

describe('TODO(1) schema lets the model say "absent" instead of fabricating', () => {
  it.each(['invoice_number', 'po_number', 'issue_date', 'due_date', 'currency', 'total_amount', 'payment_terms'])(
    '%s is nullable',
    (field) => expect(allowsNull(props[field])).toBe(true),
  );

  it('every property is required, so a key is never silently omitted', () => {
    expect([...((schema.required as string[]) ?? [])].sort()).toEqual(Object.keys(props).sort());
  });

  it('closed lists have an escape value', () => {
    expect(props.document_type?.enum).toContain('other');
    expect(props.currency?.enum).toEqual(expect.arrayContaining(['other', null]));
  });

  it('has an ambiguous_fields array', () => {
    expect(typesOf(props.ambiguous_fields ?? {})).toContain('array');
  });

  it.each(invoiceDocs.map((d) => d.id))('ground truth for %s validates against the schema', (id) => {
    expect(conforms(invoiceDoc(id).expected, schema)).toEqual([]);
  });

  it('is accepted by structured outputs (no unsupported keywords)', () => {
    expect(unsupported(schema)).toEqual([]);
  });
});

describe('TODO(2) buildExtractionRequest', () => {
  const req = lesson.buildExtractionRequest(invoiceDoc('INV-2'), 'claude-haiku-5-5');
  it('uses structured outputs with the schema', () => {
    expect(req.output_config?.format).toEqual({ type: 'json_schema', schema: lesson.INVOICE_SCHEMA });
  });
  it('does not prefill the assistant turn (400 on current models)', () => {
    expect(req.messages.at(-1)?.role).toBe('user');
  });
  it('tells the model to use null instead of guessing, and to flag ambiguity', () => {
    const system = String(req.system);
    expect(system).toMatch(/null/);
    expect(system).toMatch(/guess|invent|fabricat/i);
    expect(system).toMatch(/ambiguous_fields/);
  });
});

describe('TODO(3) parseExtraction', () => {
  const json = JSON.stringify(invoiceDoc('INV-2').expected);
  it('parses a complete response', () => {
    expect(lesson.parseExtraction(reply([text(json)], 'end_turn'))).toEqual(invoiceDoc('INV-2').expected);
  });
  it('rejects a response truncated at max_tokens', () => {
    expect(() => lesson.parseExtraction(reply([text(json.slice(0, 40))], 'max_tokens'))).toThrow(lesson.ExtractionError);
  });
  it('rejects a refusal', () => {
    expect(() => lesson.parseExtraction(reply([text('I cannot help with that.')], 'refusal'))).toThrow(lesson.ExtractionError);
  });
});

describe('end to end with a scripted model', () => {
  it('extracts INV-5 with nulls and flags ambiguity', async () => {
    const expected = invoiceDoc('INV-5').expected;
    const client = new FakeClient([reply([text(JSON.stringify(expected))], 'end_turn')]);
    await expect(lesson.extractInvoice(client, invoiceDoc('INV-5'))).resolves.toEqual(expected);
    expect(client.calls[0]?.output_config?.format?.type).toBe('json_schema');
  });
});
