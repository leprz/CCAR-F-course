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
 * TODO(1): this picks the mode by volume. Decide on what actually matters instead:
 *  - is anything (a user, CI, the next pipeline step) waiting on the result?
 *  - can the consumer wait the full 24h batch window (BATCH_WINDOW_SECONDS)?
 *  - does the model need client tool round trips (each one would be another batch)?
 * Batch only when nothing blocks, the window is acceptable, and there is no client tool loop.
 */
export function chooseProcessingMode(w: Workload): { mode: ProcessingMode; reason: string } {
  return w.requestCount > 100
    ? { mode: 'batch', reason: 'large volume' }
    : { mode: 'sync', reason: 'small volume' };
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

/**
 * TODO(2): custom_id must match CUSTOM_ID_PATTERN (1–64 chars: letters, digits, "_" and "-") and be unique
 * within the batch, or results can't be matched back. Sanitize keys here, use the document id as the key in
 * buildBatchRequests, and throw on duplicates.
 */
export function toCustomId(key: string): string {
  return key;
}

export function buildBatchRequests(docs: InvoiceDoc[], model?: string): BatchCreateParams.Request[] {
  return docs.map((doc) => ({ custom_id: `${doc.id}/${doc.traits[0]}`, params: buildExtractionParams(doc, model) }));
}

/**
 * TODO(3): retrieve once and return. Poll instead: retrieve, and if processing_status isn't "ended", sleep
 * `intervalMs` and try again. Throw once `timeoutMs` worth of waiting has passed. Use the injected `sleep`.
 */
export async function waitForBatch(
  client: BatchesClient,
  batchId: string,
  _opts: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MessageBatch> {
  return client.messages.batches.retrieve(batchId);
}

export interface FailedRequest {
  custom_id: string;
  type: 'errored' | 'canceled' | 'expired';
  retryable: boolean;
  detail: string;
}

export function parseExtraction(message: Message): InvoiceExtraction {
  const block = message.content.find((b) => b.type === 'text');
  if (message.stop_reason !== 'end_turn' || block?.type !== 'text') {
    throw new Error(`Unusable result (stop_reason ${message.stop_reason})`);
  }
  return JSON.parse(block.text) as InvoiceExtraction;
}

/**
 * TODO(4): only successes are kept, and in arrival order. Results come back in ANY order, so key every
 * result by its custom_id. Record each non-success as a FailedRequest:
 *  - canceled / expired: never reached the model, not billed → retryable
 *  - errored: retryable only for transient types (api_error, overloaded_error, rate_limit_error, timeout_error);
 *    invalid_request_error needs a fix, not a retry
 *  - succeeded but unparseable (e.g. max_tokens): not retryable
 */
export async function collectResults(
  client: BatchesClient,
  batchId: string,
): Promise<{ succeeded: Map<string, InvoiceExtraction>; failed: FailedRequest[] }> {
  const succeeded = new Map<string, InvoiceExtraction>();
  let position = 0;
  for await (const line of await client.messages.batches.results(batchId)) {
    if (line.result.type === 'succeeded') succeeded.set(String(position), parseExtraction(line.result.message));
    position++;
  }
  return { succeeded, failed: [] };
}

/** TODO(5): resubmit only the retryable failures (by custom_id), not the whole batch. */
export function retryRequests(_failed: FailedRequest[], original: BatchCreateParams.Request[]): BatchCreateParams.Request[] {
  return original;
}

/** TODO(6): run one retry round by default (maxRetryRounds = 1), resubmitting only what retryRequests returns. */
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

  for (let round = 0; round <= (opts.maxRetryRounds ?? 0) && pending.length > 0; round++) {
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
