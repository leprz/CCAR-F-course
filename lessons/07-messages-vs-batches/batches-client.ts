import type {
  BatchCreateParams,
  MessageBatch,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages/batches';

/**
 * The slice of `client.messages.batches` this lesson uses. The real `Anthropic` client satisfies it,
 * and so does `FakeBatches` below, which lets the structural tests run offline.
 */
export interface BatchesClient {
  messages: {
    batches: {
      create(params: BatchCreateParams): PromiseLike<MessageBatch>;
      retrieve(batchId: string): PromiseLike<MessageBatch>;
      results(batchId: string): PromiseLike<AsyncIterable<MessageBatchIndividualResponse>>;
    };
  };
}

type Status = MessageBatch['processing_status'];

/**
 * Scripted Message Batches backend. Each `create` returns a new batch. Every `retrieve` advances that
 * batch's status along `statuses`, and `results` yields whatever `respond` returns for the batch's requests.
 */
export class FakeBatches implements BatchesClient {
  readonly created: BatchCreateParams[] = [];
  readonly retrieveCalls: string[] = [];
  private readonly batches = new Map<string, { params: BatchCreateParams; polls: number }>();

  constructor(
    private readonly respond: (requests: BatchCreateParams.Request[], batchIndex: number) => MessageBatchIndividualResponse[],
    private readonly statuses: Status[] = ['in_progress', 'ended'],
  ) {}

  private batch(id: string, params: BatchCreateParams, polls: number): MessageBatch {
    const status = this.statuses[Math.min(polls, this.statuses.length - 1)]!;
    const n = params.requests.length;
    return {
      id,
      type: 'message_batch',
      archived_at: null,
      cancel_initiated_at: null,
      created_at: '2026-10-18T00:00:00Z',
      ended_at: status === 'ended' ? '2026-10-18T00:30:00Z' : null,
      expires_at: '2026-10-19T00:00:00Z',
      processing_status: status,
      request_counts: { processing: status === 'ended' ? 0 : n, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      results_url: status === 'ended' ? `https://example.invalid/${id}.jsonl` : null,
    };
  }

  messages = {
    batches: {
      create: async (params: BatchCreateParams): Promise<MessageBatch> => {
        this.created.push(structuredClone(params));
        const id = `msgbatch_fake_${this.created.length}`;
        this.batches.set(id, { params, polls: 0 });
        return this.batch(id, params, 0);
      },
      retrieve: async (batchId: string): Promise<MessageBatch> => {
        this.retrieveCalls.push(batchId);
        const entry = this.batches.get(batchId);
        if (!entry) throw new Error(`FakeBatches: unknown batch ${batchId}`);
        entry.polls++;
        return this.batch(batchId, entry.params, entry.polls);
      },
      results: async (batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>> => {
        const entry = this.batches.get(batchId);
        if (!entry) throw new Error(`FakeBatches: unknown batch ${batchId}`);
        const lines = this.respond(entry.params.requests, [...this.batches.keys()].indexOf(batchId));
        return (async function* () {
          yield* lines;
        })();
      },
    },
  };
}
