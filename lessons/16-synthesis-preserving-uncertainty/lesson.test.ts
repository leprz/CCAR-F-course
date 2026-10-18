import { describe, expect, it } from 'vitest';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, toolUse } from '../../lib/testing/index.ts';
import { ANSWER_KEY, RESEARCH_QUESTION, sources } from '../../fixtures/research/index.ts';

type Lesson = typeof import('./solution/index.ts');
type Evidence = import('./solution/index.ts').Evidence;
type Synthesis = import('./solution/index.ts').Synthesis;
const lesson = await loadLesson<Lesson>(import.meta.url);

const byId = (id: string) => sources.find((s) => s.id === id)!;
const sorted = (xs: string[]) => [...xs].sort();

/** Evidence straight from the answer key, so TODO(5) can be tested without depending on TODO(3). */
const keyEvidence: Evidence[] = ANSWER_KEY.map((k) => ({
  claim: k.claim,
  status: k.status,
  supporting: k.supportingSources,
  conflicting: k.conflictingSources,
  discounted: k.discount,
}));

/** A synthesis that matches the answer key: what a careful analyst would write. */
const goodSynthesis: Synthesis = {
  claims: ANSWER_KEY.map((k) => ({
    claim: k.claim,
    status: k.status,
    statement: k.summary,
    supporting_sources: k.supportingSources,
    conflicting_sources: k.conflictingSources,
    discounted_sources: Object.entries(k.discount).map(([source_id, reason]) => ({ source_id, reason })),
  })),
  open_questions: ['Effects in product companies with on-call duties.'],
};

/** The classic failure: the conflict on output is flattened into one confident headline built on the vendor figure. */
const collapsedSynthesis: Synthesis = {
  claims: goodSynthesis.claims.map((c) =>
    c.claim === 'output'
      ? { ...c, status: 'well-established', statement: 'Productivity rises by up to 40% [S6].', supporting_sources: ['S6', 'S5'], conflicting_sources: [], discounted_sources: [] }
      : c,
  ),
  open_questions: [],
};

describe('TODO(1) the output schema has room for uncertainty', () => {
  const schema = lesson.SYNTHESIS_TOOL.input_schema as {
    properties: Record<string, { items?: { properties: Record<string, { enum?: string[]; items?: { required?: string[] } }>; required: string[] } }>;
    required: string[];
  };

  it('has one entry per claim instead of a single conclusion', () => {
    expect(schema.properties.conclusion).toBeUndefined();
    expect(schema.required).toEqual(expect.arrayContaining(['claims', 'open_questions']));
  });
  it('gives every claim its own status from the three allowed values', () => {
    const item = schema.properties.claims!.items!;
    expect(item.properties.status?.enum).toEqual(['well-established', 'contested', 'insufficient-evidence']);
    expect(item.properties.claim?.enum).toEqual(lesson.CLAIMS);
  });
  it('requires both sides of the evidence and the discounted sources with reasons', () => {
    const item = schema.properties.claims!.items!;
    expect(item.required).toEqual(
      expect.arrayContaining(['claim', 'status', 'statement', 'supporting_sources', 'conflicting_sources', 'discounted_sources']),
    );
    expect(item.properties.discounted_sources?.items?.required).toEqual(expect.arrayContaining(['source_id', 'reason']));
  });
});

describe('TODO(2) weighSource', () => {
  it('discounts the vendor whitepaper and the anecdotal blog, with reasons', () => {
    const vendor = lesson.weighSource(byId('S6'));
    expect(vendor.discounted).toBe(true);
    expect(vendor.reasons.join(' ')).toMatch(/vendor/i);
    const blog = lesson.weighSource(byId('S5'));
    expect(blog.discounted).toBe(true);
    expect(blog.reasons.join(' ')).toMatch(/blog|anecdot/i);
  });
  it('discounts a peer-reviewed source when it is badly out of date', () => {
    const old = lesson.weighSource(byId('S7'));
    expect(old.discounted).toBe(true);
    expect(old.reasons.join(' ')).toMatch(/outdated \(2009\)/);
  });
  it('keeps strong and middling sources, weighted by type', () => {
    expect(lesson.weighSource(byId('S9'))).toMatchObject({ weight: 1, discounted: false });
    expect(lesson.weighSource(byId('S4'))).toMatchObject({ weight: 0.6, discounted: false });
    const news = lesson.weighSource(byId('S8'));
    expect(news.discounted).toBe(false);
    expect(news.weight).toBeLessThan(0.6);
  });
});

describe('TODO(3) classifyClaim / classifyAll match the answer key', () => {
  const evidence = lesson.classifyAll(sources);

  for (const key of ANSWER_KEY) {
    it(`${key.claim}: ${key.status}, same sources cited, same sources discounted`, () => {
      const e = evidence.find((x) => x.claim === key.claim)!;
      expect(e.status).toBe(key.status);
      expect(sorted([...e.supporting, ...e.conflicting])).toEqual(sorted([...key.supportingSources, ...key.conflictingSources]));
      expect(sorted(Object.keys(e.discounted))).toEqual(sorted(Object.keys(key.discount)));
    });
  }

  it('puts the randomised study on the other side of the output conflict', () => {
    const output = evidence.find((x) => x.claim === 'output')!;
    expect(sorted(output.supporting)).toEqual(['S1', 'S10', 'S2', 'S3']);
    expect(output.conflicting).toEqual(['S9']);
  });
});

describe('TODO(4) buildSynthesisPrompt', () => {
  const prompt = lesson.buildSynthesisPrompt(RESEARCH_QUESTION, sources, keyEvidence);

  it('carries every source id with its date and type', () => {
    for (const s of sources) {
      const line = prompt.split('\n').find((l) => l.includes(s.id) && l.includes(s.date));
      expect(line, `${s.id} with its date`).toBeDefined();
      expect(line).toContain(s.type);
    }
  });
  it('includes the evidence table with each claim\'s status', () => {
    expect(prompt).toMatch(/output[^\n]*contested/);
    expect(prompt).toMatch(/collaboration[^\n]*insufficient-evidence/);
  });
  it('tells the model to keep conflicts visible instead of a single confident answer', () => {
    expect(prompt).toMatch(/both sides/i);
    expect(prompt).toMatch(/never (merge|collapse)|do not (merge|collapse)|don't (merge|collapse)/i);
    expect(prompt).not.toMatch(/one clear, confident answer/i);
  });
});

describe('TODO(5) validateSynthesis', () => {
  const ids = sources.map((s) => s.id);

  it('accepts a synthesis that matches the evidence', () => {
    expect(lesson.validateSynthesis(goodSynthesis, keyEvidence, ids)).toEqual([]);
  });

  it('catches a contested claim collapsed into a confident one built on discounted sources', () => {
    const kinds = lesson.validateSynthesis(collapsedSynthesis, keyEvidence, ids).map((i) => `${i.kind}:${i.claim}`);
    expect(kinds).toEqual(
      expect.arrayContaining(['overclaimed:output', 'conflict-dropped:output', 'relies-on-discounted:output']),
    );
  });

  it('catches missing claims, other status mismatches and invented sources', () => {
    const broken: Synthesis = {
      claims: goodSynthesis.claims
        .filter((c) => c.claim !== 'retention')
        .map((c) => (c.claim === 'collaboration' ? { ...c, status: 'contested', supporting_sources: ['S99'] } : c)),
      open_questions: [],
    };
    const kinds = lesson.validateSynthesis(broken, keyEvidence, ids).map((i) => `${i.kind}:${i.claim}`);
    expect(kinds).toEqual(
      expect.arrayContaining(['missing-claim:retention', 'status-mismatch:collaboration', 'unknown-source:collaboration']),
    );
  });
});

describe('TODO(6) synthesize repairs a bad first draft', () => {
  it('sends every issue back in one is_error tool_result and returns the corrected synthesis', async () => {
    const client = new FakeClient([
      reply([toolUse('record_synthesis', collapsedSynthesis as unknown as Record<string, unknown>, 'toolu_draft')]),
      reply([toolUse('record_synthesis', goodSynthesis as unknown as Record<string, unknown>, 'toolu_fixed')]),
    ]);
    const result = await lesson.synthesize(client, RESEARCH_QUESTION, sources);

    expect(result.issues).toEqual([]);
    expect(result.synthesis.claims.find((c) => c.claim === 'output')?.status).toBe('contested');
    expect(client.calls).toHaveLength(2);
    for (const call of client.calls) expect(call.tool_choice).toEqual({ type: 'tool', name: 'record_synthesis' });

    const feedback = client.calls[1]!.messages.at(-1)!;
    expect(feedback.role).toBe('user');
    const blocks = feedback.content as ToolResultBlockParam[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_draft', is_error: true });
    expect(String(blocks[0]!.content)).toMatch(/overclaimed/);
    expect(String(blocks[0]!.content)).toMatch(/conflict-dropped/);
  });

  it('returns the remaining issues instead of looping forever', async () => {
    const client = new FakeClient([
      reply([toolUse('record_synthesis', collapsedSynthesis as unknown as Record<string, unknown>)]),
      reply([toolUse('record_synthesis', collapsedSynthesis as unknown as Record<string, unknown>)]),
    ]);
    const result = await lesson.synthesize(client, RESEARCH_QUESTION, sources, { maxRepairs: 1 });
    expect(client.calls).toHaveLength(2);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
