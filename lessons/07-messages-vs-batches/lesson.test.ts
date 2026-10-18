import { describe, expect, it } from 'vitest';
import type { BatchCreateParams, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { loadLesson } from '../../lib/lesson.ts';
import { reply, text } from '../../lib/testing/index.ts';
import { invoiceDoc, invoiceDocs } from '../../fixtures/invoices/index.ts';
import { FakeBatches } from './batches-client.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const noSleep = async () => {};
const HOUR = 3600;

const succeeded = (custom_id: string, docId = custom_id): MessageBatchIndividualResponse => ({
  custom_id,
  result: { type: 'succeeded', message: reply([text(JSON.stringify(invoiceDoc(docId).expected))], 'end_turn') },
});
const errored = (custom_id: string, type: string): MessageBatchIndividualResponse =>
  ({
    custom_id,
    result: { type: 'errored', error: { type: 'error', request_id: null, error: { type, message: `${type} happened` } } },
  }) as MessageBatchIndividualResponse;
const notRun = (custom_id: string, type: 'expired' | 'canceled'): MessageBatchIndividualResponse => ({
  custom_id,
  result: { type },
});

describe('TODO(1) chooseProcessingMode', () => {
  const base = { requestCount: 1, needsClientToolLoop: false, blocking: false, acceptableWaitSeconds: 48 * HOUR };
  const cases: Array<[string, Partial<Parameters<Lesson['chooseProcessingMode']>[0]>, 'sync' | 'batch']> = [
    ['live chat reply', { requestCount: 1, blocking: true, acceptableWaitSeconds: 5 }, 'sync'],
    ['nightly re-triage of 10k tickets, due in 36h', { requestCount: 10_000, acceptableWaitSeconds: 36 * HOUR }, 'batch'],
    ['pre-merge CI review of 300 files', { requestCount: 300, blocking: true, acceptableWaitSeconds: 15 * 60 }, 'sync'],
    ['3 invoices for month-end close in 2 days', { requestCount: 3, acceptableWaitSeconds: 48 * HOUR }, 'batch'],
    ['5k-ticket report needed by 9am (in 4h)', { requestCount: 5_000, acceptableWaitSeconds: 4 * HOUR }, 'sync'],
    ['2k tickets needing client-tool lookups', { requestCount: 2_000, needsClientToolLoop: true }, 'sync'],
  ];
  for (const [name, overrides, expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(lesson.chooseProcessingMode({ ...base, name, ...overrides }).mode).toBe(expected);
    });
  }
});

describe('TODO(2) custom_id', () => {
  it('sanitizes keys to the allowed pattern and 64 characters', () => {
    expect(lesson.toCustomId('INV 2026/03 #7')).toMatch(lesson.CUSTOM_ID_PATTERN);
    expect(lesson.toCustomId('x'.repeat(100))).toHaveLength(64);
  });
  it('uses the document id as the custom_id and the sync request shape as params', () => {
    const requests = lesson.buildBatchRequests(invoiceDocs);
    expect(requests.map((r) => r.custom_id)).toEqual(invoiceDocs.map((d) => d.id));
    for (const r of requests) expect(r.custom_id).toMatch(lesson.CUSTOM_ID_PATTERN);
    expect(requests[0]?.params).toEqual(lesson.buildExtractionParams(invoiceDocs[0]!));
  });
  it('rejects duplicate custom_ids', () => {
    expect(() => lesson.buildBatchRequests([invoiceDoc('INV-1'), invoiceDoc('INV-1')])).toThrow(/duplicate/i);
  });
});

describe('TODO(3) waitForBatch', () => {
  it('polls until processing_status is "ended"', async () => {
    const fake = new FakeBatches(() => [], ['in_progress', 'in_progress', 'in_progress', 'ended']);
    const { id } = await fake.messages.batches.create({ requests: [] });
    const sleeps: number[] = [];
    const batch = await lesson.waitForBatch(fake, id, { intervalMs: 10, sleep: async (ms) => void sleeps.push(ms) });
    expect(batch.processing_status).toBe('ended');
    expect(fake.retrieveCalls).toHaveLength(3);
    expect(sleeps).toEqual([10, 10]);
  });
  it('gives up after the timeout', async () => {
    const fake = new FakeBatches(() => [], ['in_progress']);
    const { id } = await fake.messages.batches.create({ requests: [] });
    await expect(lesson.waitForBatch(fake, id, { intervalMs: 10, timeoutMs: 30, sleep: noSleep })).rejects.toThrow();
    expect(fake.retrieveCalls.length).toBeLessThanOrEqual(5);
  });
});

describe('TODO(4) collectResults', () => {
  it('matches out-of-order results by custom_id', async () => {
    const fake = new FakeBatches(() => [succeeded('INV-3'), succeeded('INV-1'), succeeded('INV-2')]);
    const { id } = await fake.messages.batches.create({ requests: [] });
    const { succeeded: ok } = await lesson.collectResults(fake, id);
    expect([...ok.keys()].sort()).toEqual(['INV-1', 'INV-2', 'INV-3']);
    expect(ok.get('INV-3')?.total_amount).toBe(invoiceDoc('INV-3').expected.total_amount);
  });
  it('classifies failures: expired/canceled and transient errors retry, invalid requests do not', async () => {
    const fake = new FakeBatches(() => [
      succeeded('INV-1'),
      notRun('INV-2', 'expired'),
      notRun('INV-3', 'canceled'),
      errored('INV-4', 'overloaded_error'),
      errored('INV-5', 'invalid_request_error'),
    ]);
    const { id } = await fake.messages.batches.create({ requests: [] });
    const { failed } = await lesson.collectResults(fake, id);
    const byId = Object.fromEntries(failed.map((f) => [f.custom_id, f]));
    expect(byId['INV-2']).toMatchObject({ type: 'expired', retryable: true });
    expect(byId['INV-3']).toMatchObject({ type: 'canceled', retryable: true });
    expect(byId['INV-4']).toMatchObject({ type: 'errored', retryable: true });
    expect(byId['INV-5']).toMatchObject({ type: 'errored', retryable: false });
  });
  it('treats a truncated success as a non-retryable failure instead of crashing', async () => {
    const truncated: MessageBatchIndividualResponse = {
      custom_id: 'INV-7',
      result: { type: 'succeeded', message: reply([text('{"document_type": "inv')], 'max_tokens') },
    };
    const fake = new FakeBatches(() => [truncated]);
    const { id } = await fake.messages.batches.create({ requests: [] });
    const { succeeded: ok, failed } = await lesson.collectResults(fake, id);
    expect(ok.size).toBe(0);
    expect(failed[0]).toMatchObject({ custom_id: 'INV-7', retryable: false });
  });
});

describe('TODO(5) retryRequests', () => {
  it('resubmits only retryable failures', () => {
    const original = lesson.buildBatchRequests([invoiceDoc('INV-1'), invoiceDoc('INV-2'), invoiceDoc('INV-3')]);
    const retry = lesson.retryRequests(
      [
        { custom_id: 'INV-2', type: 'expired', retryable: true, detail: '' },
        { custom_id: 'INV-3', type: 'errored', retryable: false, detail: '' },
      ],
      original,
    );
    expect(retry.map((r) => r.custom_id)).toEqual(['INV-2']);
  });
});

describe('TODO(6) runBatchExtraction', () => {
  it('retries the transient failures in a second, smaller batch', async () => {
    const respond = (requests: BatchCreateParams.Request[], batchIndex: number) =>
      requests.map((r) =>
        batchIndex === 0 && r.custom_id === 'INV-2' ? notRun('INV-2', 'expired')
        : batchIndex === 0 && r.custom_id === 'INV-5' ? errored('INV-5', 'invalid_request_error')
        : succeeded(r.custom_id),
      );
    const fake = new FakeBatches(respond);
    const docs = ['INV-1', 'INV-2', 'INV-3', 'INV-5'].map(invoiceDoc);
    const out = await lesson.runBatchExtraction(fake, docs, { sleep: noSleep });

    expect(fake.created).toHaveLength(2);
    expect(fake.created[1]?.requests.map((r) => r.custom_id)).toEqual(['INV-2']);
    expect([...out.extractions.keys()].sort()).toEqual(['INV-1', 'INV-2', 'INV-3']);
    expect(out.failed.map((f) => f.custom_id)).toEqual(['INV-5']);
  });
});
