import Anthropic from '@anthropic-ai/sdk';
import { expect, it } from 'vitest';
import { modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { longConversation } from './conversation.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L09 live: compact a long conversation and keep answering correctly', () => {
  it('fits the budget and still knows the amount and the promise', async () => {
    const client = new Anthropic();
    const count = lesson.apiTokenCounter(client);
    const history = longConversation(12);
    const full = await count(lesson.BASE_SYSTEM, history);
    const budget = Math.floor(full * 0.6);

    const ctx = await lesson.manageContext(client, count, history, lesson.EMPTY_STATE, { budget, keepTurns: 2 });
    expect(ctx.compacted).toBe(true);
    expect(await count(ctx.system, ctx.messages)).toBeLessThanOrEqual(budget);

    const answer = await client.messages.create({ model: modelFromEnv(), max_tokens: 300, system: ctx.system, messages: ctx.messages });
    const textOut = answer.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ');
    console.log({ full, budget, answer: textOut });
    expect(textOut).toMatch(/899\.99/);
    expect(textOut).toMatch(/5 business days/i);
  });
});
