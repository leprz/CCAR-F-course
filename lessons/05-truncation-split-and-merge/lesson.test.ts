import { describe, expect, it } from 'vitest';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text } from '../../lib/testing/index.ts';
import { largeInvoice } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const expected = largeInvoice.expected;
const userText = (p: MessageCreateParamsNonStreaming) => String(p.messages.at(-1)?.content ?? '');
const lineNumbersIn = (p: MessageCreateParamsNonStreaming) =>
  [...userText(p).matchAll(/^\s*(\d+)\s+Fastener kit/gm)].map((m) => Number(m[1]));
const isChunkCall = (p: MessageCreateParamsNonStreaming) =>
  'line_items' in ((p.output_config?.format?.schema as { properties?: object } | undefined)?.properties ?? {}) &&
  !('vendor_name' in ((p.output_config?.format?.schema as { properties?: object }).properties ?? {}));

/** Simulated model: answers header and chunk calls from the ground truth, truncating chunks above `maxLines`. */
function responder(maxLines = Infinity) {
  return (p: MessageCreateParamsNonStreaming) => {
    if (!isChunkCall(p)) {
      const { line_items: _l, ...header } = expected;
      return reply([text(JSON.stringify(header))], 'end_turn');
    }
    const nos = lineNumbersIn(p);
    if (nos.length > maxLines) return reply([text('{"line_items":[{"line_no":1,"descr')], 'max_tokens');
    const items = nos.map((n) => ({ line_no: n, ...expected.line_items[n - 1]! }));
    return reply([text(JSON.stringify({ line_items: items }))], 'end_turn');
  };
}

describe('TODO(1) splitDocument / chunkLines', () => {
  const parts = lesson.splitDocument(largeInvoice.text);
  it('separates header, the 60 item lines and footer', () => {
    expect(parts.itemLines).toHaveLength(60);
    expect(parts.header).toMatch(/GX-55120/);
    expect(parts.header).not.toMatch(/SKU-1001/);
    expect(parts.footer).toMatch(/TOTAL DUE/);
  });
  it('chunks into consecutive pieces of at most `size`', () => {
    expect(lesson.chunkLines(parts.itemLines, 25).map((c) => c.length)).toEqual([25, 25, 10]);
    expect(lesson.chunkLines(parts.itemLines, 25).flat()).toEqual(parts.itemLines);
  });
});

describe('TODO(2) buildChunkRequest', () => {
  const parts = lesson.splitDocument(largeInvoice.text);
  const chunks = lesson.chunkLines(parts.itemLines, 20);
  const req = lesson.buildChunkRequest(parts, chunks[0]!, 0, chunks.length, 'claude-haiku-5-5');
  it('contains the header context and only its own lines', () => {
    expect(userText(req)).toMatch(/GX-55120/);
    expect(lineNumbersIn(req)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  it('requests the line-items schema with a bounded output budget', () => {
    expect(req.output_config?.format?.schema).toBe(lesson.LINE_ITEMS_SCHEMA);
    expect(req.max_tokens).toBeLessThanOrEqual(lesson.MAX_TOKENS_CEILING);
  });
});

describe('TODO(3) mergeLineItems', () => {
  it('orders by line_no and drops overlaps', () => {
    const a = { description: 'a', quantity: 1, unit_price: 1, amount: 1 };
    const merged = lesson.mergeLineItems([
      [{ ...a, line_no: 3, description: 'c' }, { ...a, line_no: 4, description: 'd' }],
      [{ ...a, line_no: 1, description: 'a' }, { ...a, line_no: 2, description: 'b' }, { ...a, line_no: 3, description: 'c' }],
    ]);
    expect(merged.map((m) => m.description)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged[0]).not.toHaveProperty('line_no');
  });
});

describe('TODO(4) extractLargeInvoice', () => {
  it('splits into a header call plus scoped chunk calls and merges a complete result', async () => {
    const client = new FakeClient(Array.from({ length: 4 }, () => responder()));
    const { extraction, issues } = await lesson.extractLargeInvoice(client, largeInvoice, { chunkSize: 20 });
    expect(issues).toEqual([]);
    expect(extraction).toEqual(expected);
    expect(client.calls.filter(isChunkCall)).toHaveLength(3);
  });

  it('handles a truncated chunk by splitting it, never by raising max_tokens', async () => {
    const client = new FakeClient(Array.from({ length: 20 }, () => responder(10)));
    const { extraction, issues } = await lesson.extractLargeInvoice(client, largeInvoice, { chunkSize: 20 });
    expect(issues).toEqual([]);
    expect(extraction.line_items).toEqual(expected.line_items);
    for (const call of client.calls) expect(call.max_tokens).toBeLessThanOrEqual(lesson.MAX_TOKENS_CEILING);
    expect(client.calls.filter(isChunkCall)).toHaveLength(3 + 6);
  });

  it('reports a line-count mismatch instead of returning a silently partial result', async () => {
    const dropping = (p: MessageCreateParamsNonStreaming) => {
      const r = responder()(p);
      if (!isChunkCall(p) || !lineNumbersIn(p).includes(1)) return r;
      const block = r.content[0] as { text: string };
      const parsed = JSON.parse(block.text) as { line_items: unknown[] };
      return reply([text(JSON.stringify({ line_items: parsed.line_items.slice(1) }))], 'end_turn');
    };
    const client = new FakeClient(Array.from({ length: 4 }, () => dropping));
    const { issues } = await lesson.extractLargeInvoice(client, largeInvoice, { chunkSize: 20 });
    expect(issues.join('\n')).toMatch(/60/);
  });
});
