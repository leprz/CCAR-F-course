import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { BatchCreateParams, MessageBatch } from '@anthropic-ai/sdk/resources/messages/batches';
import { modelFromEnv } from '../../../lib/claude.ts';
import { INVOICE_JSON_SCHEMA, type InvoiceDoc, type InvoiceExtraction } from '../../../fixtures/invoices/index.ts';
import type { BatchesClient } from '../batches-client.ts';

/** A batch may take up to 24 hours. Any result needed sooner than that can't rely on a batch. */
export const BATCH_WINDOW_SECONDS = 24 * 60 * 60;

export interface Workload {
  name: string;
  requestCount: number;
  /** How long the consumer can wait for the result before something breaks or a person is kept waiting. */
  acceptableWaitSeconds: number;
  /** A user, a CI job or the next pipeline step is waiting on this result. */
  blocking: boolean;
  /** The model must call client tools whose results go back into the same conversation. */
  needsClientToolLoop: boolean;
}

export type ProcessingMode = 'sync' | 'batch';

/**
 * Decide on latency and blocking, not on volume. A batch is 50% cheaper and doesn't count against
 * Messages API rate limits, but it only promises results within 24 hours, and each client-tool round
 * trip would be another batch.
 */
export function chooseProcessingMode(w: Workload): { mode: ProcessingMode; reason: string } {
  if (w.blocking) return { mode: 'sync', reason: 'something is waiting on the result' };
  if (w.acceptableWaitSeconds < BATCH_WINDOW_SECONDS) {
    return { mode: 'sync', reason: 'needed sooner than the 24h batch window guarantees' };
  }
  if (w.needsClientToolLoop) return { mode: 'sync', reason: 'each client tool round trip would be another batch' };
  return { mode: 'batch', reason: 'non-blocking and can wait 24h: take the 50% discount' };
}

export const SYSTEM_PROMPT =
  'You extract data from accounts-payable documents. Copy values only from the document. ' +
  'If a value is not in the document, return null. If it can be read more than one way, return null and list it in ambiguous_fields.';

/** The same request shape is used synchronously and inside a batch. Try it with the Messages API before batching thousands. */
export function buildExtractionParams(doc: InvoiceDoc, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` }],
  };
}

export const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Turn an arbitrary key into a valid custom_id: allowed characters only, at most 64 of them. */
export function toCustomId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function buildBatchRequests(docs: InvoiceDoc[], model?: string): BatchCreateParams.Request[] {
  const requests = docs.map((doc) => ({ custom_id: toCustomId(doc.id), params: buildExtractionParams(doc, model) }));
  const seen = new Set<string>();
  for (const r of requests) {
    if (seen.has(r.custom_id)) throw new Error(`Duplicate custom_id "${r.custom_id}": results could not be matched back`);
    seen.add(r.custom_id);
  }
  return requests;
}

/** Poll until processing_status is "ended". request_counts other than `processing` stay 0 until then. */
export async function waitForBatch(
  client: BatchesClient,
  batchId: string,
  opts: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MessageBatch> {
  const interval = opts.intervalMs ?? 60_000;
  const timeout = opts.timeoutMs ?? BATCH_WINDOW_SECONDS * 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let waited = 0;
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status === 'ended') return batch;
    if (waited >= timeout) throw new Error(`Batch ${batchId} still ${batch.processing_status} after ${waited}ms`);
    await sleep(interval);
    waited += interval;
  }
}

export interface FailedRequest {
  custom_id: string;
  type: 'errored' | 'canceled' | 'expired';
  retryable: boolean;
  detail: string;
}

/** These error types are worth resubmitting unchanged. An invalid_request_error needs a fix, not a retry. */
const RETRYABLE_ERRORS = new Set(['api_error', 'overloaded_error', 'rate_limit_error', 'timeout_error']);

export function parseExtraction(message: Message): InvoiceExtraction {
  const block = message.content.find((b) => b.type === 'text');
  if (message.stop_reason !== 'end_turn' || block?.type !== 'text') {
    throw new Error(`Unusable result (stop_reason ${message.stop_reason})`);
  }
  return JSON.parse(block.text) as InvoiceExtraction;
}

/** Results arrive in any order: match them to requests by custom_id, never by position. */
export async function collectResults(
  client: BatchesClient,
  batchId: string,
): Promise<{ succeeded: Map<string, InvoiceExtraction>; failed: FailedRequest[] }> {
  const succeeded = new Map<string, InvoiceExtraction>();
  const failed: FailedRequest[] = [];
  for await (const line of await client.messages.batches.results(batchId)) {
    const { result } = line;
    switch (result.type) {
      case 'succeeded':
        try {
          succeeded.set(line.custom_id, parseExtraction(result.message));
        } catch (err) {
          failed.push({ custom_id: line.custom_id, type: 'errored', retryable: false, detail: String(err) });
        }
        break;
      case 'errored':
        failed.push({
          custom_id: line.custom_id,
          type: 'errored',
          retryable: RETRYABLE_ERRORS.has(result.error.error.type),
          detail: `${result.error.error.type}: ${result.error.error.message}`,
        });
        break;
      case 'canceled':
      case 'expired':
        // Never sent to the model and not billed: resubmitting is safe.
        failed.push({ custom_id: line.custom_id, type: result.type, retryable: true, detail: result.type });
        break;
    }
  }
  return { succeeded, failed };
}

/** Resubmit only the requests that failed for a transient reason, with their original custom_ids. */
export function retryRequests(failed: FailedRequest[], original: BatchCreateParams.Request[]): BatchCreateParams.Request[] {
  const retry = new Set(failed.filter((f) => f.retryable).map((f) => f.custom_id));
  return original.filter((r) => retry.has(r.custom_id));
}

export async function runBatchExtraction(
  client: BatchesClient,
  docs: InvoiceDoc[],
  opts: { model?: string; sleep?: (ms: number) => Promise<void>; intervalMs?: number; maxRetryRounds?: number } = {},
): Promise<{ extractions: Map<string, InvoiceExtraction>; failed: FailedRequest[]; batchIds: string[] }> {
  const all = buildBatchRequests(docs, opts.model);
  const extractions = new Map<string, InvoiceExtraction>();
  const batchIds: string[] = [];
  let pending = all;
  const permanent: FailedRequest[] = [];
  let stillRetryable: FailedRequest[] = [];

  for (let round = 0; round <= (opts.maxRetryRounds ?? 1) && pending.length > 0; round++) {
    const batch = await client.messages.batches.create({ requests: pending });
    batchIds.push(batch.id);
    await waitForBatch(client, batch.id, { sleep: opts.sleep, intervalMs: opts.intervalMs });
    const out = await collectResults(client, batch.id);
    for (const [id, value] of out.succeeded) extractions.set(id, value);
    // Keep permanent failures from every round; retryable ones only matter if the last round still has them.
    permanent.push(...out.failed.filter((f) => !f.retryable));
    stillRetryable = out.failed.filter((f) => f.retryable);
    pending = retryRequests(out.failed, all);
  }
  return { extractions, failed: [...permanent, ...stillRetryable], batchIds };
}
