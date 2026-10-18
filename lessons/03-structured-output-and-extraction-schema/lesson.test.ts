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

  it('is accepted by structured outputs (no unsupported keywords)', async () => {
    const solution = await import('./solution/index.ts');
    expect(solution.findUnsupportedKeywords(lesson.INVOICE_SCHEMA)).toEqual([]);
  });
});

describe('TODO(2) findUnsupportedKeywords', () => {
  const bad = {
    type: 'object',
    properties: {
      total: { type: 'number', minimum: 0 },
      name: { type: 'string', maxLength: 10 },
      tags: { type: 'array', minItems: 2, items: { type: 'object', properties: { k: { type: 'string' } } } },
    },
  };
  it('reports constraint keywords by path', () => {
    const found = lesson.findUnsupportedKeywords(bad);
    expect(found).toEqual(expect.arrayContaining(['properties.total: minimum', 'properties.name: maxLength', 'properties.tags: minItems']));
  });
  it('reports objects without additionalProperties: false, including nested ones', () => {
    const found = lesson.findUnsupportedKeywords(bad);
    expect(found).toEqual(expect.arrayContaining([': additionalProperties', 'properties.tags.items: additionalProperties']));
  });
  it('accepts a compliant schema', () => {
    expect(lesson.findUnsupportedKeywords({ type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } })).toEqual([]);
  });
});

describe('TODO(3) chooseOutputMethod', () => {
  it.each([
    ['guaranteed', 'claude-haiku-5-5', 'json_outputs'],
    ['guaranteed', 'claude-opus-5-5', 'json_outputs'],
    ['guaranteed', 'claude-3-7-sonnet', 'forced_tool'],
    ['best_effort', 'claude-opus-5-5', 'prompt_only'],
    ['best_effort', 'claude-3-7-sonnet', 'prompt_only'],
  ] as const)('%s on %s → %s', (strictness, model, method) => {
    expect(lesson.chooseOutputMethod({ strictness, model })).toBe(method);
  });
  it('never treats prefill as a guarantee', () => {
    for (const model of Object.keys(lesson.MODEL_CAPS)) {
      expect(lesson.chooseOutputMethod({ strictness: 'guaranteed', model })).not.toBe('prefill');
    }
  });
});

describe('TODO(4) buildExtractionRequest', () => {
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

describe('TODO(5) parseExtraction', () => {
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
